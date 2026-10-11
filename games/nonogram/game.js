/* ===========================================================
   Nonogram / Picross  –  Full Game Logic
   =========================================================== */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let size = 5;                // current grid dimension
    let solution = [];           // 2-D boolean (true = filled)
    let playerGrid = [];         // 2-D: 0 = empty, 1 = filled, 2 = marked-X
    let rowClues = [];
    let colClues = [];
    let history = [];            // undo stack [{r, c, prev}]
    let mistakes = 0;
    const MAX_MISTAKES = 5;
    let timerSeconds = 0;
    let timerInterval = null;
    let gameActive = false;

    // Drag state
    let isDragging = false;
    let dragAction = null;       // 'fill' | 'mark' | 'clear'
    let dragButton = null;       // 0 = left, 2 = right
    let dragCells = [];          // [{r,c}] cells touched this drag
    let dragAxis = null;         // 'row' | 'col' | null (locked after 2nd cell)
    let dragStartR = -1;
    let dragStartC = -1;

    // ── DOM refs ───────────────────────────────────────────
    const gridEl        = document.getElementById('grid');
    const rowCluesEl    = document.getElementById('row-clues');
    const colCluesEl    = document.getElementById('col-clues');
    const cornerEl      = document.getElementById('corner-spacer');
    const boardArea     = document.getElementById('board-area');
    const timerSpan     = document.getElementById('timer');
    const mistakeSpan   = document.getElementById('mistakes');
    const undoBtn       = document.getElementById('undo-btn');
    const newGameBtn    = document.getElementById('new-game-btn');
    const winOverlay    = document.getElementById('win-overlay');
    const winTime       = document.getElementById('win-time');
    const winMistakes   = document.getElementById('win-mistakes');
    const winNewGame    = document.getElementById('win-new-game');
    const gameOverOvl   = document.getElementById('game-over-overlay');
    const gameOverNew   = document.getElementById('game-over-new-game');
    const sizeBtns      = document.querySelectorAll('.size-btn');

    // ── Helpers ────────────────────────────────────────────

    /** Seeded pseudo-random (xorshift32) for reproducibility if desired */
    function randomBool(probability) {
        return Math.random() < probability;
    }

    /** Compute clue numbers for a single line (array of booleans). */
    function computeClues(line) {
        const clues = [];
        let run = 0;
        for (const cell of line) {
            if (cell) {
                run++;
            } else if (run > 0) {
                clues.push(run);
                run = 0;
            }
        }
        if (run > 0) clues.push(run);
        return clues.length ? clues : [0];
    }

    /** Get a column from a 2-D array. */
    function getCol(grid, c) {
        return grid.map(row => row[c]);
    }

    /** Check if a line (array of player values) satisfies a clue. */
    function lineSatisfied(playerLine, clue) {
        const filled = playerLine.map(v => v === 1);
        const actual = computeClues(filled);
        if (actual.length !== clue.length) return false;
        return actual.every((v, i) => v === clue[i]);
    }

    /** Compute which individual clue numbers are "matched" so far
     *  for progressive crossing-out. We scan filled runs from left
     *  and see if leading clues match. Same from the right. */
    function matchedClueIndices(playerLine, clue) {
        if (clue.length === 1 && clue[0] === 0) {
            // "0" clue — satisfied if no fills
            const anyFilled = playerLine.some(v => v === 1);
            return anyFilled ? new Set() : new Set([0]);
        }

        const n = playerLine.length;
        const filled = playerLine.map(v => v === 1);
        const marked = playerLine.map(v => v === 2);
        const matched = new Set();

        // Forward pass: match clues from left while the region is
        // fully determined (filled cells bordered by marks/edges).
        let pos = 0;
        for (let ci = 0; ci < clue.length; ci++) {
            // Skip marked/empty cells
            while (pos < n && !filled[pos]) {
                if (!marked[pos]) break;  // unknown territory
                pos++;
            }
            if (pos >= n || !filled[pos]) break;

            // Count the run
            let runStart = pos;
            let run = 0;
            while (pos < n && filled[pos]) { run++; pos++; }

            // After the run, there must be a mark or edge
            const bounded = (pos >= n || marked[pos] || !filled[pos]);
            if (run === clue[ci] && bounded) {
                matched.add(ci);
            } else {
                break;
            }
        }

        // Backward pass: same from right
        pos = n - 1;
        for (let ci = clue.length - 1; ci >= 0; ci--) {
            while (pos >= 0 && !filled[pos]) {
                if (!marked[pos]) break;
                pos--;
            }
            if (pos < 0 || !filled[pos]) break;

            let run = 0;
            while (pos >= 0 && filled[pos]) { run++; pos--; }

            const bounded = (pos < 0 || marked[pos] || !filled[pos]);
            if (run === clue[ci] && bounded) {
                matched.add(ci);
            } else {
                break;
            }
        }

        return matched;
    }

    // ── Puzzle Generation ──────────────────────────────────

    /**
     * Generate a puzzle with recognisable patterns.
     * Strategy: pick from a library of small "shape stamps" and
     * boolean noise, biased so roughly 45-60% of cells are filled
     * to produce interesting clues.
     */
    function generatePuzzle(n) {
        // Start with empty grid
        const grid = Array.from({ length: n }, () => Array(n).fill(false));

        if (n === 5) {
            generate5x5(grid);
        } else if (n === 10) {
            generate10x10(grid);
        } else {
            generate15x15(grid);
        }

        return grid;
    }

    /** 5x5: Use pre-made pattern templates for recognisable shapes */
    function generate5x5(grid) {
        const patterns = [
            // Heart
            [
                [0,1,0,1,0],
                [1,1,1,1,1],
                [1,1,1,1,1],
                [0,1,1,1,0],
                [0,0,1,0,0],
            ],
            // Cross / Plus
            [
                [0,0,1,0,0],
                [0,0,1,0,0],
                [1,1,1,1,1],
                [0,0,1,0,0],
                [0,0,1,0,0],
            ],
            // Diamond
            [
                [0,0,1,0,0],
                [0,1,1,1,0],
                [1,1,1,1,1],
                [0,1,1,1,0],
                [0,0,1,0,0],
            ],
            // Arrow right
            [
                [0,0,1,0,0],
                [0,0,1,1,0],
                [1,1,1,1,1],
                [0,0,1,1,0],
                [0,0,1,0,0],
            ],
            // T shape
            [
                [1,1,1,1,1],
                [0,0,1,0,0],
                [0,0,1,0,0],
                [0,0,1,0,0],
                [0,0,1,0,0],
            ],
            // U shape
            [
                [1,0,0,0,1],
                [1,0,0,0,1],
                [1,0,0,0,1],
                [1,1,1,1,1],
                [0,1,1,1,0],
            ],
            // Checkerboard corners
            [
                [1,1,0,1,1],
                [1,0,0,0,1],
                [0,0,1,0,0],
                [1,0,0,0,1],
                [1,1,0,1,1],
            ],
            // Smiley
            [
                [0,1,1,1,0],
                [1,0,1,0,1],
                [1,0,0,0,1],
                [1,0,1,0,1],
                [0,1,1,1,0],
            ],
            // Frame
            [
                [1,1,1,1,1],
                [1,0,0,0,1],
                [1,0,0,0,1],
                [1,0,0,0,1],
                [1,1,1,1,1],
            ],
            // Stairs
            [
                [1,0,0,0,0],
                [1,1,0,0,0],
                [0,1,1,0,0],
                [0,0,1,1,0],
                [0,0,0,1,1],
            ],
        ];

        const chosen = patterns[Math.floor(Math.random() * patterns.length)];
        for (let r = 0; r < 5; r++)
            for (let c = 0; c < 5; c++)
                grid[r][c] = !!chosen[r][c];
    }

    /** 10x10: stamp a few shapes then add structured noise. */
    function generate10x10(grid) {
        // Fill density target: ~50%
        const templates = [
            // Symmetric cross in center
            () => {
                for (let i = 0; i < 10; i++) { grid[4][i] = true; grid[5][i] = true; }
                for (let i = 0; i < 10; i++) { grid[i][4] = true; grid[i][5] = true; }
            },
            // Border frame with inner pattern
            () => {
                for (let i = 0; i < 10; i++) {
                    grid[0][i] = true; grid[9][i] = true;
                    grid[i][0] = true; grid[i][9] = true;
                }
                // Inner diamond
                for (let r = 2; r <= 7; r++)
                    for (let c = 2; c <= 7; c++) {
                        const dr = Math.abs(r - 4.5), dc = Math.abs(c - 4.5);
                        if (dr + dc <= 3.5) grid[r][c] = true;
                    }
            },
            // Diagonal stripes
            () => {
                for (let r = 0; r < 10; r++)
                    for (let c = 0; c < 10; c++)
                        if ((r + c) % 3 === 0 || (r + c) % 3 === 1) grid[r][c] = true;
            },
            // Big heart
            () => {
                const heart = [
                    [0,0,1,1,0,0,1,1,0,0],
                    [0,1,1,1,1,1,1,1,1,0],
                    [1,1,1,1,1,1,1,1,1,1],
                    [1,1,1,1,1,1,1,1,1,1],
                    [1,1,1,1,1,1,1,1,1,1],
                    [0,1,1,1,1,1,1,1,1,0],
                    [0,0,1,1,1,1,1,1,0,0],
                    [0,0,0,1,1,1,1,0,0,0],
                    [0,0,0,0,1,1,0,0,0,0],
                    [0,0,0,0,0,0,0,0,0,0],
                ];
                for (let r = 0; r < 10; r++)
                    for (let c = 0; c < 10; c++)
                        grid[r][c] = !!heart[r][c];
            },
            // Circle
            () => {
                const cx = 4.5, cy = 4.5, rad = 4.2;
                for (let r = 0; r < 10; r++)
                    for (let c = 0; c < 10; c++) {
                        const dist = Math.sqrt((r - cx) ** 2 + (c - cy) ** 2);
                        if (dist <= rad) grid[r][c] = true;
                    }
            },
        ];

        templates[Math.floor(Math.random() * templates.length)]();
        // Slight random mutation for variety (flip ~5% of cells)
        for (let r = 0; r < 10; r++)
            for (let c = 0; c < 10; c++)
                if (Math.random() < 0.05) grid[r][c] = !grid[r][c];
    }

    /** 15x15: Larger shapes, symmetry, structured fills. */
    function generate15x15(grid) {
        const n = 15;
        const method = Math.floor(Math.random() * 5);

        switch (method) {
            case 0: {
                // Symmetric pattern via vertical mirror
                for (let r = 0; r < n; r++)
                    for (let c = 0; c <= 7; c++) {
                        const val = randomBool(0.5);
                        grid[r][c] = val;
                        grid[r][n - 1 - c] = val;
                    }
                break;
            }
            case 1: {
                // Circle with frame
                const cx = 7, cy = 7;
                for (let r = 0; r < n; r++)
                    for (let c = 0; c < n; c++) {
                        const dist = Math.sqrt((r - cx) ** 2 + (c - cy) ** 2);
                        if (dist <= 6.5) grid[r][c] = true;
                        if (r === 0 || r === n - 1 || c === 0 || c === n - 1) grid[r][c] = true;
                    }
                break;
            }
            case 2: {
                // Diamond inside frame
                for (let r = 0; r < n; r++)
                    for (let c = 0; c < n; c++) {
                        const dr = Math.abs(r - 7), dc = Math.abs(c - 7);
                        if (dr + dc <= 7) grid[r][c] = true;
                        if (r === 0 || r === n - 1 || c === 0 || c === n - 1) grid[r][c] = true;
                    }
                break;
            }
            case 3: {
                // 4-fold symmetric random (iconic quilt look)
                for (let r = 0; r <= 7; r++)
                    for (let c = 0; c <= 7; c++) {
                        const val = randomBool(0.48);
                        grid[r][c] = val;
                        grid[r][n - 1 - c] = val;
                        grid[n - 1 - r][c] = val;
                        grid[n - 1 - r][n - 1 - c] = val;
                    }
                break;
            }
            case 4: {
                // House / tree shape
                // Tree trunk
                for (let r = 9; r < 15; r++)
                    for (let c = 6; c <= 8; c++)
                        grid[r][c] = true;
                // Tree layers
                for (let layer = 0; layer < 3; layer++) {
                    const topR = layer * 3;
                    for (let dr = 0; dr < 4; dr++) {
                        const rr = topR + dr;
                        if (rr >= 15) break;
                        const halfW = dr + 1 + layer;
                        for (let c = 7 - halfW; c <= 7 + halfW; c++)
                            if (c >= 0 && c < 15) grid[rr][c] = true;
                    }
                }
                break;
            }
        }

        // Ensure no completely empty rows/cols (add a cell if needed)
        for (let r = 0; r < n; r++) {
            if (grid[r].every(v => !v)) grid[r][Math.floor(Math.random() * n)] = true;
        }
        for (let c = 0; c < n; c++) {
            if (grid.every(row => !row[c])) grid[Math.floor(Math.random() * n)][c] = true;
        }
    }

    // ── Rendering ──────────────────────────────────────────

    function computeSizing() {
        // Determine cell size to fit within available space
        const boardWrapper = document.getElementById('board-wrapper');
        const wrapperW = boardWrapper.clientWidth - 8;
        const wrapperH = boardWrapper.clientHeight - 8;

        // Clue area takes roughly: maxClueLen * (fontSize + gap)
        const maxRowClueLen = Math.max(...rowClues.map(c => c.length));
        const maxColClueLen = Math.max(...colClues.map(c => c.length));

        // Estimate clue widths: each number ~14px wide + 4px gap for rows
        // Estimate clue heights: each number ~14px tall + 1px gap for cols
        let clueFontGuess = size <= 5 ? 14 : size <= 10 ? 12 : 10;
        let rowClueWidth = maxRowClueLen * (clueFontGuess + 4) + 8;
        let colClueHeight = maxColClueLen * (clueFontGuess + 2) + 6;

        const availW = wrapperW - rowClueWidth;
        const availH = wrapperH - colClueHeight;

        let cellSize = Math.floor(Math.min(availW / size, availH / size));
        // Clamp cell size
        const maxCell = size <= 5 ? 56 : size <= 10 ? 38 : 28;
        const minCell = size <= 5 ? 28 : size <= 10 ? 20 : 16;
        cellSize = Math.max(minCell, Math.min(maxCell, cellSize));

        // Recompute clue font based on cell size
        let clueFont = Math.max(8, Math.floor(cellSize * 0.38));
        if (size <= 5) clueFont = Math.max(10, Math.floor(cellSize * 0.32));

        // Recompute clue area sizes
        rowClueWidth = maxRowClueLen * (clueFont + 4) + 10;
        colClueHeight = maxColClueLen * (clueFont + 2) + 8;

        return { cellSize, clueFont, rowClueWidth, colClueHeight };
    }

    function renderBoard() {
        const { cellSize, clueFont, rowClueWidth, colClueHeight } = computeSizing();

        // CSS custom properties
        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
        document.documentElement.style.setProperty('--clue-font', clueFont + 'px');

        const gridWidth = cellSize * size + 2;   // +2 for outer border
        const gridHeight = cellSize * size + 2;

        // Board area grid template
        boardArea.style.gridTemplateColumns = `${rowClueWidth}px ${gridWidth}px`;
        boardArea.style.gridTemplateRows = `${colClueHeight}px ${gridHeight}px`;

        // ── Column clues ──
        colCluesEl.innerHTML = '';
        colCluesEl.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
        for (let c = 0; c < size; c++) {
            const div = document.createElement('div');
            div.className = 'col-clue';
            div.dataset.col = c;
            colClues[c].forEach((num, i) => {
                const span = document.createElement('span');
                span.className = 'clue-num';
                span.textContent = num;
                span.dataset.idx = i;
                div.appendChild(span);
            });
            colCluesEl.appendChild(div);
        }

        // ── Row clues ──
        rowCluesEl.innerHTML = '';
        rowCluesEl.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;
        for (let r = 0; r < size; r++) {
            const div = document.createElement('div');
            div.className = 'row-clue';
            div.dataset.row = r;
            rowClues[r].forEach((num, i) => {
                const span = document.createElement('span');
                span.className = 'clue-num';
                span.textContent = num;
                span.dataset.idx = i;
                div.appendChild(span);
            });
            rowCluesEl.appendChild(div);
        }

        // ── Grid cells ──
        gridEl.innerHTML = '';
        gridEl.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
        gridEl.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.r = r;
                cell.dataset.c = c;
                // Heavy borders every 5 cells
                if ((c + 1) % 5 === 0 && c !== size - 1) cell.classList.add('border-right');
                if ((r + 1) % 5 === 0 && r !== size - 1) cell.classList.add('border-bottom');
                gridEl.appendChild(cell);
            }
        }

        updateAllCells();
        updateAllClues();
    }

    function getCellEl(r, c) {
        return gridEl.children[r * size + c];
    }

    function updateCellEl(r, c) {
        const el = getCellEl(r, c);
        if (!el) return;
        el.classList.remove('filled', 'marked');
        if (playerGrid[r][c] === 1) el.classList.add('filled');
        else if (playerGrid[r][c] === 2) el.classList.add('marked');
    }

    function updateAllCells() {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                updateCellEl(r, c);
    }

    function updateRowClue(r) {
        const clueDiv = rowCluesEl.querySelector(`.row-clue[data-row="${r}"]`);
        if (!clueDiv) return;
        const playerLine = playerGrid[r];
        const clue = rowClues[r];
        const satisfied = lineSatisfied(playerLine, clue);
        const matched = matchedClueIndices(playerLine, clue);

        clueDiv.classList.toggle('completed', satisfied);
        const spans = clueDiv.querySelectorAll('.clue-num');
        spans.forEach((sp, i) => {
            sp.classList.toggle('crossed', !satisfied && matched.has(i));
        });
    }

    function updateColClue(c) {
        const clueDiv = colCluesEl.querySelector(`.col-clue[data-col="${c}"]`);
        if (!clueDiv) return;
        const playerLine = getCol(playerGrid, c);
        const clue = colClues[c];
        const satisfied = lineSatisfied(playerLine, clue);
        const matched = matchedClueIndices(playerLine, clue);

        clueDiv.classList.toggle('completed', satisfied);
        const spans = clueDiv.querySelectorAll('.clue-num');
        spans.forEach((sp, i) => {
            sp.classList.toggle('crossed', !satisfied && matched.has(i));
        });
    }

    function updateAllClues() {
        for (let r = 0; r < size; r++) updateRowClue(r);
        for (let c = 0; c < size; c++) updateColClue(c);
    }

    // ── Timer ──────────────────────────────────────────────

    function startTimer() {
        stopTimer();
        timerSeconds = 0;
        timerSpan.textContent = '00:00';
        timerInterval = setInterval(() => {
            timerSeconds++;
            const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
            const s = String(timerSeconds % 60).padStart(2, '0');
            timerSpan.textContent = `${m}:${s}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    function formatTime(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    // ── Game Actions ───────────────────────────────────────

    function applyAction(r, c, newState) {
        if (!gameActive) return;
        const prev = playerGrid[r][c];
        if (prev === newState) return;

        // Check for mistakes: filling a cell that should be empty
        if (newState === 1 && !solution[r][c]) {
            mistakes++;
            mistakeSpan.textContent = `${mistakes} / ${MAX_MISTAKES}`;
            // Flash the cell red briefly then revert
            const el = getCellEl(r, c);
            el.classList.add('filled');
            setTimeout(() => {
                el.classList.remove('filled');
                // Auto-mark as X so player knows
                playerGrid[r][c] = 2;
                updateCellEl(r, c);
                updateRowClue(r);
                updateColClue(c);
            }, 250);
            history.push({ r, c, prev });
            playerGrid[r][c] = 2; // will be set after flash via timeout too
            undoBtn.disabled = false;

            if (mistakes >= MAX_MISTAKES) {
                gameActive = false;
                stopTimer();
                setTimeout(() => gameOverOvl.classList.remove('hidden'), 300);
            }
            return;
        }

        history.push({ r, c, prev });
        playerGrid[r][c] = newState;
        updateCellEl(r, c);
        updateRowClue(r);
        updateColClue(c);
        undoBtn.disabled = false;

        checkWin();
    }

    function undo() {
        if (!history.length || !gameActive) return;
        const { r, c, prev } = history.pop();
        playerGrid[r][c] = prev;
        updateCellEl(r, c);
        updateRowClue(r);
        updateColClue(c);
        undoBtn.disabled = history.length === 0;
    }

    function checkWin() {
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (solution[r][c] && playerGrid[r][c] !== 1) return;
                // We don't care if unfilled cells are marked or empty

        // Extra check: make sure player hasn't filled non-solution cells
        // (those would already be mistakes, but let's be safe)
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (!solution[r][c] && playerGrid[r][c] === 1) return;

        // WIN!
        gameActive = false;
        stopTimer();

        // Pulse animation on all filled cells
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++) {
                const el = getCellEl(r, c);
                if (playerGrid[r][c] === 1) {
                    el.classList.add('win-pulse');
                }
            }

        setTimeout(() => {
            winTime.textContent = `Time: ${formatTime(timerSeconds)}`;
            winMistakes.textContent = `Mistakes: ${mistakes} / ${MAX_MISTAKES}`;
            winOverlay.classList.remove('hidden');
        }, 600);
    }

    // ── Drag Handling ──────────────────────────────────────

    function determineDragAction(r, c, button) {
        const current = playerGrid[r][c];
        if (button === 2) {
            // Right click: toggle mark
            return current === 2 ? 'clear' : 'mark';
        }
        // Left click: toggle fill
        return current === 1 ? 'clear' : 'fill';
    }

    function applyDragToCell(r, c) {
        if (dragAction === 'fill') applyAction(r, c, 1);
        else if (dragAction === 'mark') applyAction(r, c, 2);
        else if (dragAction === 'clear') applyAction(r, c, 0);
    }

    function clearDragPreviews() {
        gridEl.querySelectorAll('.drag-preview, .drag-preview-mark, .drag-preview-clear').forEach(el => {
            el.classList.remove('drag-preview', 'drag-preview-mark', 'drag-preview-clear');
        });
    }

    function cellFromEvent(e) {
        // Handle both mouse and touch
        let target;
        if (e.touches) {
            const touch = e.touches[0] || e.changedTouches[0];
            target = document.elementFromPoint(touch.clientX, touch.clientY);
        } else {
            target = e.target;
        }
        if (!target || !target.classList.contains('cell')) return null;
        return { r: parseInt(target.dataset.r), c: parseInt(target.dataset.c) };
    }

    function onPointerDown(e) {
        if (!gameActive) return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        // Prevent context menu on right click
        if (e.button === 2) e.preventDefault();

        isDragging = true;
        dragButton = e.button === undefined ? 0 : e.button;
        dragStartR = cell.r;
        dragStartC = cell.c;
        dragAxis = null;
        dragAction = determineDragAction(cell.r, cell.c, dragButton);
        dragCells = [{ r: cell.r, c: cell.c }];

        applyDragToCell(cell.r, cell.c);
    }

    function onPointerMove(e) {
        if (!isDragging || !gameActive) return;
        const cell = cellFromEvent(e);
        if (!cell) return;

        // Lock axis after first different cell
        if (dragAxis === null && (cell.r !== dragStartR || cell.c !== dragStartC)) {
            if (cell.r !== dragStartR && cell.c !== dragStartC) {
                // Diagonal — lock to the axis with more movement
                dragAxis = Math.abs(cell.r - dragStartR) >= Math.abs(cell.c - dragStartC) ? 'col' : 'row';
            } else if (cell.r !== dragStartR) {
                dragAxis = 'col'; // moving vertically, locked column
            } else {
                dragAxis = 'row'; // moving horizontally, locked row
            }
        }

        // Constrain to axis
        let targetR = cell.r, targetC = cell.c;
        if (dragAxis === 'row') targetR = dragStartR;
        if (dragAxis === 'col') targetC = dragStartC;

        // Fill all cells between last drag cell and current target
        const last = dragCells[dragCells.length - 1];
        const cellsToFill = [];

        if (targetR === last.r) {
            const step = targetC > last.c ? 1 : -1;
            for (let c = last.c + step; c !== targetC + step; c += step) {
                cellsToFill.push({ r: targetR, c });
            }
        } else if (targetC === last.c) {
            const step = targetR > last.r ? 1 : -1;
            for (let r = last.r + step; r !== targetR + step; r += step) {
                cellsToFill.push({ r, c: targetC });
            }
        }

        for (const { r, c } of cellsToFill) {
            if (!dragCells.some(dc => dc.r === r && dc.c === c)) {
                dragCells.push({ r, c });
                applyDragToCell(r, c);
            }
        }
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        dragCells = [];
        dragAxis = null;
        clearDragPreviews();
    }

    // ── Event Wiring ───────────────────────────────────────

    gridEl.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    gridEl.addEventListener('contextmenu', e => e.preventDefault());

    // Touch support
    gridEl.addEventListener('touchstart', e => {
        e.preventDefault();
        const fakeEvent = { button: 0, target: e.target, touches: e.touches };
        onPointerDown(fakeEvent);
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (isDragging) e.preventDefault();
        onPointerMove({ touches: e.touches });
    }, { passive: false });

    document.addEventListener('touchend', () => onPointerUp());

    // Long press on touch for mark mode
    let longPressTimer = null;
    gridEl.addEventListener('touchstart', e => {
        const cell = cellFromEvent(e);
        if (!cell) return;
        longPressTimer = setTimeout(() => {
            // Switch drag action to mark if we haven't moved
            if (isDragging && dragCells.length === 1) {
                // Undo the fill we did on touchstart
                undo();
                dragAction = determineDragAction(cell.r, cell.c, 2);
                applyDragToCell(cell.r, cell.c);
            }
        }, 400);
    }, { passive: true });

    gridEl.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    gridEl.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });

    // Keyboard undo
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        }
    });

    undoBtn.addEventListener('click', undo);

    // Size buttons
    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            size = parseInt(btn.dataset.size);
            newGame();
        });
    });

    newGameBtn.addEventListener('click', newGame);
    winNewGame.addEventListener('click', () => {
        winOverlay.classList.add('hidden');
        newGame();
    });
    gameOverNew.addEventListener('click', () => {
        gameOverOvl.classList.add('hidden');
        newGame();
    });

    // ── New Game ───────────────────────────────────────────

    function newGame() {
        // Generate solution
        solution = generatePuzzle(size);

        // Compute clues
        rowClues = solution.map(row => computeClues(row));
        colClues = [];
        for (let c = 0; c < size; c++) {
            colClues.push(computeClues(getCol(solution, c)));
        }

        // Reset player state
        playerGrid = Array.from({ length: size }, () => Array(size).fill(0));
        history = [];
        mistakes = 0;
        mistakeSpan.textContent = `0 / ${MAX_MISTAKES}`;
        undoBtn.disabled = true;
        gameActive = true;

        // Hide overlays
        winOverlay.classList.add('hidden');
        gameOverOvl.classList.add('hidden');

        renderBoard();
        startTimer();
    }

    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (gameActive || playerGrid.length) renderBoard();
        }, 150);
    });

    // ── Init ───────────────────────────────────────────────
    newGame();

})();
