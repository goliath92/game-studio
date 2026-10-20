/* ==============================================
   Mahjong Solitaire - Full Game Logic
   ============================================== */

(function () {
    'use strict';

    // ── Language Support ──────────────────────────
    const LANG = {
        en: {
            moves: 'Moves', timer: 'Time', tiles: 'Tiles', openPairs: 'Open Pairs',
            hint: 'Hint', shuffle: 'Shuffle', newGame: 'New Game', undo: 'Undo',
            theme: 'Theme', table: 'Table', settings: 'Settings',
            difficulty: 'Difficulty', easy: 'Easy', medium: 'Medium', hard: 'Hard',
            youWin: 'You Win!', noMoreMoves: 'No More Moves',
            congrats: 'Congratulations! You cleared all the tiles!',
            noMatches: 'No valid matches remain. Try a new game!',
            shuffling: 'No valid moves - shuffling...',
            noMoves: 'No valid moves available!',
            movesLabel: 'Moves', timeLabel: 'Time', tilesLeft: 'Tiles Left',
            confirmNewGame: 'End the current game and start a new one?',
            cancel: 'Cancel', yes: 'Yes'
        },
        tr: {
            moves: 'Hamle', timer: 'Süre', tiles: 'Taş', openPairs: 'Açık Çift',
            hint: 'İpucu', shuffle: 'Karıştır', newGame: 'Yeni Oyun', undo: 'Geri Al',
            theme: 'Tema', table: 'Masa', settings: 'Ayarlar',
            difficulty: 'Zorluk', easy: 'Kolay', medium: 'Orta', hard: 'Zor',
            youWin: 'Kazandınız!', noMoreMoves: 'Hamle Kalmadı',
            congrats: 'Tebrikler! Tüm taşları temizlediniz!',
            noMatches: 'Geçerli eşleşme kalmadı. Yeni oyun deneyin!',
            shuffling: 'Hamle yok - karıştırılıyor...',
            noMoves: 'Geçerli hamle yok!',
            movesLabel: 'Hamle', timeLabel: 'Süre', tilesLeft: 'Kalan Taş',
            confirmNewGame: 'Devam eden oyunu bitirmek istediğinize emin misiniz?',
            cancel: 'Vazgeç', yes: 'Evet'
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
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.dataset.i18n;
            const val = t(key);
            if (val) el.textContent = val;
        });
        const diffMap = { easy: t('easy'), medium: t('medium'), hard: t('hard') };
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

    // ── Screen-Based Layouts ──────────────────────
    // Each layout = array of [startCol, startRow, cols, rows] per layer
    const SCREEN_LAYOUTS = {
        'phone-portrait':   [[0,0,6,8],[1,1,4,6],[2,3,2,2]],
        'tablet-portrait':  [[0,0,10,9],[2,2,6,5],[3,3,4,3],[4,4,2,1]],
        'tablet-landscape': [[0,0,12,8],[2,1,8,6]],
        'desktop':          [[0,0,14,8],[4,2,6,4],[5,3,4,2]],
    };

    function getScreenCategory() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w < h) {
            return Math.min(w, h) < 600 ? 'phone-portrait' : 'tablet-portrait';
        }
        return w >= 1280 ? 'desktop' : 'tablet-landscape';
    }

    function buildLayoutFromRects(rects) {
        return rects.map(([sc, sr, cols, rows]) => {
            const positions = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    positions.push([sc + c, sr + r]);
                }
            }
            return positions;
        });
    }

    // ── Flexible Deck Builder ─────────────────────
    function buildDeck(count, difficulty) {
        const allPairs = [];

        for (const s of ['m', 'p']) {
            for (let n = 1; n <= 9; n++) {
                allPairs.push({ face: {kind:s, n, key:s+n}, group: s+n, tier: 1 });
                allPairs.push({ face: {kind:s, n, key:s+n}, group: s+n, tier: 1 });
            }
        }
        for (let n = 1; n <= 9; n++) {
            allPairs.push({ face: {kind:'s', n, key:'s'+n}, group: 's'+n, tier: 2 });
            allPairs.push({ face: {kind:'s', n, key:'s'+n}, group: 's'+n, tier: 2 });
        }
        const winds = [{c:'東',lat:'E'},{c:'南',lat:'S'},{c:'西',lat:'W'},{c:'北',lat:'N'}];
        for (const w of winds) {
            const face = {kind:'w', c:w.c, lat:w.lat, key:'w'+w.lat};
            allPairs.push({ face, group: face.key, tier: 3 });
            allPairs.push({ face, group: face.key, tier: 3 });
        }
        const dragons = [{c:'中',cls:'red',k:'dR'},{c:'發',cls:'grn',k:'dG'},{c:'白',cls:'wht',k:'dW'}];
        for (const d of dragons) {
            const face = {kind:'d', c:d.c, cls:d.cls, key:d.k};
            allPairs.push({ face, group: d.k, tier: 3 });
            allPairs.push({ face, group: d.k, tier: 3 });
        }
        allPairs.push({ faces:[{kind:'q',c:'春',n:1,key:'q1'},{kind:'q',c:'夏',n:2,key:'q2'}], group:'season', tier:3 });
        allPairs.push({ faces:[{kind:'q',c:'秋',n:3,key:'q3'},{kind:'q',c:'冬',n:4,key:'q4'}], group:'season', tier:3 });
        allPairs.push({ faces:[{kind:'f',c:'梅',n:1,key:'f1'},{kind:'f',c:'蘭',n:2,key:'f2'}], group:'flower', tier:3 });
        allPairs.push({ faces:[{kind:'f',c:'菊',n:3,key:'f3'},{kind:'f',c:'竹',n:4,key:'f4'}], group:'flower', tier:3 });

        let maxTier = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
        const pairsNeeded = count / 2;
        let pool = allPairs.filter(p => p.tier <= maxTier);
        while (pool.length < pairsNeeded && maxTier < 3) {
            maxTier++;
            pool = allPairs.filter(p => p.tier <= maxTier);
        }

        shuffle(pool);
        const deck = [];
        let id = 0;
        for (let i = 0; i < pairsNeeded; i++) {
            const p = pool[i % pool.length];
            if (p.faces) {
                deck.push({ id: id++, face: {...p.faces[0]}, matchGroup: p.group });
                deck.push({ id: id++, face: {...p.faces[1]}, matchGroup: p.group });
            } else {
                deck.push({ id: id++, face: {...p.face}, matchGroup: p.group });
                deck.push({ id: id++, face: {...p.face}, matchGroup: p.group });
            }
        }
        return shuffle(deck);
    }

    // ── Dynamic Tile Sizing ───────────────────────
    let tileW = 52, tileH = 68, tileD = 6;

    function getCarpetSize() {
        const cs = getComputedStyle(dom.wrapper);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const padB = parseFloat(cs.paddingBottom) || 0;
        return {
            w: dom.wrapper.clientWidth - padL - padR,
            h: dom.wrapper.clientHeight - padT - padB,
        };
    }

    function calcTileSize(rects) {
        const carpet = getCarpetSize();
        let maxCols = 0, maxRows = 0;
        for (const [sc, sr, cols, rows] of rects) {
            maxCols = Math.max(maxCols, sc + cols);
            maxRows = Math.max(maxRows, sr + rows);
        }
        const w = Math.min(
            carpet.w / (maxCols + 0.3),
            carpet.h / (maxRows * 1.3 + 0.3)
        );
        return {
            w: Math.floor(w),
            h: Math.floor(w * 1.3),
            d: Math.max(2, Math.round(w * 0.08)),
        };
    }

    function chooseLayoutAndSize() {
        let cat = getScreenCategory();
        let rects = SCREEN_LAYOUTS[cat];
        let size = calcTileSize(rects);

        const isTouch = matchMedia('(pointer: coarse)').matches;
        if (isTouch && size.w < 44 && cat !== 'phone-portrait') {
            const fallbacks = ['tablet-portrait', 'phone-portrait'];
            for (const fb of fallbacks) {
                rects = SCREEN_LAYOUTS[fb];
                size = calcTileSize(rects);
                if (size.w >= 44) { cat = fb; break; }
            }
        }
        return { category: cat, rects, size };
    }

    // ── Pixel Positioning ─────────────────────────
    function pixelPos(col, row, layer) {
        const colStep = tileW + 2;
        const rowStep = tileH + 2;
        return {
            x: col * colStep + layer * (-tileD),
            y: row * rowStep + layer * (-tileD),
        };
    }

    // ── Game State ────────────────────────────────
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
        currentCategory: null,
    };
    let undoStack = [];

    // ── DOM Refs ──────────────────────────────────
    const $ = id => document.getElementById(id);
    const dom = {
        board:       $('board'),
        wrapper:     $('board-wrapper'),
        // Portrait stats
        timerP:      $('timer'),
        movesP:      $('move-counter'),
        remainingP:  $('tiles-remaining'),
        openPairsP:  $('open-pairs'),
        // Landscape stats
        timerS:      $('timer-s'),
        movesS:      $('moves-s'),
        remainingS:  $('tiles-s'),
        openPairsS:  $('pairs-s'),
        // Portrait buttons
        btnUndo:     $('btn-undo'),
        btnHint:     $('btn-hint'),
        btnShuffle:  $('btn-shuffle'),
        btnNew:      $('btn-new'),
        btnSettings: $('btn-settings'),
        // Landscape buttons
        btnUndoS:    $('btn-undo-s'),
        btnHintS:    $('btn-hint-s'),
        btnShuffleS: $('btn-shuffle-s'),
        btnNewS:     $('btn-new-s'),
        btnSettingsS:$('btn-settings-s'),
        // Shared
        settingsPanel: $('settings-panel'),
        overlay:     $('overlay'),
        oTitle:      $('overlay-title'),
        oMsg:        $('overlay-message'),
        oStats:      $('overlay-stats'),
        oBtn:        $('overlay-btn'),
        toast:       $('hint-toast'),
        // Confirm dialog
        confirmOverlay: $('confirm-overlay'),
        confirmMsg:  $('confirm-msg'),
        confirmYes:  $('confirm-yes'),
        confirmNo:   $('confirm-no'),
    };

    // ── Utility ───────────────────────────────────
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ── Spatial Lookup Map ────────────────────────
    function rebuildGridMap() {
        const map = S.gridMap;
        map.clear();
        for (const t of S.tiles) {
            if (t.removed) continue;
            map.set(`${t.col},${t.row},${t.layer}`, t);
        }
    }

    // ── Free-Tile Detection ──────────────────────
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
        const groupFreeCount = {};
        for (const tile of S.tiles) {
            if (tile.removed) continue;
            const free = isTileFree(tile);
            if (tile.el) {
                tile.el.classList.toggle('blocked', !free);
                tile.el.setAttribute('aria-disabled', free ? 'false' : 'true');
            }
            if (free) {
                groupFreeCount[tile.matchGroup] = (groupFreeCount[tile.matchGroup] || 0) + 1;
            }
        }
        let pairs = 0;
        for (const key in groupFreeCount) {
            if (groupFreeCount[key] >= 2) pairs++;
        }
        if (dom.openPairsP) dom.openPairsP.textContent = pairs;
        if (dom.openPairsS) dom.openPairsS.textContent = pairs;

        const shouldGlow = pairs === 0 && S.active && S.remaining > 0;
        dom.btnShuffle.classList.toggle('glow', shouldGlow);
        dom.btnShuffleS.classList.toggle('glow', shouldGlow);
    }

    // ── Matching Logic ────────────────────────────
    function tilesMatch(a, b) {
        return a !== b && a.matchGroup === b.matchGroup;
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

    // ── Tile Element Creation ─────────────────────
    const LAYER_SHADOW = [.38, .44, .50, .56];

    function createTileEl(tile, dealing) {
        const el = document.createElement('div');
        el.className = 'tile' + (dealing ? ' dealing' : '');
        el.setAttribute('role', 'button');
        el.dataset.layer = tile.layer;
        el.style.zIndex = tile.layer * 1000 + Math.round(tile.row * 50) + Math.round((tile.col + 2) * 2);
        el.style.setProperty('--tx', tile.x + 'px');
        el.style.setProperty('--ty', tile.y + 'px');
        el.style.setProperty('--layer-shadow', LAYER_SHADOW[tile.layer] || .56);
        el.style.transform = `translate(${tile.x}px, ${tile.y}px)`;
        el.innerHTML = `<div class="face">${faceHTML(tile.face)}</div>`;
        el.addEventListener('click', () => onTileClick(tile));
        tile.el = el;
        return el;
    }

    // ── Render ────────────────────────────────────
    function renderBoard() {
        dom.board.innerHTML = '';
        dom.board.style.width  = S.bw + 'px';
        dom.board.style.height = S.bh + 'px';

        const sorted = [...S.tiles].sort((a, b) =>
            (a.layer - b.layer) || (a.row - b.row) || (a.col - b.col)
        );

        const frag = document.createDocumentFragment();
        for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            if (t.removed) continue;
            const el = createTileEl(t, true);
            el.style.animationDelay = `${i * 2}ms`;
            frag.appendChild(el);
        }
        dom.board.appendChild(frag);

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
        const cs = getComputedStyle(dom.wrapper);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const padB = parseFloat(cs.paddingBottom) || 0;
        const cw = dom.wrapper.clientWidth - padL - padR;
        const ch = dom.wrapper.clientHeight - padT - padB;
        if (S.bw === 0 || S.bh === 0) return;
        const s = Math.min(cw / S.bw, ch / S.bh);
        document.documentElement.style.setProperty('--board-scale', s);
        dom.board.style.width  = S.bw + 'px';
        dom.board.style.height = S.bh + 'px';
        dom.board.style.left = (padL + (cw - S.bw * s) / 2) + 'px';
        dom.board.style.top  = (padT + (ch - S.bh * s) / 2) + 'px';
    }

    // ── Custom Confirm Dialog ─────────────────────
    let confirmResolve = null;

    function showConfirm(msg) {
        return new Promise(resolve => {
            confirmResolve = resolve;
            dom.confirmMsg.textContent = msg;
            dom.confirmOverlay.classList.remove('hidden');
        });
    }

    dom.confirmYes.addEventListener('click', () => {
        dom.confirmOverlay.classList.add('hidden');
        if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
    });
    dom.confirmNo.addEventListener('click', () => {
        dom.confirmOverlay.classList.add('hidden');
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
    });

    // ── Undo System ──────────────────────────────
    function updateUndoState() {
        const disabled = undoStack.length === 0;
        dom.btnUndo.disabled = disabled;
        dom.btnUndoS.disabled = disabled;
    }

    function undo() {
        if (!undoStack.length || !S.active) return;
        const entry = undoStack.pop();

        for (const saved of [entry.a, entry.b]) {
            const tile = S.tiles.find(t => t.id === saved.id);
            if (!tile) continue;
            tile.removed = false;

            if (tile.el) {
                tile.el.classList.remove('removing');
                tile.el.style.transform = `translate(${tile.x}px, ${tile.y}px)`;
                tile.el.style.opacity = '';
                tile.el.style.pointerEvents = '';
            } else {
                createTileEl(tile, false);
                dom.board.appendChild(tile.el);
            }
        }

        S.remaining += 2;
        S.moves = Math.max(0, S.moves - 1);
        updateAllStats();
        updateFreeStatus();
        updateUndoState();

        dom.overlay.classList.add('hidden');
        if (!S.active) {
            S.active = true;
            resumeTimer();
        }
    }

    // ── New Game ──────────────────────────────────
    async function requestNewGame() {
        if (S.active && S.moves > 0) {
            const ok = await showConfirm(t('confirmNewGame'));
            if (!ok) return;
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
        undoStack  = [];

        dom.overlay.classList.add('hidden');
        clearHints();

        const chosen = chooseLayoutAndSize();
        S.currentCategory = chosen.category;
        const rects = chosen.rects;

        tileW = chosen.size.w;
        tileH = chosen.size.h;
        tileD = chosen.size.d;

        document.documentElement.style.setProperty('--w', tileW + 'px');
        document.documentElement.style.setProperty('--h', tileH + 'px');
        document.documentElement.style.setProperty('--d', tileD + 'px');

        const layers = buildLayoutFromRects(rects);
        S.maxLayer = layers.length - 1;
        const positions = [];
        for (let li = 0; li < layers.length; li++) {
            for (const [c, r] of layers[li]) {
                positions.push({ col: c, row: r, layer: li });
            }
        }

        S.remaining = positions.length;
        const deck = buildDeck(positions.length, S.difficulty);

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < positions.length; i++) {
            const p  = positions[i];
            const d  = deck[i];
            const px = pixelPos(p.col, p.row, p.layer);

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
            if (px.x + tileW > maxX) maxX = px.x + tileW;
            if (px.y < minY) minY = px.y;
            if (px.y + tileH > maxY) maxY = px.y + tileH;
        }

        const padX = 15, padY = 10;
        for (const t of S.tiles) {
            t.x -= minX - padX;
            t.y -= minY - padY;
        }
        S.bw = (maxX - minX) + padX * 2 + tileD * S.maxLayer + 8;
        S.bh = (maxY - minY) + padY * 2 + tileD * S.maxLayer + 8;

        renderBoard();
        updateAllStats();
        updateUndoState();
        scaleBoard();
        startTimer();

        setTimeout(() => {
            if (S.active && !findMatch()) {
                showToast(t('shuffling'));
                setTimeout(shuffleTiles, 600);
            }
        }, 400);
    }

    // ── Blocked Tile Feedback ─────────────────────
    const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>';

    function showBlockedFeedback(tile) {
        const el = tile.el;
        el.classList.remove('is-blocked-feedback');
        void el.offsetWidth;
        el.classList.add('is-blocked-feedback');
        setTimeout(() => el.classList.remove('is-blocked-feedback'), 250);

        const badge = document.createElement('span');
        badge.className = 'lock-badge';
        badge.innerHTML = LOCK_SVG;
        el.appendChild(badge);
        setTimeout(() => badge.remove(), 600);

        navigator.vibrate?.(15);
    }

    // ── Click Handler ─────────────────────────────
    function onTileClick(tile) {
        if (!S.active || tile.removed) return;
        rebuildGridMap();
        if (!isTileFree(tile)) {
            showBlockedFeedback(tile);
            return;
        }

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
        undoStack.push({
            a: { id: a.id },
            b: { id: b.id },
        });

        a.el.classList.remove('selected');
        b.el.classList.remove('selected');
        a.el.classList.add('removing');
        b.el.classList.add('removing');
        a.removed = true;
        b.removed = true;

        S.moves++;
        S.remaining -= 2;
        updateAllStats();
        updateUndoState();

        setTimeout(() => {
            if (a.el) { a.el.remove(); a.el = null; }
            if (b.el) { b.el.remove(); b.el = null; }
            updateFreeStatus();

            if (S.remaining === 0) { endGame(true); return; }
            if (!findMatch()) endGame(false);
        }, 480);
    }

    // ── Hint ──────────────────────────────────────
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

    // ── Shuffle ───────────────────────────────────
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

        // Clear undo stack since faces changed
        undoStack = [];
        updateUndoState();

        setTimeout(() => {
            for (const t of live) { if (t.el) t.el.classList.remove('shuffling'); }
            updateFreeStatus();
            if (!findMatch()) {
                showToast(t('shuffling'));
                setTimeout(shuffleTiles, 500);
            }
        }, 450);
    }

    // ── Timer ─────────────────────────────────────
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

    function resumeTimer() {
        if (S.interval || !S.active) return;
        S.interval = setInterval(() => {
            if (S.active) { S.seconds++; updateTimerDisplay(); }
        }, 1000);
    }

    function updateTimerDisplay() {
        const m = Math.floor(S.seconds / 60);
        const s = S.seconds % 60;
        const str = m + ':' + String(s).padStart(2, '0');
        if (dom.timerP) dom.timerP.textContent = str;
        if (dom.timerS) dom.timerS.textContent = str;
    }

    // ── UI Helpers ────────────────────────────────
    function updateAllStats() {
        const mv = String(S.moves);
        const rm = String(S.remaining);
        if (dom.movesP) dom.movesP.textContent = mv;
        if (dom.movesS) dom.movesS.textContent = mv;
        if (dom.remainingP) dom.remainingP.textContent = rm;
        if (dom.remainingS) dom.remainingS.textContent = rm;
    }

    let toastTimer = null;
    function showToast(msg) {
        dom.toast.textContent = msg;
        dom.toast.classList.remove('hidden');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 2500);
    }

    // ── Settings Panel ────────────────────────────
    function toggleSettings() {
        dom.settingsPanel.classList.toggle('hidden');
    }

    document.addEventListener('click', function (e) {
        if (dom.settingsPanel.classList.contains('hidden')) return;
        if (dom.settingsPanel.contains(e.target)) return;
        if (e.target.closest('#btn-settings') || e.target.closest('#btn-settings-s')) return;
        dom.settingsPanel.classList.add('hidden');
    });

    // ── Game End ──────────────────────────────────
    function endGame(won) {
        S.active = false;
        stopTimer();

        dom.oTitle.textContent = won ? t('youWin') : t('noMoreMoves');
        dom.oMsg.textContent   = won ? t('congrats') : t('noMatches');

        const timeStr = dom.timerP ? dom.timerP.textContent : '0:00';
        dom.oStats.innerHTML =
            `<div class="stat"><span class="stat-lbl">${t('movesLabel')}</span><span class="stat-val">${S.moves}</span></div>` +
            `<div class="stat"><span class="stat-lbl">${t('timeLabel')}</span><span class="stat-val">${timeStr}</span></div>` +
            `<div class="stat"><span class="stat-lbl">${t('tilesLeft')}</span><span class="stat-val">${S.remaining}</span></div>`;

        dom.overlay.classList.remove('hidden');
    }

    // ── Event Wiring ──────────────────────────────
    // Portrait buttons
    dom.btnUndo.addEventListener('click', undo);
    dom.btnHint.addEventListener('click', showHint);
    dom.btnShuffle.addEventListener('click', shuffleTiles);
    dom.btnNew.addEventListener('click', requestNewGame);
    dom.btnSettings.addEventListener('click', toggleSettings);

    // Landscape buttons
    dom.btnUndoS.addEventListener('click', undo);
    dom.btnHintS.addEventListener('click', showHint);
    dom.btnShuffleS.addEventListener('click', shuffleTiles);
    dom.btnNewS.addEventListener('click', requestNewGame);
    dom.btnSettingsS.addEventListener('click', toggleSettings);

    // Overlay new game
    dom.oBtn.addEventListener('click', newGame);

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) return;
        if (!dom.confirmOverlay.classList.contains('hidden')) return;
        switch (e.key.toLowerCase()) {
            case 'n': requestNewGame(); break;
            case 'h': showHint();       break;
            case 's': shuffleTiles();   break;
            case 'z': undo();           break;
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

    // ResizeObserver for responsive scaling
    new ResizeObserver(() => scaleBoard()).observe(dom.wrapper);

    // Phone landscape detection — pause timer
    const phoneLandscapeMQ = matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
    function onPhoneLandscape(mq) {
        if (mq.matches) {
            stopTimer();
        } else {
            resumeTimer();
        }
    }
    phoneLandscapeMQ.addEventListener('change', onPhoneLandscape);

    // ── Tile Theme Picker ─────────────────────────
    (function initThemePicker() {
        let saved = null;
        try { saved = localStorage.getItem('mahjong-tile-theme'); } catch (_) {}
        if (saved !== null) {
            if (saved) document.body.setAttribute('data-tiles', saved);
            else document.body.removeAttribute('data-tiles');
        }
        const swatches = document.querySelectorAll('.mj-swatch');
        function markActive() {
            const current = document.body.getAttribute('data-tiles') || '';
            swatches.forEach(s => s.classList.toggle('is-active', s.dataset.theme === current));
        }
        swatches.forEach(s => {
            s.addEventListener('click', () => {
                const theme = s.dataset.theme;
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
        let saved = null;
        try { saved = localStorage.getItem('mahjong-table-theme'); } catch (_) {}
        if (saved) document.body.dataset.tableTheme = saved;

        const btns = document.querySelectorAll('.table-theme-btn');
        function markActive() {
            const current = document.body.dataset.tableTheme || 'cay-evi';
            btns.forEach(b => b.classList.toggle('is-active', b.dataset.table === current));
        }
        btns.forEach(b => {
            b.addEventListener('click', () => {
                document.body.dataset.tableTheme = b.dataset.table;
                try { localStorage.setItem('mahjong-table-theme', b.dataset.table); } catch (_) {}
                markActive();
            });
        });
        markActive();
    })();

    // ── Difficulty Picker ─────────────────────────
    (function initDifficultyPicker() {
        const btns = document.querySelectorAll('.diff-btn');
        function markActive() {
            btns.forEach(b => b.classList.toggle('is-active', b.dataset.diff === S.difficulty));
        }
        btns.forEach(b => {
            b.addEventListener('click', async () => {
                if (b.dataset.diff === S.difficulty) return;
                const newDiff = b.dataset.diff;
                if (S.active && S.moves > 0) {
                    const ok = await showConfirm(t('confirmNewGame'));
                    if (!ok) return;
                }
                S.difficulty = newDiff;
                try { localStorage.setItem('mahjong-difficulty', S.difficulty); } catch (_) {}
                markActive();
                newGame();
            });
        });
        markActive();
    })();

    // ── Parent Page Language Sync ──────────────────
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'lang') {
            setLang(e.data.lang);
        }
    });

    // ── Start ─────────────────────────────────────
    applyLang();
    newGame();
})();
