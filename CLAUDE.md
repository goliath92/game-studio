# Game Studio

A browser-based games site for adults. The first market is Turkey, then global. Site copy is in Turkish. The owner is Efe, a QA engineer who builds the games together with Claude.

## Structure
```
index.html                  Home page (single file: HTML + CSS + JS)
games/<id>/index.html       Each game is a self-contained HTML file
tasarim-alternatifleri/     Home page design drafts we tried (reference only, not published)
```
Game ids: `solitaire`, `mahjong`, `sudoku`, `nonogram`. These folders currently hold "yakında" (coming soon) placeholders. Replace each placeholder with the real game file.

## How the home page works
- The `GAMES` list in the `<script>` at the bottom of `index.html` defines the games. Each entry has `id`, `pos` (where it sits on the table), `title`, `desc`, `time` and `file` (the path to the game), plus `obj` (the inline HTML for the object drawn on the table).
- A click on a game opens it in a full-screen player (`#player`, an iframe), with "Tam ekran" (Full screen) and "Kapat ✕" (Close) buttons. Escape closes it too.
- The last games played are stored in `localStorage` under the `as_recent` key.

## Design (decided, keep it)
- "Kahvehane" table: a burgundy felt table (`--felt`) with a walnut wood rim (`--wood`), on a dark background. The theme is deliberately single and dark.
- Each game sits on a "tray": a 3px brass rim, `color-mix(in srgb, var(--brass) 70%, transparent)`, which turns full `--brass` on hover. A brass name plate sits on the bottom edge of the tray.
- Decoration on the table, outside the trays: a tulip tea glass, a face-down card, one mahjong tile.
- No game list under the table.
- Fonts: Young Serif (headings), Manrope (body), both from Google Fonts.
- On desktop the trays are placed with absolute positions in `%` (the `.framed .s-*` classes). At 900px and below they become a 2-column grid.

## Adding a new game
1. Put the game at `games/<new-id>/index.html`.
2. Add an entry to `GAMES`.
3. Pick a free spot on the table for its `pos`, or add a second table or row. Currently 4 spots are used on desktop.

## Game requirements
- One self-contained HTML file. External scripts load only from a pinned-version CDN.
- Works on mobile and is comfortable to tap.
- Fits the full size of the iframe it opens in; avoid fixed widths.

## Running locally
`npx http-server -p 8080`, then open http://localhost:8080. The iframes need a server; opening the file directly does not work.

## Publishing (planned)
A static site: Cloudflare Pages or Netlify.
