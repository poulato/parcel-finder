var DLS_BASE = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';
var GOOGLE_CLIENT_ID = '284743039293-0lo05gnap8immcls45hqsniv16djtdap.apps.googleusercontent.com';

var authUser = null;
var authToken = null;

function getAuthHeaders() {
  if (!authToken) return {};
  return { 'Authorization': 'Bearer ' + authToken };
}

function onSignIn(response) {
  authToken = response.credential;
  var parts = authToken.split('.');
  var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  authUser = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
  localStorage.setItem('geo_auth_token', authToken);
  localStorage.setItem('geo_auth_user', JSON.stringify(authUser));
  updateAuthUI();
  loadParcelList();
}

function signOut() {
  authUser = null;
  authToken = null;
  localStorage.removeItem('geo_auth_token');
  localStorage.removeItem('geo_auth_user');
  parcelList = [];
  renderParcelList();
  closeUserMenu();
  updateAuthUI();
  if (window.google && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
}

function toggleUserMenu() {
  var menu = document.getElementById('userMenu');
  menu.classList.toggle('hidden');
}

function closeUserMenu() {
  document.getElementById('userMenu').classList.add('hidden');
}

function handleAuthClick() {
  if (authUser) {
    toggleUserMenu();
    return;
  }
  var container = document.getElementById('googleSignInDiv');
  var gBtn = container && (container.querySelector('[role="button"]') || container.querySelector('div[style]'));
  if (gBtn) {
    gBtn.click();
  } else if (window.google && google.accounts) {
    google.accounts.id.prompt();
  }
}

function updateAuthUI() {
  var mobileIcon = document.getElementById('authBtnIcon');
  var mobileAvatar = document.getElementById('authBtnAvatar');
  var desktopIcon = document.getElementById('authBtnDesktopIcon');
  var desktopAvatar = document.getElementById('authBtnDesktopAvatar');
  var desktopText = document.getElementById('authBtnDesktopText');
  var listAuthPrompt = document.getElementById('listAuthPrompt');
  var parcelListWrap = document.getElementById('parcelListWrap');

  if (authUser) {
    mobileIcon.style.display = 'none';
    mobileAvatar.src = authUser.picture;
    mobileAvatar.style.display = 'block';
    desktopIcon.style.display = 'none';
    desktopAvatar.src = authUser.picture;
    desktopAvatar.style.display = 'block';
    desktopText.textContent = authUser.name.split(' ')[0];
    listAuthPrompt.style.display = 'none';
    parcelListWrap.style.display = 'block';
    document.getElementById('userMenuAvatar').src = authUser.picture;
    document.getElementById('userMenuName').textContent = authUser.name;
    document.getElementById('userMenuEmail').textContent = authUser.email;
  } else {
    mobileIcon.style.display = '';
    mobileAvatar.style.display = 'none';
    desktopIcon.style.display = '';
    desktopAvatar.style.display = 'none';
    desktopText.textContent = 'Sign in';
    listAuthPrompt.style.display = '';
    parcelListWrap.style.display = 'none';
  }
}

function restoreSession() {
  var token = localStorage.getItem('geo_auth_token');
  var user = localStorage.getItem('geo_auth_user');
  if (token && user) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp * 1000 > Date.now()) {
        authToken = token;
        authUser = JSON.parse(user);
        updateAuthUI();
        return true;
      }
    } catch (e) {}
    localStorage.removeItem('geo_auth_token');
    localStorage.removeItem('geo_auth_user');
  }
  return false;
}

function initGoogleSignIn() {
  if (!window.google || !google.accounts) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onSignIn,
    auto_select: true,
  });
  var container = document.getElementById('googleSignInDiv');
  if (container) {
    google.accounts.id.renderButton(container, {
      type: 'standard',
      size: 'large',
      theme: 'filled_black',
      text: 'signin_with',
      width: 250,
    });
  }
  var listContainer = document.getElementById('googleSignInList');
  if (listContainer) {
    google.accounts.id.renderButton(listContainer, {
      type: 'standard',
      size: 'large',
      theme: 'filled_black',
      text: 'signin_with',
      width: 250,
    });
  }
  if (!authUser) {
    google.accounts.id.prompt();
  }
}

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
var openBtnMobile = document.getElementById('openBtnMobile');
var addToListBtn = document.getElementById('addToListBtn');
var listHintEl = document.getElementById('listHint');
var parcelListEl = document.getElementById('parcelList');
var parcelListEmptyEl = document.getElementById('parcelListEmpty');
var parcelList = [];
var currentParcel = null;
var API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8787/api'
  : 'https://geoktimonas-api.hello-118.workers.dev/api';

