var DLS_BASE = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';
var currentParcel = null;
var _skipTabSwitch = false;
var _searchGen = 0;

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
var listParcelsGroup = L.layerGroup().addTo(map);
var saleMarkersGroup = L.layerGroup().addTo(map);

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

var PARCEL_FIELDS = 'DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR';

function findParcel(sheet, plan, parcelNbr, distCode) {
  var where = "PARCEL_NBR=" + parcelNbr + " AND SHEET='" + sheet + "' AND PLAN_NBR='" + plan + "'";
  if (distCode) where += " AND DIST_CODE=" + distCode;
  return dlsQuery(0, {
    where: where,
    outFields: PARCEL_FIELDS,
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
    outFields: PARCEL_FIELDS,
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
    spatialLookup(15, 'DIST_NM_E', lat, lng),
    spatialLookup(13, 'POST_CODE', lat, lng)
  ]).then(function(results) {
    var zone = results[0].features && results[0].features[0] ? results[0].features[0].attributes : {};
    var muni = results[1].features && results[1].features[0] ? results[1].features[0].attributes : {};
    var dist = results[2].features && results[2].features[0] ? results[2].features[0].attributes : {};
    var post = results[3].features && results[3].features[0] ? results[3].features[0].attributes : {};
    return {
      planning_zone: zone.PLNZNT_NAME || '\u2014',
      planning_zone_desc: zone.PLNZNT_DESC || '\u2014',
      municipality: muni.VIL_NM_E || '\u2014',
      district: dist.DIST_NM_E || '\u2014',
      postal_code: post.POST_CODE ? String(Math.round(post.POST_CODE)) : '\u2014'
    };
  });
}

function centroid(rings) {
  var ring = rings[0], n = ring.length, latSum = 0, lngSum = 0;
  for (var i = 0; i < n; i++) { latSum += ring[i][1]; lngSum += ring[i][0]; }
  return [latSum / n, lngSum / n];
}

function pickFeatureByMunicipality(features, municipality) {
  if (features.length <= 1 || !municipality) return Promise.resolve(features[0]);
  var checks = features.map(function(f) {
    var c = centroid(f.geometry.rings);
    return spatialLookup(16, 'VIL_NM_E', c[0], c[1]).then(function(data) {
      var muni = (data.features && data.features[0]) ? data.features[0].attributes.VIL_NM_E : '';
      return { feature: f, municipality: muni };
    });
  });
  return Promise.all(checks).then(function(results) {
    var match = results.find(function(r) { return r.municipality === municipality; });
    return match ? match.feature : features[0];
  });
}

var detailsContentEl = document.getElementById('detailsContent');
var detailsActionsEl = document.getElementById('detailsActions');
var detailsAddBtn = document.getElementById('detailsAddBtn');
var detailsShareBtn = document.getElementById('detailsShareBtn');

function buildParcelHTML(attrs, extra) {
  return '<h3>Parcel ' + attrs.PARCEL_NBR + '</h3>' +
    '<div><span class="label">District:</span> <span class="value">' + extra.district + '</span></div>' +
    '<div><span class="label">Municipality:</span> <span class="value">' + extra.municipality + '</span></div>' +
    '<div><span class="label">Postal Code:</span> <span class="value">' + extra.postal_code + '</span></div>' +
    '<div><span class="label">Sheet / Plan:</span> <span class="value">' + attrs.SHEET + ' / ' + attrs.PLAN_NBR + '</span></div>' +
    '<div><span class="label">Block:</span> <span class="value">' + (attrs.BLCK_CODE || '\u2014') + '</span></div>' +
    '<div><span class="label">Planning Zone:</span> <span class="value">' + extra.planning_zone + '</span></div>' +
    '<div><span class="label">Zone Detail:</span> <span class="value zone-detail">' + extra.planning_zone_desc + '</span></div>';
}

