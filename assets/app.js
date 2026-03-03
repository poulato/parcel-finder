var DLS_BASE = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';

var sidebar = document.getElementById('sidebar');
var openBtnMobile = document.getElementById('openBtnMobile');
var openBtnDesktop = document.getElementById('openBtnDesktop');
var addToListBtn = document.getElementById('addToListBtn');
var listHintEl = document.getElementById('listHint');
var parcelListEl = document.getElementById('parcelList');
var parcelListEmptyEl = document.getElementById('parcelListEmpty');
var parcelList = [];
var currentParcel = null;
var API_BASE = window.GEOKTIMONAS_API_BASE || '/api';
var currentUserId = getOrCreateUserId();

function getOrCreateUserId() {
  var match = document.cookie.match(/(?:^|;\s*)geo_user_id=([^;]+)/);
  if (match && match[1]) return decodeURIComponent(match[1]);
  var id = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'user-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  document.cookie = 'geo_user_id=' + encodeURIComponent(id) + '; Path=/; Max-Age=31536000; SameSite=Lax';
  return id;
}

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
  try {
    var res = await fetch(API_BASE + '/parcels?user_id=' + encodeURIComponent(currentUserId));
    if (!res.ok) throw new Error('failed to load list');
    parcelList = await res.json();
    renderParcelList();
  } catch (err) {
    console.error(err);
    listHintEl.textContent = 'Could not load parcel list.';
    listHintEl.style.display = 'block';
  }
}

