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
- The `GAMES` array in `index.html` defines each game: `id`, `title`, `desc`, `file` (path to the game), and `obj` (inline HTML for the object drawn on the tray stage).
- Games render as "tray" cards inside a CSS grid on a walnut-framed table. Clicking a tray opens the game in a full-screen player (`#player`, an iframe) with a "Kapat ✕" button. Escape and browser back close it.
- Opening a game sets the URL hash to `#<id>` via `pushState`. Loading the page with a hash (e.g. `/#sudoku`) opens that game directly. `popstate` closes the player.
- The last games played are stored in `localStorage` under the `as_recent` key.

## Design (decided, keep it)
- Dark background, walnut wood table frame (`linear-gradient #5B3A28 → #3A2419`), burgundy felt trays.
- Each tray: brass ring border (3px `rgba(210,167,94,.7)`), full brass on hover with 4px lift. Upper stage shows the game object, lower info section has title, description, and "Oyna" pill.
- A "Yakında" placeholder follows the last game tray (dashed border, "+" circle).
- Intro section: tea glass drawing (left) + heading + description (right), single-row flex.
- Fonts: Young Serif (headings/game titles), Manrope (body), both from Google Fonts.
- Tray grid: `repeat(auto-fit, minmax(210px, 1fr))`. At ≤900px: 2 columns. At ≤520px: 2 columns, shorter stages, scaled-down objects, "Yakında" spans full width.

## Adding a new game
1. Put the game at `games/<new-id>/index.html`.
2. Add an entry to the `GAMES` array with `id`, `title`, `desc`, `file`, and `obj`.
3. The CSS grid auto-fits — no manual positioning needed.

## Game requirements
- One self-contained HTML file. External scripts load only from a pinned-version CDN.
- Works on mobile and is comfortable to tap.
- Fits the full size of the iframe it opens in; avoid fixed widths.

## Running locally
`npx http-server -p 8080`, then open http://localhost:8080. The iframes need a server; opening the file directly does not work.

## Publishing (planned)
A static site: Cloudflare Pages or Netlify.
