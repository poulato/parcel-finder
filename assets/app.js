var API_BASE = '/api';

// --- App Menu (hamburger) ---

function toggleAppMenu() {
  var menu = document.getElementById('appMenu');
  var backdrop = document.getElementById('appMenuBackdrop');
  if (menu.classList.contains('hidden') || !menu.classList.contains('open')) {
    menu.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(function() { menu.classList.add('open'); });
  } else {
    closeAppMenu();
  }
}
function closeAppMenu() {
  var menu = document.getElementById('appMenu');
  var backdrop = document.getElementById('appMenuBackdrop');
  menu.classList.remove('open');
  setTimeout(function() { menu.classList.add('hidden'); backdrop.classList.add('hidden'); }, 250);
}

// --- Sidebar & Navigation ---

function switchTab(tabName) {
  closeSavePanel();
  if (typeof closeSaleOverlay === 'function') closeSaleOverlay();
  document.querySelectorAll('.sidebar-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.sidebar-view').forEach(function(view) {
    view.classList.toggle('active', view.id === 'view' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  });
  if (tabName === 'sale' && typeof loadSaleListings === 'function') {
    loadSaleListings();
    var sb = document.getElementById('searchBar');
    var sbt = document.getElementById('searchBarText');
    if (sb && sbt) { sbt.textContent = 'Search parcels'; sb.classList.remove('has-result'); }
  } else if (typeof clearSaleMarkers === 'function') {
    clearSaleMarkers();
  }
  var tabKey = tabName === 'details' ? 'search' : (tabName === 'listParcels' ? 'list' : tabName);
  if (['search', 'list', 'sale'].indexOf(tabKey) !== -1) {
    var u = new URL(window.location.href);
    u.searchParams.set('tab', tabKey);
    history.replaceState(null, '', u.toString());
  }
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

function handleSearchBarClear() {
  if (isSaleTabActive()) {
    document.getElementById('backToSaleList').click();
    return;
  }
  doClear();
  openSearchPanel();
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

function isTabOwnedView(tab) {
  var cur = document.querySelector('.sidebar-view.active');
  if (!cur) return false;
  var id = cur.id;
  if (tab === 'sale') return id === 'viewSale' || id === 'viewSaleDetail';
  if (tab === 'search') return id === 'viewSearch' || id === 'viewDetails';
  if (tab === 'list') return id === 'viewList' || id === 'viewListParcels';
  return id === 'view' + tab.charAt(0).toUpperCase() + tab.slice(1);
}

function handleTabClick(tab, btn, isMobileTab) {
  var effectiveTab = (tab === 'search' && currentParcel) ? 'details' : tab;
  var isOpen = !sidebar.classList.contains('hidden');
  var sameTab = isTabOwnedView(tab);

  if (sameTab && isOpen) {
    closeSidebar();
    return;
  }
  if (sameTab && !isOpen) {
    openSidebar();
    if (isMobileTab) {
      document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    } else {
      document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    }
    btn.classList.add('active');
    return;
  }

  if (tab === 'list') doClear();
  if (tab === 'search') { doClear(); effectiveTab = 'search'; }
  if (tab === 'sale') {
    var u = new URL(window.location.href);
    u.searchParams.delete('listing');
    history.replaceState(null, '', u.toString());
  }
  switchTab(effectiveTab);
  if (isMobileTab) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
  }
  btn.classList.add('active');
  if (!isOpen) openSidebar();
}

// --- Bottom tabs (mobile) ---
document.querySelectorAll('.bottom-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    handleTabClick(this.getAttribute('data-tab'), this, true);
  });
});

// --- Rail buttons (desktop) ---
document.querySelectorAll('.rail-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    handleTabClick(this.getAttribute('data-tab'), this, false);
    switchTab(effectiveTab);
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

var params = new URLSearchParams(window.location.search);
var shareToken = params.get('share');

if (shareToken) {
  loadSharedList(shareToken);
} else if (authUser) {
  loadLists().then(function() {
    var listParam = params.get('list');
    if (listParam) {
      openListParcels(listParam).then(function() {
        if (currentListParcels.length) showAllListParcels(currentListParcels);
      });
      switchTab('listParcels');
      if (isMobile()) {
        document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
        var savedBtn = document.querySelector('.bottom-tab[data-tab="list"]');
        if (savedBtn) savedBtn.classList.add('active');
      } else {
        document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
        var savedRail = document.querySelector('.rail-btn[data-tab="list"]');
        if (savedRail) savedRail.classList.add('active');
      }
      openSidebar();
    }
  });
}
initGoogleSignIn();

map.on('moveend', function() {
  if (!currentParcel) return;
  updateURL(
    currentParcel.sheet, currentParcel.plan_nbr,
    currentParcel.parcel_nbr, currentParcel.dist_code
  );
});

var listingsUrl = '/listings';

document.getElementById('railListBtn').addEventListener('click', function() {
  window.location.href = listingsUrl;
});
document.getElementById('bottomListBtn').addEventListener('click', function() {
  window.location.href = listingsUrl;
});

var _urlTabParam = new URLSearchParams(window.location.search).get('tab');
if (_urlTabParam && _urlTabParam !== 'search') { _skipTabSwitch = true; }
loadFromURL();

(function() {
  var tabParam = _urlTabParam;
  if (tabParam && ['search', 'list', 'sale'].includes(tabParam)) {
    switchTab(tabParam === 'search' ? (currentParcel ? 'details' : 'search') : tabParam);
    if (isMobile()) {
      document.querySelectorAll('.bottom-tab').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === (tabParam === 'details' ? 'search' : tabParam));
      });
    } else {
      document.querySelectorAll('.rail-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === (tabParam === 'details' ? 'search' : tabParam));
      });
    }
    openSidebar();
  }
})();
