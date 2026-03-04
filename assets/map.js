var DLS_BASE = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';
var currentParcel = null;

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
      planning_zone: zone.PLNZNT_NAME || '\u2014',
      planning_zone_desc: zone.PLNZNT_DESC || '\u2014',
      municipality: muni.VIL_NM_E || '\u2014',
      district: dist.DIST_NM_E || '\u2014'
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
    '<div><span class="label">Block:</span> <span class="value">' + (attrs.BLCK_CODE || '\u2014') + '</span></div>' +
    '<div><span class="label">District:</span> <span class="value">' + extra.district + '</span></div>' +
    '<div><span class="label">Municipality:</span> <span class="value">' + extra.municipality + '</span></div>' +
    '<div><span class="label">Sheet / Plan:</span> <span class="value">' + attrs.SHEET + ' / ' + attrs.PLAN_NBR + '</span></div>' +
    '<div><span class="label">Planning Zone:</span> <span class="value">' + extra.planning_zone + '</span></div>' +
    '<div><span class="label">Zone Detail:</span> <span class="value">' + extra.planning_zone_desc + '</span></div>';
}

function showParcel(feature, extra) {
  if (parcelLayer) { map.removeLayer(parcelLayer); }

  var attrs = feature.attributes;
  var clean = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  currentParcel = {
    sheet: clean(attrs.SHEET),
    plan_nbr: clean(attrs.PLAN_NBR),
    parcel_nbr: clean(attrs.PARCEL_NBR),
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
  parcelSavedLists = [];
  updateSaveButton();
  checkParcelSaved();
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
    searchBarTextEl.textContent = 'Parcel ' + attrs.PARCEL_NBR + ' \u2022 ' + attrs.SHEET + '/' + attrs.PLAN_NBR;
    searchBarEl.classList.add('has-result');
  }
}

detailsAddBtn.addEventListener('click', function() {
  openSavePanel();
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

function navigateToParcel(sheet, planNbr, parcelNbr, distCode) {
  document.getElementById('sheet').value = sheet;
  document.getElementById('plan').value = planNbr;
  document.getElementById('parcel').value = parcelNbr;
  document.getElementById('district').value = distCode || '';
  doSearch();
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
