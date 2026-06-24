/* ============================================================
   app.js — Entry point: state, action dispatch, AI driver, input
   ============================================================ */
(function() {
  'use strict';

  var HL = window.HL;

  // ===== App state =====
  var app = {
    setup: {
      playerName: 'You',
      playerColor: 'red',
      difficulty: 'normal'
    },
    game: null,  // live game state
    savedGame: null
  };

  var STORAGE_KEY = 'hexland_save_v1';

  // ===== Boot =====
  function init() {
    HL.UI.init();
    wireEvents();
    wireBoardClicks();
    setupResponsiveScaling();
    loadSaved();
    refreshMenuButtons();
    HL.UI.go('menu', { history: false });
  }

  // ===== Responsive scaling (phone/desktop, transparent on glasses) =====
  function setupResponsiveScaling() {
    var app = document.getElementById('app');
    function applyScale() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      // On exactly 600x600 (glasses) — no scale needed
      var scale = Math.min(vw / 600, vh / 600);
      if (Math.abs(scale - 1) < 0.01) {
        app.style.transform = '';
      } else {
        app.style.transform = 'scale(' + scale + ')';
      }
    }
    applyScale();
    window.addEventListener('resize', applyScale);
    window.addEventListener('orientationchange', applyScale);
  }

  // ===== Board click/tap handlers (tap-to-place) =====
  function wireBoardClicks() {
    var svg = document.getElementById('board-svg');
    if (!svg) return;

    function findAttr(el, name) {
      while (el && el !== svg && el.nodeType === 1) {
        if (el.hasAttribute && el.hasAttribute(name)) return el.getAttribute(name);
        el = el.parentNode;
      }
      return null;
    }

    function tryConfirm(target) {
      if (!HL.UI.isCursorActive()) return false;
      var mode = HL.UI.cursorMode();
      var id;
      if (mode === 'vertex-pick') id = findAttr(target, 'data-vid');
      else if (mode === 'edge-pick') id = findAttr(target, 'data-eid');
      else if (mode === 'tile-pick') id = findAttr(target, 'data-tid');
      if (!id) return false;
      var ok = HL.UI.setCursorAndConfirm(app.game, id);
      if (ok) afterCursorConfirm();
      return ok;
    }

    // pointerdown fires reliably on touch + mouse + pen
    svg.addEventListener('pointerdown', function(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (tryConfirm(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    // click as a fallback (in case pointer events are stopped by something else)
    svg.addEventListener('click', function(e) {
      tryConfirm(e.target);
    });
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) app.savedGame = JSON.parse(raw);
    } catch (e) {}
  }

  function saveGame() {
    if (!app.game || app.game.phase === 'over') {
      localStorage.removeItem(STORAGE_KEY);
      app.savedGame = null;
      return;
    }
    try {
      // strip rng function before serializing
      var clone = JSON.parse(JSON.stringify(app.game, function(k, v) {
        if (typeof v === 'function') return undefined;
        return v;
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clone));
      app.savedGame = clone;
    } catch (e) { console.warn('save failed', e); }
  }

  function refreshMenuButtons() {
    var cont = document.querySelector('[data-action="continue-game"]');
    if (cont) cont.disabled = !app.savedGame;
  }

  // ===== Event wiring =====
  function wireEvents() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      if (el.disabled) return;
      handleAction(el.dataset.action, el);
    });

    document.addEventListener('keydown', function(e) {
      var inInput = document.activeElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      if (inInput && !['Escape', 'Enter'].includes(e.key)) return;

      switch (e.key) {
        case 'ArrowUp':    handleArrow('up'); e.preventDefault(); break;
        case 'ArrowDown':  handleArrow('down'); e.preventDefault(); break;
        case 'ArrowLeft':  handleArrow('left'); e.preventDefault(); break;
        case 'ArrowRight': handleArrow('right'); e.preventDefault(); break;
        case 'Enter':
          if (HL.UI.isCursorActive()) { HL.UI.confirmCursor(); afterCursorConfirm(); e.preventDefault(); break; }
          if (document.activeElement && document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          if (HL.UI.isCursorActive()) { HL.UI.cancelCursor(); }
          else if (HL.UI.isPopoverOpen()) { HL.UI.closePopover(); }
          else HL.UI.back();
          e.preventDefault();
          break;
      }
    });
  }

  function handleArrow(dir) {
    if (HL.UI.isCursorActive() && app.game) {
      HL.UI.moveCursor(app.game, dir);
    } else {
      HL.UI.moveFocus(dir);
    }
  }

  // ===== Action dispatcher =====
  function handleAction(action, el) {
    switch (action) {
      // Menu
      case 'new-game':       startNewGameFlow(); break;
      case 'continue-game':  continueGame(); break;
      case 'how-to-play':    HL.UI.go('how-to-play'); break;
      case 'back':           HL.UI.back(); break;
      case 'go-menu':        HL.UI.go('menu', { history: false }); break;

      // Setup screen
      case 'start-game':     beginGame(); break;

      // Game primary button
      case 'primary':        onPrimary(); break;
      case 'menu':           openActionMenu(); break;
      case 'players':        openPlayersMenu(); break;
      case 'close-popover':  HL.UI.closePopover(); break;
      case 'cancel-mode':    HL.UI.cancelCursor(); break;

      // Build actions
      case 'build-road':         enterBuildRoadMode(); break;
      case 'build-settlement':   enterBuildSettlementMode(); break;
      case 'build-city':         enterBuildCityMode(); break;

      // Dev cards
      case 'buy-dev':            doBuyDev(); break;
      case 'play-dev':           openDevMenu(); break;
      case 'play-dev-knight':    HL.UI.closePopover(); playKnight(); break;
      case 'play-dev-road':      HL.UI.closePopover(); playRoadCard(); break;
      case 'play-dev-mono':      HL.UI.closePopover(); playMonopolyCard(); break;
      case 'play-dev-plenty':    HL.UI.closePopover(); playPlentyCard(); break;

      // Trading
      case 'trade-bank':         openBankTrade(); break;
      case 'trade-players':      openPlayerTrade(); break;
      case 'bank-give-pick':     bankPickGive(el.dataset.res); break;
      case 'bank-recv-pick':     bankPickRecv(el.dataset.res); break;
      case 'confirm-bank-trade': doBankTrade(); break;

      case 'pt-give-inc':        ptInc('give', el.dataset.res); break;
      case 'pt-recv-inc':        ptInc('recv', el.dataset.res); break;
      case 'reset-trade':        resetPlayerTrade(); break;
      case 'propose-trade':      proposePlayerTrade(); break;
      case 'accept-trade-with':  acceptTradeWith(parseInt(el.dataset.with, 10)); break;

      // Discard
      case 'discard-pick':       discardPick(el.dataset.res); break;
      case 'confirm-discard':    confirmDiscard(); break;

      case 'end-turn':           HL.UI.closePopover(); doEndTurn(); break;

      // Monopoly pick / plenty pick / robber-steal pick
      case 'pick-mono':          doResolveMonopoly(el.dataset.res); break;
      case 'pick-plenty':        doResolvePlenty(el.dataset.res); break;
      case 'steal-pick':         doStealPick(parseInt(el.dataset.with, 10)); break;

      // Setup-screen pickers
      case 'set-color':
        if (el.dataset.color) {
          app.setup.playerColor = el.dataset.color;
          HL.UI.setColorSwatch(el.dataset.color);
        }
        break;
      case 'set-diff':
        if (el.dataset.diff) {
          app.setup.difficulty = el.dataset.diff;
          HL.UI.setDifficulty(el.dataset.diff);
        }
        break;

      default:
        break;
    }
  }

  // ===== Flows =====
  function startNewGameFlow() {
    HL.UI.go('setup');
    HL.UI.setColorSwatch(app.setup.playerColor);
    HL.UI.setDifficulty(app.setup.difficulty);
    var input = document.getElementById('player-name-input');
    if (input) input.value = app.setup.playerName;
  }

  function continueGame() {
    if (!app.savedGame) return;
    var saved = app.savedGame;
    saved.rng = HL.Board.mulberry32(((saved.seed || 1) ^ Date.now()) >>> 0);
    // Rebuild lookups so the same JS objects are shared between arrays and dicts
    // (JSON round-trip splits them into separate copies otherwise)
    saved.board.verticesById = {};
    saved.board.vertices.forEach(function(v){ saved.board.verticesById[v.id] = v; });
    saved.board.edgesById = {};
    saved.board.edges.forEach(function(e){ saved.board.edgesById[e.id] = e; });
    saved.board.tilesByKey = {};
    saved.board.tiles.forEach(function(t){ saved.board.tilesByKey[t.q + ',' + t.r] = t; });
    app.game = saved;
    HL.UI.go('game', { history: false });
    refreshGame();
    setTimeout(driveTurns, 200);
  }

  function beginGame() {
    var nameInput = document.getElementById('player-name-input');
    if (nameInput) app.setup.playerName = (nameInput.value || 'You').slice(0, 12);

    app.game = HL.Game.newGame({
      playerName: app.setup.playerName,
      playerColor: app.setup.playerColor,
      difficulty: app.setup.difficulty,
      seed: (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0
    });

    HL.UI.go('game', { history: false });
    refreshGame();
    setTimeout(driveTurns, 250);
  }

  function refreshGame() {
    var state = app.game;
    HL.Render.renderBoard(document.getElementById('board-svg'), state);
    HL.UI.updateHud(state);
    saveGame();
  }

  // ===== Primary button behavior =====
  function onPrimary() {
    var state = app.game;
    if (state.phase === 'setup') {
      var setupP = HL.Game.currentSetupPlayer(state);
      if (setupP.idx !== 0) return;
      if (state.setupExpecting === 'settlement') startHumanSetupSettlement();
      else startHumanSetupRoad();
    } else if (state.phase === 'play') {
      var cp = state.players[state.currentPlayerIdx];
      if (cp.idx !== 0) return;
      if (state.turnState === 'roll') humanRoll();
      else doEndTurn();
    }
  }

  // ===== Setup phase =====
  function startHumanSetupSettlement() {
    var legal = HL.Game.legalInitialSettlement(app.game);
    if (legal.length === 0) return;
    HL.UI.startVertexPick(app.game, legal, {
      label: 'Place settlement',
      mandatory: true,
      onConfirm: function(vid) {
        HL.Game.placeInitialSettlement(app.game, vid);
        refreshGame();
        setTimeout(startHumanSetupRoad, 150);
      }
    });
  }

  function startHumanSetupRoad() {
    var legal = HL.Game.legalInitialRoad(app.game);
    if (legal.length === 0) {
      HL.UI.toast('No legal road');
      return;
    }
    HL.UI.startEdgePick(app.game, legal, {
      label: 'Place road from settlement',
      mandatory: true,
      onConfirm: function(eid) {
        HL.Game.placeInitialRoad(app.game, eid);
        refreshGame();
        setTimeout(driveTurns, 300);
      }
    });
  }

  // ===== Drive AI / setup AI / next phase =====
  function driveTurns() {
    var state = app.game;
    if (!state) return;

    if (state.phase === 'over') {
      HL.UI.showGameOver(state);
      HL.UI.go('game-over', { history: false });
      saveGame();
      return;
    }

    if (state.phase === 'setup') {
      var setupP = HL.Game.currentSetupPlayer(state);
      if (setupP.idx === 0) {
        // Human's setup turn — wait for human action
        HL.UI.updateHud(state);
        if (state.setupExpecting === 'settlement') startHumanSetupSettlement();
        else startHumanSetupRoad();
        return;
      }
      // AI setup
      runAiSetupStep();
      return;
    }

    if (state.phase === 'play') {
      var cp = state.players[state.currentPlayerIdx];

      // Discard handling
      if (state.turnState === 'robber-discard') {
        var dc = state.discardCurrent;
        if (dc && dc.idx === 0) {
          HL.UI.populateDiscardScreen(state, state.players[0], dc.need);
          HL.UI.go('discard');
          return;
        }
        // Should not happen — AI discards resolved at roll
        proceedAfterDiscard();
        return;
      }

      if (state.turnState === 'robber-move') {
        if (state.robberMover === 0) {
          startHumanRobberMove();
        } else {
          runAiRobberMove();
        }
        return;
      }
      if (state.turnState === 'robber-steal') {
        if (state.robberMover === 0) {
          startHumanStealPick();
        } else {
          var tgt = HL.AI.pickStealTarget(state, state.robberMover, state.robberStealCandidates);
          HL.Game.stealCard(state, tgt);
          refreshGame();
          setTimeout(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'pick-monopoly') {
        if (cp.idx === 0) startHumanMonopolyPick();
        else {
          var res = chooseAIMonopoly(state, cp);
          HL.Game.resolveMonopoly(state, res);
          refreshGame();
          setTimeout(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'pick-plenty') {
        if (cp.idx === 0) startHumanPlentyPick();
        else {
          var picks = chooseAIPlenty(state, cp);
          HL.Game.resolvePlenty(state, picks);
          refreshGame();
          setTimeout(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'free-road') {
        if (cp.idx === 0) startHumanFreeRoad();
        else runAiFreeRoad();
        return;
      }

      if (cp.idx === 0) {
        // Human main turn — just update HUD, wait
        HL.UI.updateHud(state);
        return;
      }
      // AI turn
      runAiTurn();
    }
  }

  // Tiny indirection to call helpers from ai.js by name (since they're not exported)
  // (We refactor to use exported functions instead.)
  function chooseAIMonopoly(state, p) {
    var totals = {};
    state.players.forEach(function(other){
      if (other.idx === p.idx) return;
      for (var k in other.hand) totals[k] = (totals[k]||0) + other.hand[k];
    });
    var best = null, bestN = 0;
    Object.keys(totals).forEach(function(r){ if (totals[r] > bestN) { bestN = totals[r]; best = r; } });
    return best || 'wheat';
  }
  function chooseAIPlenty(state, p) {
    var picks = [];
    for (var i = 0; i < 2; i++) {
      var sim = Object.assign({}, p.hand);
      picks.forEach(function(r){ sim[r]++; });
      var need = null;
      var goals = [HL.Game.COSTS.city, HL.Game.COSTS.settlement, HL.Game.COSTS.dev, HL.Game.COSTS.road];
      for (var g = 0; g < goals.length && !need; g++) {
        for (var k in goals[g]) if (sim[k] < goals[g][k]) { need = k; break; }
      }
      picks.push(need || 'wheat');
    }
    return picks;
  }
  // Replace bad `require` calls above
  function fixDriveTurnsHelpers() {}

  // ===== AI: setup =====
  function runAiSetupStep() {
    var state = app.game;
    var setupP = HL.Game.currentSetupPlayer(state);
    setTimeout(function() {
      // Settlement
      var vid = HL.AI.pickInitialSettlement(state, setupP.idx);
      if (!vid) {
        forceSetupAdvance(state);
        refreshGame();
        setTimeout(driveTurns, 200);
        return;
      }
      HL.Game.placeInitialSettlement(state, vid);
      refreshGame();
      setTimeout(function() {
        // Road
        var eid = HL.AI.pickInitialRoad(state, setupP.idx);
        if (!eid) {
          // Defensive fallback — any unoccupied edge of the just-placed settlement
          var v = state.board.verticesById[state.setupLastVertex];
          if (v) {
            for (var i = 0; i < v.adjEdges.length; i++) {
              var candidate = v.adjEdges[i];
              var occupied = state.players.some(function(p){ return p.roads[candidate]; });
              if (!occupied) { eid = candidate; break; }
            }
          }
        }
        if (eid) {
          HL.Game.placeInitialRoad(state, eid);
        } else {
          forceSetupAdvance(state);
        }
        refreshGame();
        setTimeout(driveTurns, 300);
      }, 350);
    }, 300);
  }

  function forceSetupAdvance(state) {
    state.setupLastVertex = null;
    state.setupExpecting = 'settlement';
    state.setupIndex++;
    if (state.setupIndex >= state.setupOrder.length) {
      state.phase = 'play';
      state.turnState = 'roll';
      state.currentPlayerIdx = state.setupOrder[0];
    }
  }

  // ===== AI: turn =====
  function runAiTurn() {
    var state = app.game;
    var p = state.players[state.currentPlayerIdx];
    HL.UI.updateHud(state);

    var actions = HL.AI.takeTurn(state, p.idx);
    runAiActions(actions, 0);
  }

  function runAiActions(actions, i) {
    if (i >= actions.length) { driveTurns(); return; }
    var state = app.game;
    var p = state.players[state.currentPlayerIdx];
    var a = actions[i];

    function next(delay) {
      refreshGame();
      setTimeout(function(){ runAiActions(actions, i + 1); }, delay || 400);
    }

    switch (a.type) {
      case 'roll':
        HL.UI.rollDiceAnim();
        setTimeout(function() {
          HL.Game.rollDice(state);
          refreshGame();
          if (state.turnState !== 'main') {
            // Handle robber etc — re-enter drive
            setTimeout(driveTurns, 400);
          } else {
            setTimeout(function(){ runAiActions(actions.slice(1), 0); }, 400);
          }
        }, 500);
        return;
      case 'play-dev':
        if (a.kind === 'knight') {
          var dr = HL.Game.playDev(state, 'knight');
          if (!dr.ok) { next(0); return; }
          refreshGame();
          // Move robber
          setTimeout(function(){
            var tile = HL.AI.pickRobberTile(state, p.idx);
            HL.Game.moveRobber(state, tile);
            refreshGame();
            if (state.turnState === 'robber-steal') {
              var tgt = HL.AI.pickStealTarget(state, p.idx, state.robberStealCandidates);
              HL.Game.stealCard(state, tgt);
            }
            refreshGame();
            // After knight, re-evaluate actions if still our turn (handles both 'main' and 'roll' restore)
            if (state.phase === 'play' &&
                state.players[state.currentPlayerIdx].idx === p.idx &&
                (state.turnState === 'main' || state.turnState === 'roll')) {
              var more = HL.AI.takeTurn(state, p.idx);
              setTimeout(function(){ runAiActions(more, 0); }, 400);
            } else {
              setTimeout(driveTurns, 400);
            }
          }, 400);
          return;
        } else if (a.kind === 'mono') {
          HL.Game.playDev(state, 'mono');
          HL.Game.resolveMonopoly(state, a.res);
          next();
          return;
        } else if (a.kind === 'plenty') {
          HL.Game.playDev(state, 'plenty');
          HL.Game.resolvePlenty(state, a.picks);
          next();
          return;
        } else if (a.kind === 'road') {
          HL.Game.playDev(state, 'road');
          refreshGame();
          // Place two free roads
          setTimeout(function(){
            for (var r = 0; r < 2; r++) {
              var legal = HL.Board.legalRoadEdges(state.board, state.players, p.idx);
              if (legal.length === 0) { state.freeRoadsLeft = 0; break; }
              var bestE = pickAiFreeRoad(state, p, legal);
              if (!bestE) { state.freeRoadsLeft = 0; break; }
              HL.Game.buildRoad(state, bestE, true);
              state.freeRoadsLeft--;
            }
            state.turnState = 'main';
            refreshGame();
            var more = HL.AI.takeTurn(state, p.idx);
            setTimeout(function(){ runAiActions(more, 0); }, 350);
          }, 300);
          return;
        }
        next();
        return;
      case 'build-road':
        HL.Game.buildRoad(state, a.eid);
        next();
        return;
      case 'build-settlement':
        HL.Game.buildSettlement(state, a.vid);
        next();
        return;
      case 'build-city':
        HL.Game.buildCity(state, a.vid);
        next();
        return;
      case 'buy-dev':
        HL.Game.buyDev(state);
        next();
        return;
      case 'bank-trade':
        HL.Game.tradeWithBank(state, a.give, a.gain);
        next();
        return;
      case 'end-turn':
        if (state.phase === 'over') { next(0); return; }
        HL.Game.endTurn(state);
        refreshGame();
        setTimeout(driveTurns, 500);
        return;
    }
    next();
  }

  function pickAiFreeRoad(state, p, legal) {
    // Mirror the logic from ai.js's pickBestRoad
    var best = null, bestScore = -Infinity;
    legal.forEach(function(eid) {
      var e = state.board.edgesById[eid];
      var v1 = state.board.verticesById[e.v1];
      var v2 = state.board.verticesById[e.v2];
      var score = HL.AI.scoreVertex(state, v1.id, p.aiStyle) + HL.AI.scoreVertex(state, v2.id, p.aiStyle);
      if (Object.keys(p.roads).some(function(reid){
        var r = state.board.edgesById[reid];
        return r.v1 === e.v1 || r.v1 === e.v2 || r.v2 === e.v1 || r.v2 === e.v2;
      })) score += 3;
      if (score > bestScore) { bestScore = score; best = eid; }
    });
    return best;
  }

  // ===== AI: robber move =====
  function runAiRobberMove() {
    var state = app.game;
    var tile = HL.AI.pickRobberTile(state, state.robberMover);
    setTimeout(function() {
      HL.Game.moveRobber(state, tile);
      refreshGame();
      if (state.turnState === 'robber-steal') {
        var tgt = HL.AI.pickStealTarget(state, state.robberMover, state.robberStealCandidates);
        setTimeout(function() {
          HL.Game.stealCard(state, tgt);
          refreshGame();
          setTimeout(driveTurns, 300);
        }, 300);
      } else {
        setTimeout(driveTurns, 300);
      }
    }, 300);
  }

  // ===== Human: roll =====
  function humanRoll() {
    HL.UI.rollDiceAnim();
    setTimeout(function() {
      HL.Game.rollDice(app.game);
      refreshGame();
      // If we triggered the robber-discard for ourselves, drive will handle
      // If we need to move robber, drive will switch to robber-move
      if (app.game.turnState !== 'main') {
        setTimeout(driveTurns, 400);
      }
    }, 500);
  }

  // ===== Human: build modes =====
  function enterBuildSettlementMode() {
    HL.UI.closePopover();
    var state = app.game;
    var p = state.players[0];
    var legal = HL.Board.legalSettlementVertices(state.board, state.players, p);
    if (legal.length === 0) { HL.UI.toast('No legal spot', 'danger'); return; }
    HL.UI.startVertexPick(state, legal, {
      label: 'Build settlement (-1 ea wood, brick, sheep, wheat)',
      onConfirm: function(vid) {
        var r = HL.Game.buildSettlement(state, vid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function enterBuildCityMode() {
    HL.UI.closePopover();
    var state = app.game;
    var p = state.players[0];
    var legal = HL.Board.legalCityVertices(state.board, p);
    if (legal.length === 0) { HL.UI.toast('No settlement to upgrade', 'danger'); return; }
    HL.UI.startVertexPick(state, legal, {
      label: 'Upgrade settlement to city (-2 wheat, -3 ore)',
      onConfirm: function(vid) {
        var r = HL.Game.buildCity(state, vid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function enterBuildRoadMode() {
    HL.UI.closePopover();
    var state = app.game;
    var legal = HL.Board.legalRoadEdges(state.board, state.players, 0);
    if (legal.length === 0) { HL.UI.toast('No legal road spot', 'danger'); return; }
    HL.UI.startEdgePick(state, legal, {
      label: 'Build road (-1 wood, -1 brick)',
      onConfirm: function(eid) {
        var r = HL.Game.buildRoad(state, eid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function startHumanFreeRoad() {
    var state = app.game;
    var legal = HL.Board.legalRoadEdges(state.board, state.players, 0);
    if (legal.length === 0 || state.freeRoadsLeft <= 0) {
      state.turnState = 'main';
      state.freeRoadsLeft = 0;
      refreshGame();
      return;
    }
    HL.UI.startEdgePick(state, legal, {
      label: 'Free road ' + (3 - state.freeRoadsLeft) + ' of 2',
      mandatory: true,
      onConfirm: function(eid) {
        HL.Game.buildRoad(state, eid, true);
        state.freeRoadsLeft--;
        if (state.freeRoadsLeft <= 0) state.turnState = 'main';
        refreshGame();
        if (state.freeRoadsLeft > 0 && state.turnState === 'free-road') {
          setTimeout(startHumanFreeRoad, 200);
        }
      }
    });
  }

  function runAiFreeRoad() {
    var state = app.game;
    var p = state.players[state.currentPlayerIdx];
    while (state.freeRoadsLeft > 0) {
      var legal = HL.Board.legalRoadEdges(state.board, state.players, p.idx);
      if (legal.length === 0) break;
      var eid = pickAiFreeRoad(state, p, legal);
      if (!eid) break;
      HL.Game.buildRoad(state, eid, true);
      state.freeRoadsLeft--;
    }
    state.turnState = 'main';
    refreshGame();
    setTimeout(driveTurns, 350);
  }

  // ===== Dev cards =====
  function openDevMenu() {
    HL.UI.populateDevMenu(app.game);
    HL.UI.openPopover('dev-menu');
  }

  function doBuyDev() {
    HL.UI.closePopover();
    var r = HL.Game.buyDev(app.game);
    if (!r.ok) HL.UI.toast(r.err, 'danger');
    else HL.UI.toast('Bought: ' + r.card);
    refreshGame();
    checkWinAndDrive();
  }

  function playKnight() {
    var state = app.game;
    var r = HL.Game.playDev(state, 'knight');
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    refreshGame();
    if (state.turnState === 'robber-move') startHumanRobberMove();
    checkWinAndDrive();
  }

  function playRoadCard() {
    var state = app.game;
    var r = HL.Game.playDev(state, 'road');
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    refreshGame();
    startHumanFreeRoad();
  }

  function playMonopolyCard() {
    var state = app.game;
    var r = HL.Game.playDev(state, 'mono');
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    refreshGame();
    startHumanMonopolyPick();
  }

  function playPlentyCard() {
    var state = app.game;
    var r = HL.Game.playDev(state, 'plenty');
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    refreshGame();
    startHumanPlentyPick();
  }

  // ===== Pickers (mono / plenty) =====
  function startHumanMonopolyPick() {
    // Reuse the action-menu popover dynamically
    var menu = document.getElementById('action-menu');
    menu.querySelector('.popover-title').textContent = 'Choose a resource to monopolize';
    var list = menu.querySelector('.popover-list');
    list.innerHTML = '';
    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var b = document.createElement('button');
      b.className = 'pop-item focusable';
      b.setAttribute('data-action', 'pick-mono');
      b.setAttribute('data-res', res);
      b.innerHTML = '<span class="cost-row"><span class="ci res-' + res + '"></span></span><span class="pop-label">' + res + '</span>';
      list.appendChild(b);
    });
    HL.UI.openPopover('action-menu', { mandatory: true });
  }
  function doResolveMonopoly(res) {
    HL.UI.closePopover(true);
    HL.Game.resolveMonopoly(app.game, res);
    refreshGame();
    restoreActionMenu();
    checkWinAndDrive();
  }

  function startHumanPlentyPick() {
    app.game._plentyPicked = [];
    showPlentyMenu();
  }
  function showPlentyMenu() {
    var menu = document.getElementById('action-menu');
    var picks = app.game._plentyPicked;
    menu.querySelector('.popover-title').textContent = 'Year of Plenty — pick ' + (picks.length === 0 ? 'first' : 'second');
    var list = menu.querySelector('.popover-list');
    list.innerHTML = '';
    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var b = document.createElement('button');
      b.className = 'pop-item focusable';
      b.setAttribute('data-action', 'pick-plenty');
      b.setAttribute('data-res', res);
      b.disabled = app.game.bank[res] <= 0;
      b.innerHTML = '<span class="cost-row"><span class="ci res-' + res + '"></span></span><span class="pop-label">' + res + ' <span class="text-muted" style="font-size:11px">(bank: ' + app.game.bank[res] + ')</span></span>';
      list.appendChild(b);
    });
    HL.UI.openPopover('action-menu', { mandatory: true });
  }
  function doResolvePlenty(res) {
    app.game._plentyPicked.push(res);
    if (app.game._plentyPicked.length < 2) {
      showPlentyMenu();
      return;
    }
    HL.UI.closePopover(true);
    HL.Game.resolvePlenty(app.game, app.game._plentyPicked);
    refreshGame();
    restoreActionMenu();
    checkWinAndDrive();
  }

  function restoreActionMenu() {
    // Rebuild the original action-menu content
    var menu = document.getElementById('action-menu');
    menu.querySelector('.popover-title').textContent = 'Actions';
    var list = menu.querySelector('.popover-list');
    list.innerHTML = ORIGINAL_ACTION_MENU_HTML;
  }
  var ORIGINAL_ACTION_MENU_HTML = '';

  // ===== Trade Bank =====
  function openBankTrade() {
    HL.UI.closePopover();
    HL.UI.setupBankTradeScreen(app.game);
    HL.UI.go('trade-bank');
  }
  function bankPickGive(res) { app.game._bankTrade.give = res; HL.UI.refreshBankTradeScreen(app.game); }
  function bankPickRecv(res) { app.game._bankTrade.gain = res; HL.UI.refreshBankTradeScreen(app.game); }
  function doBankTrade() {
    var bt = app.game._bankTrade;
    if (!bt.give || !bt.gain) return;
    var r = HL.Game.tradeWithBank(app.game, bt.give, bt.gain);
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    HL.UI.toast('Traded!');
    HL.UI.back();
    refreshGame();
  }

  // ===== Trade Players =====
  function openPlayerTrade() {
    HL.UI.closePopover();
    HL.UI.setupPlayerTradeScreen(app.game);
    HL.UI.go('trade-players');
  }
  function ptInc(side, res) {
    var state = app.game;
    var pt = state._playerTrade;
    var p = state.players[0];
    var max;
    if (side === 'give') {
      max = p.hand[res] - pt.give[res];
      if (max <= 0) {
        // wrap back to 0
        pt.give[res] = 0;
      } else {
        pt.give[res] = (pt.give[res] + 1);
        if (pt.give[res] > p.hand[res]) pt.give[res] = 0;
      }
    } else {
      // Receive: cap at 19 (basically unlimited)
      pt.recv[res] = (pt.recv[res] + 1) % 6;
    }
    HL.UI.refreshPlayerTradeScreen(state);
    document.getElementById('trade-responses').innerHTML = '';
  }
  function resetPlayerTrade() {
    HL.UI.setupPlayerTradeScreen(app.game);
  }
  function proposePlayerTrade() {
    var state = app.game;
    var pt = state._playerTrade;
    // Evaluate from each AI's perspective
    var responses = [];
    state.players.forEach(function(p) {
      if (p.idx === 0) return;
      var accept = HL.AI.evaluateTrade(state, p.idx, pt.give, pt.recv);
      responses.push({ idx: p.idx, accept: accept, reason: accept ? null : 'Not worth it' });
    });
    HL.UI.showTradeResponses(state, responses);
  }
  function acceptTradeWith(idx) {
    var state = app.game;
    var pt = state._playerTrade;
    var r = HL.Game.executePlayerTrade(state, 0, idx, pt.give, pt.recv);
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    HL.UI.toast('Trade done');
    HL.UI.back();
    refreshGame();
  }

  // ===== Discard =====
  function discardPick(res) {
    var state = app.game;
    var sel = state._discardSelected;
    var p = state.players[state.discardCurrent.idx];
    var need = state.discardCurrent.need;
    var total = sel.wood + sel.brick + sel.sheep + sel.wheat + sel.ore;
    if (sel[res] > 0) {
      // Already has selections of this resource — decrement (toggle/cycle)
      sel[res]--;
    } else if (sel[res] < p.hand[res] && total < need) {
      // Increment from zero
      sel[res]++;
    } else if (total >= need) {
      HL.UI.toast('Deselect another first', 'danger');
    }
    HL.UI.refreshDiscardScreen(state, p, need);
  }
  function confirmDiscard() {
    var state = app.game;
    var sel = state._discardSelected;
    var p = state.players[state.discardCurrent.idx];
    Object.keys(sel).forEach(function(res){
      p.hand[res] -= sel[res];
      state.bank[res] += sel[res];
    });
    HL.Game.pushEvent(state, p.name + ' discarded ' + (sel.wood+sel.brick+sel.sheep+sel.wheat+sel.ore));
    proceedAfterDiscard();
  }
  function proceedAfterDiscard() {
    var state = app.game;
    if (state.discardQueue.length > 0) {
      state.discardCurrent = state.discardQueue.shift();
      // If still human (shouldn't happen since only one human), reuse screen
      if (state.discardCurrent.idx === 0) {
        HL.UI.populateDiscardScreen(state, state.players[0], state.discardCurrent.need);
        return;
      }
    }
    state.discardCurrent = null;
    state.turnState = 'robber-move';
    HL.UI.go('game', { history: false });
    refreshGame();
    setTimeout(driveTurns, 200);
  }

  // ===== Human: robber move =====
  function startHumanRobberMove() {
    var state = app.game;
    var candidates = state.board.tiles
      .filter(function(t){ return t.id !== state.board.robberTileId; })
      .map(function(t){ return t.id; });
    HL.UI.startTilePick(state, candidates, {
      label: 'Move the robber',
      mandatory: true,
      onConfirm: function(tid) {
        var res = HL.Game.moveRobber(state, tid);
        refreshGame();
        if (state.turnState === 'robber-steal') {
          startHumanStealPick();
        } else {
          driveTurns();
        }
      }
    });
  }
  function startHumanStealPick() {
    var state = app.game;
    if (state.robberStealCandidates.length === 0) {
      state.turnState = 'main';
      refreshGame();
      driveTurns();
      return;
    }
    // Show a quick popover with candidates
    var menu = document.getElementById('action-menu');
    menu.querySelector('.popover-title').textContent = 'Steal from whom?';
    var list = menu.querySelector('.popover-list');
    list.innerHTML = '';
    state.robberStealCandidates.forEach(function(idx) {
      var p = state.players[idx];
      var b = document.createElement('button');
      b.className = 'pop-item focusable';
      b.setAttribute('data-action', 'steal-pick');
      b.setAttribute('data-with', idx);
      b.innerHTML = '<span class="cost-row"><span style="display:inline-block;width:14px;height:14px;background:' + HL.Render.PLAYER_HEX[p.color].fill + ';border-radius:50%"></span></span><span class="pop-label">' + p.name + ' (' + HL.Game.totalCards(p.hand) + ' cards)</span>';
      list.appendChild(b);
    });
    HL.UI.openPopover('action-menu', { mandatory: true });
  }

  function doStealPick(idx) {
    var state = app.game;
    HL.Game.stealCard(state, idx);
    HL.UI.closePopover(true);
    restoreActionMenu();
    refreshGame();
    checkWinAndDrive();
  }

  // ===== End turn =====
  function doEndTurn() {
    var state = app.game;
    if (state.turnState !== 'main') {
      HL.UI.toast('Finish current action first', 'danger');
      return;
    }
    HL.Game.endTurn(state);
    refreshGame();
    setTimeout(driveTurns, 250);
  }

  function checkWinAndDrive() {
    var state = app.game;
    if (state.phase === 'over') {
      setTimeout(driveTurns, 300);
      return;
    }
    if (state.players[state.currentPlayerIdx].idx !== 0) {
      setTimeout(driveTurns, 300);
    }
  }

  function afterCursorConfirm() {
    // After confirming cursor in setup placement
  }

  // Cache the original action-menu HTML before we mutate it for mono/plenty
  function cacheActionMenuHTML() {
    var menu = document.getElementById('action-menu');
    if (menu) ORIGINAL_ACTION_MENU_HTML = menu.querySelector('.popover-list').innerHTML;
  }

  // Open action menu
  function openActionMenu() {
    HL.UI.populateActionMenu(app.game);
    HL.UI.openPopover('action-menu');
  }
  function openPlayersMenu() {
    HL.UI.populatePlayersMenu(app.game);
    HL.UI.openPopover('players-menu');
  }

  // ===== Boot =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      cacheActionMenuHTML();
      init();
    });
  } else {
    cacheActionMenuHTML();
    init();
  }

})();
