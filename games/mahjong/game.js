/* ==============================================
   Mahjong Solitaire - Full Game Logic
   ============================================== */

(function () {
    'use strict';

    // ── Tile Definitions & Face Rendering ─────────
    const NUM = ['一','二','三','四','五','六','七','八','九'];
    const ROWS = {1:[1],2:[1,1],3:[1,1,1],4:[2,2],5:[2,1,2],6:[2,2,2],7:[3,2,2],8:[3,2,3],9:[3,3,3]};
    const PIPC = ['var(--blu)','var(--grn)','var(--red)'];

    function pipSVG(n, type) {
        let rows = ROWS[n]; if (type === 'bam' && n === 3) rows = [1, 2];
        const top = 8, bot = 44; let out = '';
        rows.forEach((cnt, ri) => {
            const y = rows.length === 1 ? 26 : top + (bot - top) * ri / (rows.length - 1);
            for (let i = 0; i < cnt; i++) {
                let x = cnt === 1 ? 20 : 8 + 24 * i / (cnt - 1);
                if (type === 'dot' && n === 3) x = 9 + 11 * ri;
                if (type === 'dot') {
                    const r = n === 1 ? 13 : n === 2 ? 8.5 : n <= 4 ? 7 : n <= 6 ? 6 : 5;
                    const c = n === 1 ? 'var(--red)' : PIPC[ri % 3];
                    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${(r * .3).toFixed(1)}"/><circle cx="${x}" cy="${y}" r="${(r * .38).toFixed(1)}" fill="${c}"/>`;
                } else {
                    const h = rows.length === 1 ? 36 : Math.min(18, (bot - top) / (rows.length - 1) * .78);
                    const w = n === 1 ? 8 : 5.2;
                    const mid = rows.length > 2 && ri === (rows.length - 1) / 2 && n % 2;
                    const c = n === 1 || mid ? 'var(--red)' : 'var(--grn)';
                    out += `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${c}"/><rect x="${x - w / 2}" y="${y - .6}" width="${w}" height="1.2" fill="var(--tf)"/>`;
                }
            }
        });
        return `<svg viewBox="0 0 40 52" aria-hidden="true">${out}</svg>`;
    }

    function faceHTML(f) {
        switch (f.kind) {
            case 'm': return `<div class="cn"><span class="num">${NUM[f.n - 1]}</span><span class="wan">萬</span></div>`;
            case 'p': return pipSVG(f.n, 'dot');
            case 's': return pipSVG(f.n, 'bam');
            case 'w': return `<div class="glyph ink">${f.c}</div><span class="idx">${f.lat}</span>`;
            case 'd': return f.cls === 'wht' ? `<div class="white"></div>` : `<div class="glyph ${f.cls}">${f.c}</div>`;
            case 'f': return `<div class="glyph flw">${f.c}</div><span class="idx">${f.n}</span>`;
            case 'q': return `<div class="glyph ssn">${f.c}</div><span class="idx">${f.n}</span>`;
        }
    }

    function buildDeck() {
        const deck = [];
        let id = 0;
        for (const s of ['m', 'p', 's']) {
            for (let n = 1; n <= 9; n++) {
                for (let copy = 0; copy < 4; copy++) {
                    deck.push({ id: id++, face: {kind: s, n, key: s + n}, matchGroup: s + n });
                }
            }
        }
        const winds = [
            {kind: 'w', c: '東', lat: 'E', key: 'wE'},
            {kind: 'w', c: '南', lat: 'S', key: 'wS'},
            {kind: 'w', c: '西', lat: 'W', key: 'wW'},
            {kind: 'w', c: '北', lat: 'N', key: 'wN'},
        ];
        for (const w of winds) {
            for (let copy = 0; copy < 4; copy++) {
                deck.push({ id: id++, face: w, matchGroup: w.key });
            }
        }
        const dragons = [
            {kind: 'd', c: '中', cls: 'red', key: 'dR'},
            {kind: 'd', c: '發', cls: 'grn', key: 'dG'},
            {kind: 'd', c: '白', cls: 'wht', key: 'dW'},
        ];
        for (const d of dragons) {
            for (let copy = 0; copy < 4; copy++) {
                deck.push({ id: id++, face: d, matchGroup: d.key });
            }
        }
        const seasons = [
            {kind: 'q', c: '春', n: 1},
            {kind: 'q', c: '夏', n: 2},
            {kind: 'q', c: '秋', n: 3},
            {kind: 'q', c: '冬', n: 4},
        ];
        for (const s of seasons) {
            deck.push({ id: id++, face: s, matchGroup: 'season' });
        }
        const flowers = [
            {kind: 'f', c: '梅', n: 1},
            {kind: 'f', c: '蘭', n: 2},
            {kind: 'f', c: '菊', n: 3},
            {kind: 'f', c: '竹', n: 4},
        ];
        for (const f of flowers) {
            deck.push({ id: id++, face: f, matchGroup: 'flower' });
        }
        return deck; // 144 tiles
    }

    // ── Turtle Layout (144 positions, 4 layers) ──────

    function buildLayout() {
        // Layer 0 (ground): 88 tiles
        // Octagonal/diamond shape, 8 rows, with wider middle rows
        //   row 0: cols 2..9    (8)
        //   row 1: cols 1..10   (10)
        //   row 2: cols 0..11   (12)
        //   row 3: cols -1..12  (14)
        //   row 4: cols -1..12  (14)
        //   row 5: cols 0..11   (12)
        //   row 6: cols 1..10   (10)
        //   row 7: cols 2..9    (8)
        // Total = 8+10+12+14+14+12+10+8 = 88

        const rowSpec0 = [
            [0, 2, 9],
            [1, 1, 10],
            [2, 0, 11],
            [3, -1, 12],
            [4, -1, 12],
            [5, 0, 11],
            [6, 1, 10],
            [7, 2, 9],
        ];
        const L0 = [];
        for (const [row, cStart, cEnd] of rowSpec0) {
            for (let c = cStart; c <= cEnd; c++) L0.push([c, row]);
        }

        // Layer 1: 6 cols x 6 rows = 36
        const L1 = [];
        for (let r = 1; r <= 6; r++) {
            for (let c = 3; c <= 8; c++) L1.push([c, r]);
        }

        // Layer 2: 4 cols x 4 rows = 16
        const L2 = [];
        for (let r = 2; r <= 5; r++) {
            for (let c = 4; c <= 7; c++) L2.push([c, r]);
        }

        // Layer 3: 2 cols x 2 rows = 4
        const L3 = [];
        for (let r = 3; r <= 4; r++) {
            for (let c = 5; c <= 6; c++) L3.push([c, r]);
        }

        // 88 + 36 + 16 + 4 = 144
        return [L0, L1, L2, L3];
    }

    // ── Pixel positioning ──────────────────────────

    const TILE_W    = 52;
    const TILE_H    = 68;
    const GAP       = 2;
    const COL_STEP  = TILE_W + GAP;
    const ROW_STEP  = TILE_H + GAP;
    const LAYER_DX  = -4;   // shift left per layer (3D effect)
    const LAYER_DY  = -4;   // shift up per layer

    function pixelPos(col, row, layer) {
        return {
            x: col * COL_STEP + layer * LAYER_DX,
            y: row * ROW_STEP + layer * LAYER_DY,
        };
    }

    // ── Game state ─────────────────────────────────

    const S = {
        tiles: [],
        selected: null,
        moves: 0,
        remaining: 144,
        seconds: 0,
        interval: null,
        active: false,
        hintPair: null,
        bw: 0,
        bh: 0,
        gridMap: new Map(),
    };

    // ── DOM refs ───────────────────────────────────

    const $ = id => document.getElementById(id);
    const dom = {
        board:      $('board'),
        moves:      $('move-counter'),
        timer:      $('timer'),
        remaining:  $('tiles-remaining'),
        btnHint:    $('btn-hint'),
        btnShuffle: $('btn-shuffle'),
        btnNew:     $('btn-new-game'),
        overlay:    $('overlay'),
        oTitle:     $('overlay-title'),
        oMsg:       $('overlay-message'),
        oStats:     $('overlay-stats'),
        oBtn:       $('overlay-btn'),
        toast:      $('hint-toast'),
        wrapper:    $('board-wrapper'),
    };

    // ── Utility ────────────────────────────────────

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ── Spatial lookup map (O(1) adjacency) ────────

    function rebuildGridMap() {
        const map = S.gridMap;
        map.clear();
        for (const t of S.tiles) {
            if (t.removed) continue;
            map.set(`${t.col},${t.row},${t.layer}`, t);
        }
    }

    // ── Free-tile detection ────────────────────────

    // All grid coords are integers, so adjacency checks reduce to
    // exact coordinate lookups in the spatial map.

    function isBlockedFromAbove(tile) {
        const map = S.gridMap;
        for (let l = tile.layer + 1; l <= 3; l++) {
            if (map.has(`${tile.col},${tile.row},${l}`)) return true;
        }
        return false;
    }

    function isTileFree(tile) {
        if (tile.removed) return false;
        if (isBlockedFromAbove(tile)) return false;

        const map = S.gridMap;
        const leftBlocked  = map.has(`${tile.col - 1},${tile.row},${tile.layer}`);
        const rightBlocked = map.has(`${tile.col + 1},${tile.row},${tile.layer}`);

        return !(leftBlocked && rightBlocked);
    }

    function updateFreeStatus() {
        rebuildGridMap();
        for (const t of S.tiles) {
            if (t.removed || !t.el) continue;
            t.el.classList.toggle('blocked', !isTileFree(t));
        }
    }

    // ── Matching logic ─────────────────────────────

    function tilesMatch(a, b) {
        return a !== b && a.matchGroup === b.matchGroup;
    }

    function freeTiles() {
        rebuildGridMap();
        return S.tiles.filter(t => !t.removed && isTileFree(t));
    }

    function findMatch() {
        rebuildGridMap();
        const seen = new Map();
        for (const t of S.tiles) {
            if (t.removed || !isTileFree(t)) continue;
            const prev = seen.get(t.matchGroup);
            if (prev) return [prev, t];
            seen.set(t.matchGroup, t);
        }
        return null;
    }

    // ── Render ─────────────────────────────────────

    function renderBoard() {
        dom.board.innerHTML = '';
        dom.board.style.width  = S.bw + 'px';
        dom.board.style.height = S.bh + 'px';

        // Sort: bottom layers first, then top-to-bottom, left-to-right
        const sorted = [...S.tiles].sort((a, b) =>
            (a.layer - b.layer) || (a.row - b.row) || (a.col - b.col)
        );

        const frag = document.createDocumentFragment();

        for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            if (t.removed) continue;

            const el = document.createElement('div');
            el.className = 'tile dealing';
            el.style.zIndex = t.layer * 1000 + Math.round(t.row * 50) + Math.round((t.col + 2) * 2);
            el.style.setProperty('--tx', t.x + 'px');
            el.style.setProperty('--ty', t.y + 'px');
            el.style.transform = `translate(${t.x}px, ${t.y}px)`;
            el.style.animationDelay = `${i * 2}ms`;

            el.innerHTML = `<div class="face">${faceHTML(t.face)}</div>`;
            el.addEventListener('click', () => onTileClick(t));

            t.el = el;
            frag.appendChild(el);
        }

        dom.board.appendChild(frag);

        // Remove deal animation after it finishes
        const dur = sorted.length * 2 + 400;
        setTimeout(() => {
            for (const t of S.tiles) {
                if (t.el) t.el.classList.remove('dealing');
            }
            updateFreeStatus();
        }, dur);

        updateFreeStatus();
    }

    function scaleBoard() {
        var cs = getComputedStyle(dom.wrapper);
        var padL = parseFloat(cs.paddingLeft) || 0;
        var padT = parseFloat(cs.paddingTop) || 0;
        var padR = parseFloat(cs.paddingRight) || 0;
        var padB = parseFloat(cs.paddingBottom) || 0;
        var cw = dom.wrapper.clientWidth - padL - padR;
        var ch = dom.wrapper.clientHeight - padT - padB;
        var s = Math.min(cw / S.bw, ch / S.bh);
        document.documentElement.style.setProperty('--board-scale', s);
        dom.board.style.width  = S.bw + 'px';
        dom.board.style.height = S.bh + 'px';
        dom.board.style.left = (padL + (cw - S.bw * s) / 2) + 'px';
        dom.board.style.top  = (padT + (ch - S.bh * s) / 2) + 'px';
    }

    function scaleUI() {
        var container = document.getElementById('game-container');
        var s = Math.min(window.innerWidth / 1100, window.innerHeight / 700);
        container.style.transform = 'scale(' + s + ')';
        container.style.transformOrigin = 'center center';
        scaleBoard();
    }

    // ── New game ───────────────────────────────────

    function newGame() {
        stopTimer();

        S.tiles    = [];
        S.selected = null;
        S.moves    = 0;
        S.remaining = 144;
        S.seconds  = 0;
        S.active   = true;
        S.hintPair = null;

        dom.overlay.classList.add('hidden');
        clearHints();

        // Build positions
        const layers = buildLayout();
        const positions = [];
        for (let li = 0; li < layers.length; li++) {
            for (const [c, r] of layers[li]) {
                positions.push({ col: c, row: r, layer: li });
            }
        }

        // Shuffle the deck
        const deck = shuffle(buildDeck());

        // Assign tiles to positions
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < positions.length; i++) {
            const p   = positions[i];
            const d   = deck[i];
            const px  = pixelPos(p.col, p.row, p.layer);

            const tile = {
                id:         d.id,
                face:       d.face,
                matchGroup: d.matchGroup,
                col:  p.col,
                row:  p.row,
                layer: p.layer,
                x: px.x,
                y: px.y,
                removed: false,
                el: null,
            };
            S.tiles.push(tile);

            if (px.x < minX) minX = px.x;
            if (px.x + TILE_W > maxX) maxX = px.x + TILE_W;
            if (px.y < minY) minY = px.y;
            if (px.y + TILE_H > maxY) maxY = px.y + TILE_H;
        }

        // Normalise so top-left is near (0,0) with padding
        const padX = 25, padY = 15;
        for (const t of S.tiles) {
            t.x -= minX - padX;
            t.y -= minY - padY;
        }
        S.bw = (maxX - minX) + padX * 2 + 12;
        S.bh = (maxY - minY) + padY * 2 + 12;

        renderBoard();
        updateStats();
        scaleUI();
        startTimer();

        // If no match exists from the start, shuffle once
        setTimeout(() => {
            if (S.active && !findMatch()) {
                showToast('No valid moves - shuffling...');
                setTimeout(shuffleTiles, 600);
            }
        }, 400);
    }

    // ── Click handler ──────────────────────────────

    function onTileClick(tile) {
        if (!S.active || tile.removed) return;
        rebuildGridMap();
        if (!isTileFree(tile)) return;

        clearHints();

        if (!S.selected) {
            S.selected = tile;
            tile.el.classList.add('selected');
            return;
        }

        if (S.selected === tile) {
            tile.el.classList.remove('selected');
            S.selected = null;
            return;
        }

        if (tilesMatch(S.selected, tile)) {
            removePair(S.selected, tile);
            S.selected = null;
        } else {
            S.selected.el.classList.remove('selected');
            S.selected = tile;
            tile.el.classList.add('selected');
        }
    }

    function removePair(a, b) {
        a.el.classList.remove('selected');
        b.el.classList.remove('selected');
        a.el.classList.add('removing');
        b.el.classList.add('removing');
        a.removed = true;
        b.removed = true;

        S.moves++;
        S.remaining -= 2;
        updateStats();

        setTimeout(() => {
            if (a.el) { a.el.remove(); a.el = null; }
            if (b.el) { b.el.remove(); b.el = null; }
            updateFreeStatus();

            if (S.remaining === 0) { endGame(true); return; }
            if (!findMatch()) endGame(false);
        }, 480);
    }

    // ── Hint ───────────────────────────────────────

    function showHint() {
        if (!S.active) return;
        clearHints();

        const pair = findMatch();
        if (pair) {
            S.hintPair = pair;
            pair[0].el.classList.add('hint');
            pair[1].el.classList.add('hint');
            setTimeout(clearHints, 3000);
        } else {
            showToast('No valid moves available!');
        }
    }

    function clearHints() {
        if (S.hintPair) {
            for (const t of S.hintPair) {
                if (t.el) t.el.classList.remove('hint');
            }
            S.hintPair = null;
        }
    }

    // ── Shuffle ────────────────────────────────────

    function shuffleTiles() {
        if (!S.active) return;
        clearHints();
        if (S.selected) { S.selected.el.classList.remove('selected'); S.selected = null; }

        const live = S.tiles.filter(t => !t.removed);
        if (!live.length) return;

        const data = live.map(t => ({ face: t.face, matchGroup: t.matchGroup }));
        shuffle(data);

        for (let i = 0; i < live.length; i++) {
            live[i].face       = data[i].face;
            live[i].matchGroup = data[i].matchGroup;
            if (live[i].el) {
                live[i].el.classList.add('shuffling');
                live[i].el.querySelector('.face').innerHTML = faceHTML(data[i].face);
            }
        }

        setTimeout(() => {
            for (const t of live) { if (t.el) t.el.classList.remove('shuffling'); }
            updateFreeStatus();
            if (!findMatch()) {
                showToast('Still no moves - shuffling again...');
                setTimeout(shuffleTiles, 500);
            }
        }, 450);
    }

    // ── Timer ──────────────────────────────────────

    function startTimer() {
        stopTimer();
        S.seconds = 0;
        updateTimerDisplay();
        S.interval = setInterval(() => {
            if (S.active) { S.seconds++; updateTimerDisplay(); }
        }, 1000);
    }

    function stopTimer() {
        if (S.interval) { clearInterval(S.interval); S.interval = null; }
    }

    function updateTimerDisplay() {
        const m = Math.floor(S.seconds / 60);
        const s = S.seconds % 60;
        dom.timer.textContent = m + ':' + String(s).padStart(2, '0');
    }

    // ── UI helpers ─────────────────────────────────

    function updateStats() {
        dom.moves.textContent     = S.moves;
        dom.remaining.textContent = S.remaining;
    }

    let toastTimer = null;
    function showToast(msg) {
        dom.toast.textContent = msg;
        dom.toast.classList.remove('hidden');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 2500);
    }

    // ── Game end ───────────────────────────────────

    function endGame(won) {
        S.active = false;
        stopTimer();

        dom.oTitle.textContent = won ? 'You Win!' : 'No More Moves';
        dom.oMsg.textContent   = won
            ? 'Congratulations! You cleared all the tiles!'
            : 'No valid matches remain. Try a new game!';

        dom.oStats.innerHTML =
            `<div class="stat"><span class="mj-label">Moves</span><span class="mj-value">${S.moves}</span></div>` +
            `<div class="stat"><span class="mj-label">Time</span><span class="mj-value">${dom.timer.textContent}</span></div>` +
            `<div class="stat"><span class="mj-label">Tiles Left</span><span class="mj-value">${S.remaining}</span></div>`;

        dom.overlay.classList.remove('hidden');
    }

    // ── Event wiring ───────────────────────────────

    dom.btnNew.addEventListener('click', newGame);
    dom.oBtn.addEventListener('click', newGame);
    dom.btnHint.addEventListener('click', showHint);
    dom.btnShuffle.addEventListener('click', shuffleTiles);
    window.addEventListener('resize', scaleUI);

    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) return;
        switch (e.key.toLowerCase()) {
            case 'n': newGame();      break;
            case 'h': showHint();     break;
            case 's': shuffleTiles(); break;
            case 'escape':
                if (S.selected) { S.selected.el.classList.remove('selected'); S.selected = null; }
                clearHints();
                break;
        }
    });

    // ── Tile Theme Picker ──────────────────────────
    (function initThemePicker() {
        var saved = null;
        try { saved = localStorage.getItem('mahjong-tile-theme'); } catch (_) {}
        if (saved !== null) {
            if (saved) document.body.setAttribute('data-tiles', saved);
            else document.body.removeAttribute('data-tiles');
        }
        var swatches = document.querySelectorAll('.mj-swatch');
        function markActive() {
            var current = document.body.getAttribute('data-tiles') || '';
            swatches.forEach(function (s) {
                s.classList.toggle('is-active', s.dataset.theme === current);
            });
        }
        swatches.forEach(function (s) {
            s.addEventListener('click', function () {
                var theme = s.dataset.theme;
                if (theme) document.body.setAttribute('data-tiles', theme);
                else document.body.removeAttribute('data-tiles');
                try { localStorage.setItem('mahjong-tile-theme', theme); } catch (_) {}
                markActive();
            });
        });
        markActive();
    })();

    // ── Table Theme Picker ────────────────────────
    (function initTableThemePicker() {
        var saved = null;
        try { saved = localStorage.getItem('mahjong-table-theme'); } catch (_) {}
        if (saved) document.body.dataset.tableTheme = saved;

        var btns = document.querySelectorAll('.table-theme-btn');
        function markActive() {
            var current = document.body.dataset.tableTheme || 'cay-evi';
            btns.forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.table === current);
            });
        }
        btns.forEach(function (b) {
            b.addEventListener('click', function () {
                document.body.dataset.tableTheme = b.dataset.table;
                try { localStorage.setItem('mahjong-table-theme', b.dataset.table); } catch (_) {}
                markActive();
            });
        });
        markActive();
    })();

    // ── Start ──────────────────────────────────────
    newGame();
})();