parcelListEl.addEventListener('click', async function(e) {
  var id = e.target.getAttribute('data-remove-id');
  if (!id) return;
  try {
    var res = await fetch(API_BASE + '/parcels/' + encodeURIComponent(id) + '?user_id=' + encodeURIComponent(currentUserId), {
      method: 'DELETE'
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

addToListBtn.addEventListener('click', async function() {
  if (!currentParcel) return;
  var key = parcelKey(currentParcel);
  var exists = parcelList.some(function(item) { return parcelKey(item) === key; });
  if (exists) {
    listHintEl.textContent = 'Parcel already in your list.';
    listHintEl.style.display = 'block';
    return;
  }
  try {
    var payload = Object.assign({ user_id: currentUserId }, currentParcel);
    var res = await fetch(API_BASE + '/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('failed to add');
    var created = await res.json();
    parcelList.unshift(created);
    renderParcelList();
    listHintEl.textContent = 'Parcel added to your list.';
    listHintEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    listHintEl.textContent = 'Failed to add parcel.';
    listHintEl.style.display = 'block';
  }
});

function setOpenButtonVisibility(isSidebarOpen) {
  if (isMobile()) {
    openBtnMobile.style.display = isSidebarOpen ? 'none' : 'flex';
    openBtnDesktop.style.display = 'none';
  } else {
    openBtnDesktop.style.display = isSidebarOpen ? 'none' : 'flex';
    openBtnMobile.style.display = 'none';
  }
}

function closeSidebar() {
  sidebar.classList.add('hidden');
  setOpenButtonVisibility(false);
  setTimeout(function() { map.invalidateSize(); }, 300);
}
function openSidebar() {
  sidebar.classList.remove('hidden');
  setOpenButtonVisibility(true);
  setTimeout(function() { map.invalidateSize(); }, 300);
}
function isMobile() { return window.innerWidth <= 640; }

var map = L.map('map', { maxZoom: 19 }).setView([35.0, 33.4], 9);

var topoBase = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
).addTo(map);

var satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
);

var dlsLayer = L.esri.dynamicMapLayer({ url: DLS_BASE, opacity: 1, interactive: false }).addTo(map);

var layerControl = L.control.layers({ 'DLS Cadastral + Topo': topoBase, 'Satellite': satellite }).addTo(map);
var infoBoxControl = L.control({ position: 'topright' });
infoBoxControl.onAdd = function() {
  var div = L.DomUtil.create('div', 'leaflet-control leaflet-control-layers parcel-control');
  div.id = 'parcelControl';
  div.innerHTML =
    '<div class="parcel-toolbar">' +
    '<a href="#" id="infoToggle" class="parcel-toggle leaflet-control-layers-toggle" title="Parcel details">i</a>' +
    '<button id="infoClose" class="parcel-close" title="Close details">&times;</button>' +
    '</div>' +
    '<div id="infoBox" class="parcel-panel">' +
    '<div class="placeholder">Select a parcel and tap this button to view details.</div>' +
    '</div>';
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
};
infoBoxControl.addTo(map);

var parcelLayer = null;
var parcelControlEl = document.getElementById('parcelControl');
var infoToggleEl = document.getElementById('infoToggle');
var infoCloseEl = document.getElementById('infoClose');
var infoBoxEl = document.getElementById('infoBox');

infoToggleEl.addEventListener('click', function(e) {
  e.preventDefault();
  parcelControlEl.classList.toggle('is-open');
});
infoCloseEl.addEventListener('click', function(e) {
  e.preventDefault();
  parcelControlEl.classList.remove('is-open');
});

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

  parcelLayer.bindPopup(
    '<b>Parcel ' + attrs.PARCEL_NBR + '</b><br>' +
    attrs.SHEET + ' / ' + attrs.PLAN_NBR + '<br>' +
    extra.municipality
  );

  map.fitBounds(parcelLayer.getBounds().pad(0.3));

  infoBoxEl.innerHTML =
    '<h3>Parcel ' + attrs.PARCEL_NBR + '</h3>' +
    '<div><span class="label">Block:</span> <span class="value">' + (attrs.BLCK_CODE || '—') + '</span></div>' +
    '<div><span class="label">District:</span> <span class="value">' + extra.district + '</span></div>' +
    '<div><span class="label">Municipality:</span> <span class="value">' + extra.municipality + '</span></div>' +
    '<div><span class="label">Sheet / Plan:</span> <span class="value">' + attrs.SHEET + ' / ' + attrs.PLAN_NBR + '</span></div>' +
    '<div><span class="label">Planning Zone:</span> <span class="value">' + extra.planning_zone + '</span></div>' +
    '<div><span class="label">Zone Detail:</span> <span class="value">' + extra.planning_zone_desc + '</span></div>';
  parcelControlEl.classList.add('has-data');

  document.getElementById('shareHint').style.display = 'block';
  document.getElementById('clearBtn').style.display = 'block';
  addToListBtn.style.display = 'block';
}

function doClear() {
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  parcelControlEl.classList.remove('has-data');
  parcelControlEl.classList.remove('is-open');
  infoBoxEl.innerHTML = '<div class="placeholder">Select a parcel and tap this button to view details.</div>';
  currentParcel = null;
  document.getElementById('shareHint').style.display = 'none';
  document.getElementById('clearBtn').style.display = 'none';
  addToListBtn.style.display = 'none';
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
      updateURL(sheet, plan, parcelNbr, distCode);

      return enrich(center[0], center[1]).then(function(extra) {
        showParcel(feature, extra);
        btn.disabled = false;
        btn.textContent = 'Find Parcel';
        if (isMobile()) closeSidebar();
      });
    })
    .catch(function(err) {
      showError('DLS query failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Find Parcel';
    });
}

map.on('click', function(e) {
  showError('');
  findParcelByCoords(e.latlng.lat, e.latlng.lng)
    .then(function(data) {
      var feature = (data.features || [])[0];
      if (!feature) {
        showError('No parcel found at this point.');
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
        if (isMobile()) closeSidebar();
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

  if (sheet && plan && parcelNbr) {
    document.getElementById('sheet').value = sheet;
    document.getElementById('plan').value = plan;
    document.getElementById('parcel').value = parcelNbr;
    if (distCode) document.getElementById('district').value = distCode;
    if (isMobile()) { sidebar.classList.add('hidden'); setOpenButtonVisibility(false); }
    doSearch();
  }
}

document.querySelectorAll('#sidebar input').forEach(function(el) {
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
});

setOpenButtonVisibility(!sidebar.classList.contains('hidden'));
loadParcelList();
window.addEventListener('resize', function() {
  setOpenButtonVisibility(!sidebar.classList.contains('hidden'));
});

loadFromURL();
