/* ============================================================
   render.js — SVG board rendering (painterly)
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Color palette for resource hexes (gradient endpoints)
  var TILE_GRAD = {
    wood:   ['#4a8a5a', '#1c3a22'],
    brick:  ['#d97a4f', '#6a2e18'],
    sheep:  ['#b5d886', '#3a6020'],
    wheat:  ['#f5d272', '#8a6018'],
    ore:    ['#a7b3c4', '#3a4555'],
    desert: ['#e8cd92', '#8a7040'],
    sea:    ['#2c5878', '#0a1e2e']
  };

  // Player color hex map
  var PLAYER_HEX = {
    red:    { fill: '#d64545', dark: '#7a1818', light: '#f06868' },
    blue:   { fill: '#3a7ad8', dark: '#143a78', light: '#6ba0f0' },
    orange: { fill: '#e89a3a', dark: '#7a4a08', light: '#f4b85a' },
    white:  { fill: '#e8e8e8', dark: '#6a6a6a', light: '#ffffff' }
  };

  function el(name, attrs, parent) {
    var n = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  // Pointy-top hex path
  function hexPath(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return 'M' + pts.join(' L') + ' Z';
  }

  // Hex points string for polygon
  function hexPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }

  // Number token "pips" for high-probability numbers
  function tokenPips(token) {
    var freq = { 2: 1, 12: 1, 3: 2, 11: 2, 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
    return freq[token] || 0;
  }

  // ===== Set up defs (gradients, textures, patterns) =====
  function setupDefs(svg) {
    var defs = el('defs', null, svg);

    // Tile gradients (radial for painterly feel)
    Object.keys(TILE_GRAD).forEach(function(key) {
      var g = el('radialGradient', { id: 'g-' + key, cx: '40%', cy: '35%', r: '70%' }, defs);
      el('stop', { offset: '0%', 'stop-color': TILE_GRAD[key][0] }, g);
      el('stop', { offset: '100%', 'stop-color': TILE_GRAD[key][1] }, g);
    });

    // Subtle textured overlay per resource (vector pattern, painterly)
    addWoodPattern(defs);
    addBrickPattern(defs);
    addSheepPattern(defs);
    addWheatPattern(defs);
    addOrePattern(defs);
    addDesertPattern(defs);

    // Tile darkening filter for robbed tiles
    var f = el('filter', { id: 'tileShadow' }, defs);
    el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '1.5' }, f);
    el('feOffset', { dx: '0', dy: '1.5', result: 'off' }, f);
    var fm = el('feMerge', null, f);
    el('feMergeNode', { in: 'off' }, fm);
    el('feMergeNode', { in: 'SourceGraphic' }, fm);

    // Player gradients (for settlements/cities)
    Object.keys(PLAYER_HEX).forEach(function(color) {
      var p = PLAYER_HEX[color];
      var g = el('linearGradient', { id: 'pg-' + color, x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, defs);
      el('stop', { offset: '0%', 'stop-color': p.light }, g);
      el('stop', { offset: '100%', 'stop-color': p.dark }, g);
    });

    // Sea background pattern
    var sg = el('radialGradient', { id: 'sea-bg', cx: '50%', cy: '50%', r: '70%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#1a3a55' }, sg);
    el('stop', { offset: '100%', 'stop-color': '#050b15' }, sg);
  }

  function addWoodPattern(defs) {
    var p = el('pattern', { id: 'tex-wood', x: 0, y: 0, width: 24, height: 32, patternUnits: 'userSpaceOnUse' }, defs);
    // tree silhouettes
    for (var i = 0; i < 3; i++) {
      var tx = (i * 8 + (i % 2) * 4) % 24;
      var ty = (i * 11) % 32;
      el('polygon', {
        points: tx + ',' + (ty + 8) + ' ' + (tx + 4) + ',' + ty + ' ' + (tx + 8) + ',' + (ty + 8),
        fill: '#1a3a22', opacity: '0.55'
      }, p);
      el('rect', { x: tx + 3, y: ty + 7, width: 2, height: 4, fill: '#1a1408', opacity: '0.5' }, p);
    }
  }

  function addBrickPattern(defs) {
    var p = el('pattern', { id: 'tex-brick', x: 0, y: 0, width: 18, height: 12, patternUnits: 'userSpaceOnUse' }, defs);
    el('rect', { x: 0, y: 0, width: 8, height: 5, fill: '#8a3a18', opacity: '0.6', rx: 1 }, p);
    el('rect', { x: 10, y: 0, width: 8, height: 5, fill: '#8a3a18', opacity: '0.6', rx: 1 }, p);
    el('rect', { x: 5, y: 7, width: 8, height: 5, fill: '#8a3a18', opacity: '0.6', rx: 1 }, p);
  }

  function addSheepPattern(defs) {
    var p = el('pattern', { id: 'tex-sheep', x: 0, y: 0, width: 22, height: 22, patternUnits: 'userSpaceOnUse' }, defs);
    // small sheep blobs
    [[5, 6], [15, 14], [9, 17]].forEach(function(pt) {
      el('ellipse', { cx: pt[0], cy: pt[1], rx: 3, ry: 2, fill: '#f4f0e0', opacity: '0.65' }, p);
      el('circle', { cx: pt[0] + 2, cy: pt[1] - 1, r: 1, fill: '#1a1408', opacity: '0.6' }, p);
    });
  }

  function addWheatPattern(defs) {
    var p = el('pattern', { id: 'tex-wheat', x: 0, y: 0, width: 14, height: 18, patternUnits: 'userSpaceOnUse' }, defs);
    // wheat stalks
    [[3, 14], [9, 16], [6, 6]].forEach(function(pt) {
      el('line', { x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] - 8, stroke: '#8a6018', 'stroke-width': 0.8, opacity: '0.7' }, p);
      [-2, 0, 2].forEach(function(o, i) {
        el('ellipse', { cx: pt[0], cy: pt[1] - 6 + o, rx: 1.5, ry: 0.8, fill: '#d4a82a', opacity: '0.7', transform: 'rotate(' + (i*30 - 30) + ' ' + pt[0] + ' ' + (pt[1]-6+o) + ')' }, p);
      });
    });
  }

  function addOrePattern(defs) {
    var p = el('pattern', { id: 'tex-ore', x: 0, y: 0, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
    // rocky shapes
    el('polygon', { points: '3,12 6,4 11,8 8,15', fill: '#5a6878', opacity: '0.7' }, p);
    el('polygon', { points: '11,16 16,12 18,17', fill: '#5a6878', opacity: '0.7' }, p);
    el('polygon', { points: '13,3 17,5 16,9', fill: '#7a8898', opacity: '0.7' }, p);
  }

  function addDesertPattern(defs) {
    var p = el('pattern', { id: 'tex-desert', x: 0, y: 0, width: 22, height: 18, patternUnits: 'userSpaceOnUse' }, defs);
    // dunes and cactus
    el('path', { d: 'M0,12 Q5,9 11,12 Q17,15 22,12', fill: 'none', stroke: '#a88a4a', 'stroke-width': 0.8, opacity: '0.55' }, p);
    el('rect', { x: 14, y: 6, width: 1.5, height: 6, fill: '#5a8048', opacity: '0.6' }, p);
    el('rect', { x: 13, y: 8, width: 2, height: 1.5, fill: '#5a8048', opacity: '0.6' }, p);
  }

  // ===== Main render =====
  function renderBoard(svg, state) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    setupDefs(svg);

    var R = state.board.R;

    // 1. Sea backdrop circle behind the island
    el('circle', { cx: 0, cy: 0, r: 240, fill: 'url(#sea-bg)' }, svg);

    // 2. Port connector lines (drawn first so under hexes' edges)
    var portsLayer = el('g', { class: 'ports-layer' }, svg);
    state.board.ports.forEach(function(port) {
      var v1 = state.board.verticesById[port.v1];
      var v2 = state.board.verticesById[port.v2];
      el('line', {
        x1: v1.x, y1: v1.y, x2: port.iconX, y2: port.iconY,
        class: 'port-line'
      }, portsLayer);
      el('line', {
        x1: v2.x, y1: v2.y, x2: port.iconX, y2: port.iconY,
        class: 'port-line'
      }, portsLayer);
    });

    // 3. Tiles
    var tilesLayer = el('g', { class: 'tiles-layer' }, svg);
    state.board.tiles.forEach(function(tile) {
      var g = el('g', {
        class: 'hex-tile' + (tile.hasRobber ? ' robbed' : ''),
        'data-tile-id': tile.id
      }, tilesLayer);

      // Gradient fill
      el('polygon', {
        points: hexPoints(tile.x, tile.y, R),
        fill: 'url(#g-' + tile.res + ')',
        stroke: '#0a0a0f',
        'stroke-width': '1'
      }, g);

      // Texture overlay
      if (tile.res !== 'sea') {
        var texId = 'tex-' + tile.res;
        if (tile.res === 'desert') texId = 'tex-desert';
        el('polygon', {
          points: hexPoints(tile.x, tile.y, R - 1),
          fill: 'url(#' + texId + ')',
          opacity: '0.75',
          'pointer-events': 'none'
        }, g);
      }

      // Inner subtle border (for painterly feel)
      el('polygon', {
        points: hexPoints(tile.x, tile.y, R - 1.5),
        fill: 'none',
        stroke: '#00000033',
        'stroke-width': '1',
        'pointer-events': 'none'
      }, g);
    });

    // 4. Port icons
    var portsIconLayer = el('g', { class: 'ports-icon-layer' }, svg);
    state.board.ports.forEach(function(port) {
      var label = port.res === '?' ? '3:1' : portShortLabel(port.res);
      var fill = port.res === '?' ? '#f4e8c8' : portFill(port.res);
      el('circle', { cx: port.iconX, cy: port.iconY, r: 11, class: 'port-circle', fill: fill }, portsIconLayer);
      el('text', { x: port.iconX, y: port.iconY + 0.5, class: 'port-icon', text: label }, portsIconLayer);
    });

    // 5. Number tokens
    var tokenLayer = el('g', { class: 'token-layer' }, svg);
    state.board.tiles.forEach(function(tile) {
      if (!tile.token || tile.hasRobber) return;
      el('circle', { cx: tile.x, cy: tile.y, r: 12, class: 'hex-num-bg' }, tokenLayer);
      var cls = (tile.token === 6 || tile.token === 8) ? 'hex-num hex-num-red' : 'hex-num hex-num-blk';
      el('text', { x: tile.x, y: tile.y - 1, class: cls, text: String(tile.token) }, tokenLayer);
      // Pips below
      var pips = tokenPips(tile.token);
      var pipSize = 1.3;
      var pipGap = 2.4;
      var pipsWidth = (pips - 1) * pipGap;
      for (var i = 0; i < pips; i++) {
        el('circle', {
          cx: tile.x - pipsWidth / 2 + i * pipGap,
          cy: tile.y + 6,
          r: pipSize,
          class: 'hex-num-dots',
          fill: (tile.token === 6 || tile.token === 8) ? '#c83030' : '#1a1408'
        }, tokenLayer);
      }
    });

    // 6. Roads
    var roadsLayer = el('g', { class: 'roads-layer' }, svg);
    state.players.forEach(function(p) {
      Object.keys(p.roads).forEach(function(eid) {
        var e = state.board.edgesById[eid];
        var v1 = state.board.verticesById[e.v1];
        var v2 = state.board.verticesById[e.v2];
        drawRoad(roadsLayer, v1, v2, p.color);
      });
    });

    // 7. Settlements + cities
    var buildingsLayer = el('g', { class: 'buildings-layer' }, svg);
    state.players.forEach(function(p) {
      Object.keys(p.settlements).forEach(function(vid) {
        var v = state.board.verticesById[vid];
        drawSettlement(buildingsLayer, v.x, v.y, p.color);
      });
      Object.keys(p.cities).forEach(function(vid) {
        var v = state.board.verticesById[vid];
        drawCity(buildingsLayer, v.x, v.y, p.color);
      });
    });

    // 8. Robber piece
    var rt = state.board.tiles.find(function(t){return t.id === state.board.robberTileId;});
    if (rt) drawRobber(svg, rt.x, rt.y + 14);

    // 9. Overlay layers for cursor highlights (placement mode)
    el('g', { id: 'overlay-vertices' }, svg);
    el('g', { id: 'overlay-edges' }, svg);
    el('g', { id: 'overlay-tiles' }, svg);
    el('g', { id: 'overlay-cursor' }, svg);
  }

  function portShortLabel(res) {
    return { wood: '2:1', brick: '2:1', sheep: '2:1', wheat: '2:1', ore: '2:1' }[res] || '?';
  }
  function portFill(res) {
    return {
      wood:   '#9bc298',
      brick:  '#e0a08a',
      sheep:  '#dbedb8',
      wheat:  '#f7e3a0',
      ore:    '#c8d0db'
    }[res] || '#f4e8c8';
  }

  // ===== Piece drawings =====
  function drawSettlement(layer, cx, cy, color) {
    var g = el('g', { class: 'settlement', transform: 'translate(' + cx + ',' + cy + ')' }, layer);
    var p = PLAYER_HEX[color];
    // House: pentagon shape with roof
    el('polygon', {
      points: '-6,-3 -6,5 6,5 6,-3 0,-9',
      fill: 'url(#pg-' + color + ')',
      stroke: '#0a0a0f',
      'stroke-width': '0.8'
    }, g);
    // tiny door
    el('rect', { x: -1.5, y: 1, width: 3, height: 4, fill: p.dark }, g);
    return g;
  }

  function drawCity(layer, cx, cy, color) {
    var g = el('g', { class: 'city', transform: 'translate(' + cx + ',' + cy + ')' }, layer);
    var p = PLAYER_HEX[color];
    // Two-block city
    el('polygon', {
      points: '-9,-1 -9,6 -2,6 -2,-1 -6,-6',
      fill: 'url(#pg-' + color + ')',
      stroke: '#0a0a0f',
      'stroke-width': '0.8'
    }, g);
    el('polygon', {
      points: '-2,-5 -2,6 8,6 8,-5 3,-10',
      fill: 'url(#pg-' + color + ')',
      stroke: '#0a0a0f',
      'stroke-width': '0.8'
    }, g);
    el('rect', { x: -7, y: 2, width: 2, height: 3, fill: p.dark }, g);
    el('rect', { x: 1.5, y: 1, width: 2.5, height: 5, fill: p.dark }, g);
    return g;
  }

  function drawRoad(layer, v1, v2, color) {
    var dx = v2.x - v1.x, dy = v2.y - v1.y;
    var len = Math.sqrt(dx*dx + dy*dy);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    var mx = (v1.x + v2.x) / 2;
    var my = (v1.y + v2.y) / 2;
    var g = el('g', { class: 'road', transform: 'translate(' + mx + ',' + my + ') rotate(' + ang + ')' }, layer);
    var p = PLAYER_HEX[color];
    el('rect', {
      x: -len/2 + 4, y: -3, width: len - 8, height: 6,
      fill: 'url(#pg-' + color + ')',
      stroke: '#0a0a0f',
      'stroke-width': '0.6',
      rx: 1.5
    }, g);
    return g;
  }

  function drawRobber(svg, cx, cy) {
    var g = el('g', { class: 'robber-piece', transform: 'translate(' + cx + ',' + cy + ')' }, svg);
    // Hooded figure silhouette
    el('ellipse', { cx: 0, cy: 4, rx: 7, ry: 5, fill: '#1a1408' }, g);
    el('circle',  { cx: 0, cy: -3, r: 5, fill: '#1a1408' }, g);
    el('circle',  { cx: -1.5, cy: -3, r: 0.8, fill: '#ffaa00' }, g);
    el('circle',  { cx:  1.5, cy: -3, r: 0.8, fill: '#ffaa00' }, g);
    return g;
  }

  // ===== Overlays (placement mode) =====
  function clearOverlays(svg) {
    ['overlay-vertices','overlay-edges','overlay-tiles','overlay-cursor'].forEach(function(id){
      var g = svg.querySelector('#' + id);
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
    });
  }

  function showVertexCandidates(svg, state, vertexIds, cursorId) {
    var layer = svg.querySelector('#overlay-vertices');
    var cursorLayer = svg.querySelector('#overlay-cursor');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    while (cursorLayer.firstChild) cursorLayer.removeChild(cursorLayer.firstChild);
    vertexIds.forEach(function(vid) {
      var v = state.board.verticesById[vid];
      var c = el('circle', {
        cx: v.x, cy: v.y, r: 6,
        class: 'vertex-spot candidate',
        'data-vid': vid
      }, layer);
    });
    if (cursorId) {
      var cv = state.board.verticesById[cursorId];
      if (cv) {
        el('circle', { cx: cv.x, cy: cv.y, r: 9, class: 'vertex-spot cursor' }, cursorLayer);
      }
    }
  }

  function showEdgeCandidates(svg, state, edgeIds, cursorId) {
    var layer = svg.querySelector('#overlay-edges');
    var cursorLayer = svg.querySelector('#overlay-cursor');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    while (cursorLayer.firstChild) cursorLayer.removeChild(cursorLayer.firstChild);
    edgeIds.forEach(function(eid) {
      var e = state.board.edgesById[eid];
      var v1 = state.board.verticesById[e.v1];
      var v2 = state.board.verticesById[e.v2];
      el('line', {
        x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y,
        class: 'edge-spot',
        'data-eid': eid
      }, layer);
    });
    if (cursorId) {
      var ce = state.board.edgesById[cursorId];
      if (ce) {
        var v1 = state.board.verticesById[ce.v1];
        var v2 = state.board.verticesById[ce.v2];
        el('line', { x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, class: 'edge-spot cursor' }, cursorLayer);
      }
    }
  }

  function showTileCursor(svg, state, tileIds, cursorTileId) {
    var layer = svg.querySelector('#overlay-tiles');
    var cursorLayer = svg.querySelector('#overlay-cursor');
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    while (cursorLayer.firstChild) cursorLayer.removeChild(cursorLayer.firstChild);
    // Add subtle ring on each candidate tile
    tileIds.forEach(function(tid) {
      var t = state.board.tiles.find(function(tt){return tt.id===tid;});
      if (!t) return;
      el('polygon', {
        points: hexPoints(t.x, t.y, state.board.R + 1),
        fill: 'none',
        stroke: '#ffd96666',
        'stroke-width': '1',
        'stroke-dasharray': '3 2',
        'pointer-events': 'none'
      }, layer);
    });
    if (cursorTileId) {
      var ct = state.board.tiles.find(function(tt){return tt.id===cursorTileId;});
      if (ct) {
        el('polygon', {
          points: hexPoints(ct.x, ct.y, state.board.R - 1),
          fill: 'rgba(255,217,102,0.18)',
          stroke: '#ffd966',
          'stroke-width': '2',
          'pointer-events': 'none'
        }, cursorLayer);
      }
    }
  }

  HL.Render = {
    renderBoard: renderBoard,
    showVertexCandidates: showVertexCandidates,
    showEdgeCandidates: showEdgeCandidates,
    showTileCursor: showTileCursor,
    clearOverlays: clearOverlays,
    PLAYER_HEX: PLAYER_HEX
  };

})(window.HL);
