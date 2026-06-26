/* ============================================================
   game.js — Game state, rules engine, actions
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  var RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

  var COSTS = {
    road:       { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city:       { wheat: 2, ore: 3 },
    dev:        { sheep: 1, wheat: 1, ore: 1 }
  };

  var LIMITS = {
    roads: 15,
    settlements: 5,
    cities: 4
  };

  // Dev card composition (matches a standard 25-card deck)
  function buildDevDeck(rng) {
    var deck = [];
    for (var i = 0; i < 14; i++) deck.push('knight');
    for (var i = 0; i < 5; i++)  deck.push('vp');
    deck.push('road', 'road');
    deck.push('mono', 'mono');
    deck.push('plenty', 'plenty');
    HL.Board.shuffle(deck, rng);
    return deck;
  }

  function newPlayer(idx, name, color, isAI, aiStyle) {
    return {
      idx: idx,
      name: name,
      color: color,
      isAI: !!isAI,
      aiStyle: aiStyle || null,
      hand: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      // dev cards
      devHand: { knight: 0, vp: 0, road: 0, mono: 0, plenty: 0 },
      // dev cards just purchased this turn — cannot be played until next turn
      devPending: { knight: 0, vp: 0, road: 0, mono: 0, plenty: 0 },
      devPlayedThisTurn: false,
      knightsPlayed: 0,
      // built pieces
      settlements: {},   // vertexId -> true
      cities: {},        // vertexId -> true
      roads: {},         // edgeId -> true
      longestRoadLen: 0
    };
  }

  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed || ((Date.now() ^ Math.random() * 1e9) >>> 0);
    var rng = HL.Board.mulberry32(seed);
    var board = HL.Board.buildBoard(seed);

    var humans = opts.humans || [{ name: opts.playerName || 'You', color: opts.playerColor || 'red' }];
    var totalPlayers = 4;  // base game always 4
    var aiCount = Math.max(0, totalPlayers - humans.length);

    var humanColors = humans.map(function(h){ return h.color; });
    var allColors = ['red', 'blue', 'orange', 'white'];
    var aiColors = allColors.filter(function(c){ return humanColors.indexOf(c) === -1; });

    var aiNames = (HL.AI && HL.AI.pickAINames ? HL.AI.pickAINames(aiCount, rng) : ['Riku', 'Mara', 'Tovin'].slice(0, aiCount));
    var aiStyles = ['aggressive', 'builder', 'trader'];
    HL.Board.shuffle(aiStyles, rng);

    var players = [];
    for (var h = 0; h < humans.length; h++) {
      players.push(newPlayer(h, humans[h].name, humans[h].color, false));
    }
    for (var i = 0; i < aiCount; i++) {
      players.push(newPlayer(humans.length + i, aiNames[i], aiColors[i], true, aiStyles[i % aiStyles.length]));
    }

    // Decide starting player randomly
    var startIdx = Math.floor(rng() * totalPlayers);

    // Build setup order: snake — startIdx, +1, +2, +3, then +3, +2, +1, startIdx
    var firstRound = [];
    for (var i = 0; i < totalPlayers; i++) firstRound.push((startIdx + i) % totalPlayers);
    var setupOrder = firstRound.concat(firstRound.slice().reverse());

    return {
      seed: seed,
      rng: rng,
      board: board,
      players: players,
      difficulty: opts.difficulty || 'normal',

      // Variant settings
      winVP: opts.winVP || 10,
      noRobber: !!opts.noRobber,

      // Index of human currently using the device (for pass-and-play handoff).
      // First human is index 0; in single-player this stays 0 forever.
      localHumanIdx: 0,

      // phase: 'setup' | 'play' | 'over'
      phase: 'setup',
      // setup substate
      setupOrder: setupOrder,
      setupIndex: 0,           // 0..7
      setupExpecting: 'settlement', // 'settlement' or 'road'
      setupLastVertex: null,        // vertex placed in current pair

      // play substate
      currentPlayerIdx: startIdx,
      turnState: 'roll',       // 'roll' | 'main' | 'robber-discard' | 'robber-move' | 'robber-steal' | 'pick-monopoly' | 'pick-plenty' | 'free-road'

      // dice
      lastDice: null,          // [d1, d2]

      // robber state
      robberMover: null,
      robberStealCandidates: [],
      discardQueue: [],
      discardCurrent: null,

      // free roads from "road building" dev card
      freeRoadsLeft: 0,

      // dev deck
      devDeck: buildDevDeck(rng),

      // resource bank (basic enforcement)
      bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },

      // achievements
      longestRoadOwner: null,  // playerIdx
      longestRoadLen: 4,       // must beat 4 to take it; held value must be exceeded
      largestArmyOwner: null,
      largestArmySize: 2,      // must beat 2

      // log of recent events (for AI announcer / toast)
      events: [],

      // last roll result for stats
      diceHistory: [],

      // pending trade UI state (player's outgoing trade proposal)
      pendingTrade: null
    };
  }

  // ====== Helpers ======
  function canAfford(hand, cost) {
    for (var k in cost) if ((hand[k] || 0) < cost[k]) return false;
    return true;
  }
  function payCost(hand, cost, bank) {
    for (var k in cost) {
      hand[k] -= cost[k];
      if (bank) bank[k] += cost[k];
    }
  }
  function bankPay(bank, gain) {
    for (var k in gain) bank[k] -= gain[k];
  }
  function totalCards(hand) {
    var n = 0; for (var k in hand) n += hand[k]; return n;
  }
  function totalDev(devHand, devPending) {
    var n = 0;
    for (var k in devHand) n += devHand[k];
    if (devPending) for (var k in devPending) n += devPending[k];
    return n;
  }

  // ====== Victory points ======
  function visibleVP(state, p) {
    var vp = Object.keys(p.settlements).length + Object.keys(p.cities).length * 2;
    if (state.longestRoadOwner === p.idx) vp += 2;
    if (state.largestArmyOwner === p.idx) vp += 2;
    return vp;
  }
  function totalVP(state, p) {
    return visibleVP(state, p) + p.devHand.vp;
  }

  // ====== Setup phase ======
  function legalInitialSettlement(state) {
    return HL.Board.legalSettlementVertices(state.board, state.players, null);
  }
  function legalInitialRoad(state) {
    var p = state.players[currentSetupPlayer(state).idx];
    return HL.Board.legalRoadEdges(state.board, state.players, p.idx, state.setupLastVertex);
  }
  function currentSetupPlayer(state) {
    return state.players[state.setupOrder[state.setupIndex]];
  }

  function placeInitialSettlement(state, vertexId) {
    var p = currentSetupPlayer(state);
    p.settlements[vertexId] = true;
    state.setupLastVertex = vertexId;
    state.setupExpecting = 'road';
    pushEvent(state, p.name + ' placed a settlement');

    // If this is the second round (setupIndex >= 4), grant adjacent tile resources
    if (state.setupIndex >= 4) {
      var v = state.board.verticesById[vertexId];
      v.tiles.forEach(function(tid){
        var tile = state.board.tiles.find(function(t){return t.id===tid;});
        if (tile && tile.res !== 'desert') {
          p.hand[tile.res] += 1;
          state.bank[tile.res] -= 1;
        }
      });
    }
  }

  function placeInitialRoad(state, edgeId) {
    var p = currentSetupPlayer(state);
    p.roads[edgeId] = true;
    state.setupLastVertex = null;
    state.setupExpecting = 'settlement';
    pushEvent(state, p.name + ' placed a road');

    // Advance
    state.setupIndex++;
    if (state.setupIndex >= state.setupOrder.length) {
      // Setup complete — first player rolls
      state.phase = 'play';
      state.turnState = 'roll';
      state.currentPlayerIdx = state.setupOrder[0]; // first in turn order
      pushEvent(state, 'Setup complete. ' + state.players[state.currentPlayerIdx].name + "'s turn");
    }
  }

  // ====== Dice / resource production ======
  function rollDice(state) {
    var d1 = Math.floor(state.rng() * 6) + 1;
    var d2 = Math.floor(state.rng() * 6) + 1;
    var sum = d1 + d2;
    state.lastDice = [d1, d2];
    state.diceHistory.push(sum);
    pushEvent(state, state.players[state.currentPlayerIdx].name + ' rolled ' + sum);

    if (sum === 7 && state.noRobber) {
      pushEvent(state, 'Lucky 7 — chill mode, no robber');
      state.turnState = 'main';
      return { sum: sum, dice: state.lastDice, robber: false, chill: true };
    }
    if (sum === 7) {
      // Trigger robber phase: discard then move
      state.discardQueue = [];
      state.players.forEach(function(p) {
        if (totalCards(p.hand) > 7) {
          state.discardQueue.push({ idx: p.idx, need: Math.floor(totalCards(p.hand) / 2) });
        }
      });
      if (state.discardQueue.length > 0) {
        // Resolve AI discards immediately; humans get a screen
        for (var i = state.discardQueue.length - 1; i >= 0; i--) {
          var dq = state.discardQueue[i];
          var pl = state.players[dq.idx];
          if (pl.isAI) {
            aiAutoDiscard(state, pl, dq.need);
            state.discardQueue.splice(i, 1);
          }
        }
      }
      if (state.discardQueue.length > 0) {
        state.discardCurrent = state.discardQueue.shift();
        state.turnState = 'robber-discard';
      } else {
        state.turnState = 'robber-move';
      }
      state.robberMover = state.currentPlayerIdx;
      return { sum: sum, dice: state.lastDice, robber: true };
    }

    distributeResources(state, sum);
    state.turnState = 'main';
    return { sum: sum, dice: state.lastDice, robber: false };
  }

  function aiAutoDiscard(state, p, need) {
    // Discard from largest piles first
    var counts = Object.keys(p.hand).map(function(k){ return { k: k, v: p.hand[k] }; });
    counts.sort(function(a,b){return b.v - a.v;});
    var discarded = [];
    while (need > 0) {
      for (var i = 0; i < counts.length && need > 0; i++) {
        if (counts[i].v > 0) {
          counts[i].v--; need--;
          p.hand[counts[i].k]--;
          state.bank[counts[i].k]++;
          discarded.push(counts[i].k);
        }
      }
    }
    pushEvent(state, p.name + ' discarded ' + discarded.length);
  }

  function distributeResources(state, rolled) {
    // Find all tiles with that number, not robbed
    var producing = state.board.tiles.filter(function(t){
      return t.token === rolled && !t.hasRobber;
    });
    if (producing.length === 0) return [];

    // Tally desired output per player per resource
    var demand = {}; // playerIdx -> resource -> count
    var gainsByPlayer = {}; // for UI animation
    producing.forEach(function(tile) {
      tile.vertexIds.forEach(function(vid) {
        state.players.forEach(function(p) {
          var amt = 0;
          if (p.settlements[vid]) amt = 1;
          else if (p.cities[vid]) amt = 2;
          if (amt > 0) {
            if (!demand[p.idx]) demand[p.idx] = {};
            demand[p.idx][tile.res] = (demand[p.idx][tile.res] || 0) + amt;
          }
        });
      });
    });

    // Check bank — if any resource is over-demanded across multiple players, no one gets it
    var totalDemand = {};
    Object.keys(demand).forEach(function(pid) {
      Object.keys(demand[pid]).forEach(function(res) {
        totalDemand[res] = (totalDemand[res] || 0) + demand[pid][res];
      });
    });
    Object.keys(totalDemand).forEach(function(res) {
      if (totalDemand[res] > state.bank[res]) {
        // If only one player is asking, they get whatever's left
        var askers = Object.keys(demand).filter(function(pid){ return demand[pid][res]; });
        if (askers.length === 1) {
          demand[askers[0]][res] = state.bank[res];
        } else {
          askers.forEach(function(pid){ demand[pid][res] = 0; });
        }
      }
    });

    // Apply
    Object.keys(demand).forEach(function(pid) {
      var p = state.players[pid];
      Object.keys(demand[pid]).forEach(function(res) {
        var n = demand[pid][res];
        if (n <= 0) return;
        p.hand[res] += n;
        state.bank[res] -= n;
        gainsByPlayer[pid] = gainsByPlayer[pid] || {};
        gainsByPlayer[pid][res] = (gainsByPlayer[pid][res] || 0) + n;
      });
    });

    var humanGain = gainsByPlayer[0];
    if (humanGain) {
      var bits = Object.keys(humanGain).map(function(r){return '+'+humanGain[r]+' '+r;}).join(' · ');
      pushEvent(state, 'You gain: ' + bits);
    }
    return gainsByPlayer;
  }

  // ====== Robber ======
  function moveRobber(state, tileId, stealFromIdx) {
    state.board.tiles.forEach(function(t){ t.hasRobber = false; });
    var tile = state.board.tiles.find(function(t){return t.id === tileId;});
    tile.hasRobber = true;
    state.board.robberTileId = tileId;

    // Determine eligible victims (players with settlements/cities at the new tile)
    var victims = [];
    tile.vertexIds.forEach(function(vid){
      state.players.forEach(function(p) {
        if (p.idx === state.robberMover) return;
        if (p.settlements[vid] || p.cities[vid]) {
          if (totalCards(p.hand) > 0 && victims.indexOf(p.idx) === -1) victims.push(p.idx);
        }
      });
    });

    if (victims.length === 0) {
      state.turnState = state._postRobberState || 'main';
      state._postRobberState = null;
      pushEvent(state, state.players[state.robberMover].name + ' moved the robber');
      return { stole: null };
    }

    if (stealFromIdx === undefined) {
      if (victims.length === 1) stealFromIdx = victims[0];
      else {
        state.robberStealCandidates = victims;
        state.turnState = 'robber-steal';
        return { needPick: true, candidates: victims };
      }
    }
    return stealCard(state, stealFromIdx);
  }

  function stealCard(state, victimIdx) {
    var v = state.players[victimIdx];
    var m = state.players[state.robberMover];
    var pool = [];
    Object.keys(v.hand).forEach(function(res){
      for (var i = 0; i < v.hand[res]; i++) pool.push(res);
    });
    var stolen = null;
    if (pool.length > 0) {
      stolen = pool[Math.floor(state.rng() * pool.length)];
      v.hand[stolen]--;
      m.hand[stolen]++;
    }
    state.turnState = state._postRobberState || 'main';
    state._postRobberState = null;
    if (stolen) {
      pushEvent(state, m.name + ' stole ' + stolen + ' from ' + v.name);
    } else {
      pushEvent(state, m.name + ' stole from ' + v.name);
    }
    return { stole: stolen, from: victimIdx };
  }

  // ====== Building ======
  function buildSettlement(state, vertexId, free) {
    var p = state.players[state.currentPlayerIdx];
    if (!free && !canAfford(p.hand, COSTS.settlement)) return { ok: false, err: 'Insufficient resources' };
    if (Object.keys(p.settlements).length >= LIMITS.settlements) return { ok: false, err: 'Settlement limit reached' };
    if (!free) payCost(p.hand, COSTS.settlement, state.bank);
    p.settlements[vertexId] = true;
    pushEvent(state, p.name + ' built a settlement');
    recomputeLongestRoad(state);
    checkWin(state);
    return { ok: true };
  }

  function buildCity(state, vertexId) {
    var p = state.players[state.currentPlayerIdx];
    if (!p.settlements[vertexId]) return { ok: false, err: 'No settlement to upgrade' };
    if (!canAfford(p.hand, COSTS.city)) return { ok: false, err: 'Insufficient resources' };
    if (Object.keys(p.cities).length >= LIMITS.cities) return { ok: false, err: 'City limit reached' };
    payCost(p.hand, COSTS.city, state.bank);
    delete p.settlements[vertexId];
    p.cities[vertexId] = true;
    pushEvent(state, p.name + ' upgraded to a city');
    checkWin(state);
    return { ok: true };
  }

  function buildRoad(state, edgeId, free) {
    var p = state.players[state.currentPlayerIdx];
    if (!free && !canAfford(p.hand, COSTS.road)) return { ok: false, err: 'Insufficient resources' };
    if (Object.keys(p.roads).length >= LIMITS.roads) return { ok: false, err: 'Road limit reached' };
    if (!free) payCost(p.hand, COSTS.road, state.bank);
    p.roads[edgeId] = true;
    pushEvent(state, p.name + ' built a road');
    recomputeLongestRoad(state);
    checkWin(state);
    return { ok: true };
  }

  function buyDev(state) {
    var p = state.players[state.currentPlayerIdx];
    if (!canAfford(p.hand, COSTS.dev)) return { ok: false, err: 'Insufficient resources' };
    if (state.devDeck.length === 0) return { ok: false, err: 'Deck empty' };
    payCost(p.hand, COSTS.dev, state.bank);
    var card = state.devDeck.shift();
    // VP cards can be revealed at any time (kept in devHand to add to total)
    // All others go to pending until next turn
    if (card === 'vp') {
      p.devHand.vp += 1;
    } else {
      p.devPending[card] += 1;
    }
    pushEvent(state, p.name + ' bought a development card');
    checkWin(state);
    return { ok: true, card: card };
  }

  function playDev(state, kind) {
    var p = state.players[state.currentPlayerIdx];
    if (state.turnState !== 'main' && state.turnState !== 'roll') return { ok: false, err: 'Not your turn phase' };
    if (p.devPlayedThisTurn) return { ok: false, err: 'Already played a dev card this turn' };
    if (kind !== 'knight' && state.turnState === 'roll') return { ok: false, err: 'Roll first' };
    if (!p.devHand[kind] || p.devHand[kind] <= 0) return { ok: false, err: 'No such card' };
    p.devHand[kind] -= 1;
    p.devPlayedThisTurn = true;

    if (kind === 'knight') {
      p.knightsPlayed += 1;
      pushEvent(state, p.name + ' played a Knight');
      recomputeLargestArmy(state);
      if (state.noRobber) {
        // Chill mode: knight just counts toward Largest Army
        checkWin(state);
        return { ok: true, kind: 'knight', needRobber: false };
      }
      // Knight can be played BEFORE rolling — remember so we return to 'roll' after robber
      if (state.turnState === 'roll') state._postRobberState = 'roll';
      state.robberMover = p.idx;
      state.turnState = 'robber-move';
      checkWin(state);
      return { ok: true, kind: 'knight', needRobber: true };
    }
    if (kind === 'road') {
      state.freeRoadsLeft = 2;
      state.turnState = 'free-road';
      pushEvent(state, p.name + ' played Road Building');
      return { ok: true, kind: 'road', freeRoads: 2 };
    }
    if (kind === 'mono') {
      state.turnState = 'pick-monopoly';
      pushEvent(state, p.name + ' played Monopoly');
      return { ok: true, kind: 'mono' };
    }
    if (kind === 'plenty') {
      state.turnState = 'pick-plenty';
      state.plentyPicked = [];
      pushEvent(state, p.name + ' played Year of Plenty');
      return { ok: true, kind: 'plenty' };
    }
    return { ok: false };
  }

  function resolveMonopoly(state, res) {
    var p = state.players[state.currentPlayerIdx];
    var total = 0;
    state.players.forEach(function(other) {
      if (other.idx === p.idx) return;
      total += other.hand[res];
      other.hand[res] = 0;
    });
    p.hand[res] += total;
    state.turnState = 'main';
    pushEvent(state, p.name + ' monopolized ' + res + ' (' + total + ')');
  }

  function resolvePlenty(state, picks) {
    var p = state.players[state.currentPlayerIdx];
    picks.forEach(function(res) {
      if (state.bank[res] > 0) {
        p.hand[res] += 1;
        state.bank[res] -= 1;
      }
    });
    state.turnState = 'main';
    pushEvent(state, p.name + ' took 2 resources');
  }

  // ====== Trade ======
  function tradeWithBank(state, give, gain) {
    var p = state.players[state.currentPlayerIdx];
    // Compute rate for this resource: best port rate or 4
    var ports = HL.Board.playerPorts(state.board, p);
    var rate = ports[give] || 4;
    if (p.hand[give] < rate) return { ok: false, err: 'Not enough ' + give };
    if (state.bank[gain] < 1) return { ok: false, err: 'Bank has no ' + gain };
    p.hand[give] -= rate;
    state.bank[give] += rate;
    p.hand[gain] += 1;
    state.bank[gain] -= 1;
    pushEvent(state, p.name + ' traded ' + rate + ' ' + give + ' for ' + gain);
    return { ok: true };
  }

  function executePlayerTrade(state, fromIdx, toIdx, give, recv) {
    var f = state.players[fromIdx], t = state.players[toIdx];
    for (var k in give) {
      if (f.hand[k] < give[k]) return { ok: false, err: 'Insufficient' };
    }
    for (var k in recv) {
      if (t.hand[k] < recv[k]) return { ok: false, err: 'Insufficient' };
    }
    for (var k in give) { f.hand[k] -= give[k]; t.hand[k] += give[k]; }
    for (var k in recv) { t.hand[k] -= recv[k]; f.hand[k] += recv[k]; }
    pushEvent(state, f.name + ' traded with ' + t.name);
    return { ok: true };
  }

  // ====== End turn ======
  function endTurn(state) {
    var p = state.players[state.currentPlayerIdx];
    // Move pending dev cards into hand
    for (var k in p.devPending) {
      p.devHand[k] += p.devPending[k];
      p.devPending[k] = 0;
    }
    p.devPlayedThisTurn = false;
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    state.turnState = 'roll';
    state.lastDice = null;
    state.pendingTrade = null;
    pushEvent(state, state.players[state.currentPlayerIdx].name + "'s turn");
  }

  // ====== Achievements ======
  function recomputeLongestRoad(state) {
    // 1. Recompute everyone's current length (chains may have been broken)
    state.players.forEach(function(p) {
      p.longestRoadLen = HL.Board.longestRoadFor(state.board, state.players, p.idx);
    });

    var holder = state.longestRoadOwner !== null
      ? state.players[state.longestRoadOwner] : null;

    // 2. Holder drops the title if their chain is below 5
    if (holder && holder.longestRoadLen < 5) {
      pushEvent(state, holder.name + ' lost Longest Road');
      state.longestRoadOwner = null;
      state.longestRoadLen = 4;
      holder = null;
    }

    // 3. Find the player (if any) with strictly greater than the current threshold
    //    threshold = holder's length (must beat them), or 4 (must reach 5+)
    var threshold = holder ? holder.longestRoadLen : 4;
    var bestIdx = null, bestLen = threshold;
    state.players.forEach(function(p) {
      if (p.longestRoadLen > bestLen) {
        bestLen = p.longestRoadLen;
        bestIdx = p.idx;
      }
    });

    if (bestIdx !== null && bestIdx !== state.longestRoadOwner) {
      // Transfer (or first-take)
      state.longestRoadOwner = bestIdx;
      state.longestRoadLen = bestLen;
      pushEvent(state, state.players[bestIdx].name + ' took Longest Road');
    } else if (state.longestRoadOwner !== null) {
      // Holder still holds — update recorded length in case they extended
      state.longestRoadLen = state.players[state.longestRoadOwner].longestRoadLen;
    }
  }

  function recomputeLargestArmy(state) {
    var holder = state.largestArmyOwner !== null
      ? state.players[state.largestArmyOwner] : null;

    // Defensive (knights only ever increase, but guard anyway)
    if (holder && holder.knightsPlayed < 3) {
      state.largestArmyOwner = null;
      state.largestArmySize = 2;
      holder = null;
    }

    var threshold = holder ? holder.knightsPlayed : 2;
    var bestIdx = null, bestSize = threshold;
    state.players.forEach(function(p) {
      if (p.knightsPlayed > bestSize) {
        bestSize = p.knightsPlayed;
        bestIdx = p.idx;
      }
    });

    if (bestIdx !== null && bestIdx !== state.largestArmyOwner) {
      state.largestArmyOwner = bestIdx;
      state.largestArmySize = bestSize;
      pushEvent(state, state.players[bestIdx].name + ' took Largest Army');
    } else if (state.largestArmyOwner !== null) {
      state.largestArmySize = state.players[state.largestArmyOwner].knightsPlayed;
    }
  }

  function checkWin(state) {
    for (var i = 0; i < state.players.length; i++) {
      if (totalVP(state, state.players[i]) >= (state.winVP || 10)) {
        state.phase = 'over';
        state.winnerIdx = i;
        pushEvent(state, state.players[i].name + ' wins!');
        return true;
      }
    }
    return false;
  }

  // ====== Events ======
  function pushEvent(state, msg) {
    state.events.push({ msg: msg, t: Date.now() });
    if (state.events.length > 100) state.events.shift();
  }

  HL.Game = {
    RES: RES,
    COSTS: COSTS,
    LIMITS: LIMITS,
    newGame: newGame,
    canAfford: canAfford,
    totalCards: totalCards,
    totalDev: totalDev,
    visibleVP: visibleVP,
    totalVP: totalVP,

    currentSetupPlayer: currentSetupPlayer,
    legalInitialSettlement: legalInitialSettlement,
    legalInitialRoad: legalInitialRoad,
    placeInitialSettlement: placeInitialSettlement,
    placeInitialRoad: placeInitialRoad,

    rollDice: rollDice,
    distributeResources: distributeResources,
    moveRobber: moveRobber,
    stealCard: stealCard,
    aiAutoDiscard: aiAutoDiscard,

    buildSettlement: buildSettlement,
    buildCity: buildCity,
    buildRoad: buildRoad,
    buyDev: buyDev,
    playDev: playDev,
    resolveMonopoly: resolveMonopoly,
    resolvePlenty: resolvePlenty,

    tradeWithBank: tradeWithBank,
    executePlayerTrade: executePlayerTrade,

    endTurn: endTurn,
    recomputeLongestRoad: recomputeLongestRoad,
    recomputeLargestArmy: recomputeLargestArmy,

    pushEvent: pushEvent
  };

})(window.HL);
