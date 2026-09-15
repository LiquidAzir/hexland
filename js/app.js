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
      difficulty: 'normal',
      // Variant settings — defaults match the base game
      winVP: 10,
      noRobber: false,
      humanCount: 1,             // 1-4 humans, rest filled with AI to 4
      humans: null,              // populated at beginGame from playerName+playerColor + extras
      sound: true
    },
    game: null,
    savedGame: null,
    pendingAction: null          // queued callback after handoff
  };

  var STORAGE_KEY = 'hexland_save_v1';
  var tasks=[], clock=0, lastFrame=0, rolling=false,tradeConsent=null;
  function later(fn,ms){tasks.push({at:clock+(ms||0),fn:fn,game:app.game});}
  function advance(ms){
    if(!['game','discard'].includes(HL.UI.currentScreen()))return;
    var end=clock+Math.max(0,Math.min(Number(ms)||0,60000)),steps=0;
    while(steps++<200){tasks.sort(function(a,b){return a.at-b.at});var t=tasks[0];if(!t||t.at>end)break;tasks.shift();clock=t.at;if(t.game===app.game)t.fn();if(!['game','discard'].includes(HL.UI.currentScreen()))break;}
    clock=end;
  }
  function frame(now){var dt=lastFrame?Math.min(now-lastFrame,100):0;lastFrame=now;advance(dt);requestAnimationFrame(frame);}
  function clearTasks(){tradeConsent=null;document.getElementById('trade-consent').classList.add('hidden');tasks=[];rolling=false;app.pendingAction=null;document.querySelectorAll('.die.rolling').forEach(function(d){d.classList.remove('rolling');});document.getElementById('handoff-overlay').classList.add('hidden');HL.UI.resetInteraction();}
  function pauseGame(){if(!app.game)return;saveGame();HL.UI.resetInteraction();HL.UI.go('pause',{history:false});}
  function resumeGame(){HL.UI.go('game',{history:false});refreshGame();if(!tasks.length)later(driveTurns,80);}

  // ===== Boot =====
  function init() {
    HL.UI.init();
    HL.Art.menu();
    // Restore sound preference
    try {
      var s = localStorage.getItem('hexland_setup_sound');
      if (s === '0') app.setup.sound = false;
    } catch(e) {}
    HL.Sound.setMuted(!app.setup.sound);
    wireEvents();
    wireBoardClicks();
    setupResponsiveScaling();
    loadSaved();
    refreshMenuButtons();
    HL.UI.go('menu', { history: false });
    requestAnimationFrame(frame);
    window.advanceTime=function(ms){advance(ms);return HL.Art.ready();};
    window.render_game_to_text=function(){var s=app.game,p=s&&s.players[s.localHumanIdx||0];return JSON.stringify({screen:HL.UI.currentScreen(),coordinates:'board SVG: origin center; +x right, +y down',phase:s&&s.phase,turnState:s&&s.turnState,currentPlayer:s&&s.currentPlayerIdx,localPlayer:s&&s.localHumanIdx,setup:s&&{index:s.setupIndex,expecting:s.setupExpecting,player:s.setupOrder[s.setupIndex]},hand:p&&p.hand,bank:s&&s.bank,dice:s&&s.lastDice,players:s&&s.players.map(function(p){return{name:p.name,isAI:p.isAI,vp:HL.Game.visibleVP(s,p),cards:HL.Game.totalCards(p.hand),settlements:Object.keys(p.settlements),cities:Object.keys(p.cities),roads:Object.keys(p.roads)}}),cursor:HL.UI.cursorSnapshot(),popover:HL.UI.popoverId(),focus:document.activeElement&&{id:document.activeElement.id,action:document.activeElement.dataset.action},robber:s&&s.board.robberTileId,freeRoads:s&&s.freeRoadsLeft,rolling:rolling,pendingTasks:tasks.length,render:HL.Art.stats()});};
    if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).has('test'))window.__hexland={snapshot:function(){return JSON.parse(JSON.stringify(app.game));},load:function(raw){clearTasks();app.savedGame=HL.Game.restore(raw);continueGame();},newGame:function(opts){clearTasks();app.game=HL.Game.newGame(opts);HL.UI.go('game',{history:false});refreshGame();later(driveTurns,1);},drive:function(){driveTurns();}};
  }

  // ===== Responsive scaling (phone/desktop, transparent on glasses) =====
  function setupResponsiveScaling() {
    document.getElementById('app').style.transform='';
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

    svg.addEventListener('click', function(e) {
      if(tryConfirm(e.target)){e.preventDefault();e.stopPropagation();}
    });
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) app.savedGame = HL.Game.restore(JSON.parse(raw));
    } catch (e) {}
  }

  function saveGame() {
    if (!app.game || app.game.phase === 'over') {
      try{localStorage.removeItem(STORAGE_KEY);}catch(e){}
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
    // Resume Web Audio on first user gesture (required by browsers)
    var resumeOnce = function() {
      HL.Sound.resume();
      document.removeEventListener('pointerdown', resumeOnce);
      document.removeEventListener('click', resumeOnce);
      document.removeEventListener('keydown', resumeOnce);
    };
    document.addEventListener('pointerdown', resumeOnce);
    document.addEventListener('click', resumeOnce);
    document.addEventListener('keydown', resumeOnce);

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
          if (inInput){document.querySelector('[data-action=start-game]').focus();e.preventDefault();break;}
          if (document.activeElement && document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          if(tradeConsent){finishTradeConsent(false);}
          else if(HL.UI.currentScreen()==='pause'){resumeGame();}
          else if (HL.UI.isCursorActive()) { if(HL.UI.cursorSnapshot().mandatory)pauseGame();else HL.UI.cancelCursor(); }
          else if (HL.UI.isPopoverOpen()) { HL.UI.closePopover(); }
          else if(HL.UI.currentScreen()==='game'||HL.UI.currentScreen()==='discard'){pauseGame();}
          else HL.UI.back();
          e.preventDefault();
          break;
        case 'Tab': HL.UI.tabFocus(e.shiftKey);e.preventDefault();break;
        case 'f': if(!document.fullscreenElement)document.getElementById('app').requestFullscreen?.();else document.exitFullscreen?.();break;
      }
    });
  }

  function handleArrow(dir) {
    if(app.pendingAction){document.getElementById('handoff-ready').focus();return;}
    if (HL.UI.isCursorActive() && app.game && document.activeElement.id==='board-control') {
      if(!HL.UI.moveCursor(app.game, dir))document.getElementById('btn-pause').focus();
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
      case 'consent-accept':finishTradeConsent(true);break;
      case 'consent-decline':finishTradeConsent(false);break;
      case 'pause': pauseGame();break;
      case 'resume-game': resumeGame();break;
      case 'save-exit': saveGame();HL.UI.go('menu',{history:false});refreshMenuButtons();break;
      case 'confirm-location':if(HL.UI.isCursorActive()){HL.UI.confirmCursor();afterCursorConfirm();}else onPrimary();break;
      case 'how-to-play':    HL.UI.closePopover(true); HL.UI.go('how-to-play'); break;
      case 'back':           HL.UI.back(); break;
      case 'go-menu':        clearTasks();HL.UI.go('menu', { history: false });refreshMenuButtons(); break;

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
      case 'toggle-more-options':
        document.getElementById('more-options').classList.toggle('hidden');
        document.getElementById('more-options-arrow').textContent =
          document.getElementById('more-options').classList.contains('hidden') ? '▸' : '▾';
        break;
      case 'set-winvp':
        app.setup.winVP = parseInt(el.dataset.winvp, 10) || 10;
        HL.UI.setOptionSeg('winvp-picker', el.dataset.winvp);
        break;
      case 'set-humans':
        app.setup.humanCount = parseInt(el.dataset.humans, 10) || 1;
        HL.UI.setOptionSeg('humans-picker', el.dataset.humans);
        break;
      case 'toggle-sound':
        app.setup.sound = !app.setup.sound;
        HL.Sound.setMuted(!app.setup.sound);
        HL.UI.setToggle('sound-toggle', app.setup.sound);
        try { localStorage.setItem('hexland_setup_sound', app.setup.sound ? '1' : '0'); } catch(e){}
        break;
      case 'toggle-robber':
        app.setup.noRobber = !app.setup.noRobber;
        HL.UI.setToggle('robber-toggle', !app.setup.noRobber);
        break;

      // Pass-and-play handoff
      case 'handoff-ready':
        if (app.pendingAction) { var pa = app.pendingAction; app.pendingAction = null; pa(); }
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
    HL.UI.setOptionSeg('humans-picker', app.setup.humanCount);
    HL.UI.setOptionSeg('winvp-picker', app.setup.winVP);
    HL.UI.setToggle('sound-toggle', app.setup.sound);
    HL.UI.setToggle('robber-toggle', !app.setup.noRobber);
    var input = document.getElementById('player-name-input');
    if (input) input.value = app.setup.playerName;
  }

  function continueGame() {
    if (!app.savedGame) return;
    clearTasks();
    var saved = HL.Game.restore(app.savedGame);
    if(!saved){app.savedGame=null;refreshMenuButtons();HL.UI.toast('This save could not be read');return;}
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
    later(driveTurns, 200);
  }

  function beginGame() {
    clearTasks();
    var nameInput = document.getElementById('player-name-input');
    if (nameInput) app.setup.playerName = (nameInput.value || 'You').slice(0, 12);

    // Apply sound preference
    HL.Sound.setMuted(!app.setup.sound);

    // Build humans array from setup
    var humans = buildHumansFromSetup();

    app.game = HL.Game.newGame({
      humans: humans,
      difficulty: app.setup.difficulty,
      winVP: app.setup.winVP,
      noRobber: app.setup.noRobber,
      seed: (Date.now() ^ Math.floor(Math.random()*1e9)) >>> 0
    });

    HL.UI.go('game', { history: false });
    refreshGame();
    later(driveTurns, 250);
  }

  // Build humans list. Player 1 always = the user's name+color from Setup.
  // Extra humans get generic names + unused colors.
  function buildHumansFromSetup() {
    var allColors = ['red', 'blue', 'orange', 'white'];
    var firstColor = app.setup.playerColor;
    var rest = allColors.filter(function(c){ return c !== firstColor; });
    var humans = [{ name: app.setup.playerName || 'You', color: firstColor }];
    var defaultNames = ['Player 2', 'Player 3', 'Player 4'];
    for (var i = 1; i < (app.setup.humanCount || 1); i++) {
      humans.push({ name: defaultNames[i - 1], color: rest[i - 1] });
    }
    return humans;
  }

  // ===== Pass-and-play handoff =====
  // If the active player (setup or play) is a human OTHER than the local one,
  // pause control and show a handoff prompt. Otherwise just run `next`.
  function ensureLocalIsCurrentHuman(state, next) {
    var active;
    if (state.phase === 'setup') {
      active = HL.Game.currentSetupPlayer(state);
    } else if (state.phase === 'play') {
      if (state.turnState === 'robber-discard' && state.discardCurrent) {
        active = state.players[state.discardCurrent.idx];
      } else {
        active = state.players[state.currentPlayerIdx];
      }
    }
    if (!active || active.isAI) { next(); return; }
    if (active.idx === state.localHumanIdx) { next(); return; }
    // Defensive: single-human game (or unset localHumanIdx) — no handoff ever needed
    var humanCount = state.players.filter(function(p){return !p.isAI;}).length;
    if (humanCount <= 1) { state.localHumanIdx = active.idx; next(); return; }

    // Show handoff overlay
    showHandoffOverlay(active, function() {
      state.localHumanIdx = active.idx;
      refreshGame();
      next();
    });
  }

  function showHandoffOverlay(player, onReady) {
    var ov = document.getElementById('handoff-overlay');
    if (!ov) { onReady(); return; }
    document.getElementById('handoff-name').textContent = player.name;
    var swatch = document.getElementById('handoff-swatch');
    if (swatch) swatch.style.background = HL.Render.PLAYER_HEX[player.color].fill;
    ov.classList.remove('hidden');
    var btn = document.getElementById('handoff-ready');
    btn.focus();
    app.pendingAction = function() {
      ov.classList.add('hidden');
      app.pendingAction = null;
      onReady();
    };
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
    var localIdx = state.localHumanIdx || 0;
    if (state.phase === 'setup') {
      var setupP = HL.Game.currentSetupPlayer(state);
      if (setupP.idx !== localIdx) return;
      if (state.setupExpecting === 'settlement') startHumanSetupSettlement();
      else startHumanSetupRoad();
    } else if (state.phase === 'play') {
      var cp = state.players[state.currentPlayerIdx];
      if (cp.idx !== localIdx || cp.isAI) return;
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
        later(startHumanSetupRoad, 150);
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
        later(driveTurns, 300);
      }
    });
  }

  // ===== Drive AI / setup AI / next phase =====
  function driveTurns() {
    var state = app.game;
    if (!state||!['game','discard'].includes(HL.UI.currentScreen())||app.pendingAction) return;
    HL.Game.checkWin(state);

    if (state.phase === 'over') {
      HL.UI.showGameOver(state);
      HL.UI.go('game-over', { history: false });
      saveGame();
      return;
    }

    if (state.phase === 'setup') {
      var setupP = HL.Game.currentSetupPlayer(state);
      if (!setupP.isAI) {
        ensureLocalIsCurrentHuman(state, function() {
          HL.UI.updateHud(state);
          if (state.setupExpecting === 'settlement') startHumanSetupSettlement();
          else startHumanSetupRoad();
        });
        return;
      }
      runAiSetupStep();
      return;
    }

    if (state.phase === 'play') {
      var cp = state.players[state.currentPlayerIdx];

      // Discard handling
      if (state.turnState === 'robber-discard') {
        var dc = state.discardCurrent;
        if (dc && !state.players[dc.idx].isAI) {
          ensureLocalIsCurrentHuman(state, function() {
            HL.UI.populateDiscardScreen(state, state.players[dc.idx], dc.need);
            HL.UI.go('discard');
          });
          return;
        }
        // AI discards already resolved at roll, but be defensive
        proceedAfterDiscard();
        return;
      }

      if (state.turnState === 'robber-move') {
        if (!state.players[state.robberMover].isAI) {
          ensureLocalIsCurrentHuman(state, startHumanRobberMove);
        } else {
          runAiRobberMove();
        }
        return;
      }
      if (state.turnState === 'robber-steal') {
        if (!state.players[state.robberMover].isAI) {
          ensureLocalIsCurrentHuman(state, startHumanStealPick);
        } else {
          var tgt = HL.AI.pickStealTarget(state, state.robberMover, state.robberStealCandidates);
          HL.Game.stealCard(state, tgt);
          refreshGame();
          later(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'pick-monopoly') {
        if (!cp.isAI) ensureLocalIsCurrentHuman(state, startHumanMonopolyPick);
        else {
          var res = chooseAIMonopoly(state, cp);
          HL.Game.resolveMonopoly(state, res);
          refreshGame();
          later(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'pick-plenty') {
        if (!cp.isAI) ensureLocalIsCurrentHuman(state, startHumanPlentyPick);
        else {
          var picks = chooseAIPlenty(state, cp);
          HL.Game.resolvePlenty(state, picks);
          refreshGame();
          later(driveTurns, 350);
        }
        return;
      }
      if (state.turnState === 'free-road') {
        if (!cp.isAI) ensureLocalIsCurrentHuman(state, startHumanFreeRoad);
        else runAiFreeRoad();
        return;
      }

      if (!cp.isAI) {
        // Human main turn — handoff if needed, then wait
        ensureLocalIsCurrentHuman(state, function() { HL.UI.updateHud(state); });
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
  function chooseAIPlenty(state,p){return HL.AI.chooseBestResources(state,p,2);}

  // Replace bad `require` calls above
  function fixDriveTurnsHelpers() {}

  // ===== AI: setup =====
  function runAiSetupStep() {
    var state = app.game;
    var setupP = HL.Game.currentSetupPlayer(state);
    if(state.setupExpecting==='road'){
      later(function(){var eid=HL.AI.pickInitialRoad(state,setupP.idx)||HL.Game.legalInitialRoad(state)[0];if(eid)HL.Game.placeInitialRoad(state,eid);refreshGame();later(driveTurns,250);},250);return;
    }
    later(function() {
      // Settlement
      var vid = HL.AI.pickInitialSettlement(state, setupP.idx);
      if (!vid) {
        forceSetupAdvance(state);
        refreshGame();
        later(driveTurns, 200);
        return;
      }
      HL.Game.placeInitialSettlement(state, vid);
      refreshGame();
      later(function() {
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
        later(driveTurns, 300);
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
      later(function(){ runAiActions(actions, i + 1); }, delay || 400);
    }

    switch (a.type) {
      case 'roll':
        HL.UI.rollDiceAnim();
        later(function() {
          HL.Game.rollDice(state);
          refreshGame();
          if (state.turnState !== 'main') {
            // Handle robber etc — re-enter drive
            later(driveTurns, 400);
          } else {
            later(function(){ runAiActions(actions.slice(1), 0); }, 400);
          }
        }, 500);
        return;
      case 'play-dev':
        if (a.kind === 'knight') {
          var dr = HL.Game.playDev(state, 'knight');
          if (!dr.ok) { next(0); return; }
          refreshGame();
          if (state.noRobber) {
            // Chill mode — knight just counts, no robber move
            next();
            return;
          }
          // Move robber
          later(function(){
            var tile = HL.AI.pickRobberTile(state, p.idx);
            HL.Game.moveRobber(state, tile);
            HL.Sound.play('robber');
            refreshGame();
            if (state.turnState === 'robber-steal') {
              var tgt = HL.AI.pickStealTarget(state, p.idx, state.robberStealCandidates);
              var victim = state.players[tgt];
              HL.Game.stealCard(state, tgt);
              if (victim && !victim.isAI && victim.idx === (state.localHumanIdx || 0)) {
                var b = HL.AI.barb('rob-you');
                if (b) HL.UI.toast(p.name + ': "' + b + '"');
              }
            }
            refreshGame();
            // After knight, re-evaluate actions if still our turn (handles both 'main' and 'roll' restore)
            if (state.phase === 'play' &&
                state.players[state.currentPlayerIdx].idx === p.idx &&
                (state.turnState === 'main' || state.turnState === 'roll')) {
              var more = HL.AI.takeTurn(state, p.idx);
              later(function(){ runAiActions(more, 0); }, 400);
            } else {
              later(driveTurns, 400);
            }
          }, 400);
          return;
        } else if (a.kind === 'mono') {
          if(!HL.Game.playDev(state, 'mono').ok){next();return;}
          HL.Game.resolveMonopoly(state, a.res);
          next();
          return;
        } else if (a.kind === 'plenty') {
          if(!HL.Game.playDev(state, 'plenty').ok){next();return;}
          HL.Game.resolvePlenty(state, a.picks);
          next();
          return;
        } else if (a.kind === 'road') {
          if(!HL.Game.playDev(state, 'road').ok){next();return;}
          refreshGame();
          // Place two free roads
          later(function(){
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
            later(function(){ runAiActions(more, 0); }, 350);
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
        // Occasional barb if AI is closing in on victory
        var vp = HL.Game.totalVP(state, p);
        if (vp >= state.winVP - 2 && Math.random() < 0.35) {
          var b = HL.AI.barb('win-soon');
          if (b) HL.UI.toast(p.name + ': "' + b + '"');
        }
        HL.Game.endTurn(state);
        refreshGame();
        later(driveTurns, 500);
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
    var mover = state.players[state.robberMover];
    var tile = HL.AI.pickRobberTile(state, state.robberMover);
    later(function() {
      HL.Game.moveRobber(state, tile);
      HL.Sound.play('robber');
      refreshGame();
      if (state.turnState === 'robber-steal') {
        var tgt = HL.AI.pickStealTarget(state, state.robberMover, state.robberStealCandidates);
        later(function() {
          var victim = state.players[tgt];
          HL.Game.stealCard(state, tgt);
          if (victim && !victim.isAI && victim.idx === (state.localHumanIdx || 0)) {
            var b = HL.AI.barb('rob-you');
            if (b) HL.UI.toast(mover.name + ': "' + b + '"');
          }
          refreshGame();
          later(driveTurns, 300);
        }, 300);
      } else {
        later(driveTurns, 300);
      }
    }, 300);
  }

  // ===== Human: roll =====
  function humanRoll() {
    if(rolling||app.game.turnState!=='roll')return;
    rolling=true;document.getElementById('btn-primary').disabled=true;
    HL.Sound.play('roll');
    HL.UI.rollDiceAnim();
    later(function() {
      var r = HL.Game.rollDice(app.game);
      rolling=false;
      refreshGame();
      if (r.robber) HL.Sound.play('robber');
      else if (r.sum !== 7) HL.Sound.play('production');
      if (app.game.turnState !== 'main') {
        later(driveTurns, 400);
      }
    }, 500);
  }

  // ===== Human: build modes =====
  function enterBuildSettlementMode() {
    HL.UI.closePopover();
    var state = app.game;
    var p = state.players[state.currentPlayerIdx];
    var legal = HL.Board.legalSettlementVertices(state.board, state.players, p);
    if (legal.length === 0) { HL.UI.toast('No legal spot', 'danger'); return; }
    HL.UI.startVertexPick(state, legal, {
      label: 'Build settlement (-1 ea wood, brick, sheep, wheat)',
      onConfirm: function(vid) {
        var r = HL.Game.buildSettlement(state, vid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        else HL.Sound.play('build-settle');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function enterBuildCityMode() {
    HL.UI.closePopover();
    var state = app.game;
    var p = state.players[state.currentPlayerIdx];
    var legal = HL.Board.legalCityVertices(state.board, p);
    if (legal.length === 0) { HL.UI.toast('No settlement to upgrade', 'danger'); return; }
    HL.UI.startVertexPick(state, legal, {
      label: 'Upgrade settlement to city (-2 wheat, -3 ore)',
      onConfirm: function(vid) {
        var r = HL.Game.buildCity(state, vid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        else HL.Sound.play('build-city');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function enterBuildRoadMode() {
    HL.UI.closePopover();
    var state = app.game;
    var legal = HL.Board.legalRoadEdges(state.board, state.players, state.currentPlayerIdx);
    if (legal.length === 0) { HL.UI.toast('No legal road spot', 'danger'); return; }
    HL.UI.startEdgePick(state, legal, {
      label: 'Build road (-1 wood, -1 brick)',
      onConfirm: function(eid) {
        var r = HL.Game.buildRoad(state, eid);
        if (!r.ok) HL.UI.toast(r.err, 'danger');
        else HL.Sound.play('build-road');
        refreshGame();
        checkWinAndDrive();
      }
    });
  }

  function startHumanFreeRoad() {
    var state = app.game;
    var legal = HL.Board.legalRoadEdges(state.board, state.players, state.currentPlayerIdx);
    if (legal.length === 0 || state.freeRoadsLeft <= 0 || Object.keys(state.players[state.currentPlayerIdx].roads).length>=HL.Game.LIMITS.roads) {
      state.turnState = state._postDevState||'main';state._postDevState=null;
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
        if (state.freeRoadsLeft <= 0){state.turnState = state._postDevState||'main';state._postDevState=null;}
        refreshGame();
        if(state.phase==='over'){checkWinAndDrive();return;}
        if (state.freeRoadsLeft > 0 && state.turnState === 'free-road') {
          later(startHumanFreeRoad, 200);
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
    later(driveTurns, 350);
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
    else { HL.UI.toast('Bought: ' + r.card); HL.Sound.play('buy-dev'); }
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
    app.game._plentyPicked = app.game._plentyPicked||[];
    showPlentyMenu();
  }
  function showPlentyMenu() {
    var menu = document.getElementById('action-menu');
    var picks = app.game._plentyPicked;
    var need=Math.min(2,HL.Game.totalCards(app.game.bank));
    if(picks.length>=need){finishPlenty();return;}
    menu.querySelector('.popover-title').textContent = 'Year of Plenty — pick ' + (picks.length === 0 ? 'first' : 'second');
    var list = menu.querySelector('.popover-list');
    list.innerHTML = '';
    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var b = document.createElement('button');
      b.className = 'pop-item focusable';
      b.setAttribute('data-action', 'pick-plenty');
      b.setAttribute('data-res', res);
      b.disabled = app.game.bank[res] <= picks.filter(function(r){return r===res;}).length;
      b.innerHTML = '<span class="cost-row"><span class="ci res-' + res + '"></span></span><span class="pop-label">' + res + ' <span class="text-muted" style="font-size:11px">(bank: ' + app.game.bank[res] + ')</span></span>';
      list.appendChild(b);
    });
    HL.UI.openPopover('action-menu', { mandatory: true });
  }
  function doResolvePlenty(res) {
    if(app.game.bank[res]<=app.game._plentyPicked.filter(function(r){return r===res;}).length)return;
    app.game._plentyPicked.push(res);
    saveGame();
    if (app.game._plentyPicked.length < Math.min(2,HL.Game.totalCards(app.game.bank))) {
      showPlentyMenu();
      return;
    }
    finishPlenty();
  }
  function finishPlenty(){
    HL.UI.closePopover(true);
    var result=HL.Game.resolvePlenty(app.game, app.game._plentyPicked);
    if(!result.ok){app.game._plentyPicked=[];showPlentyMenu();return;}
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
    var p = state.players[state.currentPlayerIdx];
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
    // Evaluate from each AI's perspective. Other humans implicit accept (tap to confirm).
    var responses = [];
    state.players.forEach(function(p) {
      if (p.idx === state.currentPlayerIdx) return;
      if (!p.isAI) {
        responses.push({ idx: p.idx, accept: true, reason: 'Human — tap to confirm' });
      } else {
        var accept = HL.AI.evaluateTrade(state, p.idx, pt.give, pt.recv);
        responses.push({ idx: p.idx, accept: accept, reason: accept ? null : 'Not worth it' });
      }
    });
    HL.UI.showTradeResponses(state, responses);
  }
  function acceptTradeWith(idx) {
    var state = app.game;
    var pt = state._playerTrade;
    if(!state.players[idx].isAI){
      tradeConsent={state:state,from:state.currentPlayerIdx,to:idx,give:Object.assign({},pt.give),recv:Object.assign({},pt.recv)};
      document.getElementById('trade-consent-title').textContent=state.players[idx].name+' — your choice';
      function list(m){return Object.keys(m).filter(function(r){return m[r]>0;}).map(function(r){return m[r]+' '+r;}).join(', ');}
      document.getElementById('trade-consent-detail').textContent='Give '+list(pt.recv)+' to '+state.players[state.currentPlayerIdx].name+'. Receive '+list(pt.give)+'.';
      document.getElementById('trade-consent').classList.remove('hidden');document.querySelector('[data-action=consent-accept]').focus();return;
    }
    executeTrade(state,state.currentPlayerIdx,idx,pt.give,pt.recv);
  }
  function finishTradeConsent(accepted){var t=tradeConsent;tradeConsent=null;document.getElementById('trade-consent').classList.add('hidden');if(t&&accepted&&t.state===app.game)executeTrade(t.state,t.from,t.to,t.give,t.recv);else document.getElementById('btn-propose-trade').focus();}
  function executeTrade(state,from,idx,give,recv){
    var r = HL.Game.executePlayerTrade(state, from, idx, give, recv);
    if (!r.ok) { HL.UI.toast(r.err, 'danger'); return; }
    HL.UI.toast('Trade done');
    HL.Sound.play('trade');
    HL.UI.back();
    refreshGame();
  }

  // ===== Discard =====
  function discardPick(res) {
    var state = app.game;
    var sel = state._discardSelected;
    if (!state.discardCurrent) return;
    var p = state.players[state.discardCurrent.idx];
    var need = state.discardCurrent.need;
    var total = sel.wood + sel.brick + sel.sheep + sel.wheat + sel.ore;
    if (sel[res] < p.hand[res] && total < need) {
      sel[res]++;
    } else if(sel[res]>0){
      sel[res]=0;
    } else {
      HL.UI.toast('Tap a selected resource to clear it', 'danger');
    }
    HL.UI.refreshDiscardScreen(state, p, need);
    saveGame();
  }
  function confirmDiscard() {
    var state = app.game;
    var sel = state._discardSelected;
    var p = state.players[state.discardCurrent.idx];
    if(HL.Game.totalCards(sel)!==state.discardCurrent.need||Object.keys(sel).some(function(r){return sel[r]<0||sel[r]>p.hand[r];}))return;
    Object.keys(sel).forEach(function(res){
      p.hand[res] -= sel[res];
      state.bank[res] += sel[res];
    });
    HL.Game.pushEvent(state, p.name + ' discarded ' + (sel.wood+sel.brick+sel.sheep+sel.wheat+sel.ore));
    delete state._discardSelected;
    proceedAfterDiscard();
  }
  function proceedAfterDiscard() {
    var state = app.game;
    if (state.discardQueue.length > 0) {
      state.discardCurrent = state.discardQueue.shift();
      var next = state.players[state.discardCurrent.idx];
      // If still human, route through driveTurns so handoff kicks in for other humans
      if (!next.isAI) {
        HL.UI.go('game', { history: false });
        refreshGame();
        later(driveTurns, 100);
        return;
      }
    }
    state.discardCurrent = null;
    state.turnState = 'robber-move';
    HL.UI.go('game', { history: false });
    refreshGame();
    later(driveTurns, 200);
  }

  // ===== Human: robber move =====
  function startHumanRobberMove() {
    var state = app.game;
    var candidates = state.board.tiles
      .filter(function(t){ return t.id !== state.board.robberTileId && t.res !== 'sea'; })
      .map(function(t){ return t.id; });
    HL.UI.startTilePick(state, candidates, {
      label: 'Move the robber',
      mandatory: true,
      onConfirm: function(tid) {
        var res = HL.Game.moveRobber(state, tid);
        HL.Sound.play('robber');
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
      b.innerHTML = '<span class="cost-row"><span style="display:inline-block;width:14px;height:14px;background:' + HL.Render.PLAYER_HEX[p.color].fill + ';border-radius:50%"></span></span><span class="pop-label">' + HL.UI.esc(p.name) + ' (' + HL.Game.totalCards(p.hand) + ' cards)</span>';
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
    later(driveTurns, 250);
  }

  function checkWinAndDrive() {
    var state = app.game;
    if (state.phase === 'over') {
      var winner = state.players[state.winnerIdx];
      HL.Sound.play(winner && !winner.isAI ? 'win' : 'lose');
      later(driveTurns, 300);
      return;
    }
    if (state.players[state.currentPlayerIdx].isAI) {
      later(driveTurns, 300);
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
    if(!app.game||app.game.phase!=='play'||app.game.players[app.game.currentPlayerIdx].isAI||!['main','roll'].includes(app.game.turnState))return;
    restoreActionMenu();
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
