/* =============================================================
   SUDOKU  --  Complete game engine
   ============================================================= */
(() => {
  "use strict";

  /* ---------- constants ---------- */
  const BOARD = 9;
  const BOX   = 3;
  const EMPTY = 0;

  const DIFFICULTY_MAP = {
    easy:   { clues: 42 },   // 42 given -> 39 to solve
    medium: { clues: 32 },
    hard:   { clues: 25 },
  };

  /* ---------- state ---------- */
  let solution    = [];   // 9x9 solved grid
  let puzzle      = [];   // 9x9 starting grid (0 = blank)
  let board       = [];   // 9x9 current player grid
  let notes       = [];   // 9x9 array of Sets
  let history     = [];   // undo stack [{r, c, prevVal, prevNotes}]
  let selectedR   = -1;
  let selectedC   = -1;
  let noteMode    = false;
  let autoCheck   = false;
  let timerSec    = 0;
  let timerRef    = null;
  let gameWon     = false;
  let difficulty  = "easy";

  /* ---------- DOM refs (filled in init) ---------- */
  let gridEl, timerEl, overlayEl, overlayMsg;
  let sizeGrid = () => {};

  /* =============================================================
     SUDOKU GENERATOR
     ============================================================= */

  /** Return a deep-copy 9x9 zero grid */
  function emptyGrid() {
    return Array.from({ length: BOARD }, () => new Array(BOARD).fill(EMPTY));
  }

  /** Check if placing `num` at (r,c) is valid on `grid` */
  function isValid(grid, r, c, num) {
    for (let i = 0; i < BOARD; i++) {
      if (grid[r][i] === num) return false;
      if (grid[i][c] === num) return false;
    }
    const br = Math.floor(r / BOX) * BOX;
    const bc = Math.floor(c / BOX) * BOX;
    for (let i = br; i < br + BOX; i++)
      for (let j = bc; j < bc + BOX; j++)
        if (grid[i][j] === num) return false;
    return true;
  }

  /** Shuffle an array in place (Fisher-Yates) */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Fill `grid` completely using randomized backtracking. Returns true on success. */
  function fillGrid(grid) {
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        if (grid[r][c] !== EMPTY) continue;
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const n of nums) {
          if (isValid(grid, r, c, n)) {
            grid[r][c] = n;
            if (fillGrid(grid)) return true;
            grid[r][c] = EMPTY;
          }
        }
        return false;
      }
    }
    return true;
  }

  /** Count solutions (stop early at 2). Returns 0, 1, or 2. */
  function countSolutions(grid, limit = 2) {
    let count = 0;
    function solve() {
      if (count >= limit) return;
      for (let r = 0; r < BOARD; r++) {
        for (let c = 0; c < BOARD; c++) {
          if (grid[r][c] !== EMPTY) continue;
          for (let n = 1; n <= 9; n++) {
            if (isValid(grid, r, c, n)) {
              grid[r][c] = n;
              solve();
              grid[r][c] = EMPTY;
              if (count >= limit) return;
            }
          }
          return; // no valid number -> backtrack
        }
      }
      count++;
    }
    solve();
    return count;
  }

  /** Generate a puzzle with a unique solution.
   *  Returns {solution, puzzle}. */
  function generatePuzzle(diff) {
    const sol = emptyGrid();
    fillGrid(sol);

    // deep copy for puzzle
    const puz = sol.map(row => row.slice());

    const clues = DIFFICULTY_MAP[diff].clues;
    const cellsToRemove = 81 - clues;

    // Build a shuffled list of all cell indices
    const indices = shuffle(
      Array.from({ length: 81 }, (_, i) => i)
    );

    let removed = 0;
    for (const idx of indices) {
      if (removed >= cellsToRemove) break;
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      const backup = puz[r][c];
      puz[r][c] = EMPTY;
      // Make a copy for counting
      const copy = puz.map(row => row.slice());
      if (countSolutions(copy) !== 1) {
        puz[r][c] = backup; // restore – removal would break uniqueness
      } else {
        removed++;
      }
    }

    return { solution: sol, puzzle: puz };
  }

  /* =============================================================
     GAME MANAGEMENT
     ============================================================= */

  function startNewGame(diff) {
    difficulty = diff || difficulty;
    gameWon = false;
    noteMode = false;
    autoCheck = false;
    history = [];
    selectedR = -1;
    selectedC = -1;
    timerSec = 0;
    clearInterval(timerRef);

    const gen = generatePuzzle(difficulty);
    solution = gen.solution;
    puzzle   = gen.puzzle;
    board    = puzzle.map(row => row.slice());
    notes    = Array.from({ length: BOARD }, () =>
      Array.from({ length: BOARD }, () => new Set())
    );

    updateTimerDisplay();
    timerRef = setInterval(() => {
      if (!gameWon) { timerSec++; updateTimerDisplay(); }
    }, 1000);

    renderGrid();
    renderNumpad();
    updateButtons();
    hideOverlay();
    requestAnimationFrame(sizeGrid);
  }

  /* =============================================================
     RENDERING
     ============================================================= */

  function renderGrid() {
    gridEl.innerHTML = "";
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener("click", () => selectCell(r, c));

        if (puzzle[r][c] !== EMPTY) {
          cell.textContent = puzzle[r][c];
          cell.classList.add("given");
        } else if (board[r][c] !== EMPTY) {
          cell.textContent = board[r][c];
          cell.classList.add("user");
          if (board[r][c] !== solution[r][c]) {
            cell.classList.add("error");
          }
        } else if (notes[r][c].size > 0) {
          const ng = document.createElement("div");
          ng.className = "notes-grid";
          for (let n = 1; n <= 9; n++) {
            const sp = document.createElement("span");
            sp.textContent = notes[r][c].has(n) ? n : "";
            ng.appendChild(sp);
          }
          cell.appendChild(ng);
        }

        gridEl.appendChild(cell);
      }
    }
    highlightCells();
  }

  function getCellEl(r, c) {
    return gridEl.children[r * BOARD + c];
  }

  function refreshCell(r, c) {
    const cell = getCellEl(r, c);
    if (!cell) return;
    // Clear content
    cell.textContent = "";
    cell.className = "cell";
    cell.dataset.row = r;
    cell.dataset.col = c;

    if (puzzle[r][c] !== EMPTY) {
      cell.textContent = puzzle[r][c];
      cell.classList.add("given");
    } else if (board[r][c] !== EMPTY) {
      cell.textContent = board[r][c];
      cell.classList.add("user");
      if (board[r][c] !== solution[r][c]) {
        cell.classList.add("error");
      }
    } else if (notes[r][c].size > 0) {
      const ng = document.createElement("div");
      ng.className = "notes-grid";
      for (let n = 1; n <= 9; n++) {
        const sp = document.createElement("span");
        sp.textContent = notes[r][c].has(n) ? n : "";
        ng.appendChild(sp);
      }
      cell.appendChild(ng);
    }
  }

  function highlightCells() {
    // Clear all highlights first
    for (let i = 0; i < gridEl.children.length; i++) {
      const cell = gridEl.children[i];
      cell.classList.remove("selected", "highlight-line", "highlight-same", "error-bg");
    }

    if (selectedR < 0 || selectedC < 0) return;

    const selVal = board[selectedR][selectedC];
    const boxR = Math.floor(selectedR / BOX) * BOX;
    const boxC = Math.floor(selectedC / BOX) * BOX;

    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const cell = getCellEl(r, c);
        // Selected
        if (r === selectedR && c === selectedC) {
          cell.classList.add("selected");
        }
        // Same row, col, or box
        const sameRow = r === selectedR;
        const sameCol = c === selectedC;
        const sameBox = r >= boxR && r < boxR + BOX && c >= boxC && c < boxC + BOX;
        if ((sameRow || sameCol || sameBox) && !(r === selectedR && c === selectedC)) {
          cell.classList.add("highlight-line");
        }
        // Same number
        if (selVal !== EMPTY && board[r][c] === selVal && !(r === selectedR && c === selectedC)) {
          cell.classList.add("highlight-same");
        }
        // Conflict highlighting for auto-check
        if (board[r][c] !== EMPTY && puzzle[r][c] === EMPTY && board[r][c] !== solution[r][c]) {
          cell.classList.add("error");
          cell.classList.add("error-bg");
        }
      }
    }
  }

  function renderNumpad() {
    const pad = document.getElementById("numpad");
    pad.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.textContent = n;
      btn.dataset.num = n;
      btn.addEventListener("click", () => inputNumber(n));
      // Check if all 9 copies are placed
      let count = 0;
      for (let r = 0; r < BOARD; r++)
        for (let c = 0; c < BOARD; c++)
          if (board[r][c] === n) count++;
      if (count >= 9) btn.classList.add("num-complete");
      pad.appendChild(btn);
    }
  }

  function updateTimerDisplay() {
    if (!timerEl) return;
    const m = Math.floor(timerSec / 60);
    const s = timerSec % 60;
    timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  function updateButtons() {
    const noteBtn = document.getElementById("btn-notes");
    if (noteBtn) noteBtn.classList.toggle("active", noteMode);
    const checkBtn = document.getElementById("btn-autocheck");
    if (checkBtn) checkBtn.classList.toggle("active", autoCheck);
  }

  /* =============================================================
     INTERACTION
     ============================================================= */

  function selectCell(r, c) {
    if (gameWon) return;
    selectedR = r;
    selectedC = c;
    highlightCells();
  }

  function inputNumber(num) {
    if (gameWon) return;
    if (selectedR < 0 || selectedC < 0) return;
    const r = selectedR, c = selectedC;
    if (puzzle[r][c] !== EMPTY) return; // given cell

    if (noteMode) {
      // Toggle note
      const prevNotes = new Set(notes[r][c]);
      const prevVal = board[r][c];
      if (board[r][c] !== EMPTY) {
        // Clear the main number and add note
        history.push({ r, c, prevVal, prevNotes });
        board[r][c] = EMPTY;
        notes[r][c] = new Set([num]);
      } else {
        history.push({ r, c, prevVal: EMPTY, prevNotes });
        if (notes[r][c].has(num)) {
          notes[r][c].delete(num);
        } else {
          notes[r][c].add(num);
        }
      }
      refreshCell(r, c);
      highlightCells();
    } else {
      // Place number
      const prevVal = board[r][c];
      const prevNotes = new Set(notes[r][c]);
      if (prevVal === num) {
        // Same number = erase
        history.push({ r, c, prevVal, prevNotes });
        board[r][c] = EMPTY;
      } else {
        history.push({ r, c, prevVal, prevNotes });
        board[r][c] = num;
        notes[r][c].clear();
        // Remove this number from notes in same row/col/box
        removeNoteFromPeers(r, c, num);
      }
      refreshCell(r, c);
      highlightCells();
      renderNumpad();
      // Pop animation
      const cell = getCellEl(r, c);
      if (cell && board[r][c] !== EMPTY) {
        cell.classList.add("pop");
        setTimeout(() => cell.classList.remove("pop"), 200);
      }
      // Check for conflicts if auto-check
      if (autoCheck) {
        highlightCells();
      }
      checkWin();
    }
  }

  function eraseCell() {
    if (gameWon) return;
    if (selectedR < 0 || selectedC < 0) return;
    const r = selectedR, c = selectedC;
    if (puzzle[r][c] !== EMPTY) return;

    const prevVal = board[r][c];
    const prevNotes = new Set(notes[r][c]);
    if (prevVal === EMPTY && prevNotes.size === 0) return;

    history.push({ r, c, prevVal, prevNotes });
    board[r][c] = EMPTY;
    notes[r][c].clear();
    refreshCell(r, c);
    highlightCells();
    renderNumpad();
  }

  function undo() {
    if (gameWon) return;
    if (history.length === 0) return;
    const { r, c, prevVal, prevNotes } = history.pop();
    board[r][c] = prevVal;
    notes[r][c] = new Set(prevNotes);
    refreshCell(r, c);
    selectedR = r;
    selectedC = c;
    highlightCells();
    renderNumpad();
  }

  function removeNoteFromPeers(r, c, num) {
    const boxR = Math.floor(r / BOX) * BOX;
    const boxC = Math.floor(c / BOX) * BOX;
    for (let i = 0; i < BOARD; i++) {
      // Same row
      if (notes[r][i].has(num)) { notes[r][i].delete(num); refreshCell(r, i); }
      // Same col
      if (notes[i][c].has(num)) { notes[i][c].delete(num); refreshCell(i, c); }
    }
    // Same box
    for (let dr = boxR; dr < boxR + BOX; dr++)
      for (let dc = boxC; dc < boxC + BOX; dc++)
        if (notes[dr][dc].has(num)) { notes[dr][dc].delete(num); refreshCell(dr, dc); }
  }

  function toggleNoteMode() {
    noteMode = !noteMode;
    updateButtons();
  }

  function toggleAutoCheck() {
    autoCheck = !autoCheck;
    updateButtons();
    highlightCells();
    // Re-render user cells to show/hide errors
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++)
        if (puzzle[r][c] === EMPTY && board[r][c] !== EMPTY)
          refreshCell(r, c);
    highlightCells();
  }

  function checkSolution() {
    let hasError = false;
    for (let r = 0; r < BOARD; r++) {
      for (let c = 0; c < BOARD; c++) {
        const cell = getCellEl(r, c);
        if (puzzle[r][c] === EMPTY && board[r][c] !== EMPTY && board[r][c] !== solution[r][c]) {
          cell.classList.add("error", "error-bg");
          hasError = true;
        }
      }
    }
    if (!hasError) {
      // Briefly flash all cells green-ish if no errors found
      for (let r = 0; r < BOARD; r++) {
        for (let c = 0; c < BOARD; c++) {
          if (board[r][c] !== EMPTY) {
            const cell = getCellEl(r, c);
            cell.style.transition = "background 0.3s";
            cell.style.background = "rgba(46, 213, 115, 0.15)";
            setTimeout(() => { cell.style.background = ""; }, 800);
          }
        }
      }
    }
  }

  function checkWin() {
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++)
        if (board[r][c] !== solution[r][c]) return;
    // WIN!
    gameWon = true;
    clearInterval(timerRef);
    // Animate grid
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++)
        getCellEl(r, c).classList.add("win");
    showOverlay();
  }

  function showOverlay() {
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    overlayMsg.textContent = `Difficulty: ${diffLabel}  |  Time: ${timerEl.textContent}`;
    overlayEl.classList.add("visible");
  }

  function hideOverlay() {
    overlayEl.classList.remove("visible");
  }

  /* =============================================================
     KEYBOARD
     ============================================================= */
  function handleKeyDown(e) {
    if (gameWon) return;

    const key = e.key;
    // Number input
    if (key >= "1" && key <= "9") {
      e.preventDefault();
      inputNumber(parseInt(key));
      return;
    }

    // Delete / Backspace
    if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      eraseCell();
      return;
    }

    // Arrow navigation
    if (key.startsWith("Arrow")) {
      e.preventDefault();
      let r = selectedR < 0 ? 4 : selectedR;
      let c = selectedC < 0 ? 4 : selectedC;
      if (key === "ArrowUp")    r = (r - 1 + BOARD) % BOARD;
      if (key === "ArrowDown")  r = (r + 1) % BOARD;
      if (key === "ArrowLeft")  c = (c - 1 + BOARD) % BOARD;
      if (key === "ArrowRight") c = (c + 1) % BOARD;
      selectCell(r, c);
      return;
    }

    // N for notes
    if (key === "n" || key === "N") {
      e.preventDefault();
      toggleNoteMode();
      return;
    }

    // Z for undo
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      undo();
      return;
    }
  }

  /* =============================================================
     INIT
     ============================================================= */
  function init() {
    gridEl     = document.getElementById("grid");
    timerEl    = document.getElementById("timer");
    overlayEl  = document.getElementById("overlay");
    overlayMsg  = document.getElementById("overlay-msg");

    // Toolbar
    document.getElementById("btn-new").addEventListener("click", () => {
      const diff = document.getElementById("select-diff").value;
      startNewGame(diff);
    });

    // Actions
    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("btn-erase").addEventListener("click", eraseCell);
    document.getElementById("btn-notes").addEventListener("click", toggleNoteMode);
    document.getElementById("btn-check").addEventListener("click", checkSolution);
    document.getElementById("btn-autocheck").addEventListener("click", toggleAutoCheck);

    // Overlay
    document.getElementById("btn-play-again").addEventListener("click", () => {
      const diff = document.getElementById("select-diff").value;
      startNewGame(diff);
    });

    // Keyboard
    document.addEventListener("keydown", handleKeyDown);

    // Theme system
    const THEMES = [
      {id:'gazete', name:'Gazete', sw:['#ece5d3','#161412']},
      {id:'klasik', name:'Klasik', sw:['#f6f4ef','#2f6fde']},
      {id:'neon',   name:'Neon',   sw:['#120828','#00e5ff']},
      {id:'pastel', name:'Pastel', sw:['#ffe1e8','#7a68f0'], tiles:true},
    ];
    const THEME_KEY = 'sudoku-theme-v1';
    const themesEl = document.getElementById('themes');

    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.dataset.t = t.id;
      b.innerHTML = '<i class="sw" style="background:linear-gradient(135deg,' + t.sw[0] + ' 50%,' + t.sw[1] + ' 50%)"></i>' + t.name;
      b.addEventListener('click', () => setTheme(t.id));
      themesEl.appendChild(b);
    });

    function setTheme(id) {
      const t = THEMES.find(x => x.id === id) || THEMES.find(x => x.id === 'gazete');
      const root = document.documentElement;
      root.dataset.theme = t.id;
      root.classList.toggle('tiles', !!t.tiles);
      themesEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t.id));
      try { localStorage.setItem(THEME_KEY, t.id); } catch(e) {}
    }

    // URL parameter or localStorage
    let startTheme = new URLSearchParams(location.search).get('tema');
    if (!startTheme) { try { startTheme = localStorage.getItem(THEME_KEY); } catch(e) {} }
    setTheme(startTheme || 'gazete');

    // Size grid to fit viewport
    const wrapper = document.querySelector('.grid-wrapper');
    sizeGrid = function() {
      wrapper.style.width = '';
      wrapper.style.height = '';
      const container = document.querySelector('.game-container');
      const containerH = container.clientHeight;
      const otherH = Array.from(container.children).reduce((sum, el) => {
        if (el === wrapper) return sum;
        return sum + el.offsetHeight;
      }, 0);
      const gaps = (container.children.length - 1) * 10;
      const available = containerH - otherH - gaps;
      const side = Math.min(available, container.clientWidth, 540);
      if (side > 0) {
        wrapper.style.width = side + 'px';
        wrapper.style.height = side + 'px';
      }
    }
    window.addEventListener('resize', sizeGrid);

    // Start — sizeGrid must run AFTER numpad/actions are in the DOM
    startNewGame("easy");
    sizeGrid();
    requestAnimationFrame(sizeGrid);
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