function parcelKey(item) {
  return [item.sheet, item.plan_nbr, item.parcel_nbr, item.dist_code || ''].join('|');
}

function renderParcelList() {
  if (!parcelList.length) {
    parcelListEl.innerHTML = '';
    parcelListEmptyEl.style.display = 'block';
    return;
  }
  parcelListEmptyEl.style.display = 'none';
  parcelListEl.innerHTML = parcelList.map(function(item) {
    var line = 'Parcel ' + item.parcel_nbr + ' • ' + item.sheet + '/' + item.plan_nbr;
    var area = item.municipality || item.district || '—';
    return (
      '<div class="parcel-list-item">' +
        '<div><div>' + line + '</div><div style="color:#94a3b8;">' + area + '</div></div>' +
        '<button data-remove-id="' + item.id + '">Remove</button>' +
      '</div>'
    );
  }).join('');
}

async function loadParcelList() {
  if (!authUser) return;
  try {
    var res = await fetch(API_BASE + '/parcels', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('failed to load list');
    parcelList = await res.json();
    renderParcelList();
  } catch (err) {
    console.error(err);
  }
}

parcelListEl.addEventListener('click', async function(e) {
  var id = e.target.getAttribute('data-remove-id');
  if (!id) return;
  try {
    var res = await fetch(API_BASE + '/parcels/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('failed to remove');
    parcelList = parcelList.filter(function(item) { return item.id !== id; });
    renderParcelList();
    listHintEl.textContent = 'Parcel removed from list.';
    listHintEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    listHintEl.textContent = 'Failed to remove parcel.';
    listHintEl.style.display = 'block';
  }
});

async function saveParcel() {
  if (!currentParcel) return;
  if (!authUser) { handleAuthClick(); return; }
  var key = parcelKey(currentParcel);
  var exists = parcelList.some(function(item) { return parcelKey(item) === key; });
  if (exists) {
    listHintEl.textContent = 'Parcel already in your list.';
    listHintEl.style.display = 'block';
    return;
  }
  try {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders());
    var res = await fetch(API_BASE + '/parcels', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(currentParcel)
    });
    if (!res.ok) throw new Error('failed to add');
    var created = await res.json();
    parcelList.unshift(created);
    renderParcelList();
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

addToListBtn.addEventListener('click', async function() {
  var ok = await saveParcel();
  if (ok) {
    listHintEl.textContent = 'Parcel added to your list.';
    listHintEl.style.display = 'block';
  }
});

var backdropEl = document.getElementById('backdrop');

function closeSidebar() {
  sidebar.classList.add('hidden');
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
function isMobile() { return window.innerWidth <= 640; }

function openSearchPanel() {
  switchTab('search');
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

    switchTab(tab);
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    if (!isOpen) openSidebar();
  });
});

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

    switchTab(tab);
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    if (!isOpen) openSidebar();
  });
});

