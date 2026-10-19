/* ==============================================
   Mahjong Solitaire - Full Game Logic
   ============================================== */

(function () {
    'use strict';

    // ── Language Support ──────────────────────────
    const LANG = {
        en: {
            moves: 'Moves', timer: 'Time', tiles: 'Tiles', openPairs: 'Open Pairs',
            hint: 'Hint', shuffle: 'Shuffle', newGame: 'New Game',
            theme: 'Theme', table: 'Table', settings: 'Settings',
            difficulty: 'Difficulty', easy: 'Easy', medium: 'Medium', hard: 'Hard',
            youWin: 'You Win!', noMoreMoves: 'No More Moves',
            congrats: 'Congratulations! You cleared all the tiles!',
            noMatches: 'No valid matches remain. Try a new game!',
            shuffling: 'No valid moves - shuffling...',
            noMoves: 'No valid moves available!',
            movesLabel: 'Moves', timeLabel: 'Time', tilesLeft: 'Tiles Left',
            confirmNewGame: 'End the current game and start a new one?'
        },
        tr: {
            moves: 'Hamle', timer: 'Süre', tiles: 'Taş', openPairs: 'Açık Çift',
            hint: 'İpucu', shuffle: 'Karıştır', newGame: 'Yeni Oyun',
            theme: 'Tema', table: 'Masa', settings: 'Ayarlar',
            difficulty: 'Zorluk', easy: 'Kolay', medium: 'Orta', hard: 'Zor',
            youWin: 'Kazandınız!', noMoreMoves: 'Hamle Kalmadı',
            congrats: 'Tebrikler! Tüm taşları temizlediniz!',
            noMatches: 'Geçerli eşleşme kalmadı. Yeni oyun deneyin!',
            shuffling: 'Hamle yok - karıştırılıyor...',
            noMoves: 'Geçerli hamle yok!',
            movesLabel: 'Hamle', timeLabel: 'Süre', tilesLeft: 'Kalan Taş',
            confirmNewGame: 'Devam eden oyunu bitirmek istediğinize emin misiniz?'
        }
    };

    function getLang() {
        try { return localStorage.getItem('lang') || 'tr'; } catch (_) { return 'tr'; }
    }

    function t(key) { return (LANG[getLang()] || LANG.tr)[key] || key; }

    function setLang(lang) {
        try { localStorage.setItem('lang', lang); } catch (_) {}
        applyLang();
    }

    function applyLang() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.dataset.i18n;
            var val = t(key);
            if (val) el.textContent = val;
        });

        // Difficulty button text
        var diffMap = { easy: t('easy'), medium: t('medium'), hard: t('hard') };
        document.querySelectorAll('.diff-btn').forEach(function (b) {
            if (diffMap[b.dataset.diff]) b.textContent = diffMap[b.dataset.diff];
        });
    }

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

    function buildDeck(difficulty) {
        const deck = [];
        let id = 0;

        var suits = difficulty === 'easy' ? ['m', 'p'] : ['m', 'p', 's'];
        for (const s of suits) {
            for (let n = 1; n <= 9; n++) {
                for (let copy = 0; copy < 4; copy++) {
                    deck.push({ id: id++, face: {kind: s, n, key: s + n}, matchGroup: s + n });
                }
            }
        }

        if (difficulty === 'hard') {
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
        }

        return deck;
    }

    // ── Layouts ────────────────────────────────────

    function buildLayoutEasy() {
        const rowSpec0 = [
            [0, 2, 9],
            [1, 2, 9],
            [2, 1, 10],
            [3, 1, 10],
            [4, 2, 9],
            [5, 2, 9],
        ];
        const L0 = [];
        for (const [row, cStart, cEnd] of rowSpec0) {
            for (let c = cStart; c <= cEnd; c++) L0.push([c, row]);
        }
        const rowSpec1 = [
            [1, 4, 7],
            [2, 3, 8],
            [3, 3, 8],
            [4, 4, 7],
        ];
        const L1 = [];
        for (const [row, cStart, cEnd] of rowSpec1) {
            for (let c = cStart; c <= cEnd; c++) L1.push([c, row]);
        }
        return [L0, L1];
    }

    function buildLayoutMedium() {
        const rowSpec0 = [
            [0, 2, 9],
            [1, 1, 10],
            [2, 0, 11],
            [3, 0, 11],
            [4, 0, 11],
            [5, 1, 10],
            [6, 2, 9],
        ];
        const L0 = [];
        for (const [row, cStart, cEnd] of rowSpec0) {
            for (let c = cStart; c <= cEnd; c++) L0.push([c, row]);
        }
        const rowSpec1 = [
            [1, 3, 8],
            [2, 2, 9],
            [3, 2, 9],
            [4, 3, 8],
        ];
        const L1 = [];
        for (const [row, cStart, cEnd] of rowSpec1) {
            for (let c = cStart; c <= cEnd; c++) L1.push([c, row]);
        }
        const rowSpec2 = [
            [2, 4, 7],
            [3, 4, 7],
        ];
        const L2 = [];
        for (const [row, cStart, cEnd] of rowSpec2) {
            for (let c = cStart; c <= cEnd; c++) L2.push([c, row]);
        }
        return [L0, L1, L2];
    }

    function buildLayoutHard() {
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
        const L1 = [];
        for (let r = 1; r <= 6; r++) {
            for (let c = 3; c <= 8; c++) L1.push([c, r]);
        }
        const L2 = [];
        for (let r = 2; r <= 5; r++) {
            for (let c = 4; c <= 7; c++) L2.push([c, r]);
        }
        const L3 = [];
        for (let r = 3; r <= 4; r++) {
            for (let c = 5; c <= 6; c++) L3.push([c, r]);
        }
        return [L0, L1, L2, L3];
    }

    function buildLayout(difficulty) {
        if (difficulty === 'easy') return buildLayoutEasy();
        if (difficulty === 'medium') return buildLayoutMedium();
        return buildLayoutHard();
    }

    // ── Pixel positioning ──────────────────────────

    const TILE_W    = 52;
    const TILE_H    = 68;
    const GAP       = 2;
    const COL_STEP  = TILE_W + GAP;
    const ROW_STEP  = TILE_H + GAP;
    const LAYER_DX  = -4;
    const LAYER_DY  = -4;

    function pixelPos(col, row, layer) {
        return {
            x: col * COL_STEP + layer * LAYER_DX,
            y: row * ROW_STEP + layer * LAYER_DY,
        };
    }

    // ── Game state ─────────────────────────────────

    function getSavedDifficulty() {
        try { return localStorage.getItem('mahjong-difficulty') || 'hard'; } catch (_) { return 'hard'; }
    }

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
        difficulty: getSavedDifficulty(),
        maxLayer: 3,
    };

    // ── DOM refs ───────────────────────────────────

    const $ = id => document.getElementById(id);
    const dom = {
        board:         $('board'),
        moves:         $('move-counter'),
        timer:         $('timer'),
        remaining:     $('tiles-remaining'),
        openPairs:     $('open-pairs'),
        btnHint:       $('btn-hint'),
        btnShuffle:    $('btn-shuffle'),
        btnSettings:   $('btn-settings'),
        btnNew:        $('btn-new-game'),
        settingsPanel: $('settings-panel'),
        overlay:       $('overlay'),
        oTitle:        $('overlay-title'),
        oMsg:          $('overlay-message'),
        oStats:        $('overlay-stats'),
        oBtn:          $('overlay-btn'),
        toast:         $('hint-toast'),
        wrapper:       $('board-wrapper'),
        bottomBar:     $('bottom-bar'),
        rotateHint:    $('rotate-hint'),
        dismissRotate: $('dismiss-rotate'),
        // Mobile buttons
        btnHintMob:    $('btn-hint-mobile'),
        btnShuffleMob: $('btn-shuffle-mobile'),
        btnSettingsMob:$('btn-settings-mobile'),
        btnNewMob:     $('btn-new-mobile'),
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

    function isBlockedFromAbove(tile) {
        const map = S.gridMap;
        for (let l = tile.layer + 1; l <= S.maxLayer; l++) {
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
        var groupFreeCount = {};
        for (var i = 0; i < S.tiles.length; i++) {
            var tile = S.tiles[i];
            if (tile.removed) continue;
            var free = isTileFree(tile);
            if (tile.el) tile.el.classList.toggle('blocked', !free);
            if (free) {
                groupFreeCount[tile.matchGroup] = (groupFreeCount[tile.matchGroup] || 0) + 1;
            }
        }
        // Count open pairs (matchGroups with 2+ free tiles)
        var pairs = 0;
        for (var key in groupFreeCount) {
            if (groupFreeCount[key] >= 2) pairs++;
        }
        if (dom.openPairs) dom.openPairs.textContent = pairs;
        // Glow the shuffle button when no open pairs and game is active
        if (dom.btnShuffle) {
            var shouldGlow = pairs === 0 && S.active && S.remaining > 0;
            dom.btnShuffle.classList.toggle('glow', shouldGlow);
            if (dom.btnShuffleMob) dom.btnShuffleMob.classList.toggle('glow', shouldGlow);
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

    var LAYER_SHADOW = [.38, .44, .50, .56];

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
            el.dataset.layer = t.layer;
            el.style.zIndex = t.layer * 1000 + Math.round(t.row * 50) + Math.round((t.col + 2) * 2);
            el.style.setProperty('--tx', t.x + 'px');
            el.style.setProperty('--ty', t.y + 'px');
            el.style.setProperty('--layer-shadow', LAYER_SHADOW[t.layer] || .56);
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
        if (S.bw === 0 || S.bh === 0) return;
        var s = Math.min(cw / S.bw, ch / S.bh);
        document.documentElement.style.setProperty('--board-scale', s);
        dom.board.style.width  = S.bw + 'px';
        dom.board.style.height = S.bh + 'px';
        dom.board.style.left = (padL + (cw - S.bw * s) / 2) + 'px';
        dom.board.style.top  = (padT + (ch - S.bh * s) / 2) + 'px';
    }

    // ── New game ───────────────────────────────────

    function requestNewGame() {
        if (S.active && S.moves > 0) {
            if (!confirm(t('confirmNewGame'))) return;
        }
        newGame();
    }

    function newGame() {
        stopTimer();

        S.tiles    = [];
        S.selected = null;
        S.moves    = 0;
        S.seconds  = 0;
        S.active   = true;
        S.hintPair = null;

        dom.overlay.classList.add('hidden');
        clearHints();

        // Build positions based on difficulty
        const layers = buildLayout(S.difficulty);
        S.maxLayer = layers.length - 1;
        const positions = [];
        for (let li = 0; li < layers.length; li++) {
            for (const [c, r] of layers[li]) {
                positions.push({ col: c, row: r, layer: li });
            }
        }

        S.remaining = positions.length;

        // Shuffle the deck
        const deck = shuffle(buildDeck(S.difficulty));

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
        scaleBoard();
        startTimer();

        // If no match exists from the start, shuffle once
        setTimeout(() => {
            if (S.active && !findMatch()) {
                showToast(t('shuffling'));
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
            setTimeout(clearHints, 4500);
        } else {
            showToast(t('noMoves'));
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
                showToast(t('shuffling'));
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

    // ── Settings panel ─────────────────────────────

    function toggleSettings() {
        dom.settingsPanel.classList.toggle('hidden');
    }

    // Close settings when clicking outside
    document.addEventListener('click', function (e) {
        if (dom.settingsPanel.classList.contains('hidden')) return;
        if (dom.settingsPanel.contains(e.target)) return;
        if (e.target.closest('#btn-settings') || e.target.closest('#btn-settings-mobile')) return;
        dom.settingsPanel.classList.add('hidden');
    });

    // ── Portrait orientation hint ──────────────────

    function checkOrientation() {
        if (!dom.rotateHint) return;
        if (window.innerWidth < 768 && window.innerHeight > window.innerWidth) {
            var dismissed = false;
            try { dismissed = sessionStorage.getItem('mj-rotate-dismissed'); } catch (_) {}
            if (!dismissed) {
                dom.rotateHint.classList.remove('hidden');
            }
        } else {
            dom.rotateHint.classList.add('hidden');
        }
    }

    if (dom.dismissRotate) {
        dom.dismissRotate.addEventListener('click', function () {
            dom.rotateHint.classList.add('hidden');
            try { sessionStorage.setItem('mj-rotate-dismissed', '1'); } catch (_) {}
        });
    }

    // ── Game end ───────────────────────────────────

    function endGame(won) {
        S.active = false;
        stopTimer();

        dom.oTitle.textContent = won ? t('youWin') : t('noMoreMoves');
        dom.oMsg.textContent   = won ? t('congrats') : t('noMatches');

        dom.oStats.innerHTML =
            `<div class="stat"><span class="stat-lbl">${t('movesLabel')}</span><span class="stat-val">${S.moves}</span></div>` +
            `<div class="stat"><span class="stat-lbl">${t('timeLabel')}</span><span class="stat-val">${dom.timer.textContent}</span></div>` +
            `<div class="stat"><span class="stat-lbl">${t('tilesLeft')}</span><span class="stat-val">${S.remaining}</span></div>`;

        dom.overlay.classList.remove('hidden');
    }

    // ── Event wiring ───────────────────────────────

    // Desktop buttons
    dom.btnNew.addEventListener('click', requestNewGame);
    dom.oBtn.addEventListener('click', newGame);
    dom.btnHint.addEventListener('click', showHint);
    dom.btnShuffle.addEventListener('click', shuffleTiles);
    dom.btnSettings.addEventListener('click', toggleSettings);

    // Mobile buttons
    if (dom.btnHintMob)    dom.btnHintMob.addEventListener('click', showHint);
    if (dom.btnShuffleMob) dom.btnShuffleMob.addEventListener('click', shuffleTiles);
    if (dom.btnSettingsMob) dom.btnSettingsMob.addEventListener('click', toggleSettings);
    if (dom.btnNewMob)     dom.btnNewMob.addEventListener('click', requestNewGame);

    // Resize: just scale the board
    window.addEventListener('resize', function () {
        scaleBoard();
        checkOrientation();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) return;
        switch (e.key.toLowerCase()) {
            case 'n': requestNewGame(); break;
            case 'h': showHint();       break;
            case 's': shuffleTiles();   break;
            case 'escape':
                if (!dom.settingsPanel.classList.contains('hidden')) {
                    dom.settingsPanel.classList.add('hidden');
                    break;
                }
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

    // ── Difficulty Picker ──────────────────────────
    (function initDifficultyPicker() {
        var btns = document.querySelectorAll('.diff-btn');
        function markActive() {
            btns.forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.diff === S.difficulty);
            });
        }
        btns.forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.dataset.diff === S.difficulty) return;
                var newDiff = b.dataset.diff;
                if (S.active && S.moves > 0) {
                    if (!confirm(t('confirmNewGame'))) return;
                }
                S.difficulty = newDiff;
                try { localStorage.setItem('mahjong-difficulty', S.difficulty); } catch (_) {}
                markActive();
                newGame();
            });
        });
        markActive();
    })();

    // ── Parent page language sync ──────────────────
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'lang') {
            setLang(e.data.lang);
        }
    });

    // ── Start ──────────────────────────────────────
    applyLang();
    newGame();
    checkOrientation();
})();
