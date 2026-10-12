/**
 * Game Studio — Dashboard Controller
 *
 * Manages game selection, iframe loading, sidebar state,
 * and responsive behaviour for the main dashboard.
 */
(function () {
  'use strict';

  /* -------------------------------------------------------
     DOM references
     ------------------------------------------------------- */
  const sidebar        = document.getElementById('sidebar');
  const gameList       = document.getElementById('gameList');
  const welcomeScreen  = document.getElementById('welcomeScreen');
  const gameFrame      = document.getElementById('gameFrame');
  const gameIframe     = document.getElementById('gameIframe');
  const frameLoader    = document.getElementById('frameLoader');
  const homeBtn        = document.getElementById('homeBtn');
  const sidebarToggle  = document.getElementById('sidebarToggle');

  /* -------------------------------------------------------
     State
     ------------------------------------------------------- */
  let activeGame = null;   // slug of the currently loaded game
  let overlay    = null;   // mobile overlay element (created lazily)

  /* -------------------------------------------------------
     Internationalization (i18n)
     ------------------------------------------------------- */
  var i18n = {
    en: {
      home: 'Home',
      library: 'Library',
      cardGame: 'Card Game',
      tileMatching: 'Tile Matching',
      numberPuzzle: 'Number Puzzle',
      logicPuzzle: 'Logic Puzzle',
      gameCount: '4 games',
      welcomeTitle: 'Welcome to <strong>Game Studio</strong>',
      welcomeSub: 'Pick a game from the library or choose one below to start playing.',
      solitaireDesc: 'The timeless card game. Stack, sort, and clear the tableau.',
      mahjongDesc: 'Match tiles and clear the board in this classic puzzle.',
      sudokuDesc: 'Fill the grid so every row, column, and box has 1-9.',
      nonogramDesc: 'Reveal hidden pictures using number clues on each axis.',
      playNow: 'Play Now',
      loading: 'Loading game…'
    },
    tr: {
      home: 'Ana Sayfa',
      library: 'Kütüphane',
      cardGame: 'Kart Oyunu',
      tileMatching: 'Taş Eşleştirme',
      numberPuzzle: 'Sayı Bulmacası',
      logicPuzzle: 'Mantık Bulmacası',
      gameCount: '4 oyun',
      welcomeTitle: '<strong>Game Studio</strong>\'ya Hoş Geldiniz',
      welcomeSub: 'Kütüphaneden bir oyun seçin veya aşağıdan birini seçerek oynamaya başlayın.',
      solitaireDesc: 'Zamansız kart oyunu. İstifle, sırala ve masayı temizle.',
      mahjongDesc: 'Taşları eşleştir ve tahtayı temizle.',
      sudokuDesc: 'Her satır, sütun ve kutu 1-9 içerecek şekilde ızgarayı doldur.',
      nonogramDesc: 'Sayı ipuçlarını kullanarak gizli resimleri ortaya çıkar.',
      playNow: 'Oyna',
      loading: 'Oyun yükleniyor…'
    }
  };

  function currentLang() {
    try { return localStorage.getItem('lang') || 'tr'; } catch (e) { return 'tr'; }
  }

  function applyLang(lang) {
    if (!lang) lang = currentLang();
    var t = i18n[lang] || i18n.tr;

    // Update all elements with data-i18n (textContent)
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    // Update all elements with data-i18n-html (innerHTML — for tags like <strong>)
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (t[key] !== undefined) el.innerHTML = t[key];
    });

    // Update lang toggle button styles
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('lang-btn--active', btn.dataset.lang === lang);
    });

    // Notify iframe game of language change
    if (gameIframe && gameIframe.contentWindow && activeGame) {
      try {
        gameIframe.contentWindow.postMessage({ type: 'lang', lang: lang }, '*');
      } catch (e) {}
    }
  }

  // Language toggle click handler
  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lang = btn.dataset.lang;
      try { localStorage.setItem('lang', lang); } catch (e) {}
      applyLang(lang);
    });
  });

  /* -------------------------------------------------------
     Game registry — easy to extend later
     ------------------------------------------------------- */
  const GAMES = {
    solitaire : { name: 'Solitaire', path: 'games/solitaire/index.html' },
    mahjong   : { name: 'Mahjong',   path: 'games/mahjong/index.html'   },
    sudoku    : { name: 'Sudoku',    path: 'games/sudoku/index.html'    },
    nonogram  : { name: 'Nonogram',  path: 'games/nonogram/index.html'  },
  };

  /* -------------------------------------------------------
     Core: Select & load a game
     ------------------------------------------------------- */
  function selectGame(slug) {
    if (!GAMES[slug]) return;
    if (slug === activeGame) return;   // already showing

    activeGame = slug;

    // Update sidebar active state
    gameList.querySelectorAll('.game-card').forEach(function (btn) {
      btn.classList.toggle('game-card--active', btn.dataset.game === slug);
    });

    // Transition: hide welcome, show frame + loader
    welcomeScreen.hidden = true;
    gameFrame.hidden     = false;
    frameLoader.hidden   = false;
    gameIframe.classList.remove('game-frame__iframe--loaded');

    // Small delay so the loader is visible before we start loading
    requestAnimationFrame(function () {
      gameIframe.src = GAMES[slug].path;
    });

    // Update document title
    document.title = GAMES[slug].name + ' — Game Studio';

    // Close mobile sidebar if open
    closeSidebar();

    // Push state so the back button works
    if (window.history && window.history.pushState) {
      var url = new URL(window.location);
      url.searchParams.set('game', slug);
      window.history.pushState({ game: slug }, '', url);
    }
  }

  /* -------------------------------------------------------
     Show welcome / home screen
     ------------------------------------------------------- */
  function showHome() {
    activeGame = null;

    // Clear sidebar active states
    gameList.querySelectorAll('.game-card').forEach(function (btn) {
      btn.classList.remove('game-card--active');
    });

    // Stop any loading iframe
    gameIframe.src = 'about:blank';
    gameIframe.classList.remove('game-frame__iframe--loaded');

    // Swap visibility
    gameFrame.hidden     = true;
    welcomeScreen.hidden = false;

    document.title = 'Game Studio';

    // Update URL
    if (window.history && window.history.pushState) {
      var url = new URL(window.location);
      url.searchParams.delete('game');
      window.history.replaceState(null, '', url);
    }
  }

  /* -------------------------------------------------------
     Iframe load event
     ------------------------------------------------------- */
  gameIframe.addEventListener('load', function () {
    // Only fade in when a real game page has loaded
    if (!gameIframe.src || gameIframe.src === 'about:blank') return;
    frameLoader.hidden = true;
    gameIframe.classList.add('game-frame__iframe--loaded');

    // Send current language to the loaded game
    try {
      gameIframe.contentWindow.postMessage({ type: 'lang', lang: currentLang() }, '*');
    } catch (e) {}
  });

  /* -------------------------------------------------------
     Event delegation: sidebar game cards
     ------------------------------------------------------- */
  gameList.addEventListener('click', function (e) {
    var card = e.target.closest('.game-card');
    if (card && card.dataset.game) {
      selectGame(card.dataset.game);
    }
  });

  /* -------------------------------------------------------
     Event delegation: welcome screen cards
     ------------------------------------------------------- */
  welcomeScreen.addEventListener('click', function (e) {
    var card = e.target.closest('.welcome__card');
    if (card && card.dataset.game) {
      selectGame(card.dataset.game);
    }
  });

  /* -------------------------------------------------------
     Home button
     ------------------------------------------------------- */
  homeBtn.addEventListener('click', showHome);

  /* -------------------------------------------------------
     Mobile sidebar toggle
     ------------------------------------------------------- */
  function openSidebar() {
    sidebar.classList.add('sidebar--open');
    sidebarToggle.setAttribute('aria-expanded', 'true');
    getOverlay().classList.add('sidebar-overlay--visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('sidebar--open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
    if (overlay) {
      overlay.classList.remove('sidebar-overlay--visible');
    }
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('sidebar--open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  /** Lazily create the backdrop overlay element */
  function getOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.addEventListener('click', closeSidebar);
      document.body.appendChild(overlay);
      // Force a reflow so the transition works on first open
      void overlay.offsetWidth;
    }
    return overlay;
  }

  sidebarToggle.addEventListener('click', toggleSidebar);

  /* -------------------------------------------------------
     Keyboard shortcuts
     ------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    // Escape closes mobile sidebar or returns home
    if (e.key === 'Escape') {
      if (sidebar.classList.contains('sidebar--open')) {
        closeSidebar();
      } else if (activeGame) {
        showHome();
      }
    }
  });

  /* -------------------------------------------------------
     Browser back/forward (popstate)
     ------------------------------------------------------- */
  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.game && GAMES[e.state.game]) {
      // Directly set to avoid pushing another history entry
      activeGame = null;  // reset so selectGame doesn't short-circuit
      selectGame(e.state.game);
    } else {
      showHome();
    }
  });

  /* -------------------------------------------------------
     Init: check URL params on first load
     ------------------------------------------------------- */
  function init() {
    applyLang();

    var params = new URLSearchParams(window.location.search);
    var gameSlug = params.get('game');

    if (gameSlug && GAMES[gameSlug]) {
      selectGame(gameSlug);
    }
    // Otherwise the welcome screen is already visible by default
  }

  init();
})();
