(function () {
    'use strict';

    // ---- Constants ----
    var SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
    var SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
    var SUIT_COLORS = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };
    var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    var RANK_VALUES = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };

    // ---- Game State ----
    var stock = [];
    var waste = [];
    var foundations = [[], [], [], []];
    var tableau = [[], [], [], [], [], [], []];
    var moveCount = 0;
    var timerSeconds = 0;
    var timerInterval = null;
    var timerStarted = false;
    var undoStack = [];
    var dragState = null;
    var gameWon = false;
    var autoCompleteRunning = false;
    var settingsOpen = false;
    var timerPausedBySettings = false;
    var timerPausedByRotate = false;
    var currentLayout = { cw: 80, ch: 112, gap: 8, boardW: 608 };

    // ---- i18n ----
    var i18n = {
        en: {
            moves: 'Moves',
            movesLabel: 'MOVES',
            timeLabel: 'TIME',
            undo: 'Undo',
            hint: 'Hint',
            newGame: 'New Game',
            settings: 'Settings',
            autoFinish: 'Auto Finish',
            langLabel: 'LANGUAGE',
            cardBackLabel: 'CARD BACK',
            cancel: 'Cancel',
            yes: 'Yes',
            youWin: 'You Win!',
            playAgain: 'Play Again',
            completed: 'Completed in <strong>{moves}</strong> moves<br>Time: <strong>{time}</strong>',
            confirmNewGame: 'Start a new game? Current progress will be lost.',
            noHints: 'No hints available',
            paused: 'paused',
            rotateTitle: 'Turn your device upright for a better experience',
            rotateDesc: 'Game paused ({time}). It will resume when you turn back to portrait.'
        },
        tr: {
            moves: 'Hamle',
            movesLabel: 'HAMLE',
            timeLabel: 'SÜRE',
            undo: 'Geri Al',
            hint: 'İpucu',
            newGame: 'Yeni Oyun',
            settings: 'Ayarlar',
            autoFinish: 'Otomatik Bitir',
            langLabel: 'DİL',
            cardBackLabel: 'KART ARKASI',
            cancel: 'Vazgeç',
            yes: 'Evet',
            youWin: 'Kazandınız!',
            playAgain: 'Tekrar Oyna',
            completed: '<strong>{moves}</strong> hamlede tamamlandı<br>Süre: <strong>{time}</strong>',
            confirmNewGame: 'Yeni oyun başlasın mı? Mevcut ilerleme kaybolacak.',
            noHints: 'İpucu bulunamadı',
            paused: 'duraklatıldı',
            rotateTitle: 'Daha iyi oynamak için cihazını dikey çevir',
            rotateDesc: 'Oyun duraklatıldı ({time}). Dikeye döndüğünde kaldığın yerden devam edersin.'
        }
    };

    function currentLang() {
        try { return localStorage.getItem('lang') || 'tr'; } catch (e) { return 'tr'; }
    }

    function t(key) {
        var lang = currentLang();
        return (i18n[lang] || i18n.tr)[key] || key;
    }

    function formatTime(s) {
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    // ---- DOM References ----
    var stockEl = document.getElementById('stock');
    var wasteEl = document.getElementById('waste');
    var foundationEls = document.querySelectorAll('.foundation-slot');
    var tableauEls = document.querySelectorAll('.tableau-column');

    // ================================================
    //  Deck Creation & Shuffle (Fisher-Yates)
    // ================================================

    function createDeck() {
        var deck = [];
        for (var s = 0; s < SUITS.length; s++) {
            for (var r = 0; r < RANKS.length; r++) {
                deck.push({
                    suit: SUITS[s],
                    rank: RANKS[r],
                    color: SUIT_COLORS[SUITS[s]],
                    value: RANK_VALUES[RANKS[r]],
                    faceUp: false,
                    id: RANKS[r] + '-' + SUITS[s]
                });
            }
        }
        return deck;
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    // ================================================
    //  Solvability Checker (Greedy Monte-Carlo)
    // ================================================

    var _SUIT_TO_IDX = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

    function _cSuit(id)  { return (id / 13) | 0; }
    function _cVal(id)   { return (id % 13) + 1; }
    function _cColor(id) { var s = (id / 13) | 0; return (s === 1 || s === 2) ? 1 : 0; }

    function _encodeDeck(deck) {
        return deck.map(function (c) { return _SUIT_TO_IDX[c.suit] * 13 + (c.value - 1); });
    }

    function _initSolverState(ids) {
        var tab = [], idx = 0;
        for (var c = 0; c < 7; c++) {
            var d = [], u = [];
            for (var r = 0; r < c; r++) d.push(ids[idx++]);
            u.push(ids[idx++]);
            tab.push({ d: d, u: u });
        }
        var stk = [];
        for (var i = idx; i < 52; i++) stk.push(ids[i]);
        return { stk: stk, w: [], f: [0, 0, 0, 0], tab: tab };
    }

    function _fndTotal(s) { return s.f[0] + s.f[1] + s.f[2] + s.f[3]; }

    function _canFnd(s, id) { return s.f[_cSuit(id)] === _cVal(id) - 1; }

    function _safeFnd(s, id) {
        var v = _cVal(id);
        if (v <= 2) return true;
        var myColor = _cColor(id);
        for (var su = 0; su < 4; su++) {
            if (_cColor(su * 13) !== myColor && s.f[su] < v - 1) return false;
        }
        return true;
    }

    function _canTab(s, id, col) {
        var t = s.tab[col];
        if (t.u.length === 0 && t.d.length === 0) return _cVal(id) === 13;
        if (t.u.length === 0) return false;
        var top = t.u[t.u.length - 1];
        return _cColor(id) !== _cColor(top) && _cVal(id) === _cVal(top) - 1;
    }

    function _flipTop(s, col) {
        var t = s.tab[col];
        if (t.u.length === 0 && t.d.length > 0) t.u.push(t.d.pop());
    }

    function _greedySolve(ids, rng) {
        var s = _initSolverState(ids);
        var moves = 0, limit = 1000;
        var stockPasses = 0, maxPasses = 3;
        var drawsSinceMeaningful = 0;
        var maxDraws = 24 * (maxPasses + 1) + 10;

        while (moves < limit) {
            if (_fndTotal(s) === 52) return true;

            var acted = false;

            var sfm = true;
            while (sfm) {
                sfm = false;
                for (var i = 0; i < 7; i++) {
                    var u = s.tab[i].u;
                    if (u.length > 0 && _canFnd(s, u[u.length - 1]) && _safeFnd(s, u[u.length - 1])) {
                        s.f[_cSuit(u[u.length - 1])]++;
                        u.pop();
                        _flipTop(s, i);
                        sfm = true; acted = true; moves++;
                    }
                }
                if (s.w.length > 0 && _canFnd(s, s.w[s.w.length - 1]) && _safeFnd(s, s.w[s.w.length - 1])) {
                    s.f[_cSuit(s.w[s.w.length - 1])]++;
                    s.w.pop();
                    sfm = true; acted = true; moves++;
                }
            }
            if (_fndTotal(s) === 52) return true;
            if (acted) { drawsSinceMeaningful = 0; continue; }

            var revOpts = [];
            for (var fr = 0; fr < 7; fr++) {
                if (s.tab[fr].d.length === 0 || s.tab[fr].u.length === 0) continue;
                var bot = s.tab[fr].u[0];
                for (var to = 0; to < 7; to++) {
                    if (to !== fr && _canTab(s, bot, to))
                        revOpts.push({ fr: fr, to: to, n: s.tab[fr].d.length });
                }
            }
            if (revOpts.length > 0) {
                revOpts.sort(function (a, b) { return b.n - a.n; });
                var bestN = revOpts[0].n;
                var top = [];
                for (var r = 0; r < revOpts.length; r++) {
                    if (revOpts[r].n === bestN) top.push(revOpts[r]);
                }
                var ch = top[rng(top.length)];
                var cards = s.tab[ch.fr].u.splice(0);
                for (var k = 0; k < cards.length; k++) s.tab[ch.to].u.push(cards[k]);
                _flipTop(s, ch.fr);
                moves++; drawsSinceMeaningful = 0; continue;
            }

            if (s.w.length > 0) {
                var wid = s.w[s.w.length - 1];
                var wt = [];
                for (var to = 0; to < 7; to++) {
                    if (_canTab(s, wid, to)) wt.push(to);
                }
                if (wt.length > 0) {
                    s.tab[wt[rng(wt.length)]].u.push(s.w.pop());
                    moves++; drawsSinceMeaningful = 0; continue;
                }
            }

            var empties = [];
            for (var i = 0; i < 7; i++) {
                if (s.tab[i].u.length === 0 && s.tab[i].d.length === 0) empties.push(i);
            }
            if (empties.length > 0) {
                var km = [];
                for (var fr = 0; fr < 7; fr++) {
                    if (s.tab[fr].u.length > 0 && _cVal(s.tab[fr].u[0]) === 13 && s.tab[fr].d.length > 0)
                        km.push(fr);
                }
                if (km.length > 0) {
                    var chosen = km[rng(km.length)];
                    var target = empties[rng(empties.length)];
                    var cards = s.tab[chosen].u.splice(0);
                    for (var k = 0; k < cards.length; k++) s.tab[target].u.push(cards[k]);
                    _flipTop(s, chosen);
                    moves++; drawsSinceMeaningful = 0; continue;
                }
                if (s.w.length > 0 && _cVal(s.w[s.w.length - 1]) === 13) {
                    s.tab[empties[rng(empties.length)]].u.push(s.w.pop());
                    moves++; drawsSinceMeaningful = 0; continue;
                }
            }

            var nsfDone = false;
            for (var i = 0; i < 7 && !nsfDone; i++) {
                var u = s.tab[i].u;
                if (u.length > 0 && _canFnd(s, u[u.length - 1])) {
                    s.f[_cSuit(u[u.length - 1])]++;
                    u.pop();
                    _flipTop(s, i);
                    nsfDone = true; moves++; drawsSinceMeaningful = 0;
                }
            }
            if (!nsfDone && s.w.length > 0 && _canFnd(s, s.w[s.w.length - 1])) {
                s.f[_cSuit(s.w[s.w.length - 1])]++;
                s.w.pop();
                nsfDone = true; moves++; drawsSinceMeaningful = 0;
            }
            if (nsfDone) continue;

            if (s.stk.length > 0) {
                s.w.push(s.stk.pop());
                moves++; drawsSinceMeaningful++;
                if (drawsSinceMeaningful > maxDraws) return false;
                continue;
            }

            if (s.w.length > 0 && stockPasses < maxPasses) {
                s.stk = s.w.slice().reverse();
                s.w = [];
                stockPasses++;
                continue;
            }

            return false;
        }

        return _fndTotal(s) === 52;
    }

    function findSolvableDeal() {
        var MAX_SHUFFLES = 500;
        var PROBES = 8;
        var lastDeck = null;

        for (var a = 0; a < MAX_SHUFFLES; a++) {
            var deck = shuffle(createDeck());
            lastDeck = deck;
            var ids = _encodeDeck(deck);

            for (var p = 0; p < PROBES; p++) {
                var rng = (function (seed) {
                    return function (max) {
                        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                        return seed % max;
                    };
                })(a * 31 + p * 7 + 1);

                if (_greedySolve(ids, rng)) return deck;
            }
        }

        return lastDeck;
    }

    // ================================================
    //  Layout Calculation
    // ================================================

    function calcCardSize() {
        var wrapper = document.getElementById('board-wrapper');
        if (!wrapper) return currentLayout;
        var areaW = wrapper.clientWidth;
        var areaH = wrapper.clientHeight;
        if (areaW < 10 || areaH < 10) return currentLayout;

        var isTouch = matchMedia('(pointer: coarse) and (hover: none)').matches;
        var margin = areaW < 500 ? 8 : 16;
        var gapRatio = areaW < 500 ? 0.08 : (areaW < 900 ? 0.10 : 0.13);

        var cw = Math.floor((areaW - 2 * margin) / (7 + 6 * gapRatio));
        var maxByH = Math.floor(areaH / 5 / 1.4);
        cw = Math.min(cw, maxByH);
        cw = Math.max(isTouch ? 44 : 44, Math.min(120, cw));

        var ch = Math.round(cw * 1.4);
        var gap = Math.max(2, Math.round(cw * gapRatio));
        var boardW = 7 * cw + 6 * gap;
        var cr = Math.max(4, Math.round(cw * 0.08));

        var root = document.documentElement;
        root.style.setProperty('--cw', cw + 'px');
        root.style.setProperty('--ch', ch + 'px');
        root.style.setProperty('--gap', gap + 'px');
        root.style.setProperty('--board-w', boardW + 'px');
        root.style.setProperty('--cr', cr + 'px');

        currentLayout = { cw: cw, ch: ch, gap: gap, boardW: boardW };
        return currentLayout;
    }

    // ================================================
    //  Card Element Creation
    // ================================================

    function createCardElement(card) {
        var el = document.createElement('div');
        var colorClass = (card.color === 'red') ? 'red' : 'navy';
        el.className = 'card ' + colorClass + (card.faceUp ? ' face-up' : ' face-down');
        el.dataset.cardId = card.id;

        if (card.faceUp) {
            var front = document.createElement('div');
            front.className = 'card-front';

            var corner = document.createElement('div');
            corner.className = 'corner';
            corner.innerHTML = '<span class="rank">' + card.rank + '</span><span class="suit">' + SUIT_SYMBOLS[card.suit] + '</span>';

            var big = document.createElement('div');
            big.className = 'big-suit';
            big.textContent = SUIT_SYMBOLS[card.suit];

            front.appendChild(corner);
            front.appendChild(big);
            el.appendChild(front);
        }

        return el;
    }

    // ================================================
    //  Rendering
    // ================================================

    function render() {
        renderStock();
        renderWaste();
        renderFoundations();
        renderTableau();
        checkAutoFinish();
    }

    function renderStock() {
        stockEl.innerHTML = '';
        stockEl.classList.remove('has-cards', 'is-empty');

        if (stock.length === 0) {
            stockEl.classList.add('is-empty');
            if (waste.length > 0) {
                var recycle = document.createElement('div');
                recycle.className = 'stock-recycle';
                recycle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
                stockEl.appendChild(recycle);
            }
            return;
        }

        stockEl.classList.add('has-cards');
    }

    function renderWaste() {
        wasteEl.querySelectorAll('.card').forEach(function (c) { c.remove(); });

        if (waste.length === 0) return;

        var topCard = waste[waste.length - 1];
        var el = createCardElement(topCard);
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.zIndex = '2';
        attachDrag(el, topCard, 'waste', null, waste.length - 1);
        wasteEl.appendChild(el);
    }

    function renderFoundations() {
        foundationEls.forEach(function (fEl, i) {
            fEl.querySelectorAll('.card').forEach(function (c) { c.remove(); });
            var pile = foundations[i];
            if (pile.length === 0) return;
            var topCard = pile[pile.length - 1];
            var el = createCardElement(topCard);
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.left = '0';
            el.style.zIndex = '2';
            attachDrag(el, topCard, 'foundation', i, pile.length - 1);
            fEl.appendChild(el);
        });
    }

    function renderTableau() {
        var ch = currentLayout.ch;
        var topRowEl = document.getElementById('top-row');
        var wrapperEl = document.getElementById('board-wrapper');
        var topRowH = topRowEl ? topRowEl.offsetHeight : ch;
        var availH = wrapperEl.clientHeight - topRowH - currentLayout.gap - 24;

        tableauEls.forEach(function (colEl, colIdx) {
            colEl.innerHTML = '';
            var pile = tableau[colIdx];
            if (pile.length === 0) {
                colEl.style.height = '';
                return;
            }

            var hidden = 0, faceUp = 0;
            for (var i = 0; i < pile.length; i++) {
                if (pile[i].faceUp) faceUp++; else hidden++;
            }

            var hiddenOff = Math.round(ch * 0.12);
            var faceUpOff = Math.round(ch * 0.28);

            var totalH = hidden * hiddenOff + Math.max(0, faceUp - 1) * faceUpOff + ch;

            if (totalH > availH && pile.length > 1) {
                var offsets = hidden * hiddenOff + Math.max(0, faceUp - 1) * faceUpOff;
                if (offsets > 0) {
                    var ratio = Math.max(0.3, (availH - ch) / offsets);
                    hiddenOff = Math.max(2, Math.round(hiddenOff * ratio));
                    faceUpOff = Math.max(Math.round(ch * 0.12), Math.round(faceUpOff * ratio));
                }
            }

            var top = 0;
            pile.forEach(function (card, i) {
                var el = createCardElement(card);
                el.style.position = 'absolute';
                el.style.top = top + 'px';
                el.style.left = '0';
                el.style.zIndex = i + 1;

                if (card.faceUp) {
                    attachDrag(el, card, 'tableau', colIdx, i);
                }

                colEl.appendChild(el);

                if (i < pile.length - 1) {
                    top += card.faceUp ? faceUpOff : hiddenOff;
                }
            });

            colEl.style.height = (top + ch) + 'px';
        });
    }

    // ================================================
    //  Timer & Stats
    // ================================================

    function startTimer() {
        if (timerStarted) return;
        timerStarted = true;
        timerInterval = setInterval(function () {
            timerSeconds++;
            updateTimer();
        }, 1000);
    }

    function pauseTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function resumeTimer() {
        if (timerStarted && !timerInterval && !gameWon) {
            timerInterval = setInterval(function () {
                timerSeconds++;
                updateTimer();
            }, 1000);
        }
    }

    function updateTimer() {
        var str = formatTime(timerSeconds);
        var timerEl = document.getElementById('timer');
        var timerS = document.getElementById('timer-s');
        if (settingsOpen) {
            timerEl.textContent = str + ' · ' + t('paused');
        } else {
            timerEl.textContent = str;
        }
        timerS.textContent = str;
    }

    function updateMoveCounter() {
        document.getElementById('move-count').textContent = moveCount;
        document.getElementById('moves-s').textContent = moveCount;
    }

    function updateUndoBtn() {
        var disabled = undoStack.length === 0;
        document.getElementById('btn-undo').disabled = disabled;
        document.getElementById('btn-undo-s').disabled = disabled;
    }

    // ================================================
    //  Move Validation
    // ================================================

    function canPlaceOnFoundation(card, fIdx) {
        var pile = foundations[fIdx];
        if (pile.length === 0) {
            return card.value === 1;
        }
        var top = pile[pile.length - 1];
        return card.suit === top.suit && card.value === top.value + 1;
    }

    function canPlaceOnTableau(card, colIdx) {
        var pile = tableau[colIdx];
        if (pile.length === 0) {
            return card.value === 13;
        }
        var top = pile[pile.length - 1];
        if (!top.faceUp) return false;
        return card.color !== top.color && card.value === top.value - 1;
    }

    function findFoundationForCard(card) {
        for (var i = 0; i < 4; i++) {
            if (canPlaceOnFoundation(card, i)) return i;
        }
        return -1;
    }

    // ================================================
    //  Move Execution
    // ================================================

    function recordMove(action) {
        undoStack.push(action);
        if (undoStack.length > 300) undoStack.shift();
        updateUndoBtn();
    }

    function incrementMoves() {
        moveCount++;
        updateMoveCounter();
        startTimer();
    }

    function drawFromStock() {
        if (stock.length === 0) {
            if (waste.length === 0) return;
            recordMove({ type: 'recycle', count: waste.length });
            while (waste.length > 0) {
                var card = waste.pop();
                card.faceUp = false;
                stock.push(card);
            }
            incrementMoves();
            render();
            return;
        }

        var card = stock.pop();
        card.faceUp = true;
        waste.push(card);

        recordMove({ type: 'draw' });
        incrementMoves();
        render();
    }

    function moveToFoundation(card, fromZone, fromCol) {
        var fIdx = findFoundationForCard(card);
        if (fIdx === -1) return false;

        var flippedCard = null;

        if (fromZone === 'waste') {
            waste.pop();
        } else if (fromZone === 'tableau') {
            tableau[fromCol].pop();
            var pile = tableau[fromCol];
            if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                pile[pile.length - 1].faceUp = true;
                flippedCard = pile[pile.length - 1].id;
            }
        }

        foundations[fIdx].push(card);

        recordMove({
            type: 'toFoundation',
            cardId: card.id,
            from: fromZone,
            fromCol: fromCol,
            foundationIdx: fIdx,
            flippedCard: flippedCard
        });

        incrementMoves();
        render();
        checkWin();
        return true;
    }

    function moveCardsToPile(cards, fromZone, fromCol, fromIdx, toCol) {
        var flippedCard = null;

        if (fromZone === 'waste') {
            waste.pop();
        } else if (fromZone === 'tableau') {
            tableau[fromCol].splice(fromIdx);
            var pile = tableau[fromCol];
            if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                pile[pile.length - 1].faceUp = true;
                flippedCard = pile[pile.length - 1].id;
            }
        } else if (fromZone === 'foundation') {
            foundations[fromCol].pop();
        }

        for (var i = 0; i < cards.length; i++) {
            tableau[toCol].push(cards[i]);
        }

        recordMove({
            type: 'moveCards',
            cardIds: cards.map(function (c) { return c.id; }),
            from: fromZone,
            fromCol: fromCol,
            fromIdx: fromIdx,
            toCol: toCol,
            flippedCard: flippedCard
        });

        incrementMoves();
        render();
    }

    // ================================================
    //  Undo
    // ================================================

    function undo() {
        if (undoStack.length === 0 || gameWon) return;

        var action = undoStack.pop();

        switch (action.type) {
            case 'draw': {
                var card = waste.pop();
                card.faceUp = false;
                stock.push(card);
                break;
            }
            case 'recycle': {
                for (var i = 0; i < action.count; i++) {
                    var c = stock.pop();
                    c.faceUp = true;
                    waste.push(c);
                }
                break;
            }
            case 'toFoundation': {
                var card = foundations[action.foundationIdx].pop();
                if (action.flippedCard && action.from === 'tableau') {
                    var pile = tableau[action.fromCol];
                    if (pile.length > 0) {
                        pile[pile.length - 1].faceUp = false;
                    }
                }
                if (action.from === 'waste') {
                    waste.push(card);
                } else if (action.from === 'tableau') {
                    tableau[action.fromCol].push(card);
                }
                break;
            }
            case 'moveCards': {
                var cards = [];
                for (var i = action.cardIds.length - 1; i >= 0; i--) {
                    cards.unshift(tableau[action.toCol].pop());
                }
                if (action.flippedCard && action.from === 'tableau') {
                    var pile = tableau[action.fromCol];
                    if (pile.length > 0) {
                        pile[pile.length - 1].faceUp = false;
                    }
                }
                if (action.from === 'waste') {
                    waste.push(cards[0]);
                } else if (action.from === 'tableau') {
                    for (var j = 0; j < cards.length; j++) {
                        tableau[action.fromCol].push(cards[j]);
                    }
                } else if (action.from === 'foundation') {
                    foundations[action.fromCol].push(cards[0]);
                }
                break;
            }
        }

        moveCount = Math.max(0, moveCount - 1);
        updateMoveCounter();
        updateUndoBtn();
        render();
    }

    // ================================================
    //  Win Detection
    // ================================================

    function checkWin() {
        var total = 0;
        for (var i = 0; i < 4; i++) total += foundations[i].length;
        if (total === 52) {
            gameWon = true;
            clearInterval(timerInterval);
            timerInterval = null;
            var timeStr = formatTime(timerSeconds);
            var d = i18n[currentLang()] || i18n.tr;
            document.getElementById('win-title').textContent = d.youWin;
            document.getElementById('win-new-btn').textContent = d.playAgain;
            document.getElementById('win-stats').innerHTML = d.completed
                .replace('{moves}', moveCount)
                .replace('{time}', timeStr);
            document.getElementById('win-overlay').classList.remove('hidden');
            spawnConfetti();
        }
    }

    // ================================================
    //  Auto-Complete
    // ================================================

    function canAutoComplete() {
        if (stock.length > 0 || waste.length > 0) return false;
        for (var i = 0; i < 7; i++) {
            var pile = tableau[i];
            for (var j = 0; j < pile.length; j++) {
                if (!pile[j].faceUp) return false;
            }
        }
        return true;
    }

    function runAutoComplete() {
        if (gameWon || autoCompleteRunning) return;
        autoCompleteRunning = true;

        function step() {
            if (gameWon) { autoCompleteRunning = false; return; }
            var moved = false;
            for (var col = 0; col < 7; col++) {
                var pile = tableau[col];
                if (pile.length === 0) continue;
                var card = pile[pile.length - 1];
                var fIdx = findFoundationForCard(card);
                if (fIdx !== -1) {
                    pile.pop();
                    foundations[fIdx].push(card);
                    moveCount++;
                    updateMoveCounter();
                    render();
                    moved = true;
                    break;
                }
            }
            if (moved) {
                checkWin();
                if (!gameWon) {
                    setTimeout(step, 100);
                } else {
                    autoCompleteRunning = false;
                }
            } else {
                autoCompleteRunning = false;
            }
        }

        step();
    }

    // ================================================
    //  Auto-Finish Button
    // ================================================

    function checkAutoFinish() {
        var btn = document.getElementById('auto-finish');
        if (!gameWon && !autoCompleteRunning && canAutoComplete()) {
            btn.classList.remove('hidden');
            btn.textContent = t('autoFinish');
        } else {
            btn.classList.add('hidden');
        }
    }

    // ================================================
    //  Confetti
    // ================================================

    function spawnConfetti() {
        var colors = ['#e94560', '#ff6b81', '#0f3460', '#f5f5f0', '#ffd700', '#48dbfb', '#ff9ff3', '#55efc4'];
        for (var i = 0; i < 80; i++) {
            (function (delay) {
                setTimeout(function () {
                    var el = document.createElement('div');
                    el.className = 'confetti';
                    el.style.left = Math.random() * 100 + 'vw';
                    el.style.top = '-10px';
                    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    var size = 4 + Math.random() * 8;
                    el.style.width = size + 'px';
                    el.style.height = size + 'px';
                    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                    el.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
                    document.body.appendChild(el);
                    setTimeout(function () { el.remove(); }, 5500);
                }, delay * 40);
            })(i);
        }
    }

    function removeConfetti() {
        document.querySelectorAll('.confetti').forEach(function (c) { c.remove(); });
    }

    // ================================================
    //  Hint System
    // ================================================

    function findHint() {
        if (waste.length > 0) {
            var wCard = waste[waste.length - 1];
            if (findFoundationForCard(wCard) !== -1) return { card: wCard };
        }
        for (var i = 0; i < 7; i++) {
            var pile = tableau[i];
            if (pile.length > 0 && pile[pile.length - 1].faceUp) {
                if (findFoundationForCard(pile[pile.length - 1]) !== -1) return { card: pile[pile.length - 1] };
            }
        }
        if (waste.length > 0) {
            var wCard = waste[waste.length - 1];
            for (var i = 0; i < 7; i++) {
                if (canPlaceOnTableau(wCard, i)) return { card: wCard };
            }
        }
        for (var from = 0; from < 7; from++) {
            var pile = tableau[from];
            if (pile.length === 0) continue;
            var firstUp = -1;
            for (var j = 0; j < pile.length; j++) {
                if (pile[j].faceUp) { firstUp = j; break; }
            }
            if (firstUp === -1) continue;
            var bottom = pile[firstUp];
            for (var to = 0; to < 7; to++) {
                if (to === from) continue;
                if (canPlaceOnTableau(bottom, to)) {
                    if (firstUp > 0 || (tableau[to].length === 0 && bottom.value === 13)) {
                        return { card: bottom };
                    }
                }
            }
        }
        if (stock.length > 0) return { type: 'stock' };
        return null;
    }

    function showHint() {
        if (gameWon || autoCompleteRunning) return;
        var hint = findHint();
        if (!hint) {
            showToast(t('noHints'));
            return;
        }
        if (hint.type === 'stock') {
            stockEl.classList.add('hint-glow');
            setTimeout(function () { stockEl.classList.remove('hint-glow'); }, 1600);
            return;
        }
        if (hint.card) {
            var el = document.querySelector('[data-card-id="' + hint.card.id + '"]');
            if (el) {
                el.classList.add('hint-glow');
                el.addEventListener('animationend', function () {
                    el.classList.remove('hint-glow');
                }, { once: true });
            }
        }
    }

    function showToast(msg) {
        var toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toast._tid);
        toast._tid = setTimeout(function () {
            toast.classList.add('hidden');
        }, 2000);
    }

    // ================================================
    //  Auto-Move (tap/click)
    // ================================================

    function autoMove(card, zone, col, cardIdx) {
        if (zone === 'waste' || (zone === 'tableau' && cardIdx === tableau[col].length - 1) || zone === 'foundation') {
            var fIdx = findFoundationForCard(card);
            if (fIdx !== -1 && zone !== 'foundation') {
                moveToFoundation(card, zone, col);
                return true;
            }
        }

        var cards;
        if (zone === 'waste') {
            cards = [card];
        } else if (zone === 'tableau') {
            cards = tableau[col].slice(cardIdx);
        } else if (zone === 'foundation') {
            cards = [card];
        } else {
            return false;
        }

        for (var pass = 0; pass < 2; pass++) {
            for (var i = 0; i < 7; i++) {
                if (zone === 'tableau' && i === col) continue;
                if (pass === 0 && tableau[i].length === 0) continue;
                if (pass === 1 && tableau[i].length > 0) continue;
                if (canPlaceOnTableau(cards[0], i)) {
                    moveCardsToPile(cards, zone, col, cardIdx, i);
                    return true;
                }
            }
        }

        return false;
    }

    function shakeCard(cardId) {
        var el = document.querySelector('[data-card-id="' + cardId + '"]');
        if (!el) return;
        el.classList.add('shake');
        el.addEventListener('animationend', function () {
            el.classList.remove('shake');
        }, { once: true });
    }

    // ================================================
    //  Drag and Drop
    // ================================================

    function attachDrag(el, card, zone, col, cardIdx) {
        el.addEventListener('mousedown', function (e) { onDragStart(e, card, zone, col, cardIdx); });
        el.addEventListener('touchstart', function (e) { onDragStart(e, card, zone, col, cardIdx); }, { passive: false });
    }

    function pointerPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e, card, zone, col, cardIdx) {
        if (gameWon || autoCompleteRunning) return;
        if (e.button && e.button !== 0) return;

        var dragCards = [];

        if (zone === 'waste') {
            dragCards = [card];
            cardIdx = waste.length - 1;
        } else if (zone === 'tableau') {
            var pile = tableau[col];
            var idx = pile.indexOf(card);
            if (idx === -1) return;
            dragCards = pile.slice(idx);
            cardIdx = idx;
        } else if (zone === 'foundation') {
            dragCards = [card];
            cardIdx = foundations[col].length - 1;
        }

        if (dragCards.length === 0) return;
        e.preventDefault();

        var pos = pointerPos(e);

        var container;
        if (zone === 'waste') container = wasteEl;
        else if (zone === 'tableau') container = tableauEls[col];
        else if (zone === 'foundation') container = foundationEls[col];

        var allCardEls = container.querySelectorAll('.card');
        var dragElements = [];

        for (var d = 0; d < dragCards.length; d++) {
            for (var c = 0; c < allCardEls.length; c++) {
                if (allCardEls[c].dataset.cardId === dragCards[d].id) {
                    dragElements.push(allCardEls[c]);
                    break;
                }
            }
        }

        if (dragElements.length === 0) return;

        var rects = dragElements.map(function (el) { return el.getBoundingClientRect(); });
        var offsets = rects.map(function (r) { return { x: pos.x - r.left, y: pos.y - r.top }; });

        dragElements.forEach(function (el, i) {
            el.classList.add('is-dragging');
            el.style.position = 'fixed';
            el.style.left = rects[i].left + 'px';
            el.style.top = rects[i].top + 'px';
            el.style.width = rects[i].width + 'px';
            el.style.height = rects[i].height + 'px';
            el.style.zIndex = 1000 + i;
            el.style.transition = 'none';
            document.body.appendChild(el);
        });

        dragState = {
            cards: dragCards,
            elements: dragElements,
            zone: zone,
            col: col,
            cardIdx: cardIdx,
            offsets: offsets,
            startPos: pos,
            moved: false
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState) return;
        e.preventDefault();

        var pos = pointerPos(e);

        if (Math.abs(pos.x - dragState.startPos.x) > 4 ||
            Math.abs(pos.y - dragState.startPos.y) > 4) {
            dragState.moved = true;
        }

        dragState.elements.forEach(function (el, i) {
            el.style.left = (pos.x - dragState.offsets[i].x) + 'px';
            el.style.top = (pos.y - dragState.offsets[i].y) + 'px';
        });

        clearHighlights();
        var cardRect = dragState.elements[0].getBoundingClientRect();
        var target = findDropTarget(pos, dragState.cards[0], dragState.cards.length, cardRect);
        if (target) {
            target.element.classList.add('drop-target');
        }
    }

    function onDragEnd(e) {
        if (!dragState) return;

        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);

        clearHighlights();

        var pos = e.changedTouches
            ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
            : { x: e.clientX, y: e.clientY };

        var dragRect = dragState.elements[0].getBoundingClientRect();

        dragState.elements.forEach(function (el) {
            el.classList.remove('is-dragging');
            el.remove();
        });

        if (!dragState.moved) {
            var clickedCard = dragState.cards[0];
            var clickedZone = dragState.zone;
            var clickedCol = dragState.col;
            var clickedIdx = dragState.cardIdx;
            dragState = null;

            var moved = autoMove(clickedCard, clickedZone, clickedCol, clickedIdx);
            if (!moved) {
                render();
                shakeCard(clickedCard.id);
            }
            return;
        }

        var target = findDropTarget(pos, dragState.cards[0], dragState.cards.length, dragRect);
        var success = false;

        if (target) {
            if (target.type === 'foundation' && dragState.cards.length === 1) {
                var card = dragState.cards[0];
                if (canPlaceOnFoundation(card, target.index)) {
                    var flippedCard = null;
                    if (dragState.zone === 'waste') {
                        waste.pop();
                    } else if (dragState.zone === 'tableau') {
                        tableau[dragState.col].splice(dragState.cardIdx);
                        var pile = tableau[dragState.col];
                        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
                            pile[pile.length - 1].faceUp = true;
                            flippedCard = pile[pile.length - 1].id;
                        }
                    } else if (dragState.zone === 'foundation') {
                        foundations[dragState.col].pop();
                    }

                    foundations[target.index].push(card);
                    recordMove({
                        type: 'toFoundation',
                        cardId: card.id,
                        from: dragState.zone,
                        fromCol: dragState.col,
                        foundationIdx: target.index,
                        flippedCard: flippedCard
                    });
                    incrementMoves();
                    success = true;
                    checkWin();
                }
            } else if (target.type === 'tableau') {
                if (canPlaceOnTableau(dragState.cards[0], target.index)) {
                    moveCardsToPile(
                        dragState.cards,
                        dragState.zone,
                        dragState.col,
                        dragState.cardIdx,
                        target.index
                    );
                    success = true;
                }
            }
        }

        dragState = null;
        render();
    }

    function rectsOverlap(a, b) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function overlapArea(a, b) {
        var x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        var y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return x * y;
    }

    function findDropTarget(pos, topCard, stackSize, dragRect) {
        for (var i = 0; i < 4; i++) {
            var rect = foundationEls[i].getBoundingClientRect();
            if (dragRect ? rectsOverlap(dragRect, rect) :
                (pos.x >= rect.left && pos.x <= rect.right &&
                 pos.y >= rect.top && pos.y <= rect.bottom)) {
                return { type: 'foundation', index: i, element: foundationEls[i] };
            }
        }

        var best = null;
        var bestArea = 0;
        for (var i = 0; i < 7; i++) {
            var colEl = tableauEls[i];
            var rect = colEl.getBoundingClientRect();
            var extBottom = Math.max(rect.bottom, rect.top + 500);
            var hitRect = { left: rect.left, right: rect.right, top: rect.top, bottom: extBottom };

            if (dragRect) {
                var area = overlapArea(dragRect, hitRect);
                if (area > bestArea) {
                    bestArea = area;
                    best = { type: 'tableau', index: i, element: colEl };
                }
            } else if (pos.x >= rect.left && pos.x <= rect.right &&
                       pos.y >= rect.top && pos.y <= extBottom) {
                return { type: 'tableau', index: i, element: colEl };
            }
        }

        return best;
    }

    function clearHighlights() {
        document.querySelectorAll('.drop-target').forEach(function (el) {
            el.classList.remove('drop-target');
        });
    }

    // ================================================
    //  Settings Panel
    // ================================================

    function isLandscapePC() {
        return matchMedia('(min-aspect-ratio: 1/1) and (hover: hover)').matches;
    }

    function openSettings() {
        settingsOpen = true;
        document.getElementById('settings-backdrop').classList.remove('hidden');
        document.getElementById('settings-panel').classList.remove('hidden');
        document.getElementById('btn-settings-s').classList.add('is-active');

        pauseTimer();
        timerPausedBySettings = true;
        updateTimer();

        if (isLandscapePC()) {
            var btn = document.getElementById('btn-settings-s');
            var panel = document.getElementById('settings-panel');
            var containerRect = document.getElementById('game-container').getBoundingClientRect();
            var btnRect = btn.getBoundingClientRect();
            panel.style.bottom = (containerRect.bottom - btnRect.bottom) + 'px';
        }
    }

    function closeSettings() {
        settingsOpen = false;
        document.getElementById('settings-backdrop').classList.add('hidden');
        document.getElementById('settings-panel').classList.add('hidden');
        document.getElementById('btn-settings-s').classList.remove('is-active');

        if (timerPausedBySettings) {
            timerPausedBySettings = false;
            if (!timerPausedByRotate) resumeTimer();
        }
        updateTimer();
    }

    function toggleSettings() {
        if (settingsOpen) closeSettings();
        else openSettings();
    }

    // ================================================
    //  Confirm Dialog
    // ================================================

    function showConfirm(msg, onYes) {
        var overlay = document.getElementById('confirm-overlay');
        var msgEl = document.getElementById('confirm-msg');
        var yesBtn = document.getElementById('confirm-yes');
        var noBtn = document.getElementById('confirm-no');

        msgEl.textContent = msg;
        overlay.classList.remove('hidden');

        function cleanup() {
            overlay.classList.add('hidden');
            yesBtn.removeEventListener('click', onConfirm);
            noBtn.removeEventListener('click', onCancel);
        }

        function onConfirm() { cleanup(); onYes(); }
        function onCancel() { cleanup(); }

        yesBtn.addEventListener('click', onConfirm);
        noBtn.addEventListener('click', onCancel);
    }

    // ================================================
    //  Rotate Warning
    // ================================================

    var isTouch = matchMedia('(pointer: coarse) and (hover: none)').matches;

    function checkRotate() {
        if (!isTouch) return;
        var landscape = window.innerWidth >= window.innerHeight;
        var warning = document.getElementById('rotate-warning');

        if (landscape) {
            warning.classList.add('is-visible');
            document.getElementById('rw-time').textContent = formatTime(timerSeconds);
            if (timerStarted && !timerPausedByRotate) {
                pauseTimer();
                timerPausedByRotate = true;
            }
        } else {
            warning.classList.remove('is-visible');
            if (timerPausedByRotate) {
                timerPausedByRotate = false;
                if (!timerPausedBySettings && !gameWon) resumeTimer();
            }
        }
    }

    // ================================================
    //  Language Apply
    // ================================================

    function applyLang(lang) {
        if (!lang) lang = currentLang();
        var d = i18n[lang] || i18n.tr;

        try { localStorage.setItem('lang', lang); } catch (e) {}

        var movesLabel = document.querySelector('[data-i18n="moves"]');
        if (movesLabel) movesLabel.textContent = d.moves;

        document.querySelector('#btn-undo span').textContent = d.undo;
        document.querySelector('#btn-hint span').textContent = d.hint;
        document.querySelector('#btn-settings span').textContent = d.settings;
        document.querySelector('#btn-new span').textContent = d.newGame;

        document.querySelector('#btn-undo-s span').textContent = d.undo;
        document.querySelector('#btn-hint-s span').textContent = d.hint;
        document.querySelector('#btn-new-s span').textContent = d.newGame;
        document.querySelector('#btn-settings-s span').textContent = d.settings;

        var spLabels = document.querySelectorAll('.sp-label');
        if (spLabels[0]) spLabels[0].textContent = d.movesLabel;
        if (spLabels[1]) spLabels[1].textContent = d.timeLabel;

        var settingsLabels = document.querySelectorAll('.settings-label');
        if (settingsLabels[0]) settingsLabels[0].textContent = d.langLabel;
        if (settingsLabels[1]) settingsLabels[1].textContent = d.cardBackLabel;
        document.querySelector('.settings-head h2').textContent = d.settings;

        document.getElementById('win-title').textContent = d.youWin;
        document.getElementById('win-new-btn').textContent = d.playAgain;
        document.getElementById('confirm-no').textContent = d.cancel;
        document.getElementById('confirm-yes').textContent = d.yes;
        document.getElementById('auto-finish').textContent = d.autoFinish;

        document.querySelector('.rw-title').textContent = d.rotateTitle;

        document.querySelectorAll('.seg-btn').forEach(function (btn) {
            btn.classList.toggle('is-active', btn.dataset.lang === lang);
        });

        updateMoveCounter();
        updateTimer();

        if (!document.getElementById('win-overlay').classList.contains('hidden')) {
            var timeStr = formatTime(timerSeconds);
            document.getElementById('win-stats').innerHTML = d.completed
                .replace('{moves}', moveCount)
                .replace('{time}', timeStr);
        }
    }

    // ================================================
    //  New Game
    // ================================================

    function requestNewGame() {
        if (moveCount > 0 && !gameWon) {
            showConfirm(t('confirmNewGame'), newGame);
        } else {
            newGame();
        }
    }

    function newGame() {
        gameWon = false;
        autoCompleteRunning = false;
        moveCount = 0;
        timerSeconds = 0;
        timerStarted = false;
        undoStack = [];
        clearInterval(timerInterval);
        timerInterval = null;
        timerPausedBySettings = false;

        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('auto-finish').classList.add('hidden');
        removeConfetti();

        updateMoveCounter();
        updateTimer();
        updateUndoBtn();

        var deck = findSolvableDeal();

        tableau = [[], [], [], [], [], [], []];
        var idx = 0;
        for (var col = 0; col < 7; col++) {
            for (var row = 0; row <= col; row++) {
                var card = deck[idx++];
                card.faceUp = (row === col);
                tableau[col].push(card);
            }
        }

        stock = [];
        for (var i = idx; i < deck.length; i++) {
            deck[i].faceUp = false;
            stock.push(deck[i]);
        }

        waste = [];
        foundations = [[], [], [], []];

        render();
    }

    // ================================================
    //  Stock Click Handler
    // ================================================

    var stockClickHandled = false;

    stockEl.addEventListener('click', function () {
        if (gameWon || dragState || stockClickHandled) return;
        drawFromStock();
    });

    stockEl.addEventListener('touchend', function (e) {
        if (gameWon || dragState) return;
        e.preventDefault();
        stockClickHandled = true;
        drawFromStock();
        setTimeout(function () { stockClickHandled = false; }, 300);
    });

    // ================================================
    //  Event Handlers
    // ================================================

    // Bottom bar
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-hint').addEventListener('click', showHint);
    document.getElementById('btn-settings').addEventListener('click', toggleSettings);
    document.getElementById('btn-new').addEventListener('click', requestNewGame);

    // Side panel
    document.getElementById('btn-undo-s').addEventListener('click', undo);
    document.getElementById('btn-hint-s').addEventListener('click', showHint);
    document.getElementById('btn-settings-s').addEventListener('click', toggleSettings);
    document.getElementById('btn-new-s').addEventListener('click', requestNewGame);

    // Settings
    document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
    document.getElementById('btn-settings-close').addEventListener('click', closeSettings);

    document.querySelectorAll('.seg-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            applyLang(btn.dataset.lang);
        });
    });

    document.querySelectorAll('.back-sw').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var back = btn.dataset.back;
            document.body.dataset.back = back;
            document.querySelectorAll('.back-sw').forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.back === back);
            });
            try { localStorage.setItem('solitaire-back', back); } catch (e) {}
            render();
        });
    });

    // Auto-finish
    document.getElementById('auto-finish').addEventListener('click', function () {
        if (canAutoComplete()) {
            document.getElementById('auto-finish').classList.add('hidden');
            runAutoComplete();
        }
    });

    // Win overlay
    document.getElementById('win-new-btn').addEventListener('click', newGame);

    // Keyboard
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        var key = e.key.toLowerCase();
        if (key === 'z') { e.preventDefault(); undo(); }
        if (key === 'h') { e.preventDefault(); showHint(); }
        if (key === 'n') { e.preventDefault(); requestNewGame(); }
        if (key === 'escape' && settingsOpen) { e.preventDefault(); closeSettings(); }
    });

    // Language from parent
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'lang') {
            applyLang(e.data.lang);
        }
    });

    // ================================================
    //  Resize & Layout
    // ================================================

    currentLayout = calcCardSize();

    var resizeObs = new ResizeObserver(function () {
        currentLayout = calcCardSize();
        render();
    });
    resizeObs.observe(document.getElementById('board-wrapper'));

    window.addEventListener('resize', checkRotate);
    if (typeof screen !== 'undefined' && screen.orientation) {
        screen.orientation.addEventListener('change', checkRotate);
    }

    // ================================================
    //  Init
    // ================================================

    // Restore card back
    try {
        var savedBack = localStorage.getItem('solitaire-back');
        if (savedBack && document.querySelector('.back-sw[data-back="' + savedBack + '"]')) {
            document.body.dataset.back = savedBack;
            document.querySelectorAll('.back-sw').forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.back === savedBack);
            });
        }
    } catch (e) {}

    newGame();
    applyLang();
    checkRotate();

})();
