/* ============================================================
   ui.js — Screen routing, popovers, focus, placement cursor
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  var screens = {};
  var current = null;
  var history = [];

  // Placement cursor state
  // mode: null | 'vertex-pick' | 'edge-pick' | 'tile-pick'
  // candidates: array of ids
  // cursorId: currently focused id
  // onConfirm: (id) => void
  // onCancel: () => void
  // label: shown in mode banner
  var cursor = null;

  // Popover state — only one open at a time
  var openPopover = null;

  // ===== Initialization =====
  function init(state) {
    document.querySelectorAll('.screen').forEach(function(s){
      if (s.id) screens[s.id] = s;
    });
  }

  // ===== Navigation =====
  function go(screenId, opts) {
    opts = opts || {};
    if (current && opts.history !== false) history.push(current);
    Object.values(screens).forEach(function(s){ s.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      current = screenId;
      focusFirst(screens[screenId]);
    }
  }
  function back() {
    if (cursor) { cancelCursor(); return; }
    if (openPopover) { closePopover(); return; }
    if (history.length === 0) return;
    var prev = history.pop();
    Object.values(screens).forEach(function(s){ s.classList.add('hidden'); });
    if (screens[prev]) {
      screens[prev].classList.remove('hidden');
      current = prev;
      focusFirst(screens[prev]);
    }
  }
  function currentScreen() { return current; }

  // ===== Focus =====
  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }
  function moveFocus(dir) {
    // If a popover is open, scope focus to it
    var container;
    if (openPopover) container = openPopover;
    else container = screens[current];
    if (!container) return;

    var focusables = Array.from(
      container.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    );
    if (focusables.length === 0) return;
    var cur = document.activeElement;
    var idx = focusables.indexOf(cur);
    if (idx === -1) { focusables[0].focus(); return; }

    var next;
    // Try to use 2D positional move for grid-like layouts (e.g. discard, trade)
    var rect = cur.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    var dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    var best = null, bestScore = Infinity;
    focusables.forEach(function(f) {
      if (f === cur) return;
      var r = f.getBoundingClientRect();
      var fx = r.left + r.width / 2;
      var fy = r.top + r.height / 2;
      var vx = fx - cx, vy = fy - cy;
      var dot = vx * dx + vy * dy;
      if (dot <= 2) return;
      var lateral = Math.abs(dx ? vy : vx);
      var primary = Math.abs(dx ? vx : vy);
      var score = primary + lateral * 2;
      if (score < bestScore) { bestScore = score; best = f; }
    });

    if (best) next = best;
    else {
      // wrap linearly
      var ni = (dir === 'up' || dir === 'left')
        ? (idx - 1 + focusables.length) % focusables.length
        : (idx + 1) % focusables.length;
      next = focusables[ni];
    }
    next.focus();
    next.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  // ===== Popovers =====
  // openPopoverEl(id, { mandatory: true }) — required-choice popover (can't be dismissed)
  function openPopoverEl(id, opts) {
    opts = opts || {};
    closePopover(true);  // force-close any prior popover
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el._mandatory = !!opts.mandatory;
    openPopover = el;
    // Hide its cancel item if mandatory
    var cancelBtn = el.querySelector('.cancel-item');
    if (cancelBtn) cancelBtn.style.display = el._mandatory ? 'none' : '';
    focusFirst(el);
  }
  function closePopover(force) {
    if (openPopover) {
      if (openPopover._mandatory && !force) {
        toast('Required action — pick one');
        return;
      }
      openPopover.classList.add('hidden');
      openPopover._mandatory = false;
      openPopover = null;
      // Restore focus to primary button if on game screen
      var bp = document.getElementById('btn-primary');
      if (current === 'game' && bp) bp.focus();
    }
  }
  function isPopoverOpen() { return !!openPopover; }

  // ===== Placement cursor mode =====
  function startVertexPick(state, candidates, opts) {
    cursor = {
      mode: 'vertex-pick',
      candidates: candidates,
      cursorId: opts.initial || candidates[0] || null,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      label: opts.label || 'Choose a spot',
      mandatory: !!opts.mandatory
    };
    HL.Render.showVertexCandidates(document.getElementById('board-svg'), state, candidates, cursor.cursorId);
    showBanner(cursor.label, cursor.mandatory);
    showCursorHint('↑↓←→ to move · Enter to confirm');
  }

  function startEdgePick(state, candidates, opts) {
    cursor = {
      mode: 'edge-pick',
      candidates: candidates,
      cursorId: opts.initial || candidates[0] || null,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      label: opts.label || 'Choose a road',
      mandatory: !!opts.mandatory
    };
    HL.Render.showEdgeCandidates(document.getElementById('board-svg'), state, candidates, cursor.cursorId);
    showBanner(cursor.label, cursor.mandatory);
    showCursorHint('↑↓←→ to move · Enter to confirm');
  }

  function startTilePick(state, candidates, opts) {
    cursor = {
      mode: 'tile-pick',
      candidates: candidates,
      cursorId: opts.initial || candidates[0] || null,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
      label: opts.label || 'Choose a tile',
      mandatory: !!opts.mandatory
    };
    HL.Render.showTileCursor(document.getElementById('board-svg'), state, candidates, cursor.cursorId);
    showBanner(cursor.label, cursor.mandatory);
    showCursorHint('↑↓←→ to move · Enter to confirm');
  }

  function cancelCursor() {
    if (!cursor) return;
    if (cursor.mandatory) {
      toast('Required action — pick a spot');
      return;
    }
    var cb = cursor.onCancel;
    cursor = null;
    hideBanner();
    hideCursorHint();
    HL.Render.clearOverlays(document.getElementById('board-svg'));
    if (cb) cb();
  }

  function isCursorActive() { return !!cursor; }
  function cursorMode() { return cursor ? cursor.mode : null; }

  function moveCursor(state, dir) {
    if (!cursor) return;
    var items;
    if (cursor.mode === 'vertex-pick') {
      items = cursor.candidates.map(function(id){ return state.board.verticesById[id]; });
    } else if (cursor.mode === 'edge-pick') {
      items = cursor.candidates.map(function(id){ return state.board.edgesById[id]; });
    } else if (cursor.mode === 'tile-pick') {
      items = cursor.candidates.map(function(id){
        return state.board.tiles.find(function(t){return t.id===id;});
      });
    } else return;

    var curObj;
    if (cursor.mode === 'vertex-pick') curObj = state.board.verticesById[cursor.cursorId];
    else if (cursor.mode === 'edge-pick') curObj = state.board.edgesById[cursor.cursorId];
    else curObj = state.board.tiles.find(function(t){return t.id===cursor.cursorId;});

    if (!curObj) curObj = items[0];

    var others = items.filter(function(it){ return it.id !== curObj.id; });
    var pick = HL.Board.pickDirectional(others, curObj.x, curObj.y, dir);
    if (pick) {
      cursor.cursorId = pick.id;
      updateCursorVisual(state);
    } else {
      // Wrap: pick the furthest in the opposite direction
      var inv = { up: 'down', down: 'up', left: 'right', right: 'left' }[dir];
      var wrap = HL.Board.pickDirectional(others, curObj.x, curObj.y, inv);
      if (wrap) {
        cursor.cursorId = wrap.id;
        updateCursorVisual(state);
      }
    }
  }

  function updateCursorVisual(state) {
    var svg = document.getElementById('board-svg');
    if (cursor.mode === 'vertex-pick') {
      HL.Render.showVertexCandidates(svg, state, cursor.candidates, cursor.cursorId);
    } else if (cursor.mode === 'edge-pick') {
      HL.Render.showEdgeCandidates(svg, state, cursor.candidates, cursor.cursorId);
    } else {
      HL.Render.showTileCursor(svg, state, cursor.candidates, cursor.cursorId);
    }
  }

  function confirmCursor() {
    if (!cursor) return;
    var id = cursor.cursorId;
    var cb = cursor.onConfirm;
    cursor = null;
    hideBanner();
    hideCursorHint();
    HL.Render.clearOverlays(document.getElementById('board-svg'));
    if (cb) cb(id);
  }

  // ===== Banner / toasts =====
  function showBanner(text, mandatory) {
    var b = document.getElementById('mode-banner');
    var t = document.getElementById('mode-banner-text');
    if (b && t) {
      t.textContent = text;
      b.classList.remove('hidden');
      var cancelBtn = b.querySelector('.mode-cancel');
      if (cancelBtn) cancelBtn.style.display = mandatory ? 'none' : '';
    }
  }
  function hideBanner() {
    var b = document.getElementById('mode-banner');
    if (b) b.classList.add('hidden');
  }

  var toastTimer = null;
  function toast(msg, type) {
    var t = document.getElementById('event-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'event-toast' + (type ? ' ' + type : '');
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { t.classList.add('hidden'); }, 2200);
  }

  function showCursorHint(text) {
    var c = document.getElementById('cursor-hint');
    if (c) { c.textContent = text; c.classList.remove('hidden'); }
  }
  function hideCursorHint() {
    var c = document.getElementById('cursor-hint');
    if (c) c.classList.add('hidden');
  }

  // ===== Updates =====
  function updateHud(state) {
    var p = state.players[0]; // human
    document.getElementById('rc-wood').textContent = p.hand.wood;
    document.getElementById('rc-brick').textContent = p.hand.brick;
    document.getElementById('rc-sheep').textContent = p.hand.sheep;
    document.getElementById('rc-wheat').textContent = p.hand.wheat;
    document.getElementById('rc-ore').textContent = p.hand.ore;
    document.getElementById('rc-dev').textContent =
      HL.Game.totalDev(p.devHand, p.devPending);

    // Apply "zero" styling
    ['wood','brick','sheep','wheat','ore'].forEach(function(r){
      var el = document.getElementById('rc-' + r);
      el.classList.toggle('zero', p.hand[r] === 0);
    });

    // VP & color
    var pp = document.getElementById('pp-self-color');
    pp.style.background = HL.Render.PLAYER_HEX[p.color].fill;
    document.getElementById('pp-self-vp').textContent = HL.Game.visibleVP(state, p);

    // Turn indicator
    var ti = document.getElementById('turn-indicator');
    var cp = state.players[state.currentPlayerIdx];
    if (state.phase === 'setup') {
      var setupP = HL.Game.currentSetupPlayer(state);
      ti.textContent = (setupP.idx === 0 ? 'Place ' : setupP.name + ' places ') + (state.setupExpecting);
      ti.classList.toggle('active', setupP.idx === 0);
    } else if (state.phase === 'play') {
      if (cp.idx === 0) {
        ti.textContent = 'Your turn — ' + state.turnState;
        ti.classList.add('active');
      } else {
        ti.textContent = cp.name + "'s turn";
        ti.classList.remove('active');
      }
    } else {
      ti.textContent = 'Game over';
    }

    // Dice display
    if (state.lastDice) {
      document.getElementById('die1').textContent = state.lastDice[0];
      document.getElementById('die2').textContent = state.lastDice[1];
    } else {
      document.getElementById('die1').textContent = '–';
      document.getElementById('die2').textContent = '–';
    }

    // Primary button text
    var bp = document.getElementById('btn-primary');
    if (state.phase === 'setup') {
      bp.textContent = state.setupExpecting === 'settlement' ? 'Place Settlement' : 'Place Road';
      bp.disabled = state.players[state.setupOrder[state.setupIndex]].idx !== 0;
    } else if (state.phase === 'play') {
      if (cp.idx !== 0) {
        bp.textContent = 'Waiting...';
        bp.disabled = true;
      } else if (state.turnState === 'roll') {
        bp.textContent = 'Roll Dice';
        bp.disabled = false;
      } else {
        bp.textContent = 'End Turn';
        bp.disabled = false;
      }
    }

    // Menu button enabled only on player's main turn
    var btnMenu = document.getElementById('btn-menu');
    btnMenu.disabled = !(state.phase === 'play' && cp.idx === 0 && state.turnState === 'main');

    // Dev chip on/off
    var devChip = document.getElementById('dev-chip');
    devChip.classList.toggle('hidden', false);
  }

  function rollDiceAnim() {
    document.getElementById('die1').classList.add('rolling');
    document.getElementById('die2').classList.add('rolling');
    setTimeout(function() {
      document.getElementById('die1').classList.remove('rolling');
      document.getElementById('die2').classList.remove('rolling');
    }, 600);
  }

  // ===== Populate menus dynamically =====
  function populateActionMenu(state) {
    var p = state.players[0];
    function setEnabled(action, ok) {
      var el = document.querySelector('#action-menu [data-action="' + action + '"]');
      if (el) el.disabled = !ok;
    }
    setEnabled('build-road',
      HL.Game.canAfford(p.hand, HL.Game.COSTS.road) &&
      Object.keys(p.roads).length < HL.Game.LIMITS.roads &&
      HL.Board.legalRoadEdges(state.board, state.players, 0).length > 0
    );
    setEnabled('build-settlement',
      HL.Game.canAfford(p.hand, HL.Game.COSTS.settlement) &&
      Object.keys(p.settlements).length < HL.Game.LIMITS.settlements &&
      HL.Board.legalSettlementVertices(state.board, state.players, p).length > 0
    );
    setEnabled('build-city',
      HL.Game.canAfford(p.hand, HL.Game.COSTS.city) &&
      Object.keys(p.cities).length < HL.Game.LIMITS.cities &&
      Object.keys(p.settlements).length > 0
    );
    setEnabled('buy-dev',
      HL.Game.canAfford(p.hand, HL.Game.COSTS.dev) &&
      state.devDeck.length > 0
    );
    var hasPlayableDev =
      (p.devHand.knight > 0 || p.devHand.road > 0 || p.devHand.mono > 0 || p.devHand.plenty > 0) &&
      !p.devPlayedThisTurn;
    setEnabled('play-dev', hasPlayableDev);
    setEnabled('trade-bank', HL.Game.totalCards(p.hand) >= 2);
    setEnabled('trade-players', HL.Game.totalCards(p.hand) >= 1);
    setEnabled('end-turn', true);
  }

  function populateDevMenu(state) {
    var p = state.players[0];
    var list = document.getElementById('dev-menu-list');
    list.innerHTML = '';

    var labels = {
      knight: { name: 'Knight', desc: 'Move robber, steal a card' },
      road:   { name: 'Road Building', desc: 'Build 2 free roads' },
      mono:   { name: 'Monopoly', desc: 'Take all of one resource' },
      plenty: { name: 'Year of Plenty', desc: 'Take any 2 from the bank' }
    };
    var any = false;
    ['knight','road','mono','plenty'].forEach(function(k) {
      var n = p.devHand[k] || 0;
      if (n > 0) {
        any = true;
        var btn = document.createElement('button');
        btn.className = 'pop-item focusable';
        btn.setAttribute('data-action', 'play-dev-' + k);
        btn.innerHTML = '<span class="pop-label"><b>' + labels[k].name + '</b> ×' + n +
          '<br><span class="text-muted" style="font-size:11px">' + labels[k].desc + '</span></span>';
        list.appendChild(btn);
      }
    });
    if (p.devHand.vp > 0) {
      var btn = document.createElement('button');
      btn.className = 'pop-item focusable';
      btn.disabled = true;
      btn.innerHTML = '<span class="pop-label"><b>Victory Point</b> ×' + p.devHand.vp +
        '<br><span class="text-muted" style="font-size:11px">Counts toward your total</span></span>';
      list.appendChild(btn);
    }
    if (!any && p.devHand.vp === 0) {
      var msg = document.createElement('div');
      msg.style.padding = '20px';
      msg.style.textAlign = 'center';
      msg.style.color = 'var(--text-secondary)';
      msg.textContent = 'No development cards yet.';
      list.appendChild(msg);
    }
  }

  function populatePlayersMenu(state) {
    var list = document.getElementById('players-list');
    list.innerHTML = '';
    state.players.forEach(function(p) {
      var row = document.createElement('div');
      row.className = 'player-row' +
        (p.idx === state.currentPlayerIdx ? ' is-turn' : '');
      row.style.borderLeftColor = HL.Render.PLAYER_HEX[p.color].fill;
      var vp = HL.Game.visibleVP(state, p);
      row.innerHTML =
        '<span class="pr-name">' + esc(p.name) + (p.isAI ? ' <span class="text-muted" style="font-weight:400">(' + p.aiStyle + ')</span>' : ' (you)') + '</span>' +
        '<span class="pr-stats">' +
          '<span class="stat">★ <b style="color:#e8c890">' + vp + '</b></span>' +
          '<span class="stat">' + HL.Game.totalCards(p.hand) + ' cards</span>' +
          '<span class="stat">' + (p.devHand.knight + p.devPending.knight + p.knightsPlayed) + ' kn</span>' +
          (state.longestRoadOwner === p.idx ? '<span class="stat" style="color:#4ade80">LR</span>' : '') +
          (state.largestArmyOwner === p.idx ? '<span class="stat" style="color:#4ade80">LA</span>' : '') +
        '</span>';
      list.appendChild(row);
    });
  }

  // ===== Discard screen =====
  function populateDiscardScreen(state, p, need) {
    var grid = document.getElementById('discard-grid');
    grid.innerHTML = '';
    document.getElementById('discard-target').textContent = need;
    document.getElementById('discard-need').textContent = need;
    document.getElementById('discard-count').textContent = '0';

    var selected = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    state._discardSelected = selected;

    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var tile = document.createElement('button');
      tile.className = 'discard-tile focusable';
      tile.disabled = p.hand[res] === 0;
      tile.setAttribute('data-action', 'discard-pick');
      tile.setAttribute('data-res', res);
      tile.innerHTML =
        '<span class="dt-icon res-icon res-' + res + '"></span>' +
        '<span class="dt-count">' + p.hand[res] + '</span>' +
        '<span class="dt-selected">×0</span>';
      grid.appendChild(tile);
    });
    document.getElementById('btn-confirm-discard').disabled = true;
  }

  function refreshDiscardScreen(state, p, need) {
    var sel = state._discardSelected;
    var total = sel.wood + sel.brick + sel.sheep + sel.wheat + sel.ore;
    document.getElementById('discard-count').textContent = total;
    document.querySelectorAll('#discard-grid .discard-tile').forEach(function(tile) {
      var res = tile.dataset.res;
      tile.querySelector('.dt-selected').textContent = '×' + sel[res];
      tile.querySelector('.dt-count').textContent = (p.hand[res] - sel[res]);
    });
    document.getElementById('btn-confirm-discard').disabled = total !== need;
  }

  // ===== Trade Bank screen =====
  function setupBankTradeScreen(state) {
    var p = state.players[0];
    var ports = HL.Board.playerPorts(state.board, p);
    state._bankTrade = { give: null, gain: null };
    var giveRow = document.getElementById('bank-give-row');
    var recvRow = document.getElementById('bank-recv-row');
    giveRow.innerHTML = ''; recvRow.innerHTML = '';

    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var rate = ports[res] || 4;
      var givable = p.hand[res] >= rate;
      var btn = document.createElement('button');
      btn.className = 'trade-pick focusable' + (givable ? '' : ' disabled');
      btn.disabled = !givable;
      btn.setAttribute('data-action', 'bank-give-pick');
      btn.setAttribute('data-res', res);
      btn.innerHTML =
        '<span class="tp-icon res-icon res-' + res + '"></span>' +
        '<span>' + res + '</span>' +
        '<span class="tp-amt">' + rate + '</span>' +
        '<span class="tp-have">have ' + p.hand[res] + '</span>';
      giveRow.appendChild(btn);
    });

    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var btn = document.createElement('button');
      btn.className = 'trade-pick focusable' + (state.bank[res] > 0 ? '' : ' disabled');
      btn.disabled = state.bank[res] <= 0;
      btn.setAttribute('data-action', 'bank-recv-pick');
      btn.setAttribute('data-res', res);
      btn.innerHTML =
        '<span class="tp-icon res-icon res-' + res + '"></span>' +
        '<span>' + res + '</span>' +
        '<span class="tp-amt">1</span>' +
        '<span class="tp-have">bank ' + state.bank[res] + '</span>';
      recvRow.appendChild(btn);
    });

    refreshBankTradeScreen(state);
  }

  function refreshBankTradeScreen(state) {
    var bt = state._bankTrade;
    document.querySelectorAll('#bank-give-row .trade-pick').forEach(function(b){
      b.classList.toggle('selected', b.dataset.res === bt.give);
    });
    document.querySelectorAll('#bank-recv-row .trade-pick').forEach(function(b){
      b.classList.toggle('selected', b.dataset.res === bt.gain);
    });
    var summary = document.getElementById('bank-trade-summary');
    var btn = document.getElementById('btn-bank-trade');
    if (bt.give && bt.gain && bt.give !== bt.gain) {
      var ports = HL.Board.playerPorts(state.board, state.players[0]);
      var rate = ports[bt.give] || 4;
      summary.textContent = rate + ' ' + bt.give + ' → 1 ' + bt.gain;
      btn.disabled = false;
    } else {
      summary.textContent = 'Pick a resource to give and one to receive.';
      btn.disabled = true;
    }
    // also pick rate label
    document.getElementById('bank-give-rate').textContent = '(varies — see ports)';
  }

  // ===== Trade Players screen =====
  function setupPlayerTradeScreen(state) {
    var p = state.players[0];
    state._playerTrade = {
      give: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      recv: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
    };
    var giveRow = document.getElementById('pt-give-row');
    var recvRow = document.getElementById('pt-recv-row');
    giveRow.innerHTML = ''; recvRow.innerHTML = '';

    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var btn = document.createElement('button');
      btn.className = 'trade-pick focusable';
      btn.setAttribute('data-action', 'pt-give-inc');
      btn.setAttribute('data-res', res);
      btn.disabled = p.hand[res] === 0;
      btn.innerHTML =
        '<span class="tp-icon res-icon res-' + res + '"></span>' +
        '<span>' + res + '</span>' +
        '<span class="tp-amt" id="pt-give-' + res + '">0</span>' +
        '<span class="tp-have">have ' + p.hand[res] + '</span>';
      giveRow.appendChild(btn);
    });
    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      var btn = document.createElement('button');
      btn.className = 'trade-pick focusable';
      btn.setAttribute('data-action', 'pt-recv-inc');
      btn.setAttribute('data-res', res);
      btn.innerHTML =
        '<span class="tp-icon res-icon res-' + res + '"></span>' +
        '<span>' + res + '</span>' +
        '<span class="tp-amt" id="pt-recv-' + res + '">0</span>' +
        '<span class="tp-have">want</span>';
      recvRow.appendChild(btn);
    });
    document.getElementById('trade-responses').innerHTML = '';
    document.getElementById('btn-propose-trade').disabled = true;
    refreshPlayerTradeScreen(state);
  }

  function refreshPlayerTradeScreen(state) {
    var pt = state._playerTrade;
    var p = state.players[0];
    var giveTotal = 0, recvTotal = 0;
    ['wood','brick','sheep','wheat','ore'].forEach(function(res) {
      document.getElementById('pt-give-' + res).textContent = pt.give[res];
      document.getElementById('pt-recv-' + res).textContent = pt.recv[res];
      giveTotal += pt.give[res]; recvTotal += pt.recv[res];
    });
    document.getElementById('btn-propose-trade').disabled = giveTotal === 0 || recvTotal === 0;
  }

  function showTradeResponses(state, responses) {
    var box = document.getElementById('trade-responses');
    box.innerHTML = '';
    responses.forEach(function(r) {
      var row = document.createElement('div');
      var resp = r.accept ? 'accept' : 'reject';
      row.className = 'trade-response-row ' + resp + (r.accept ? ' focusable' : '');
      if (r.accept) {
        row.setAttribute('data-action', 'accept-trade-with');
        row.setAttribute('data-with', r.idx);
        row.setAttribute('tabindex', '0');
      }
      row.style.borderLeftColor = r.accept ? '#4ade80' : '#ff4466';
      row.innerHTML =
        '<span class="trr-name">' + esc(state.players[r.idx].name) + '</span>' +
        '<span class="trr-resp">' + (r.accept ? '✓ Accepts — tap to trade' : '✗ ' + (r.reason || 'Declines')) + '</span>';
      box.appendChild(row);
    });
  }

  // ===== Game over =====
  function showGameOver(state) {
    var winner = state.players[state.winnerIdx];
    document.getElementById('gameover-title').textContent = winner.idx === 0 ? 'VICTORY' : 'DEFEAT';
    document.getElementById('gameover-trophy').textContent = winner.idx === 0 ? '★' : '☼';
    document.getElementById('gameover-winner').textContent =
      winner.idx === 0 ? 'You win!' : winner.name + ' wins with ' + HL.Game.totalVP(state, winner) + ' VP';
    var scores = document.getElementById('gameover-scores');
    scores.innerHTML = '';
    var sorted = state.players.slice().sort(function(a,b){
      return HL.Game.totalVP(state, b) - HL.Game.totalVP(state, a);
    });
    sorted.forEach(function(p) {
      var row = document.createElement('div');
      row.className = 'gameover-score-row';
      row.style.borderLeftColor = HL.Render.PLAYER_HEX[p.color].fill;
      row.innerHTML =
        '<span class="gs-name">' + esc(p.name) + (p.idx === 0 ? ' (you)' : '') + '</span>' +
        '<span class="gs-vp">' + HL.Game.totalVP(state, p) + ' VP</span>';
      scores.appendChild(row);
    });
  }

  // ===== Setup screen helpers =====
  function setColorSwatch(color) {
    document.querySelectorAll('#color-picker .color-swatch').forEach(function(s){
      s.classList.toggle('active', s.dataset.color === color);
    });
  }
  function setDifficulty(diff) {
    document.querySelectorAll('#difficulty-picker .seg-btn').forEach(function(s){
      s.classList.toggle('active', s.dataset.diff === diff);
    });
  }

  // ===== util =====
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }

  HL.UI = {
    init: init,
    go: go,
    back: back,
    currentScreen: currentScreen,
    moveFocus: moveFocus,
    focusFirst: focusFirst,
    openPopover: openPopoverEl,
    closePopover: closePopover,
    isPopoverOpen: isPopoverOpen,

    startVertexPick: startVertexPick,
    startEdgePick: startEdgePick,
    startTilePick: startTilePick,
    moveCursor: moveCursor,
    confirmCursor: confirmCursor,
    cancelCursor: cancelCursor,
    isCursorActive: isCursorActive,
    cursorMode: cursorMode,

    updateHud: updateHud,
    rollDiceAnim: rollDiceAnim,
    populateActionMenu: populateActionMenu,
    populateDevMenu: populateDevMenu,
    populatePlayersMenu: populatePlayersMenu,

    populateDiscardScreen: populateDiscardScreen,
    refreshDiscardScreen: refreshDiscardScreen,

    setupBankTradeScreen: setupBankTradeScreen,
    refreshBankTradeScreen: refreshBankTradeScreen,

    setupPlayerTradeScreen: setupPlayerTradeScreen,
    refreshPlayerTradeScreen: refreshPlayerTradeScreen,
    showTradeResponses: showTradeResponses,

    showGameOver: showGameOver,
    setColorSwatch: setColorSwatch,
    setDifficulty: setDifficulty,

    toast: toast
  };

})(window.HL);
