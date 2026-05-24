/* ============================================================
   board.js — Hex board geometry, vertex/edge graph, board setup
   ============================================================ */
window.HL = window.HL || {};

(function(HL) {
  'use strict';

  // ===== Geometry =====
  var R = 42;                          // hex radius (vertex distance from center)
  var SQRT3 = Math.sqrt(3);
  var W = R * SQRT3;                   // hex width (pointy-top)
  var H = 2 * R;                       // hex height

  function hexCenter(q, r) {
    return {
      x: W * (q + r / 2),
      y: 1.5 * R * r
    };
  }

  // Vertex offsets (pointy-top), index 0=N, 1=NE, 2=SE, 3=S, 4=SW, 5=NW
  var VTX_OFFSETS = [
    { x: 0,         y: -R },
    { x:  W / 2,    y: -R / 2 },
    { x:  W / 2,    y:  R / 2 },
    { x: 0,         y:  R },
    { x: -W / 2,    y:  R / 2 },
    { x: -W / 2,    y: -R / 2 }
  ];

  function vertexPos(q, r, i) {
    var c = hexCenter(q, r);
    var o = VTX_OFFSETS[i];
    return { x: c.x + o.x, y: c.y + o.y };
  }

  // Standard 19-tile layout (rows of 3,4,5,4,3)
  var TILE_COORDS = [
    { q:  0, r: -2 }, { q:  1, r: -2 }, { q:  2, r: -2 },
    { q: -1, r: -1 }, { q:  0, r: -1 }, { q:  1, r: -1 }, { q:  2, r: -1 },
    { q: -2, r:  0 }, { q: -1, r:  0 }, { q:  0, r:  0 }, { q:  1, r:  0 }, { q:  2, r:  0 },
    { q: -2, r:  1 }, { q: -1, r:  1 }, { q:  0, r:  1 }, { q:  1, r:  1 },
    { q: -2, r:  2 }, { q: -1, r:  2 }, { q:  0, r:  2 }
  ];

  // Spiral order (outer perimeter clockwise from top, ending at center)
  // Standard token placement order ensures no two 6/8 are adjacent if shuffled correctly.
  var SPIRAL_ORDER = [
    0, 1, 2, 6, 11, 15, 18, 17, 16, 12, 7, 3,   // outer ring (12)
    4, 5, 10, 14, 13, 8,                         // inner ring (6)
    9                                            // center (1)
  ];

  // Number tokens in spiral order (no 7)
  var TOKEN_SEQUENCE = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

  // Base resource distribution (will be shuffled)
  function baseResources() {
    return [
      'wood', 'wood', 'wood', 'wood',
      'brick', 'brick', 'brick',
      'sheep', 'sheep', 'sheep', 'sheep',
      'wheat', 'wheat', 'wheat', 'wheat',
      'ore', 'ore', 'ore',
      'desert'
    ];
  }

  // Standard port layout — 9 ports on the perimeter
  // Each port: hex(q,r) + edge index (0..5) — the edge faces outward
  // Resource: '?' = generic 3:1, or specific resource = 2:1
  // Hand-curated positions, evenly distributed.
  var PORTS = [
    { q:  0, r: -2, edge: 5, res: '?' },  // NW of top
    { q:  2, r: -2, edge: 0, res: 'wheat' }, // N of top-right
    { q:  2, r: -1, edge: 1, res: 'ore' },   // E of upper-right
    { q:  2, r:  0, edge: 2, res: '?' },     // SE of right
    { q:  1, r:  1, edge: 2, res: 'sheep' }, // SE of lower-right
    { q: -1, r:  2, edge: 3, res: '?' },     // S of bottom
    { q: -2, r:  2, edge: 4, res: 'brick' }, // SW of bottom-left
    { q: -2, r:  1, edge: 4, res: '?' },     // W of lower-left
    { q: -2, r:  0, edge: 5, res: 'wood' }   // NW of left
  ];

  // ===== Build full board graph =====
  function buildBoard(seed) {
    var rng = mulberry32(seed >>> 0 || (Math.random() * 1e9) >>> 0);

    // 1. Distribute resources
    var resources = baseResources();
    shuffle(resources, rng);

    // 2. Build tile list in spiral order; place desert wherever it lands
    var tiles = [];
    var tilesByKey = {};
    var spiralPositions = SPIRAL_ORDER.map(function(idx) { return TILE_COORDS[idx]; });

    // Tokens are placed in spiral order, SKIPPING the desert (desert gets no token, has robber)
    var tokenIdx = 0;
    for (var i = 0; i < spiralPositions.length; i++) {
      var pos = spiralPositions[i];
      var res = resources[i];
      var token = null;
      if (res !== 'desert') {
        token = TOKEN_SEQUENCE[tokenIdx++];
      }
      var c = hexCenter(pos.q, pos.r);
      var tile = {
        id: 't_' + pos.q + '_' + pos.r,
        q: pos.q, r: pos.r,
        x: c.x, y: c.y,
        res: res,
        token: token,
        hasRobber: res === 'desert'
      };
      tiles.push(tile);
      tilesByKey[pos.q + ',' + pos.r] = tile;
    }

    // 3. Build vertex graph (dedupe by spatial position)
    var vertices = {};       // id -> { id, x, y, tiles[], adjVerts[], adjEdges[] }
    var vertList = [];

    function vKey(x, y) {
      return Math.round(x * 10) + '_' + Math.round(y * 10);
    }

    tiles.forEach(function(tile) {
      tile.vertexIds = [];
      for (var i = 0; i < 6; i++) {
        var p = vertexPos(tile.q, tile.r, i);
        var key = vKey(p.x, p.y);
        var v = vertices[key];
        if (!v) {
          v = {
            id: 'v_' + vertList.length,
            x: p.x, y: p.y,
            tiles: [],
            adjVerts: [],
            adjEdges: []
          };
          vertices[key] = v;
          vertList.push(v);
        }
        v.tiles.push(tile.id);
        tile.vertexIds.push(v.id);
      }
    });

    // 4. Build edge graph (dedupe by midpoint)
    var edges = {};
    var edgeList = [];

    function eKey(v1, v2) {
      // smaller id first
      return v1.id < v2.id ? v1.id + '|' + v2.id : v2.id + '|' + v1.id;
    }

    tiles.forEach(function(tile) {
      tile.edgeIds = [];
      for (var i = 0; i < 6; i++) {
        var vidA = tile.vertexIds[i];
        var vidB = tile.vertexIds[(i + 1) % 6];
        var vA = vertList.find(function(v){return v.id===vidA;});
        var vB = vertList.find(function(v){return v.id===vidB;});
        var key = eKey(vA, vB);
        var e = edges[key];
        if (!e) {
          e = {
            id: 'e_' + edgeList.length,
            v1: vidA, v2: vidB,
            x: (vA.x + vB.x) / 2,
            y: (vA.y + vB.y) / 2,
            tiles: []
          };
          edges[key] = e;
          edgeList.push(e);
        }
        e.tiles.push(tile.id);
        tile.edgeIds.push(e.id);
      }
    });

    // 5. Fill vertex adjacency
    edgeList.forEach(function(e) {
      var vA = vertList.find(function(v){return v.id===e.v1;});
      var vB = vertList.find(function(v){return v.id===e.v2;});
      if (vA.adjVerts.indexOf(vB.id) === -1) vA.adjVerts.push(vB.id);
      if (vB.adjVerts.indexOf(vA.id) === -1) vB.adjVerts.push(vA.id);
      if (vA.adjEdges.indexOf(e.id) === -1) vA.adjEdges.push(e.id);
      if (vB.adjEdges.indexOf(e.id) === -1) vB.adjEdges.push(e.id);
    });

    // 6. Place ports — each port lives on an edge of an outer tile
    var ports = [];
    var portsShuffled = PORTS.slice();
    // Shuffle which resource goes to which port location
    var portResources = ['?', '?', '?', '?', 'wood', 'brick', 'sheep', 'wheat', 'ore'];
    shuffle(portResources, rng);
    portsShuffled.forEach(function(p, idx) {
      var tile = tilesByKey[p.q + ',' + p.r];
      if (!tile) return;
      var edgeId = tile.edgeIds[p.edge];
      var edge = edgeList.find(function(e){return e.id===edgeId;});
      var port = {
        id: 'p_' + idx,
        res: portResources[idx],
        rate: portResources[idx] === '?' ? 3 : 2,
        edgeId: edgeId,
        v1: edge.v1, v2: edge.v2,
        x: edge.x, y: edge.y,
        // Outward direction (away from tile center)
        ox: edge.x - tile.x,
        oy: edge.y - tile.y
      };
      // Normalize and extend outward for icon position
      var mag = Math.sqrt(port.ox * port.ox + port.oy * port.oy) || 1;
      port.iconX = edge.x + (port.ox / mag) * 22;
      port.iconY = edge.y + (port.oy / mag) * 22;
      ports.push(port);
      // Tag the vertices as having this port
      var vA = vertList.find(function(v){return v.id===edge.v1;});
      var vB = vertList.find(function(v){return v.id===edge.v2;});
      vA.port = port.id;
      vB.port = port.id;
    });

    // 7. Robber starts on desert
    var desertTile = tiles.find(function(t){return t.res === 'desert';});
    var robberTileId = desertTile.id;

    return {
      tiles: tiles,
      tilesByKey: tilesByKey,
      vertices: vertList,
      verticesById: indexBy(vertList, 'id'),
      edges: edgeList,
      edgesById: indexBy(edgeList, 'id'),
      ports: ports,
      robberTileId: robberTileId,
      R: R
    };
  }

  // ===== utilities =====
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function indexBy(arr, key) {
    var out = {};
    arr.forEach(function(o) { out[o[key]] = o; });
    return out;
  }

  // Distance from point (px,py) to vertex
  function distSq(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx*dx + dy*dy;
  }

  // ===== Queries =====
  // All vertices where a settlement could legally be placed (initial setup):
  //   - not occupied
  //   - distance rule: no adjacent vertex already has a settlement/city
  function legalSettlementVertices(board, players, requireRoadOwner) {
    var occupied = {};
    players.forEach(function(p) {
      Object.keys(p.settlements).forEach(function(vid){ occupied[vid] = true; });
      Object.keys(p.cities).forEach(function(vid){ occupied[vid] = true; });
    });

    var out = [];
    board.vertices.forEach(function(v) {
      if (occupied[v.id]) return;
      // Distance rule
      var tooClose = v.adjVerts.some(function(av) { return occupied[av]; });
      if (tooClose) return;
      // For non-setup builds, must connect via own road
      if (requireRoadOwner) {
        var hasMyRoad = v.adjEdges.some(function(eid) {
          return requireRoadOwner.roads[eid];
        });
        if (!hasMyRoad) return;
      }
      out.push(v.id);
    });
    return out;
  }

  // Legal road edges for a player:
  //   - not occupied
  //   - either adjacent to one of this player's settlements/cities
  //   - or adjacent (via shared endpoint) to one of this player's roads
  //     UNLESS the shared endpoint is occupied by another player
  function legalRoadEdges(board, players, ownerIdx, fromVertexId) {
    var allRoads = {};      // edgeId -> playerIdx
    var allBuildings = {};  // vertexId -> playerIdx
    players.forEach(function(p, i) {
      Object.keys(p.roads).forEach(function(eid){ allRoads[eid] = i; });
      Object.keys(p.settlements).forEach(function(vid){ allBuildings[vid] = i; });
      Object.keys(p.cities).forEach(function(vid){ allBuildings[vid] = i; });
    });

    var owner = players[ownerIdx];
    var out = [];
    board.edges.forEach(function(e) {
      if (allRoads[e.id] !== undefined) return; // occupied
      var v1 = board.verticesById[e.v1];
      var v2 = board.verticesById[e.v2];
      var ok = false;

      if (fromVertexId !== undefined) {
        // Constrained: must touch the given vertex
        if (e.v1 !== fromVertexId && e.v2 !== fromVertexId) return;
        ok = true;
      } else {
        // Normal: must connect to existing road or own building
        if (owner.settlements[e.v1] || owner.settlements[e.v2] ||
            owner.cities[e.v1] || owner.cities[e.v2]) {
          ok = true;
        }
        if (!ok) {
          // Check adjacency via shared endpoint of own road
          // Roads are continuous unless blocked by enemy settlement at the shared vertex
          v1.adjEdges.forEach(function(adjE) {
            if (adjE !== e.id && allRoads[adjE] === ownerIdx) {
              // shared endpoint is v1; check if blocked
              var blocker = allBuildings[v1.id];
              if (blocker === undefined || blocker === ownerIdx) ok = true;
            }
          });
          v2.adjEdges.forEach(function(adjE) {
            if (adjE !== e.id && allRoads[adjE] === ownerIdx) {
              var blocker = allBuildings[v2.id];
              if (blocker === undefined || blocker === ownerIdx) ok = true;
            }
          });
        }
      }
      if (ok) out.push(e.id);
    });
    return out;
  }

  // Legal city upgrade vertices: own settlements
  function legalCityVertices(board, player) {
    return Object.keys(player.settlements);
  }

  // Compute longest-road for a player (length of longest continuous chain)
  function longestRoadFor(board, players, ownerIdx) {
    var owner = players[ownerIdx];
    var myRoadIds = Object.keys(owner.roads);
    if (myRoadIds.length === 0) return 0;

    // Block endpoints owned by enemies
    var allBuildings = {};
    players.forEach(function(p, i) {
      Object.keys(p.settlements).forEach(function(vid){ allBuildings[vid] = i; });
      Object.keys(p.cities).forEach(function(vid){ allBuildings[vid] = i; });
    });

    var roadEdgeSet = {};
    myRoadIds.forEach(function(eid){ roadEdgeSet[eid] = true; });

    var best = 0;

    function neighborsOf(vid, fromEdge) {
      var v = board.verticesById[vid];
      // If this vertex is occupied by an enemy, we cannot traverse through it
      var occBy = allBuildings[vid];
      if (occBy !== undefined && occBy !== ownerIdx) return [];
      var out = [];
      v.adjEdges.forEach(function(eid) {
        if (eid === fromEdge) return;
        if (!roadEdgeSet[eid]) return;
        var e = board.edgesById[eid];
        var otherV = e.v1 === vid ? e.v2 : e.v1;
        out.push({ edgeId: eid, vertexId: otherV });
      });
      return out;
    }

    function dfs(vid, fromEdge, used) {
      var len = used.length;
      if (len > best) best = len;
      var nexts = neighborsOf(vid, fromEdge);
      for (var i = 0; i < nexts.length; i++) {
        var nx = nexts[i];
        if (used[nx.edgeId]) continue;
        used[nx.edgeId] = true;
        dfs(nx.vertexId, nx.edgeId, used);
        delete used[nx.edgeId];
      }
    }

    // Start DFS from both endpoints of every road
    myRoadIds.forEach(function(eid) {
      var e = board.edgesById[eid];
      var used = {}; used[eid] = true;
      dfs(e.v1, eid, used);
      used = {}; used[eid] = true;
      dfs(e.v2, eid, used);
    });

    return best;
  }

  // Find a vertex by approximate screen position (used for cursor navigation)
  function nearestVertex(board, x, y, filterFn) {
    var best = null, bestD = Infinity;
    board.vertices.forEach(function(v) {
      if (filterFn && !filterFn(v)) return;
      var d = distSq(v.x, v.y, x, y);
      if (d < bestD) { bestD = d; best = v; }
    });
    return best;
  }

  function nearestEdge(board, x, y, filterFn) {
    var best = null, bestD = Infinity;
    board.edges.forEach(function(e) {
      if (filterFn && !filterFn(e)) return;
      var d = distSq(e.x, e.y, x, y);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  function nearestTile(board, x, y, filterFn) {
    var best = null, bestD = Infinity;
    board.tiles.forEach(function(t) {
      if (filterFn && !filterFn(t)) return;
      var d = distSq(t.x, t.y, x, y);
      if (d < bestD) { bestD = d; best = t; }
    });
    return best;
  }

  // Find the nearest item in a directional sense (dpad navigation)
  function pickDirectional(items, fromX, fromY, dir) {
    var dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    var dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    var best = null, bestScore = Infinity;
    items.forEach(function(it) {
      var vx = it.x - fromX;
      var vy = it.y - fromY;
      // Must be in roughly the right direction
      var dot = vx * dx + vy * dy;
      if (dot <= 1) return;
      // Score: prefer aligned movement (less lateral)
      var lateral;
      if (dx !== 0) {
        lateral = Math.abs(vy);
      } else {
        lateral = Math.abs(vx);
      }
      var primary = Math.abs(dx !== 0 ? vx : vy);
      var score = primary + lateral * 1.5;
      if (score < bestScore) { bestScore = score; best = it; }
    });
    return best;
  }

  // Vertex-to-port lookup: which ports a player can use
  function playerPorts(board, player) {
    var rates = {};
    Object.keys(player.settlements).concat(Object.keys(player.cities)).forEach(function(vid){
      var v = board.verticesById[vid];
      if (v && v.port) {
        var port = board.ports.find(function(p){return p.id === v.port;});
        if (port) {
          if (port.res === '?') {
            // 3:1 generic — applies to all resources
            ['wood','brick','sheep','wheat','ore'].forEach(function(res){
              if (!rates[res] || rates[res] > 3) rates[res] = 3;
            });
          } else {
            if (!rates[port.res] || rates[port.res] > 2) rates[port.res] = 2;
          }
        }
      }
    });
    return rates;
  }

  HL.Board = {
    R: R, W: W, H: H,
    hexCenter: hexCenter,
    vertexPos: vertexPos,
    buildBoard: buildBoard,
    legalSettlementVertices: legalSettlementVertices,
    legalRoadEdges: legalRoadEdges,
    legalCityVertices: legalCityVertices,
    longestRoadFor: longestRoadFor,
    nearestVertex: nearestVertex,
    nearestEdge: nearestEdge,
    nearestTile: nearestTile,
    pickDirectional: pickDirectional,
    playerPorts: playerPorts,
    shuffle: shuffle,
    mulberry32: mulberry32
  };

})(window.HL);