(function() {
  var startY = 0;
  var currentY = 0;
  var dragging = false;

  sidebar.addEventListener('touchstart', function(e) {
    if (!isMobile() || sidebar.classList.contains('hidden')) return;
    var el = e.target;
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

var map = L.map('map', { maxZoom: 19, zoomControl: false }).setView([35.0, 33.4], 9);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var topoBase = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
).addTo(map);

var satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
);

var dlsLayer = L.esri.dynamicMapLayer({ url: DLS_BASE, opacity: 1, interactive: false }).addTo(map);

var layerControl = L.control.layers({ 'DLS Cadastral + Topo': topoBase, 'Satellite': satellite }, null, { position: 'bottomleft' }).addTo(map);
var parcelLayer = null;

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function dlsQuery(layerId, params) {
  params.f = 'json';
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return fetch(DLS_BASE + '/' + layerId + '/query?' + qs).then(function(r) { return r.json(); });
}

function findParcel(sheet, plan, parcelNbr, distCode) {
  var where = "PARCEL_NBR=" + parcelNbr + " AND SHEET='" + sheet + "' AND PLAN_NBR='" + plan + "'";
  if (distCode) where += " AND DIST_CODE=" + distCode;
  return dlsQuery(0, {
    where: where,
    outFields: 'DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR',
    returnGeometry: 'true',
    outSR: '4326'
  });
}

function findParcelByCoords(lat, lng) {
  return dlsQuery(0, {
    geometry: lng + ',' + lat,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR',
    returnGeometry: 'true',
    outSR: '4326'
  });
}

function spatialLookup(layerId, outFields, lat, lng) {
  return dlsQuery(layerId, {
    geometry: lng + ',' + lat,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: outFields,
    returnGeometry: 'false'
  });
}

function enrich(lat, lng) {
  return Promise.all([
    spatialLookup(12, 'PLNZNT_NAME,PLNZNT_DESC', lat, lng),
    spatialLookup(16, 'VIL_NM_E', lat, lng),
    spatialLookup(15, 'DIST_NM_E', lat, lng)
  ]).then(function(results) {
    var zone = results[0].features && results[0].features[0] ? results[0].features[0].attributes : {};
    var muni = results[1].features && results[1].features[0] ? results[1].features[0].attributes : {};
    var dist = results[2].features && results[2].features[0] ? results[2].features[0].attributes : {};
    return {
      planning_zone: zone.PLNZNT_NAME || '—',
      planning_zone_desc: zone.PLNZNT_DESC || '—',
      municipality: muni.VIL_NM_E || '—',
      district: dist.DIST_NM_E || '—'
    };
  });
}

function centroid(rings) {
  var ring = rings[0], n = ring.length, latSum = 0, lngSum = 0;
  for (var i = 0; i < n; i++) { latSum += ring[i][1]; lngSum += ring[i][0]; }
  return [latSum / n, lngSum / n];
}

var detailsContentEl = document.getElementById('detailsContent');
var detailsActionsEl = document.getElementById('detailsActions');
var detailsAddBtn = document.getElementById('detailsAddBtn');
var detailsShareBtn = document.getElementById('detailsShareBtn');

function buildParcelHTML(attrs, extra) {
  return '<h3>Parcel ' + attrs.PARCEL_NBR + '</h3>' +
    '<div><span class="label">Block:</span> <span class="value">' + (attrs.BLCK_CODE || '—') + '</span></div>' +
    '<div><span class="label">District:</span> <span class="value">' + extra.district + '</span></div>' +
    '<div><span class="label">Municipality:</span> <span class="value">' + extra.municipality + '</span></div>' +
    '<div><span class="label">Sheet / Plan:</span> <span class="value">' + attrs.SHEET + ' / ' + attrs.PLAN_NBR + '</span></div>' +
    '<div><span class="label">Planning Zone:</span> <span class="value">' + extra.planning_zone + '</span></div>' +
    '<div><span class="label">Zone Detail:</span> <span class="value">' + extra.planning_zone_desc + '</span></div>';
}

function showParcel(feature, extra) {
  if (parcelLayer) { map.removeLayer(parcelLayer); }

  var attrs = feature.attributes;
  currentParcel = {
    sheet: attrs.SHEET || '',
    plan_nbr: attrs.PLAN_NBR || '',
    parcel_nbr: attrs.PARCEL_NBR || '',
    dist_code: attrs.DIST_CODE || null,
    district: extra.district || '',
    municipality: extra.municipality || '',
    planning_zone: extra.planning_zone || '',
    planning_zone_desc: extra.planning_zone_desc || '',
    block_code: attrs.BLCK_CODE || ''
  };
  var rings = feature.geometry.rings;
  var coords = rings[0].map(function(p) { return [p[1], p[0]]; });

  parcelLayer = L.polygon(coords, {
    color: '#ff0000', weight: 4, fillColor: '#ff0000', fillOpacity: 0.3
  }).addTo(map);

  var html = buildParcelHTML(attrs, extra);

  detailsContentEl.innerHTML = html;
  detailsActionsEl.style.display = 'flex';
  detailsAddBtn.classList.remove('done');
  switchTab('details');
  if (isMobile()) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
  }
  if (sidebar.classList.contains('hidden')) openSidebar();

  var searchBarEl = document.getElementById('searchBar');
  var searchBarTextEl = document.getElementById('searchBarText');
  if (searchBarEl && searchBarTextEl) {
    searchBarTextEl.textContent = 'Parcel ' + attrs.PARCEL_NBR + ' • ' + attrs.SHEET + '/' + attrs.PLAN_NBR;
    searchBarEl.classList.add('has-result');
  }
}


detailsAddBtn.addEventListener('click', async function() {
  var ok = await saveParcel();
  if (ok) {
    detailsAddBtn.classList.add('done');
    setTimeout(function() { detailsAddBtn.classList.remove('done'); }, 1500);
  }
});

detailsShareBtn.addEventListener('click', function() {
  var url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: 'Parcel', url: url }).catch(function() {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      detailsShareBtn.classList.add('done');
      setTimeout(function() { detailsShareBtn.classList.remove('done'); }, 1500);
    });
  }
});

