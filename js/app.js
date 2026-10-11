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
    var params = new URLSearchParams(window.location.search);
    var gameSlug = params.get('game');

    if (gameSlug && GAMES[gameSlug]) {
      selectGame(gameSlug);
    }
    // Otherwise the welcome screen is already visible by default
  }

  init();
})();
