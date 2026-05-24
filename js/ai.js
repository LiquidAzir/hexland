/* ============================================================
   ai.js — AI player decision-making
   3 styles: aggressive, builder, trader
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  var RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

  // Dice probability weighting (number of ways to roll each pip)
  var PIP_WEIGHT = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
    8: 5, 9: 4, 10: 3, 11: 2, 12: 1
  };

  // Score a vertex for initial placement
  function scoreVertex(state, vid, style) {
    var v = state.board.verticesById[vid];
    var pipTotal = 0;
    var resSet = {};
    var hasOre = false, hasWheat = false, hasBrick = false, hasWood = false, hasSheep = false;
    var portBonus = 0;

    v.tiles.forEach(function(tid) {
      var tile = state.board.tiles.find(function(t){return t.id===tid;});
      if (!tile) return;
      if (tile.res === 'desert') return;
      var pips = PIP_WEIGHT[tile.token] || 0;
      pipTotal += pips;
      resSet[tile.res] = (resSet[tile.res] || 0) + pips;
      if (tile.res === 'ore') hasOre = true;
      if (tile.res === 'wheat') hasWheat = true;
      if (tile.res === 'brick') hasBrick = true;
      if (tile.res === 'wood') hasWood = true;
      if (tile.res === 'sheep') hasSheep = true;
    });

    var diversity = Object.keys(resSet).length;
    var score = pipTotal * 3 + diversity * 4;

    // Adjust by style
    if (style === 'aggressive') {
      // Wants wood + brick for fast roads/settlements
      if (hasWood) score += 3;
      if (hasBrick) score += 3;
    } else if (style === 'builder') {
      // Wants wheat + ore for cities & dev cards
      if (hasOre) score += 4;
      if (hasWheat) score += 4;
    } else if (style === 'trader') {
      // Loves diverse resources + ports
      score += diversity * 3;
    }

    // Port bonus
    if (v.port) {
      var port = state.board.ports.find(function(p){return p.id===v.port;});
      if (port) {
        if (port.res === '?') portBonus = 2;
        else if (resSet[port.res]) portBonus = 4;
        else portBonus = 1;
      }
    }
    score += portBonus;
    return score;
  }

  // For setup phase: pick best settlement spot
  function pickInitialSettlement(state, aiIdx) {
    var p = state.players[aiIdx];
    var legal = HL.Board.legalSettlementVertices(state.board, state.players, null);
    var best = null, bestScore = -Infinity;
    legal.forEach(function(vid) {
      var s = scoreVertex(state, vid, p.aiStyle);
      if (s > bestScore) { bestScore = s; best = vid; }
    });
    return best;
  }

  // Pick a road extending toward a high-value next settlement spot
  function pickInitialRoad(state, aiIdx) {
    var p = state.players[aiIdx];
    var legal = HL.Board.legalRoadEdges(state.board, state.players, aiIdx, state.setupLastVertex);
    if (legal.length === 0) return null;

    // Prefer the road whose far vertex has the highest score (and is also "legal" for future)
    var fromV = state.setupLastVertex;
    var best = null, bestScore = -Infinity;
    legal.forEach(function(eid) {
      var e = state.board.edgesById[eid];
      var farV = e.v1 === fromV ? e.v2 : e.v1;
      var s = scoreVertex(state, farV, p.aiStyle);
      // Don't head into a vertex that's blocked
      if (s > bestScore) { bestScore = s; best = eid; }
    });
    return best;
  }

  // ===== Turn logic =====
  // After the dice are rolled (or robber resolved), the AI is in 'main' state.
  // It should: optionally play dev card, try to build / buy, then end turn.
  function takeTurn(state, aiIdx, ctx) {
    var p = state.players[aiIdx];
    var actions = [];

    // 1. If it's our roll phase, decide whether to play knight first (to relocate robber off us)
    if (state.turnState === 'roll') {
      var robbedHex = state.board.tiles.find(function(t){return t.hasRobber;});
      var robbedOnUs = robbedHex && robbedHex.vertexIds.some(function(vid){
        return p.settlements[vid] || p.cities[vid];
      });
      if (robbedOnUs && p.devHand.knight > 0 && !p.devPlayedThisTurn) {
        actions.push({ type: 'play-dev', kind: 'knight' });
      } else {
        actions.push({ type: 'roll' });
      }
      return actions;
    }

    // 2. We're in 'main' or other states. Build queue.
    var loops = 0;
    while (loops < 20) {
      loops++;

      // Try to play a non-knight dev card if useful and haven't yet
      if (!p.devPlayedThisTurn) {
        if (p.devHand.plenty > 0) {
          var picks = chooseBestResources(state, p, 2);
          if (picks) { actions.push({ type: 'play-dev', kind: 'plenty', picks: picks }); break; }
        }
        if (p.devHand.mono > 0) {
          var res = chooseMonopolyResource(state, p);
          if (res) { actions.push({ type: 'play-dev', kind: 'mono', res: res }); break; }
        }
        if (p.devHand.road > 0 && p.hand.wood + p.hand.brick < 2) {
          actions.push({ type: 'play-dev', kind: 'road' });
          break;
        }
        if (p.devHand.knight > 0 && shouldPlayKnight(state, p)) {
          actions.push({ type: 'play-dev', kind: 'knight' });
          break;
        }
      }

      // Try to build a city
      if (HL.Game.canAfford(p.hand, HL.Game.COSTS.city) && Object.keys(p.cities).length < HL.Game.LIMITS.cities) {
        var cityVids = HL.Board.legalCityVertices(state.board, p);
        if (cityVids.length > 0) {
          // Upgrade the highest-producing settlement
          var bestV = null, bestScore = -1;
          cityVids.forEach(function(vid) {
            var s = scoreVertex(state, vid, p.aiStyle);
            if (s > bestScore) { bestScore = s; bestV = vid; }
          });
          actions.push({ type: 'build-city', vid: bestV });
          break;
        }
      }

      // Try to build a settlement
      if (HL.Game.canAfford(p.hand, HL.Game.COSTS.settlement) && Object.keys(p.settlements).length < HL.Game.LIMITS.settlements) {
        var legal = HL.Board.legalSettlementVertices(state.board, state.players, p);
        if (legal.length > 0) {
          var bestV = null, bestScore = -Infinity;
          legal.forEach(function(vid) {
            var s = scoreVertex(state, vid, p.aiStyle);
            if (s > bestScore) { bestScore = s; bestV = vid; }
          });
          actions.push({ type: 'build-settlement', vid: bestV });
          break;
        }
      }

      // Try to buy dev card
      if (HL.Game.canAfford(p.hand, HL.Game.COSTS.dev) && state.devDeck.length > 0) {
        // Builders/traders love dev cards
        var devBias = p.aiStyle === 'builder' ? 0.6 : p.aiStyle === 'trader' ? 0.5 : 0.3;
        if (state.rng() < devBias) {
          actions.push({ type: 'buy-dev' });
          break;
        }
      }

      // Try to build a road toward expansion
      if (HL.Game.canAfford(p.hand, HL.Game.COSTS.road) && Object.keys(p.roads).length < HL.Game.LIMITS.roads) {
        var legalR = HL.Board.legalRoadEdges(state.board, state.players, p.idx);
        var settlements = HL.Board.legalSettlementVertices(state.board, state.players, p);
        // Only build if we don't already have a settlement spot ready
        var willingToRoad = true;
        var canReachASpot = settlements.some(function(vid) {
          var v = state.board.verticesById[vid];
          return v.adjEdges.some(function(eid){ return p.roads[eid]; });
        });
        if (canReachASpot && Object.keys(p.settlements).length + Object.keys(p.cities).length >= 2) willingToRoad = false;

        // Aggressive style is more willing to extend
        if (p.aiStyle === 'aggressive' || !canReachASpot) {
          if (legalR.length > 0 && willingToRoad !== false) {
            var bestE = pickBestRoad(state, p, legalR);
            if (bestE) {
              actions.push({ type: 'build-road', eid: bestE });
              break;
            }
          }
        }
      }

      // Try bank trade to enable a settlement/city if close
      var traded = maybeBankTrade(state, p);
      if (traded) {
        actions.push({ type: 'bank-trade', give: traded.give, gain: traded.gain });
        break;
      }

      // Nothing more to do
      break;
    }

    // Always end turn at the end (if no other action queued, this will be the only one)
    actions.push({ type: 'end-turn' });
    return actions;
  }

  // ====== Helpers ======
  function shouldPlayKnight(state, p) {
    // Play if it would take Largest Army
    if (p.knightsPlayed + 1 > state.largestArmySize && state.largestArmyOwner !== p.idx) return true;
    if (state.largestArmyOwner === p.idx) return false;
    // Or if there's a juicy steal target near a vulnerable hex
    return state.rng() < 0.3;
  }

  function chooseBestResources(state, p, count) {
    // For Year of Plenty: pick what we most need toward our next build goal
    var picks = [];
    for (var i = 0; i < count; i++) {
      var most = neededResource(state, p, picks);
      if (most) picks.push(most);
      else picks.push('wheat');
    }
    return picks;
  }

  function neededResource(state, p, alreadyPicked) {
    var simHand = Object.assign({}, p.hand);
    (alreadyPicked || []).forEach(function(r){ simHand[r]++; });
    // Goal: city > settlement > road > dev
    var goals = [HL.Game.COSTS.city, HL.Game.COSTS.settlement, HL.Game.COSTS.dev, HL.Game.COSTS.road];
    for (var g = 0; g < goals.length; g++) {
      var cost = goals[g];
      for (var k in cost) {
        if (simHand[k] < cost[k]) return k;
      }
    }
    return null;
  }

  function chooseMonopolyResource(state, p) {
    // Count what everyone has
    var totals = {};
    state.players.forEach(function(other) {
      if (other.idx === p.idx) return;
      for (var k in other.hand) totals[k] = (totals[k] || 0) + other.hand[k];
    });
    var best = null, bestN = 1;
    Object.keys(totals).forEach(function(r) {
      if (totals[r] > bestN) { bestN = totals[r]; best = r; }
    });
    return best;
  }

  function pickBestRoad(state, p, legalEdges) {
    // Prefer the road whose new endpoint is a legal/good settlement vertex
    var best = null, bestScore = -Infinity;
    legalEdges.forEach(function(eid) {
      var e = state.board.edgesById[eid];
      var v1 = state.board.verticesById[e.v1];
      var v2 = state.board.verticesById[e.v2];
      var occ1 = false, occ2 = false;
      state.players.forEach(function(pl) {
        if (pl.settlements[v1.id] || pl.cities[v1.id]) occ1 = true;
        if (pl.settlements[v2.id] || pl.cities[v2.id]) occ2 = true;
      });
      var score = 0;
      if (!occ1) score += scoreVertex(state, v1.id, p.aiStyle);
      if (!occ2) score += scoreVertex(state, v2.id, p.aiStyle);
      // Bonus for being adjacent to own road already (extending chain)
      if (Object.keys(p.roads).some(function(reid){
        var r = state.board.edgesById[reid];
        return r.v1 === e.v1 || r.v1 === e.v2 || r.v2 === e.v1 || r.v2 === e.v2;
      })) score += 2;
      if (score > bestScore) { bestScore = score; best = eid; }
    });
    return best;
  }

  function maybeBankTrade(state, p) {
    // If we're 1-2 resources away from a settlement/city, try a bank trade
    var ports = HL.Board.playerPorts(state.board, p);

    function tryToward(cost) {
      var missing = {};
      var deficit = 0;
      for (var k in cost) {
        if (p.hand[k] < cost[k]) {
          missing[k] = cost[k] - p.hand[k];
          deficit += missing[k];
        }
      }
      if (deficit === 0) return null;
      // For each resource we need, see if we can pay the rate from a surplus
      for (var need in missing) {
        for (var i = 0; i < RES.length; i++) {
          var src = RES[i];
          if (src === need) continue;
          var rate = ports[src] || 4;
          var surplus = p.hand[src] - (cost[src] || 0);
          if (surplus >= rate) {
            return { give: src, gain: need };
          }
        }
      }
      return null;
    }

    return tryToward(HL.Game.COSTS.city) || tryToward(HL.Game.COSTS.settlement) || tryToward(HL.Game.COSTS.dev);
  }

  // ===== Robber actions =====
  function pickRobberTile(state, aiIdx) {
    var p = state.players[aiIdx];
    var best = null, bestScore = -Infinity;
    state.board.tiles.forEach(function(tile) {
      if (tile.id === state.board.robberTileId) return; // must move
      if (tile.res === 'desert') {
        // sometimes ok to dump on desert if no good target
      }
      // Score = sum of (opponent buildings × pip weight)
      var score = 0;
      tile.vertexIds.forEach(function(vid) {
        state.players.forEach(function(other) {
          if (other.idx === p.idx) return;
          var amt = other.settlements[vid] ? 1 : other.cities[vid] ? 2 : 0;
          if (amt > 0) {
            var pips = PIP_WEIGHT[tile.token] || 0;
            // Prefer targets near leading players
            var oppVP = HL.Game.totalVP(state, other);
            score += amt * (pips + 1) * (1 + oppVP * 0.15);
          }
        });
        // Penalty if we have a building there
        if (p.settlements[vid] || p.cities[vid]) score -= 50;
      });
      if (score > bestScore) { bestScore = score; best = tile.id; }
    });
    return best || state.board.tiles[0].id;
  }

  function pickStealTarget(state, aiIdx, candidates) {
    // Steal from leading player with most cards
    var best = null, bestScore = -1;
    candidates.forEach(function(cidx) {
      var c = state.players[cidx];
      var s = HL.Game.totalCards(c.hand) + HL.Game.totalVP(state, c) * 2;
      if (s > bestScore) { bestScore = s; best = cidx; }
    });
    return best;
  }

  // ===== Trade response (AI evaluates a trade proposal from human) =====
  function evaluateTrade(state, aiIdx, give, recv) {
    // give = what proposer (human) gives, recv = what proposer receives (so AI gives recv, receives give)
    var p = state.players[aiIdx];
    // Can the AI afford to give what's asked?
    for (var k in recv) if ((p.hand[k] || 0) < recv[k]) return false;

    var valueIn = 0, valueOut = 0;
    for (var k in give) valueIn += give[k] * resourceValue(state, p, k, '+');
    for (var k in recv) valueOut += recv[k] * resourceValue(state, p, k, '-');

    // Style modifier
    var threshold = 1.05;
    if (p.aiStyle === 'trader') threshold = 0.9;
    if (p.aiStyle === 'aggressive') threshold = 1.15;

    // Don't help the leader
    var human = state.players[0];
    if (HL.Game.totalVP(state, human) >= 8) threshold *= 1.4;

    return valueIn >= valueOut * threshold;
  }

  // Value of a resource to player p — depends on what they're holding
  function resourceValue(state, p, res, dir) {
    var have = p.hand[res] || 0;
    if (dir === '-') have--;
    // Scarcer = more valuable. Adjust by goal.
    var need = 0;
    var goals = [HL.Game.COSTS.city, HL.Game.COSTS.settlement, HL.Game.COSTS.dev, HL.Game.COSTS.road];
    goals.forEach(function(cost) {
      if (cost[res]) need += cost[res];
    });
    var base = 1;
    if (have < 1) base = 1.5;
    if (have >= 4) base = 0.7;
    return base * (1 + need * 0.1);
  }

  HL.AI = {
    pickInitialSettlement: pickInitialSettlement,
    pickInitialRoad: pickInitialRoad,
    takeTurn: takeTurn,
    pickRobberTile: pickRobberTile,
    pickStealTarget: pickStealTarget,
    evaluateTrade: evaluateTrade,
    scoreVertex: scoreVertex
  };

})(window.HL);
