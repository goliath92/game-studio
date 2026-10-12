/* ============================================
   Klondike Solitaire - Full Game Logic
   ============================================ */

(function () {
    'use strict';

    // ---- Constants ----
    const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
    const SUIT_SYMBOLS = { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' };
    const SUIT_COLORS = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const RANK_VALUES = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };

    // ---- Game State ----
    let stock = [];
    let waste = [];
    let foundations = [[], [], [], []];
    let tableau = [[], [], [], [], [], [], []];
    let moveCount = 0;
    let timerSeconds = 0;
    let timerInterval = null;
    let timerStarted = false;
    let undoStack = [];
    let dragState = null;
    let gameWon = false;
    let autoCompleteRunning = false;
    let lastClickCardId = null;
    let lastClickTime = 0;

    // ---- DOM References ----
    const stockEl = document.getElementById('stock');
    const wasteEl = document.getElementById('waste');
    const foundationEls = document.querySelectorAll('.foundation-slot');
    const tableauEls = document.querySelectorAll('.tableau-column');
    const moveCounterEl = document.getElementById('move-counter');
    const timerEl = document.getElementById('timer');
    const undoBtn = document.getElementById('undo-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const winOverlay = document.getElementById('win-overlay');
    const winStats = document.getElementById('win-stats');
    const winNewGameBtn = document.getElementById('win-new-game-btn');

    // ================================================
    //  Internationalization (i18n)
    // ================================================

    var i18n = {
        en: {
            moves: 'Moves',
            time: 'Time',
            undo: '↶ Undo',
            newGame: 'New Game',
            theme: 'Theme',
            stock: 'Stock',
            waste: 'Waste',
            youWin: 'You Win!',
            playAgain: 'Play Again',
            completed: 'Completed in <strong>{moves}</strong> moves<br>Time: <strong>{time}</strong>'
        },
        tr: {
            moves: 'Hamle',
            time: 'Süre',
            undo: '↶ Geri Al',
            newGame: 'Yeni Oyun',
            theme: 'Tema',
            stock: 'Deste',
            waste: 'Açık',
            youWin: 'Kazandınız!',
            playAgain: 'Tekrar Oyna',
            completed: '<strong>{moves}</strong> hamlede tamamlandı<br>Süre: <strong>{time}</strong>'
        }
    };

    function currentLang() {
        try { return localStorage.getItem('lang') || 'tr'; } catch (e) { return 'tr'; }
    }

    function t(key) {
        var lang = currentLang();
        var dict = i18n[lang] || i18n.tr;
        return dict[key] || key;
    }

    function applyLang(lang) {
        if (!lang) lang = currentLang();
        var dict = i18n[lang] || i18n.tr;

        // Update button texts
        undoBtn.textContent = dict.undo;
        newGameBtn.textContent = dict.newGame;

        // Update slot labels
        var stockLabel = stockEl.querySelector('.slot-label');
        var wasteLabel = wasteEl.querySelector('.slot-label');
        if (stockLabel) stockLabel.textContent = dict.stock;
        if (wasteLabel) wasteLabel.textContent = dict.waste;

        // Update theme label
        var themeLabel = document.querySelector('.skins .lbl');
        if (themeLabel) themeLabel.textContent = dict.theme;

        // Update stats
        updateMoveCounter();
        updateTimer();

        // Update win overlay if visible
        var winHeading = winOverlay.querySelector('h2');
        if (winHeading) winHeading.textContent = dict.youWin;
        winNewGameBtn.textContent = dict.playAgain;

        // If the win overlay is shown, re-render the stats too
        if (!winOverlay.classList.contains('hidden')) {
            var mins = Math.floor(timerSeconds / 60);
            var secs = timerSeconds % 60;
            var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
            winStats.innerHTML = dict.completed
                .replace('{moves}', moveCount)
                .replace('{time}', timeStr);
        }

        // Update lang toggle button styles
        document.querySelectorAll('.lang-btn').forEach(function (btn) {
            btn.classList.toggle('lang-btn--active', btn.dataset.lang === lang);
        });
    }

    // Language toggle click handler
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var lang = btn.dataset.lang;
            try { localStorage.setItem('lang', lang); } catch (e) {}
            applyLang(lang);
        });
    });

    // Listen for language change from parent dashboard
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'lang') {
            try { localStorage.setItem('lang', e.data.lang); } catch (ex) {}
            applyLang(e.data.lang);
        }
    });

    // ================================================
    //  Deck Creation & Shuffle (Fisher-Yates)
    // ================================================

    function createDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({
                    suit,
                    rank,
                    color: SUIT_COLORS[suit],
                    value: RANK_VALUES[rank],
                    faceUp: false,
                    id: rank + '-' + suit
                });
            }
        }
        return deck;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ================================================
    //  New Game
    // ================================================

    function newGame() {
        gameWon = false;
        autoCompleteRunning = false;
        moveCount = 0;
        timerSeconds = 0;
        timerStarted = false;
        undoStack = [];
        clearInterval(timerInterval);
        timerInterval = null;
        winOverlay.classList.add('hidden');
        removeConfetti();

        updateMoveCounter();
        updateTimer();
        updateUndoBtn();

        const deck = shuffle(createDeck());

        // Deal tableau: column i gets i+1 cards, top card face-up
        tableau = [[], [], [], [], [], [], []];
        let idx = 0;
        for (let col = 0; col < 7; col++) {
            for (let row = 0; row <= col; row++) {
                const card = deck[idx++];
                card.faceUp = (row === col);
                tableau[col].push(card);
            }
        }

        // Remaining 24 cards form the stock
        stock = [];
        for (let i = idx; i < deck.length; i++) {
            deck[i].faceUp = false;
            stock.push(deck[i]);
        }

        waste = [];
        foundations = [[], [], [], []];

        render();
    }

    // ================================================
    //  Rendering
    // ================================================

    function render() {
        renderStock();
        renderWaste();
        renderFoundations();
        renderTableau();
    }

    function createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card ' + card.color + (card.faceUp ? '' : ' face-down');
        el.dataset.cardId = card.id;

        const inner = document.createElement('div');
        inner.className = 'card-inner';

        // -- Front face --
        const front = document.createElement('div');
        front.className = 'card-front';

        const cornerTL = document.createElement('div');
        cornerTL.className = 'card-corner top-left';
        cornerTL.innerHTML =
            '<span class="card-rank">' + card.rank + '</span>' +
            '<span class="card-suit-small">' + SUIT_SYMBOLS[card.suit] + '</span>';

        const cornerBR = document.createElement('div');
        cornerBR.className = 'card-corner bottom-right';
        cornerBR.innerHTML =
            '<span class="card-rank">' + card.rank + '</span>' +
            '<span class="card-suit-small">' + SUIT_SYMBOLS[card.suit] + '</span>';

        // Center decoration
        if (['J', 'Q', 'K'].includes(card.rank)) {
            const faceLetter = document.createElement('div');
            faceLetter.className = 'card-center-face';
            faceLetter.textContent = card.rank;
            front.appendChild(faceLetter);
        }
        const centerSuit = document.createElement('div');
        centerSuit.className = 'card-center';
        centerSuit.textContent = SUIT_SYMBOLS[card.suit];
        front.appendChild(centerSuit);

        front.appendChild(cornerTL);
        front.appendChild(cornerBR);

        // -- Back face --
        const back = document.createElement('div');
        back.className = 'card-back';
        const pattern = document.createElement('div');
        pattern.className = 'card-back-pattern';
        const patternInner = document.createElement('div');
        patternInner.className = 'card-back-pattern-inner';
        const emblem = document.createElement('div');
        emblem.className = 'card-back-emblem';
        emblem.textContent = '\u2660';
        pattern.appendChild(patternInner);
        pattern.appendChild(emblem);
        back.appendChild(pattern);

        inner.appendChild(front);
        inner.appendChild(back);
        el.appendChild(inner);

        return el;
    }

    function createFaceDownCard() {
        const el = document.createElement('div');
        el.className = 'card face-down';
        const inner = document.createElement('div');
        inner.className = 'card-inner';
        // Empty front
        const front = document.createElement('div');
        front.className = 'card-front';
        // Back
        const back = document.createElement('div');
        back.className = 'card-back';
        const pattern = document.createElement('div');
        pattern.className = 'card-back-pattern';
        const patternInner = document.createElement('div');
        patternInner.className = 'card-back-pattern-inner';
        const emblem = document.createElement('div');
        emblem.className = 'card-back-emblem';
        emblem.textContent = '\u2660';
        pattern.appendChild(patternInner);
        pattern.appendChild(emblem);
        back.appendChild(pattern);
        inner.appendChild(front);
        inner.appendChild(back);
        el.appendChild(inner);
        return el;
    }

    function renderStock() {
        stockEl.querySelectorAll('.card').forEach(function (c) { c.remove(); });
        stockEl.classList.remove('empty-recycle');

        if (stock.length === 0) {
            if (waste.length > 0) {
                stockEl.classList.add('empty-recycle');
            }
            return;
        }

        // Show top card as face-down
        const topEl = createCardElement(stock[stock.length - 1]);
        topEl.style.position = 'absolute';
        topEl.style.top = '0';
        topEl.style.left = '0';
        topEl.style.zIndex = '1';
        stockEl.appendChild(topEl);

        // Peek card underneath to show stack depth
        if (stock.length > 1) {
            const underEl = createFaceDownCard();
            underEl.style.position = 'absolute';
            underEl.style.top = '0';
            underEl.style.left = '0';
            underEl.style.zIndex = '0';
            stockEl.appendChild(underEl);
        }
    }

    function renderWaste() {
        wasteEl.querySelectorAll('.card').forEach(function (c) { c.remove(); });

        if (waste.length === 0) return;

        const topCard = waste[waste.length - 1];
        const el = createCardElement(topCard);
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
            const pile = foundations[i];
            if (pile.length === 0) return;
            const topCard = pile[pile.length - 1];
            const el = createCardElement(topCard);
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.left = '0';
            el.style.zIndex = '2';
            // Foundation cards can be dragged back to tableau
            attachDrag(el, topCard, 'foundation', i, pile.length - 1);
            fEl.appendChild(el);
        });
    }

    function renderTableau() {
        tableauEls.forEach(function (colEl, colIdx) {
            colEl.querySelectorAll('.card').forEach(function (c) { c.remove(); });
            const pile = tableau[colIdx];

            pile.forEach(function (card, cardIdx) {
                const el = createCardElement(card);

                // Vertical stacking offset
                var topOffset = 0;
                for (var k = 0; k < cardIdx; k++) {
                    topOffset += pile[k].faceUp ? tableauOffset : tableauOffsetHidden;
                }

                el.style.position = 'absolute';
                el.style.top = topOffset + 'px';
                el.style.left = '0';
                el.style.zIndex = cardIdx + 1;

                if (card.faceUp) {
                    attachDrag(el, card, 'tableau', colIdx, cardIdx);
                }

                colEl.appendChild(el);
            });
        });
    }

    // Cache CSS variable values, refreshed on resize
    var tableauOffset = 24;
    var tableauOffsetHidden = 8;

    function refreshCSSVars() {
        var style = getComputedStyle(document.documentElement);
        tableauOffset = parseFloat(style.getPropertyValue('--tableau-offset')) || 24;
        tableauOffsetHidden = parseFloat(style.getPropertyValue('--tableau-offset-hidden')) || 8;
    }

    refreshCSSVars();
    window.addEventListener('resize', function () {
        refreshCSSVars();
        render();
    });

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

    function updateTimer() {
        var mins = Math.floor(timerSeconds / 60);
        var secs = timerSeconds % 60;
        timerEl.textContent = t('time') + ': ' + mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    function updateMoveCounter() {
        moveCounterEl.textContent = t('moves') + ': ' + moveCount;
    }

    function updateUndoBtn() {
        undoBtn.disabled = undoStack.length === 0;
    }

    // ================================================
    //  Move Validation
    // ================================================

    function canPlaceOnFoundation(card, fIdx) {
        var pile = foundations[fIdx];
        if (pile.length === 0) {
            return card.value === 1; // Ace only
        }
        var top = pile[pile.length - 1];
        return card.suit === top.suit && card.value === top.value + 1;
    }

    function canPlaceOnTableau(card, colIdx) {
        var pile = tableau[colIdx];
        if (pile.length === 0) {
            return card.value === 13; // King only
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

    // Draw one card from stock to waste
    function drawFromStock() {
        if (stock.length === 0) {
            if (waste.length === 0) return;
            // Recycle: waste goes back to stock (reversed)
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

    // Move a single card to the foundation (double-click action)
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
        scheduleAutoComplete();
        checkWin();
        return true;
    }

    // Move one or more cards between piles
    function moveCardsToPile(cards, fromZone, fromCol, fromIdx, toCol) {
        var flippedCard = null;

        // Remove from source
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

        // Add to destination tableau
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
        scheduleAutoComplete();
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
                // Un-flip the card that was revealed
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
                // Un-flip
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
            var mins = Math.floor(timerSeconds / 60);
            var secs = timerSeconds % 60;
            var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
            var dict = i18n[currentLang()] || i18n.tr;
            winOverlay.querySelector('h2').textContent = dict.youWin;
            winNewGameBtn.textContent = dict.playAgain;
            winStats.innerHTML = dict.completed
                .replace('{moves}', moveCount)
                .replace('{time}', timeStr);
            winOverlay.classList.remove('hidden');
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

    function scheduleAutoComplete() {
        if (autoCompleteRunning || gameWon) return;
        setTimeout(function () {
            if (!gameWon && canAutoComplete()) {
                runAutoComplete();
            }
        }, 400);
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
                    break; // One card at a time for visual effect
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
                    el.style.animationDuration = (2 + Math.random() * 3) + 's';
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

        // Find the DOM elements for these cards
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

        // Record initial positions and offsets
        var rects = dragElements.map(function (el) { return el.getBoundingClientRect(); });
        var offsets = rects.map(function (r) { return { x: pos.x - r.left, y: pos.y - r.top }; });

        // Reparent to body for free positioning
        dragElements.forEach(function (el, i) {
            el.classList.add('dragging');
            el.classList.add('no-transition');
            el.style.position = 'fixed';
            el.style.left = rects[i].left + 'px';
            el.style.top = rects[i].top + 'px';
            el.style.width = rects[i].width + 'px';
            el.style.height = rects[i].height + 'px';
            el.style.zIndex = 1000 + i;
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

        // Highlight valid drop targets
        clearHighlights();
        var cardRect = dragState.elements[0].getBoundingClientRect();
        var target = findDropTarget(pos, dragState.cards[0], dragState.cards.length, cardRect);
        if (target) {
            target.element.classList.add('drop-highlight');
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

        // Remove drag elements from DOM
        dragState.elements.forEach(function (el) {
            el.classList.remove('dragging', 'no-transition');
            el.remove();
        });

        if (!dragState.moved) {
            var now = Date.now();
            var clickedId = dragState.cards[0].id;
            var clickedZone = dragState.zone;
            var clickedCol = dragState.col;
            var clickedCard = dragState.cards[0];
            if (clickedId === lastClickCardId && now - lastClickTime < 400) {
                lastClickCardId = null;
                lastClickTime = 0;
                dragState = null;
                if (clickedZone === 'waste') {
                    moveToFoundation(clickedCard, 'waste', null);
                } else if (clickedZone === 'tableau') {
                    var pile = tableau[clickedCol];
                    if (pile.length > 0 && pile[pile.length - 1].id === clickedId) {
                        moveToFoundation(clickedCard, 'tableau', clickedCol);
                    }
                }
                render();
                return;
            }
            lastClickCardId = clickedId;
            lastClickTime = now;
            dragState = null;
            render();
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
                    scheduleAutoComplete();
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
        // Check foundations first (higher priority)
        for (var i = 0; i < 4; i++) {
            var rect = foundationEls[i].getBoundingClientRect();
            if (dragRect ? rectsOverlap(dragRect, rect) :
                (pos.x >= rect.left && pos.x <= rect.right &&
                 pos.y >= rect.top && pos.y <= rect.bottom)) {
                return { type: 'foundation', index: i, element: foundationEls[i] };
            }
        }

        // Check tableau columns — pick the one with most overlap
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
        document.querySelectorAll('.drop-highlight').forEach(function (el) {
            el.classList.remove('drop-highlight');
        });
    }

    // ================================================
    //  Stock Click Handler
    // ================================================

    var stockClickHandled = false;

    stockEl.addEventListener('click', function (e) {
        if (gameWon || dragState || stockClickHandled) return;
        drawFromStock();
    });

    stockEl.addEventListener('touchend', function (e) {
        if (gameWon || dragState) return;
        e.preventDefault();
        stockClickHandled = true;
        drawFromStock();
        // Reset flag after a short delay so click doesn't also fire
        setTimeout(function () { stockClickHandled = false; }, 300);
    });

    // ================================================
    //  Button Handlers
    // ================================================

    undoBtn.addEventListener('click', undo);
    newGameBtn.addEventListener('click', newGame);
    winNewGameBtn.addEventListener('click', newGame);

    // ================================================
    //  Keyboard Shortcuts
    // ================================================

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        }
    });

    // ================================================
    //  Skin System
    // ================================================

    function setSkin(k) {
        if (k === 'cuha') delete document.body.dataset.skin;
        else document.body.dataset.skin = k;
        document.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.skin === k));
        try { localStorage.setItem('klondike-skin', k); } catch (e) {}
    }
    document.querySelectorAll('.sw').forEach(b => b.onclick = () => setSkin(b.dataset.skin));
    try {
        let k = localStorage.getItem('klondike-skin');
        if (k === 'kagit') k = 'ahsap';
        if (k && document.querySelector('.sw[data-skin="' + k + '"]')) setSkin(k);
    } catch (e) {}

    // ================================================
    //  Start the Game
    // ================================================

    newGame();
    applyLang();

})();
