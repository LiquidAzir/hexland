# Hexland

A hex-tile settlement & trading strategy game for Meta Ray-Ban Display glasses.

- 600×600 dark-theme webapp, D-pad navigation (EMG wrist band)
- Solo vs. 3 AI opponents (aggressive, builder, trader styles)
- Full base-game ruleset: settlements/cities/roads, robber, development cards (knight, road building, monopoly, year of plenty, victory point), longest road, largest army, ports (3:1 generic, 2:1 specific), bank trades, player-to-player trades, win at 10 VP

## Stack

Vanilla JS + SVG. No build step. Pure static site.

## Files

```
index.html         screens
styles.css         dark theme, focus states, popovers
manifest.webmanifest
favicon.png
js/board.js        hex coordinate system, vertex/edge graph, port logic, longest-road DFS
js/game.js         rules engine, dice, robber, dev cards, achievements, win check
js/ai.js           AI opponent decision-making
js/render.js       SVG board renderer with painterly textures
js/ui.js           screen routing, popovers, focus management, placement cursor
js/app.js          entry point, action dispatch, AI driver
```

## Local dev

```
python -m http.server 5186 --directory .
```

Then open http://localhost:5186 — arrow keys navigate, Enter selects, Esc cancels.

## Deploy

Static site on Render via `render.yaml` Blueprint. Push to `main` → production at `https://hexland.onrender.com`. Push to `staging` → preview at `https://hexland-staging.onrender.com`.