function showParcel(feature, extra, outlineColor) {
  if (parcelLayer) { map.removeLayer(parcelLayer); }
  clearListParcels();
  if (!outlineColor && typeof saleMarkersGroup !== 'undefined') saleMarkersGroup.clearLayers();

  var attrs = feature.attributes;
  var clean = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var parcelCentroid = centroid(feature.geometry.rings);
  currentParcel = {
    sheet: clean(attrs.SHEET),
    plan_nbr: clean(attrs.PLAN_NBR),
    parcel_nbr: clean(attrs.PARCEL_NBR),
    dist_code: attrs.DIST_CODE || null,
    district: extra.district || '',
    municipality: extra.municipality || '',
    planning_zone: extra.planning_zone || '',
    planning_zone_desc: extra.planning_zone_desc || '',
    block_code: attrs.BLCK_CODE || '',
    postal_code: extra.postal_code || '',
    centroid_lat: parcelCentroid[0],
    centroid_lng: parcelCentroid[1],
    geometry_rings: JSON.stringify(feature.geometry.rings)
  };
  var rings = feature.geometry.rings;
  var coords = rings[0].map(function(p) { return [p[1], p[0]]; });

  var c = outlineColor || '#ff0000';
  parcelLayer = L.polygon(coords, {
    color: c, weight: 4, fillColor: c, fillOpacity: outlineColor ? 0.2 : 0.3
  }).addTo(map);

  var html = buildParcelHTML(attrs, extra);

  detailsContentEl.innerHTML = html;
  detailsActionsEl.style.display = 'flex';
  parcelSavedLists = [];
  updateSaveButton();
  checkParcelSaved();
  if (typeof checkParcelListing === 'function') {
    checkParcelListing().then(function(listing) {
      if (typeof updateSaleButton === 'function') updateSaleButton(listing || null);
    });
  }

  var skipTab = _skipTabSwitch;
  _skipTabSwitch = false;

  if (!outlineColor) {
    var searchBarEl = document.getElementById('searchBar');
    var searchBarTextEl = document.getElementById('searchBarText');
    if (searchBarEl && searchBarTextEl) {
      searchBarTextEl.textContent = 'Parcel ' + attrs.PARCEL_NBR + ' \u2022 ' + attrs.SHEET + '/' + attrs.PLAN_NBR;
      searchBarEl.classList.add('has-result');
    }
  }

  if (!skipTab && !outlineColor) {
    switchTab('details');
    if (isMobile()) {
      document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    } else {
      document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    }
    if (sidebar.classList.contains('hidden')) openSidebar();
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
  clearListParcels();
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
  var params = new URLSearchParams(window.location.search);
  params.set('sheet', sheet);
  params.set('plan', plan);
  params.set('parcel', parcelNbr);
  if (distCode) params.set('district', distCode);
  else params.delete('district');
  var c = map.getCenter();
  params.set('lat', c.lat.toFixed(6));
  params.set('lng', c.lng.toFixed(6));
  params.set('z', map.getZoom());
  history.replaceState(null, '', '?' + params.toString());
}

var _searchMunicipality = null;

function doSearch() {
  _searchGen++;
  var gen = _searchGen;
  var sheet = document.getElementById('sheet').value.trim();
  var plan = document.getElementById('plan').value.trim();
  var parcelNbr = document.getElementById('parcel').value.trim();
  var distCode = document.getElementById('district').value;
  var municipality = _searchMunicipality;
  _searchMunicipality = null;

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
      if (gen !== _searchGen) return;
      var features = data.features || [];
      if (!features.length) {
        showError('No parcel found. Check the values.');
        btn.disabled = false;
        btn.textContent = 'Find Parcel';
        return;
      }
      return pickFeatureByMunicipality(features, municipality)
        .then(function(feature) {
          if (gen !== _searchGen) return;
          var center = centroid(feature.geometry.rings);
          map.setView([center[0], center[1]], 18);
          updateURL(sheet, plan, parcelNbr, distCode);

          return enrich(center[0], center[1]).then(function(extra) {
            if (gen !== _searchGen) return;
            showParcel(feature, extra);
            btn.disabled = false;
            btn.textContent = 'Find Parcel';
          });
        });
    })
    .catch(function(err) {
      if (gen !== _searchGen) return;
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

function clearListParcels() {
  listParcelsGroup.clearLayers();
}

function showAllListParcels(parcels) {
  _searchGen++;
  clearListParcels();
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  currentParcel = null;

  var btn = document.getElementById('showAllParcelsBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  var queries = parcels.map(function(p) {
    return findParcel(p.sheet, p.plan_nbr, p.parcel_nbr, p.dist_code);
  });

  Promise.all(queries).then(function(results) {
    var bounds = L.latLngBounds([]);
    results.forEach(function(data) {
      var feature = (data.features || [])[0];
      if (!feature) return;
      var coords = feature.geometry.rings[0].map(function(p) { return [p[1], p[0]]; });
      var poly = L.polygon(coords, {
        color: '#ff0000', weight: 4, fillColor: '#ff0000', fillOpacity: 0.3
      });
      listParcelsGroup.addLayer(poly);
      bounds.extend(poly.getBounds());
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    if (currentListId) {
      history.replaceState(null, '', '?list=' + encodeURIComponent(currentListId));
      var list = userLists.find(function(l) { return l.id === currentListId; })
        || sharedLists.find(function(l) { return l.id === currentListId; });
      var searchBarEl = document.getElementById('searchBar');
      var searchBarTextEl = document.getElementById('searchBarText');
      if (list && searchBarEl && searchBarTextEl) {
        searchBarTextEl.textContent = list.name;
        searchBarEl.classList.add('has-result');
      }
    }
  }).catch(function(err) {
    console.error('Show all failed:', err);
  }).then(function() {
    btn.disabled = false;
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> ' +
      'Show All on Map';
  });
}

function isSaleTabActive() {
  var vs = document.getElementById('viewSale');
  var vsd = document.getElementById('viewSaleDetail');
  return (vs && vs.classList.contains('active')) || (vsd && vsd.classList.contains('active'));
}

map.on('click', function(e) {
  if (map.getZoom() < 16) {
    if (!isMobile() && !sidebar.classList.contains('hidden')) closeSidebar();
    return;
  }
  showError('');

  if (isSaleTabActive()) {
    findParcelByCoords(e.latlng.lat, e.latlng.lng)
      .then(function(data) {
        var feature = (data.features || [])[0];
        if (!feature) return;
        var attrs = feature.attributes;
        var clean = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
        var sheet = clean(attrs.SHEET);
        var plan = clean(attrs.PLAN_NBR);
        var parcel = clean(attrs.PARCEL_NBR);
        var listing = saleListings.find(function(l) {
          return clean(l.sheet) === sheet && clean(l.plan_nbr) === plan && clean(l.parcel_nbr) === parcel;
        });
        function showSaleOnMap(theListing, theFeature) {
          saleMarkersGroup.clearLayers();
          _skipTabSwitch = true;
          var center = centroid(theFeature.geometry.rings);
          map.setView([center[0], center[1]], 18);
          enrich(center[0], center[1]).then(function(extra) {
            showParcel(theFeature, extra, '#16a34a');
          });
          var pl = theListing.price ? '€' + Number(theListing.price).toLocaleString() : '—';
          var pi = L.divIcon({ className: 'sale-marker', html: '<div class="sale-marker-label">' + pl + '</div>', iconSize: [80, 24], iconAnchor: [40, 12] });
          saleMarkersGroup.addLayer(L.marker([center[0], center[1]], { icon: pi }));
          if (typeof showSaleDetailInPanel === 'function') showSaleDetailInPanel(theListing);
          var el = document.getElementById('searchBarText');
          if (el) {
            el.textContent = theListing.title || ('Parcel ' + theListing.parcel_nbr);
            document.getElementById('searchBar').classList.add('has-result');
          }
        }
        if (listing) {
          showSaleOnMap(listing, feature);
          return;
        }
        return fetch('/api/listings/check?sheet=' + encodeURIComponent(sheet) + '&plan_nbr=' + encodeURIComponent(plan) + '&parcel_nbr=' + encodeURIComponent(parcel))
          .then(function(r) { return r.json(); })
          .then(function(results) {
            var active = results.find(function(l) { return l.status === 'active'; });
            if (!active) return;
            showSaleOnMap(active, feature);
          });
      });
    return;
  }

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

  if (params.get('listing') && params.get('tab') === 'sale') return;

  if (sheet && plan && parcelNbr) {
    document.getElementById('sheet').value = sheet;
    document.getElementById('plan').value = plan;
    document.getElementById('parcel').value = parcelNbr;
    if (distCode) document.getElementById('district').value = distCode;
    doSearch();
  }
}
