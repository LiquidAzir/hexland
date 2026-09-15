# Hexland · The Settlers' Coast

A settlement and trading game for Meta Ray-Ban Display glasses and phones. Play against three AI opponents or share the device with up to four human players.

Original miniature forests, farms, quarries and mountain mines surround carved towns and cities. The interface fits the 600×600 display and uses a native phone layout with readable controls, opponent scores and guidance.

## Play

- Arrows move between controls and legal board locations. Enter or a focused click selects the same action.
- On the board, select the highlighted location. Moving beyond the available locations returns focus to Menu. Tab also cycles through visible controls.
- Touch a legal location to place a piece. Cancel backs out of an optional build without spending resources.
- Menu is available during setup, AI turns, discards and required card choices. Resume continues the pending action. Save & main menu keeps the game on this device.
- Discard: select a resource repeatedly to add cards. At the selection limit, select that resource again to clear its selected pile.
- Trades between human players require the recipient to accept the exact offer.
- Escape cancels an optional choice or pauses; F toggles browser fullscreen. The explicit Menu avoids dependence on a particular glasses Back gesture.

Base-game play includes roads, settlements, cities, 3:1 and 2:1 ports, bank and player trades, the robber, development cards, Longest Road and Largest Army. The normal goal is 10 VP on your own turn; setup also offers 8 or 12 VP and a relaxed mode without the robber. Resource icons identify port types; rates are shown below them.

Existing `hexland_save_v1` games retain their board geometry, resources, pieces, cards and phase. Invalid/incomplete saves are rejected without overwriting their storage. Setup and required-choice saves resume where they stopped.

## Run locally

```
node scripts/serve.cjs
```

Open `http://127.0.0.1:5211`. Set `PORT` to use another port. No build, runtime dependency download, WebGL or game account is required.

## Rendering

`js/art.js` defines original procedural SVG artwork and replaces the legacy renderer's board entry point. Each island's static terrain is rasterized once; subsequent piece and cursor changes draw matching native Canvas primitives over that cached image, without repeated image decoding. A single 1040×940 canvas displays the board, with an invisible SVG layer preserving precise touch targets. The canvas uses 3.73 MiB; its cached background is one additional image of the same resolution. There is no continuous scene redraw when the board is idle. `tabletop.css` supplies the display and phone interface.

The original board IDs and seeded placement algorithm in `js/board.js` remain unchanged. `js/game.js` owns rules and save validation, `js/ai.js` choices, `js/ui.js` focus and screens, and `js/app.js` the state-bound, pausable action scheduler.

## Verify

```
node tests/engine.cjs
node tests/browser.cjs
```

The browser test uses Playwright from `PLAYWRIGHT_PATH`, or the installed develop-web-game skill beneath `CODEX_HOME` / the user's home `.codex` directory. Run the preview server first. Optional variables: `HEXLAND_URL`, `HEXLAND_EVIDENCE`.

Engine coverage includes 100 setup seeds, resource conservation, building/trade atomicity, development-card prerequisites, depleted banks, Longest Road ties, turn-based victory and legacy saves. `tests/fixtures/legacy-v1.json` is a synthetic saved game generated in an isolated browser running the immutable original release, not a user's save. Browser coverage includes focused-click/Enter parity, real touch phone layout, setup against AI, reload during mandatory choices, trade consent, pause/resume, and 30 human turns / 120 dice rolls with real AI and conserved resources. The supplied develop-web-game client is also exercised; captures and reports live outside the deployment tree under `.visual-review/next-trio/hexland`.

`render_game_to_text()` exposes visible game state and `advanceTime(ms)` advances pending game actions for verification. Mutable fixtures exist only with `?test` on localhost or a loopback address; production hosts do not expose them.

## Deploy

Static Render service: `hexland`, branch `main`, publish root `.`. Production URL: `https://hexland.onrender.com`. `render.yaml` requests revalidation for game files so returning players receive the current build. Production publishing is handled separately after review.