function doClear() {
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  currentParcel = null;
  var searchBarEl = document.getElementById('searchBar');
  var searchBarTextEl = document.getElementById('searchBarText');
  if (searchBarEl && searchBarTextEl) {
    searchBarTextEl.textContent = 'Search parcels';
    searchBarEl.classList.remove('has-result');
  }
  document.getElementById('sheet').value = '';
  document.getElementById('plan').value = '';
  document.getElementById('parcel').value = '';
  document.getElementById('district').value = '';
  showError('');
  history.replaceState(null, '', window.location.pathname);
  map.setView([35.0, 33.4], 9);
}

function updateURL(sheet, plan, parcelNbr, distCode) {
  var params = new URLSearchParams();
  params.set('sheet', sheet);
  params.set('plan', plan);
  params.set('parcel', parcelNbr);
  if (distCode) params.set('district', distCode);
  var c = map.getCenter();
  params.set('lat', c.lat.toFixed(6));
  params.set('lng', c.lng.toFixed(6));
  params.set('z', map.getZoom());
  history.replaceState(null, '', '?' + params.toString());
}

function doSearch() {
  var sheet = document.getElementById('sheet').value.trim();
  var plan = document.getElementById('plan').value.trim();
  var parcelNbr = document.getElementById('parcel').value.trim();
  var distCode = document.getElementById('district').value;

  showError('');

  if (!sheet || !plan || !parcelNbr) {
    showError('Fill in Sheet, Plan, and Parcel.');
    return;
  }

  var btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching...';

  findParcel(sheet, plan, parcelNbr, distCode)
    .then(function(data) {
      var features = data.features || [];
      if (!features.length) {
        showError('No parcel found. Check the values.');
        btn.disabled = false;
        btn.textContent = 'Find Parcel';
        return;
      }
      var feature = features[0];
      var center = centroid(feature.geometry.rings);
      map.setView([center[0], center[1]], 18);
      updateURL(sheet, plan, parcelNbr, distCode);

      return enrich(center[0], center[1]).then(function(extra) {
        showParcel(feature, extra);
        btn.disabled = false;
        btn.textContent = 'Find Parcel';
      });
    })
    .catch(function(err) {
      showError('DLS query failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Find Parcel';
    });
}

map.on('click', function(e) {
  if (map.getZoom() < 16) {
    if (!isMobile() && !sidebar.classList.contains('hidden')) closeSidebar();
    return;
  }
  showError('');
  findParcelByCoords(e.latlng.lat, e.latlng.lng)
    .then(function(data) {
      var feature = (data.features || [])[0];
      if (!feature) {
        if (!isMobile() && !sidebar.classList.contains('hidden')) closeSidebar();
        return;
      }

      var attrs = feature.attributes;
      document.getElementById('sheet').value = attrs.SHEET || '';
      document.getElementById('plan').value = attrs.PLAN_NBR || '';
      document.getElementById('parcel').value = attrs.PARCEL_NBR || '';
      document.getElementById('district').value = attrs.DIST_CODE ? String(attrs.DIST_CODE) : '';

      var center = centroid(feature.geometry.rings);
      updateURL(attrs.SHEET || '', attrs.PLAN_NBR || '', attrs.PARCEL_NBR || '', attrs.DIST_CODE || '');

      return enrich(center[0], center[1]).then(function(extra) {
        showParcel(feature, extra);
      });
    })
    .catch(function(err) {
      showError('DLS query failed: ' + err.message);
    });
});

function loadFromURL() {
  var params = new URLSearchParams(window.location.search);
  var sheet = params.get('sheet');
  var plan = params.get('plan');
  var parcelNbr = params.get('parcel');
  var distCode = params.get('district');
  var lat = parseFloat(params.get('lat'));
  var lng = parseFloat(params.get('lng'));
  var z = parseInt(params.get('z'), 10);

  if (lat && lng && z) {
    map.setView([lat, lng], z);
  }

  if (sheet && plan && parcelNbr) {
    document.getElementById('sheet').value = sheet;
    document.getElementById('plan').value = plan;
    document.getElementById('parcel').value = parcelNbr;
    if (distCode) document.getElementById('district').value = distCode;
    doSearch();
  }
}

document.querySelectorAll('#sidebar input').forEach(function(el) {
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
});

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

restoreSession();
if (authUser) loadParcelList();
initGoogleSignIn();

map.on('moveend', function() {
  if (!currentParcel) return;
  updateURL(
    currentParcel.sheet, currentParcel.plan_nbr,
    currentParcel.parcel_nbr, currentParcel.dist_code
  );
});

loadFromURL();
