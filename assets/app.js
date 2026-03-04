var API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8788/api'
  : 'https://geoktimonas-api.hello-118.workers.dev/api';

// --- Sidebar & Navigation ---

function switchTab(tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.sidebar-view').forEach(function(view) {
    view.classList.toggle('active', view.id === 'view' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  });
}

document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
  btn.addEventListener('click', function() { switchTab(this.getAttribute('data-tab')); });
});

var sidebar = document.getElementById('sidebar');
var addToListBtn = document.getElementById('addToListBtn');
var backdropEl = document.getElementById('backdrop');

function isMobile() { return window.innerWidth <= 640; }

function closeSidebar() {
  sidebar.classList.add('hidden');
  closeSavePanel();
  backdropEl.classList.remove('visible');
  if (isMobile()) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
  }
  setTimeout(function() { map.invalidateSize(); }, 300);
}

function openSidebar() {
  sidebar.classList.remove('hidden');
  if (isMobile()) backdropEl.classList.add('visible');
  setTimeout(function() { map.invalidateSize(); }, 300);
}

function openSearchPanel() {
  var tab = currentParcel ? 'details' : 'search';
  switchTab(tab);
  if (isMobile()) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    var mobileBtn = document.querySelector('.bottom-tab[data-tab="search"]');
    if (mobileBtn) mobileBtn.classList.add('active');
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    var searchBtn = document.querySelector('.rail-btn[data-tab="search"]');
    if (searchBtn) searchBtn.classList.add('active');
  }
  openSidebar();
}

// --- Bottom tabs (mobile) ---
document.querySelectorAll('.bottom-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = this.getAttribute('data-tab');
    var isOpen = !sidebar.classList.contains('hidden');
    var currentTab = document.querySelector('.sidebar-view.active');
    var targetId = 'view' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var alreadyShowing = isOpen && currentTab && currentTab.id === targetId;

    if (alreadyShowing) {
      closeSidebar();
      return;
    }

    if (tab === 'list') doClear();
    switchTab(tab);
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    if (!isOpen) openSidebar();
  });
});

// --- Rail buttons (desktop) ---
document.querySelectorAll('.rail-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = this.getAttribute('data-tab');
    var isOpen = !sidebar.classList.contains('hidden');
    var currentTab = document.querySelector('.sidebar-view.active');
    var targetId = 'view' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var alreadyShowing = isOpen && currentTab && currentTab.id === targetId;

    if (alreadyShowing) {
      closeSidebar();
      return;
    }

    if (tab === 'list') doClear();
    switchTab(tab);
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    if (!isOpen) openSidebar();
  });
});

// --- Touch drag to dismiss (mobile) ---
(function() {
  var startY = 0;
  var currentY = 0;
  var dragging = false;

  sidebar.addEventListener('touchstart', function(e) {
    if (!isMobile() || sidebar.classList.contains('hidden')) return;
    var scrollable = sidebar;
    if (scrollable.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = true;
    sidebar.style.transition = 'none';
  }, { passive: true });

  sidebar.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    var dy = currentY - startY;
    if (dy < 0) dy = 0;
    sidebar.style.transform = 'translateY(' + dy + 'px)';
    backdropEl.style.opacity = Math.max(0, 1 - dy / 300);
  }, { passive: true });

  sidebar.addEventListener('touchend', function() {
    if (!dragging) return;
    dragging = false;
    var dy = currentY - startY;
    sidebar.style.transition = '';
    sidebar.style.transform = '';
    backdropEl.style.opacity = '';
    if (dy > 80) {
      closeSidebar();
    }
  });
})();

// --- Prevent map clicks through sidebar ---
L.DomEvent.disableClickPropagation(sidebar);

// --- Add-to-list button in sidebar header ---
addToListBtn.addEventListener('click', function() {
  openSavePanel();
});

// --- Search form ---
document.querySelectorAll('#sidebar input').forEach(function(el) {
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
});

// --- Auth button wiring ---
document.getElementById('authBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  handleAuthClick();
});
document.getElementById('authBtnDesktop').addEventListener('click', function(e) {
  e.stopPropagation();
  handleAuthClick();
});
document.getElementById('userMenuSignOut').addEventListener('click', function() {
  signOut();
});
document.addEventListener('click', function(e) {
  var menu = document.getElementById('userMenu');
  if (!menu.classList.contains('hidden') && !menu.contains(e.target)) {
    closeUserMenu();
  }
});

// --- Init ---
restoreSession();
if (authUser) loadLists();
initGoogleSignIn();

map.on('moveend', function() {
  if (!currentParcel) return;
  updateURL(
    currentParcel.sheet, currentParcel.plan_nbr,
    currentParcel.parcel_nbr, currentParcel.dist_code
  );
});

loadFromURL();

// Check for shared list in URL
(function() {
  var params = new URLSearchParams(window.location.search);
  var shareToken = params.get('share');
  if (shareToken) {
    loadSharedList(shareToken);
  }
})();
