var DLS_BASE = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';
var DLS_SEARCH = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/General_Search/MapServer';
var currentParcel = null;
var _skipTabSwitch = false;
var _searchGen = 0;

var map = L.map('map', { maxZoom: 19, zoomControl: false }).setView([35.0, 33.4], 9);

var topoBase = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
).addTo(map);

var satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Esri', maxZoom: 19 }
);

var dlsLayer = L.esri.dynamicMapLayer({ url: DLS_BASE, opacity: 1, interactive: false }).addTo(map);
var layerControl = L.control.layers({ 'DLS Cadastral + Topo': topoBase, 'Satellite': satellite }, null, { position: 'bottomright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var MapLocateControl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd: function() {
    var wrap = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-locate-control');
    var btn = L.DomUtil.create('button', 'map-locate-control-btn', wrap);
    btn.type = 'button';
    btn.id = 'mapLocateBtn';
    btn.title = 'Find parcel at my location';
    btn.setAttribute('aria-label', 'Find parcel at my location');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.on(btn, 'click', function(ev) {
      L.DomEvent.stopPropagation(ev);
      L.DomEvent.preventDefault(ev);
      doMyLocationSearch();
    });
    return wrap;
  }
});
(new MapLocateControl()).addTo(map);
var parcelLayer = null;
var currentParcelOutlineOverride = null;
var listParcelsGroup = L.layerGroup().addTo(map);
var listParcelMapLayers = {};
var listParcelMapHoverId = null;
var saleMarkersGroup = L.layerGroup().addTo(map);
var gpsDotMarker = null;

function clearGpsDot() {
  if (gpsDotMarker) {
    map.removeLayer(gpsDotMarker);
    gpsDotMarker = null;
  }
}

function showGpsDot(lat, lng) {
  clearGpsDot();
  var icon = L.divIcon({
    className: 'gps-dot-marker',
    html: '<div class="gps-dot-wrap"><div class="gps-dot-ring"></div><div class="gps-dot-core"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  gpsDotMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 900, title: 'Your location (GPS)' }).addTo(map);
}

function showError(msg, type) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  el.style.color = type === 'warn' ? '#fbbf24' : '';
}

function dlsQuery(layerId, params) {
  params.f = 'json';
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 15000);
  return fetch(DLS_BASE + '/' + layerId + '/query?' + qs, { signal: controller.signal })
    .then(function(r) { clearTimeout(timer); return r.json(); })
    .catch(function(err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('DLS request timed out');
      throw err;
    });
}

var PARCEL_FIELDS = 'DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR,SBPI_ID_NO';
var municipalityCache = [];

function escapeWhereStr(s) {
  return String(s).replace(/'/g, "''");
}

function muniOptionValue(distCode, vilCode) {
  return String(distCode) + ':' + String(vilCode);
}

function parseMuniOptionValue(val) {
  if (!val) return null;
  if (val.indexOf(':') >= 0) {
    var parts = val.split(':');
    if (parts.length === 2) return { distCode: parts[0], vilCode: parts[1] };
  }
  return null;
}

function findMuni(distCode, vilCode) {
  return municipalityCache.find(function(m) {
    return String(m.distCode) === String(distCode) && String(m.vilCode) === String(vilCode);
  });
}

function setMunicipalitySelection(distCode, vilCode) {
  var sel = document.getElementById('municipality');
  if (!sel) return;
  if (distCode == null || vilCode == null || distCode === '' || vilCode === '') {
    sel.value = '';
    return;
  }
  populateMunicipalitySelect(String(distCode));
  sel.value = muniOptionValue(distCode, vilCode);
}

function dlsQueryUrl(baseUrl, params) {
  params.f = 'json';
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, 15000);
  return fetch(baseUrl + '?' + qs, { signal: controller.signal })
    .then(function(r) { clearTimeout(timer); return r.json(); })
    .catch(function(err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('DLS request timed out');
      throw err;
    });
}

function dbMunicipalityId(distCode, vilCode) {
  return parseInt(distCode, 10) * 1000 + parseInt(vilCode, 10);
}

function dbQuarterId(municipalityId) {
  return municipalityId * 100;
}

function findByRegistration(distCode, vilCode, regBlock, regNo) {
  var muniId = dbMunicipalityId(distCode, vilCode);
  var quarterId = dbQuarterId(muniId);
  var where = 'DistrictId=' + distCode +
    ' AND MunicipalityId=' + muniId +
    ' AND QuarterId=' + quarterId +
    ' AND RegistrationBlock=' + (regBlock || 0) +
    " AND RegistrationNo='" + escapeWhereStr(regNo) + "'";
  return dlsQueryUrl(DLS_SEARCH + '/14/query', {
    where: where,
    outFields: 'ParcelId,ParcelNo',
    returnGeometry: 'false'
  });
}

function findRegistrationBySbpiId(sbpiId) {
  if (!sbpiId) return Promise.resolve({ features: [] });
  return dlsQueryUrl(DLS_SEARCH + '/14/query', {
    where: 'ParcelId=' + sbpiId,
    outFields: 'RegistrationNo,RegistrationBlock',
    returnGeometry: 'false',
    resultRecordCount: 5
  });
}

function formatRegistrationNo(v) {
  if (v == null || v === '') return '';
  return String(v).replace(/\.0$/, '');
}

function formatRegistrationBlock(v) {
  if (v == null || v === '') return '';
  return String(v).replace(/\.0$/, '');
}

function displayRegistration(block, no) {
  var n = formatRegistrationNo(no);
  if (!n) return '';
  var b = formatRegistrationBlock(block);
  if (b && b !== '0') return b + ' / ' + n;
  return n;
}

function formatParcelRefLine(item) {
  if (!item) return '';
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var line = 'Parcel ' + norm(item.parcel_nbr) + ' \u2022 ' + norm(item.sheet) + '/' + norm(item.plan_nbr);
  var reg = displayRegistration(item.registration_block, item.registration_no);
  if (reg) line += ' \u2022 Reg. ' + reg;
  return line;
}

function registrationMetaFromItem(item) {
  if (!item) return {};
  return {
    registration_no: item.registration_no || null,
    registration_block: item.registration_block != null ? item.registration_block : null
  };
}

function findParcelBySbpiId(sbpiId) {
  return dlsQueryUrl(DLS_SEARCH + '/0/query', {
    where: 'SBPI_ID_NO=' + sbpiId,
    outFields: PARCEL_FIELDS,
    returnGeometry: 'true',
    outSR: '4326'
  });
}

function tryRegistrationSearch(distCode, vilCode, regBlock, regNo) {
  return findByRegistration(distCode, vilCode, regBlock, regNo).then(function(data) {
    var row = (data.features || [])[0];
    if (!row) return { features: [], viaRegistration: true, regNo: regNo, regBlock: regBlock };
    return findParcelBySbpiId(row.attributes.ParcelId).then(function(parcelData) {
      return {
        features: parcelData.features || [],
        viaRegistration: true,
        regNo: regNo,
        regBlock: regBlock
      };
    });
  });
}

function normParcelField(v) {
  return String(v == null ? '' : v).replace(/\.0$/, '');
}

function resolveRegistrationForAttrs(meta, attrs) {
  return Promise.resolve(applyRegistrationMeta(meta || {}, attrs));
}

function findParcels(parcelNbr, distCode, vilCode, sheet, plan) {
  var where = 'PARCEL_NBR=' + parcelNbr;
  if (sheet) where += " AND SHEET='" + escapeWhereStr(sheet) + "'";
  if (plan) where += " AND PLAN_NBR='" + escapeWhereStr(plan) + "'";
  if (distCode) where += ' AND DIST_CODE=' + distCode;
  if (vilCode !== undefined && vilCode !== null && vilCode !== '') where += ' AND VIL_CODE=' + vilCode;
  var params = {
    where: where,
    outFields: PARCEL_FIELDS,
    returnGeometry: 'true',
    outSR: '4326'
  };
  if (!sheet || !plan) params.resultRecordCount = 50;
  return dlsQuery(0, params);
}

function findParcel(sheet, plan, parcelNbr, distCode, vilCode) {
  return findParcels(parcelNbr, distCode, vilCode, sheet, plan);
}

function loadMunicipalities() {
  return dlsQuery(16, {
    where: '1=1',
    outFields: 'VIL_CODE,VIL_NM_E,DIST_CODE',
    returnGeometry: 'false',
    resultRecordCount: 2000
  }).then(function(data) {
    municipalityCache = (data.features || []).map(function(f) {
      var a = f.attributes;
      return { vilCode: a.VIL_CODE, name: a.VIL_NM_E, distCode: a.DIST_CODE };
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    populateMunicipalitySelect(document.getElementById('district').value);
  }).catch(function() {
    var sel = document.getElementById('municipality');
    sel.disabled = false;
    sel.innerHTML = '<option value="">Any (optional)</option>';
  });
}

function populateMunicipalitySelect(distCode) {
  var sel = document.getElementById('municipality');
  if (!sel) return;
  var prev = sel.value;
  sel.innerHTML = '<option value="">Any (optional)</option>';
  var list = municipalityCache;
  if (distCode) list = list.filter(function(m) { return String(m.distCode) === String(distCode); });
  list.forEach(function(m) {
    var opt = document.createElement('option');
    opt.value = muniOptionValue(m.distCode, m.vilCode);
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  sel.disabled = false;
  if (prev && list.some(function(m) { return muniOptionValue(m.distCode, m.vilCode) === prev; })) sel.value = prev;
}

function setMunicipalityByName(name) {
  if (!name || !municipalityCache.length) {
    _searchMunicipality = name || null;
    return;
  }
  var match = municipalityCache.find(function(m) { return m.name === name; });
  if (!match) {
    _searchMunicipality = name;
    return;
  }
  var distEl = document.getElementById('district');
  if (!distEl.value) distEl.value = String(match.distCode);
  setMunicipalitySelection(match.distCode, match.vilCode);
}

function explainNoParcelByNumber(parcelNbr, distCode, vilCode, muniName) {
  var filter = '';
  if (distCode) filter += ' AND DIST_CODE=' + distCode;
  if (vilCode !== undefined && vilCode !== null && vilCode !== '') filter += ' AND VIL_CODE=' + vilCode;

  var pn = parseInt(parcelNbr, 10);
  var suggestNums = [];
  if (!isNaN(pn)) {
    for (var d = -2; d <= 2; d++) {
      if (d !== 0) suggestNums.push(pn + d);
    }
    if (pn >= 100) {
      var base = Math.floor(pn / 10);
      [-2, -1, 0, 1, 2].forEach(function(offset) {
        var n = base + offset;
        if (n > 0 && n !== pn && suggestNums.indexOf(n) < 0) suggestNums.push(n);
      });
    }
  }

  var suggestQuery = suggestNums.length
    ? dlsQuery(0, {
      where: 'PARCEL_NBR IN (' + suggestNums.join(',') + ')' + filter,
      outFields: 'PARCEL_NBR,SHEET,PLAN_NBR',
      returnGeometry: 'false',
      orderByFields: 'PARCEL_NBR',
      resultRecordCount: 10
    })
    : Promise.resolve({ features: [] });

  return suggestQuery.then(function(data) {
    var suggestions = (data.features || []).map(function(f) {
      var a = f.attributes;
      return a.PARCEL_NBR + ' (Sheet ' + a.SHEET + '/' + a.PLAN_NBR + ')';
    });

    var scope = muniName || (distCode ? 'this district' : 'Cyprus');
    var msg = 'No parcel ' + parcelNbr + ' found in ' + scope + '.';
    if (suggestions.length) msg += ' Did you mean: ' + suggestions.join(', ') + '?';
    return msg;
  });
}

function explainNoParcel(sheet, plan, parcelNbr, distCode, vilCode, muniName) {
  var where = "SHEET='" + escapeWhereStr(sheet) + "' AND PLAN_NBR='" + escapeWhereStr(plan) + "'";
  if (distCode) where += " AND DIST_CODE=" + distCode;
  if (vilCode !== undefined && vilCode !== null && vilCode !== '') where += " AND VIL_CODE=" + vilCode;

  var pn = parseInt(parcelNbr, 10);
  var nearbyNums = [];
  var typoNums = [];
  if (!isNaN(pn)) {
    for (var d = -2; d <= 2; d++) {
      if (d !== 0) nearbyNums.push(pn + d);
    }
    if (pn >= 100) {
      var base = Math.floor(pn / 10);
      [-2, -1, 0, 1, 2].forEach(function(offset) {
        var n = base + offset;
        if (n > 0 && n !== pn && typoNums.indexOf(n) < 0) typoNums.push(n);
      });
    }
  }

  var suggestNums = nearbyNums.concat(typoNums.filter(function(n) { return nearbyNums.indexOf(n) < 0; }));

  var maxQ = dlsQuery(0, {
    where: where,
    outFields: 'PARCEL_NBR',
    returnGeometry: 'false',
    orderByFields: 'PARCEL_NBR DESC',
    resultRecordCount: 1
  });
  var suggestQ = suggestNums.length
    ? dlsQuery(0, {
      where: where + ' AND PARCEL_NBR IN (' + suggestNums.join(',') + ')',
      outFields: 'PARCEL_NBR',
      returnGeometry: 'false',
      orderByFields: 'PARCEL_NBR'
    })
    : Promise.resolve({ features: [] });

  var muniWhere = 'PARCEL_NBR=' + parcelNbr;
  if (distCode) muniWhere += ' AND DIST_CODE=' + distCode;
  if (vilCode !== undefined && vilCode !== null && vilCode !== '') muniWhere += ' AND VIL_CODE=' + vilCode;
  var muniAnywhereQ = (distCode || vilCode)
    ? dlsQuery(0, {
      where: muniWhere,
      outFields: 'SHEET,PLAN_NBR',
      returnGeometry: 'false',
      resultRecordCount: 5
    })
    : Promise.resolve({ features: [] });

  return Promise.all([maxQ, suggestQ, muniAnywhereQ]).then(function(results) {
    var maxParcel = results[0].features && results[0].features[0]
      ? results[0].features[0].attributes.PARCEL_NBR : null;
    var suggestions = (results[1].features || []).map(function(f) { return f.attributes.PARCEL_NBR; });
    var elsewhere = (results[2].features || []).map(function(f) {
      return f.attributes.SHEET + '/' + f.attributes.PLAN_NBR;
    });

    if (maxParcel === null) {
      var scope = muniName ? muniName : (distCode ? 'your district/municipality filters' : 'your filters');
      return 'No parcel found. This sheet/plan was not found for ' + scope + ' — try a different municipality or leave filters open.';
    }

    var msg = 'No parcel ' + parcelNbr + ' on Sheet ' + sheet + ' / Plan ' + plan;
    if (muniName) msg += ' in ' + muniName;
    msg += '.';
    if (!isNaN(pn) && maxParcel < pn) {
      msg += ' Parcels on this plan only go up to ' + maxParcel + '.';
    }
    if (elsewhere.length) {
      msg += ' Parcel ' + parcelNbr + ' exists in ' + muniName + ' on Sheet/Plan: ' + elsewhere.join(', ') + '.';
    } else if (muniName || vilCode) {
      msg += ' Parcel ' + parcelNbr + ' is not registered in ' + (muniName || 'this municipality') + ' on any sheet/plan.';
    }
    if (suggestions.length) msg += ' Did you mean: ' + suggestions.join(', ') + '?';
    return msg;
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

function findParcelNearby(lat, lng, bufferDeg) {
  var b = bufferDeg || 0.0005;
  return dlsQuery(0, {
    geometry: (lng - b) + ',' + (lat - b) + ',' + (lng + b) + ',' + (lat + b),
    geometryType: 'esriGeometryEnvelope',
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
    spatialLookup(13, 'POST_CODE', lat, lng),
    spatialLookup(17, 'QRTR_NM_E', lat, lng)
  ]).then(function(results) {
    var zone = results[0].features && results[0].features[0] ? results[0].features[0].attributes : {};
    var muni = results[1].features && results[1].features[0] ? results[1].features[0].attributes : {};
    var dist = results[2].features && results[2].features[0] ? results[2].features[0].attributes : {};
    var post = results[3].features && results[3].features[0] ? results[3].features[0].attributes : {};
    var qrtr = results[4].features && results[4].features[0] ? results[4].features[0].attributes : {};
    return {
      planning_zone: zone.PLNZNT_NAME || '\u2014',
      planning_zone_desc: zone.PLNZNT_DESC || '\u2014',
      municipality: muni.VIL_NM_E || '\u2014',
      district: dist.DIST_NM_E || '\u2014',
      postal_code: post.POST_CODE ? String(Math.round(post.POST_CODE)) : '\u2014',
      quarter: qrtr.QRTR_NM_E || ''
    };
  });
}

function centroid(rings) {
  var ring = rings[0], n = ring.length, latSum = 0, lngSum = 0;
  for (var i = 0; i < n; i++) { latSum += ring[i][1]; lngSum += ring[i][0]; }
  return [latSum / n, lngSum / n];
}

function formatBlockCode(v) {
  if (v == null || v === '') return '';
  return String(v).replace(/\.0$/, '');
}

function resolveBlockCode(attrs, savedItem) {
  return formatBlockCode(attrs && attrs.BLCK_CODE) ||
    (savedItem ? formatBlockCode(savedItem.block_code) : '') ||
    '0';
}

function displayBlockCode(v) {
  var s = formatBlockCode(v);
  return s !== '' ? s : '0';
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

function vilCodeFromMunicipality(municipality, distCode) {
  if (!municipality || !municipalityCache.length) return '';
  var match = municipalityCache.find(function(m) {
    if (m.name !== municipality) return false;
    if (distCode && String(m.distCode) !== String(distCode)) return false;
    return true;
  });
  return match ? String(match.vilCode) : '';
}

function resolveParcelFeature(sheet, plan, parcelNbr, distCode, municipality) {
  var vilCode = vilCodeFromMunicipality(municipality, distCode);
  return findParcel(sheet, plan, parcelNbr, distCode, vilCode || undefined).then(function(data) {
    var features = data.features || [];
    if (!features.length && vilCode) {
      return findParcel(sheet, plan, parcelNbr, distCode).then(function(data2) {
        features = data2.features || [];
        if (!features.length) return null;
        if (features.length === 1) return features[0];
        return pickFeatureByMunicipality(features, municipality);
      });
    }
    if (!features.length) return null;
    if (features.length === 1) return features[0];
    return pickFeatureByMunicipality(features, municipality);
  });
}

var detailsContentEl = document.getElementById('detailsContent');

function buildSearchDetailsActionsHTML() {
  return '<hr class="details-divider">' +
    '<div id="detailsActions">' +
      '<div class="action-item">' +
        '<button id="detailsAddBtn" type="button" title="Save">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
        '</button>' +
        '<span class="action-label">Save</span>' +
      '</div>' +
      '<div class="action-item">' +
        '<button id="detailsShareBtn" type="button" title="Share">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
        '</button>' +
        '<span class="action-label">Share</span>' +
      '</div>' +
    '</div>';
}

function buildParcelHTML(attrs, extra, opts) {
  opts = opts || {};
  var quarterRow = extra.quarter
    ? '<div><span class="label">Quarter:</span> <span class="value">' + extra.quarter + '</span></div>'
    : '';
  var parcelNbr = normParcelField(attrs.PARCEL_NBR);
  if (!parcelNbr && opts.parcelNbr) parcelNbr = normParcelField(opts.parcelNbr);
  var regText = displayRegistration(opts.registrationBlock, opts.registrationNo);
  var regRow = regText
    ? '<div><span class="label">Registration:</span> <span class="value" id="parcelRegistrationValue">' + regText + '</span></div>'
    : '<div id="parcelRegistrationRow" class="hidden"><span class="label">Registration:</span> <span class="value" id="parcelRegistrationValue"></span></div>';
  return '<div class="parcel-title-header">' +
      '<h3 id="parcelTitleDisplay"></h3>' +
      '<button type="button" id="parcelTitleEditBtn" class="parcel-meta-edit-btn hidden" title="Edit title">Edit</button>' +
    '</div>' +
    '<div id="parcelTitleSub" class="parcel-title-sub hidden"></div>' +
    '<div id="parcelTitleEditor" class="parcel-area-editor hidden">' +
      '<input type="text" id="parcelTitleInput" maxlength="120" placeholder="e.g. Family plot in Limassol" />' +
      '<div class="parcel-area-editor-actions">' +
        '<button type="button" id="parcelTitleSaveBtn" class="note-save-btn">Save</button>' +
        '<button type="button" id="parcelTitleCancelBtn" class="note-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<div class="parcel-external-links">' +
      '<button type="button" id="parcelOpenDlsBtn" class="parcel-external-btn">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' +
        ' Open in DLS' +
      '</button>' +
      '<button type="button" id="parcelOpenGmapsBtn" class="parcel-external-btn">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        ' Google Maps' +
      '</button>' +
    '</div>' +
    (opts.showActions ? buildSearchDetailsActionsHTML() : '') +
    '<div><span class="label">District:</span> <span class="value">' + extra.district + '</span></div>' +
    '<div><span class="label">Municipality:</span> <span class="value">' + extra.municipality + '</span></div>' +
    quarterRow +
    '<div><span class="label">Postal Code:</span> <span class="value">' + extra.postal_code + '</span></div>' +
    '<div><span class="label">Parcel:</span> <span class="value">' + parcelNbr + '</span></div>' +
    '<div><span class="label">Sheet / Plan:</span> <span class="value">' + attrs.SHEET + ' / ' + attrs.PLAN_NBR + '</span></div>' +
    regRow +
    '<div><span class="label">Block:</span> <span class="value">' + displayBlockCode(attrs.BLCK_CODE) + '</span></div>' +
    '<div><span class="label">Planning Zone:</span> <span class="value">' + extra.planning_zone + '</span></div>' +
    '<div><span class="label">Zone Detail:</span> <span class="value zone-detail">' + extra.planning_zone_desc + '</span></div>' +
    '<div id="savedParcelExtra" class="saved-parcel-extra"></div>' +
    '<div id="parcelAreaRow" class="parcel-area-row">' +
      '<span class="label">Area:</span> <span class="value" id="parcelAreaValue">\u2014</span>' +
      '<button type="button" id="parcelAreaEditBtn" class="parcel-meta-edit-btn hidden" title="Edit area">Edit</button>' +
    '</div>' +
    '<div id="parcelAreaEditor" class="parcel-area-editor hidden">' +
      '<input type="number" id="parcelAreaInput" min="0" step="any" placeholder="m\u00b2" />' +
      '<div class="parcel-area-editor-actions">' +
        '<button type="button" id="parcelAreaSaveBtn" class="note-save-btn">Save</button>' +
        '<button type="button" id="parcelAreaCancelBtn" class="note-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<div id="parcelOwnershipRow" class="parcel-area-row">' +
      '<span class="label">Ownership:</span> <span class="value" id="parcelOwnershipValue">\u2014</span>' +
      '<button type="button" id="parcelOwnershipEditBtn" class="parcel-meta-edit-btn hidden" title="Edit ownership">Edit</button>' +
    '</div>' +
    '<div id="parcelOwnershipEditor" class="parcel-area-editor hidden">' +
      '<input type="text" id="parcelOwnershipInput" placeholder="e.g. 1/2" />' +
      '<div class="parcel-area-editor-actions">' +
        '<button type="button" id="parcelOwnershipSaveBtn" class="note-save-btn">Save</button>' +
        '<button type="button" id="parcelOwnershipCancelBtn" class="note-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<div id="parcelLocationRow" class="parcel-area-row parcel-location-row">' +
      '<span class="label">Location:</span> <span class="value parcel-location-value" id="parcelLocationValue">\u2014</span>' +
      '<button type="button" id="parcelLocationEditBtn" class="parcel-meta-edit-btn hidden" title="Edit location">Edit</button>' +
    '</div>' +
    '<div id="parcelLocationEditor" class="parcel-area-editor hidden">' +
      '<input type="text" id="parcelLocationInput" maxlength="500" placeholder="e.g. Near main road, behind church" />' +
      '<div class="parcel-area-editor-actions">' +
        '<button type="button" id="parcelLocationSaveBtn" class="note-save-btn">Save</button>' +
        '<button type="button" id="parcelLocationCancelBtn" class="note-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<div id="parcelValueRow" class="parcel-area-row">' +
      '<span class="label">Value:</span> <span class="value" id="parcelValueDisplay">\u2014</span>' +
      '<button type="button" id="parcelValueEditBtn" class="parcel-meta-edit-btn hidden" title="Edit value">Edit</button>' +
    '</div>' +
    '<div id="parcelValueEditor" class="parcel-area-editor hidden">' +
      '<input type="number" id="parcelValueInput" min="0" step="1" placeholder="\u20ac" />' +
      '<div class="parcel-area-editor-actions">' +
        '<button type="button" id="parcelValueSaveBtn" class="note-save-btn">Save</button>' +
        '<button type="button" id="parcelValueCancelBtn" class="note-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>' +
    '<div id="parcelPhotosSection" class="parcel-details-photos-section hidden">' +
      '<div class="parcel-details-photos-header"><span class="label">Photos</span></div>' +
      '<div id="parcelPhotosGrid" class="parcel-details-photos-grid"></div>' +
      '<input type="file" id="parcelPhotoFile" accept="image/*" multiple hidden />' +
    '</div>' +
    '<div id="parcelNoteSection" class="parcel-details-note-section hidden">' +
      '<div class="parcel-details-note-box">' +
        '<button type="button" id="parcelNoteLine" class="parcel-details-note-line">' +
          '<span id="parcelNoteLineText" class="parcel-details-note-line-text hidden"></span>' +
          '<span id="parcelNoteLinePlaceholder" class="parcel-details-note-line-placeholder">Write a note…</span>' +
        '</button>' +
        '<textarea id="parcelNoteInput" class="parcel-details-note-input" rows="3" placeholder="Write a note…" hidden></textarea>' +
        '<span id="parcelNoteSavedMsg" class="parcel-note-saved-msg hidden">Saved</span>' +
      '</div>' +
    '</div>';
}

function openParcelInGoogleMaps() {
  if (!currentParcel || currentParcel.centroid_lat == null || currentParcel.centroid_lng == null) {
    if (typeof showError === 'function') showError('No location available for this parcel.');
    return;
  }
  var lat = currentParcel.centroid_lat;
  var lng = currentParcel.centroid_lng;
  var url = 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;
  window.open(url, '_blank', 'noopener');
}

function openParcelInDls() {
  if (!currentParcel || currentParcel.centroid_lat == null || currentParcel.centroid_lng == null) {
    if (typeof showError === 'function') showError('No location available for this parcel.');
    return;
  }
  var lat = currentParcel.centroid_lat;
  var lng = currentParcel.centroid_lng;
  var service = 'https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer';
  var url = 'https://www.arcgis.com/home/webmap/viewer.html' +
    '?url=' + encodeURIComponent(service) +
    '&source=sd' +
    '&center=' + encodeURIComponent(lng + ',' + lat) +
    '&level=19';
  window.open(url, '_blank', 'noopener');
}

function applyParcelOutlineColor(color) {
  if (!parcelLayer) return;
  parcelLayer.setStyle({
    color: color,
    fillColor: color,
    fillOpacity: currentParcelOutlineOverride ? 0.2 : 0.3
  });
}

function updateParcelRegistrationDisplay(block, no) {
  var row = document.getElementById('parcelRegistrationRow');
  var valueEl = document.getElementById('parcelRegistrationValue');
  if (!valueEl) return;
  var text = displayRegistration(block, no);
  if (text) {
    valueEl.textContent = text;
    if (row) row.classList.remove('hidden');
  } else if (row) {
    row.classList.add('hidden');
    valueEl.textContent = '';
  }
}

function applyRegistrationMeta(meta, attrs) {
  meta = meta || {};
  if (meta.registration_no) {
    return {
      registration_no: formatRegistrationNo(meta.registration_no),
      registration_block: formatRegistrationBlock(meta.registration_block)
    };
  }
  if (!attrs || !attrs.SBPI_ID_NO) return { registration_no: null, registration_block: null };
  return findRegistrationBySbpiId(attrs.SBPI_ID_NO).then(function(data) {
    var row = (data.features || [])[0];
    if (!row) return { registration_no: null, registration_block: null };
    return {
      registration_no: formatRegistrationNo(row.attributes.RegistrationNo),
      registration_block: formatRegistrationBlock(row.attributes.RegistrationBlock)
    };
  });
}

function updateParcelOwnershipAppearance() {
  if (currentParcelOutlineOverride) {
    applyParcelOutlineColor(currentParcelOutlineOverride);
    return;
  }
  var record = typeof getActiveSavedParcelRecord === 'function' ? getActiveSavedParcelRecord() : null;
  var color = typeof getParcelOutlineColorForRecord === 'function'
    ? getParcelOutlineColorForRecord(record)
    : '#ff0000';
  applyParcelOutlineColor(color);
}

function showParcel(feature, extra, outlineColor, meta) {
  meta = meta || {};
  if (parcelLayer) { map.removeLayer(parcelLayer); }
  clearListParcels();
  currentParcelOutlineOverride = outlineColor || null;
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
    quarter: extra.quarter || '',
    planning_zone: extra.planning_zone || '',
    planning_zone_desc: extra.planning_zone_desc || '',
    block_code: resolveBlockCode(attrs, null),
    postal_code: extra.postal_code || '',
    registration_no: formatRegistrationNo(meta.registration_no) || null,
    registration_block: formatRegistrationBlock(meta.registration_block) || null,
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

  var html = buildParcelHTML(attrs, extra, {
    showActions: !outlineColor && !(typeof isParcelDetailsFromList === 'function' && isParcelDetailsFromList()),
    registrationNo: currentParcel.registration_no,
    registrationBlock: currentParcel.registration_block,
    parcelNbr: currentParcel.parcel_nbr
  });

  detailsContentEl.innerHTML = html;
  parcelSavedLists = [];
  checkParcelSaved();

  var skipTab = _skipTabSwitch;
  _skipTabSwitch = false;

  if (!outlineColor && currentParcel && typeof updateParcelSearchBarTitle === 'function') {
    updateParcelSearchBarTitle();
  }

  if (!skipTab && !outlineColor) {
    switchTab('details');
    if (typeof isParcelDetailsFromList === 'function' && isParcelDetailsFromList()) {
      if (typeof highlightListNav === 'function') highlightListNav();
    } else if (isMobile()) {
      document.querySelectorAll('.bottom-tab').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === 'search');
      });
    } else {
      document.querySelectorAll('.rail-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === 'search');
      });
    }
    if (sidebar.classList.contains('hidden')) openSidebar();
  }
}

function doClear() {
  if (typeof leaveParcelDetailsFromList === 'function') leaveParcelDetailsFromList();
  clearGpsDot();
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  clearListParcels();
  currentParcel = null;
  var searchBarEl = document.getElementById('searchBar');
  var searchBarTextEl = document.getElementById('searchBarText');
  if (searchBarEl && searchBarTextEl) {
    searchBarTextEl.textContent = 'Search parcels';
    searchBarEl.classList.remove('has-result');
  }
  document.getElementById('bazarakiUrl').value = '';
  document.getElementById('bazarakiClear').classList.remove('visible');
  document.getElementById('sheet').value = '';
  document.getElementById('plan').value = '';
  document.getElementById('parcel').value = '';
  document.getElementById('regBlock').value = '0';
  document.getElementById('district').value = '';
  populateMunicipalitySelect('');
  document.getElementById('municipality').value = '';
  showError('');
  history.replaceState(null, '', window.location.pathname);
  map.setView([35.0, 33.4], 9);
}

function updateURL(sheet, plan, parcelNbr, distCode, vilCode) {
  var params = new URLSearchParams(window.location.search);
  if (sheet) params.set('sheet', sheet);
  else params.delete('sheet');
  if (plan) params.set('plan', plan);
  else params.delete('plan');
  params.set('parcel', parcelNbr);
  if (distCode) params.set('district', distCode);
  else params.delete('district');
  if (vilCode !== undefined && vilCode !== null && vilCode !== '') params.set('municipality', vilCode);
  else params.delete('municipality');
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
  var regBlockEl = document.getElementById('regBlock');
  var regBlock = (regBlockEl && regBlockEl.value.trim()) || '0';
  var distCode = document.getElementById('district').value;
  var muniVal = document.getElementById('municipality').value;
  var vilCode = '';
  var muniName = '';
  var parsed = parseMuniOptionValue(muniVal);
  if (parsed) {
    distCode = parsed.distCode;
    vilCode = parsed.vilCode;
    document.getElementById('district').value = distCode;
    var m = findMuni(distCode, vilCode);
    if (m) muniName = m.name;
  }
  var municipality = _searchMunicipality;
  _searchMunicipality = null;

  showError('');

  if (!parcelNbr) {
    showError('Enter a parcel or registration number.');
    return;
  }
  if (!sheet && !plan && !distCode && !vilCode) {
    showError('Select District and Municipality.');
    return;
  }
  if (!sheet && !plan && (!distCode || !vilCode)) {
    showError('Select District and Municipality to search by number.');
    return;
  }

  clearGpsDot();

  var btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching...';

  var searchNumber = parcelNbr;
  var searchPromise;

  if (!sheet && !plan && distCode && vilCode) {
    searchPromise = tryRegistrationSearch(distCode, vilCode, regBlock, searchNumber);
  } else {
    searchPromise = findParcels(parcelNbr, distCode, vilCode, sheet || null, plan || null).then(function(data) {
      if ((data.features || []).length) return { features: data.features, viaRegistration: false };
      if (distCode && vilCode) {
        return tryRegistrationSearch(distCode, vilCode, regBlock, parcelNbr);
      }
      return { features: [], viaRegistration: false };
    });
  }

  searchPromise
    .then(function(result) {
      if (gen !== _searchGen) return;
      var features = result.features || [];
      var viaRegistration = result.viaRegistration;
      var matchedRegNo = result.regNo || searchNumber;
      if (!features.length) {
        var msg = viaRegistration
          ? 'No property found for registration ' + matchedRegNo + ' in ' + (muniName || 'this municipality') + '.'
          : null;
        var explain = msg
          ? Promise.resolve(msg)
          : ((sheet || plan)
            ? explainNoParcel(sheet, plan, parcelNbr, distCode, vilCode, muniName)
            : Promise.resolve('No parcel found in ' + (muniName || 'this area') + '.'));
        return explain.then(function(errMsg) {
          if (gen !== _searchGen) return;
          showError(errMsg);
          btn.disabled = false;
          btn.textContent = 'Find Parcel';
        });
      }
      return pickFeatureByMunicipality(features, municipality || muniName)
        .then(function(feature) {
          if (gen !== _searchGen) return;
          var attrs = feature.attributes;
          var resSheet = attrs.SHEET || sheet;
          var resPlan = attrs.PLAN_NBR || plan;
          var resParcel = attrs.PARCEL_NBR || parcelNbr;
          document.getElementById('sheet').value = resSheet || '';
          document.getElementById('plan').value = resPlan || '';
          document.getElementById('parcel').value = resParcel || '';
          var center = centroid(feature.geometry.rings);
          map.setView([center[0], center[1]], 18);
          updateURL(resSheet || '', resPlan || '', String(resParcel), distCode, vilCode);

          return enrich(center[0], center[1]).then(function(extra) {
            if (gen !== _searchGen) return;
            var regSeed = viaRegistration
              ? { registration_no: matchedRegNo, registration_block: result.regBlock != null ? result.regBlock : regBlock }
              : {};
            return resolveRegistrationForAttrs(regSeed, attrs).then(function(regMeta) {
              if (gen !== _searchGen) return;
              showParcel(feature, extra, null, regMeta);
              if (viaRegistration) {
                showError(
                  'Registration ' + matchedRegNo + ' → Parcel ' + resParcel + ' (Sheet ' + resSheet + ' / Plan ' + resPlan + ')',
                  'warn'
                );
              } else if (features.length > 1 && (!sheet || !plan)) {
                showError(
                  'Found ' + features.length + ' matches for parcel ' + parcelNbr +
                  '. Showing Sheet ' + resSheet + ' / Plan ' + resPlan + '.',
                  'warn'
                );
              }
              btn.disabled = false;
              btn.textContent = 'Find Parcel';
            });
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

function nearestFeature(features, lat, lng) {
  var best = null, bestDist = Infinity;
  features.forEach(function(f) {
    var c = centroid(f.geometry.rings);
    var d = (c[0] - lat) * (c[0] - lat) + (c[1] - lng) * (c[1] - lng);
    if (d < bestDist) { bestDist = d; best = f; }
  });
  return best;
}

function resolveParcelAtLatLng(lat, lng, gen) {
  return findParcelByCoords(lat, lng).then(function(result) {
    if (gen !== _searchGen) return null;
    var features = result.features || [];
    if (features.length) return { feature: features[0], approx: false };
    return findParcelNearby(lat, lng).then(function(nearby) {
      if (gen !== _searchGen) return null;
      var nf = nearby.features || [];
      if (!nf.length) return null;
      return { feature: nearestFeature(nf, lat, lng), approx: true };
    });
  });
}

function applyResolvedParcel(feature, approx, gen, approxHint) {
  var attrs = feature.attributes;
  document.getElementById('sheet').value = attrs.SHEET || '';
  document.getElementById('plan').value = attrs.PLAN_NBR || '';
  document.getElementById('parcel').value = attrs.PARCEL_NBR || '';
  document.getElementById('district').value = attrs.DIST_CODE ? String(attrs.DIST_CODE) : '';
  setMunicipalitySelection(attrs.DIST_CODE, attrs.VIL_CODE);
  var center = centroid(feature.geometry.rings);
  map.setView([center[0], center[1]], 18);
  updateURL(attrs.SHEET || '', attrs.PLAN_NBR || '', attrs.PARCEL_NBR || '', attrs.DIST_CODE || '', attrs.VIL_CODE);
  return enrich(center[0], center[1]).then(function(extra) {
    if (gen !== _searchGen) return;
    return resolveRegistrationForAttrs({}, attrs).then(function(regMeta) {
      if (gen !== _searchGen) return;
      showParcel(feature, extra, null, regMeta);
      if (approx) {
        showError(approxHint || 'Approximate match — the pin was not exactly on a parcel. Please verify this is the correct parcel.', 'warn');
      }
    });
  });
}

function doBazarakiSearch() {
  var input = document.getElementById('bazarakiUrl');
  var rawUrl = input.value.trim();
  if (!rawUrl) { showError('Paste a Bazaraki link.'); return; }
  if (!/^https?:\/\/(www\.)?bazaraki\.com\/adv\//.test(rawUrl)) {
    showError('Not a valid Bazaraki listing URL.');
    return;
  }

  _searchGen++;
  var gen = _searchGen;
  showError('');
  clearGpsDot();
  var btn = document.getElementById('bazarakiBtn');
  btn.disabled = true;
  btn.textContent = '...';

  var overlay = document.getElementById('mapLoadingOverlay');
  if (overlay) { overlay.querySelector('span').textContent = 'Looking up Bazaraki listing...'; overlay.classList.remove('hidden'); }

  fetch(API_BASE + '/bazaraki?url=' + encodeURIComponent(rawUrl))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (gen !== _searchGen) return;
      if (data.error) { showError(data.error); return; }
      var lat = data.lat, lng = data.lng;
      map.setView([lat, lng], 18);

      return resolveParcelAtLatLng(lat, lng, gen).then(function(res) {
        if (!res || !res.feature || gen !== _searchGen) {
          if (gen === _searchGen) showError('No parcel found near this location.');
          return;
        }
        return applyResolvedParcel(res.feature, res.approx, gen, 'Approximate match — listing pin was not exact. Please verify this is the correct parcel.');
      });
    })
    .catch(function(err) {
      if (gen !== _searchGen) return;
      showError('Bazaraki lookup failed: ' + err.message);
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = 'Go';
      if (overlay) overlay.classList.add('hidden');
    });
}

function doMyLocationSearch() {
  if (!navigator.geolocation) {
    showError('Location is not supported in this browser.');
    return;
  }
  _searchGen++;
  var gen = _searchGen;
  showError('');
  var btn = document.getElementById('mapLocateBtn');
  if (btn) btn.disabled = true;
  var overlay = document.getElementById('mapLoadingOverlay');
  if (overlay) {
    overlay.querySelector('span').textContent = 'Getting your location...';
    overlay.classList.remove('hidden');
  }

  function finish() {
    if (btn) { btn.disabled = false; }
    if (overlay) overlay.classList.add('hidden');
  }

  var approxHint = 'Approximate match — GPS was not exactly on a parcel boundary. Please verify this is the correct parcel.';

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      if (gen !== _searchGen) { finish(); return; }
      if (overlay) overlay.querySelector('span').textContent = 'Finding parcel...';
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      map.setView([lat, lng], 18);
      showGpsDot(lat, lng);

      resolveParcelAtLatLng(lat, lng, gen).then(function(res) {
        if (!res || !res.feature) {
          if (gen === _searchGen) showError('No parcel found near your location.');
          return;
        }
        var feature = res.feature;
        var approx = res.approx;

        if (isSaleTabActive()) {
          var attrs = feature.attributes;
          var clean = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
          var sheet = clean(attrs.SHEET);
          var plan = clean(attrs.PLAN_NBR);
          var parcel = clean(attrs.PARCEL_NBR);
          var listing = saleListings.find(function(l) {
            return clean(l.sheet) === sheet && clean(l.plan_nbr) === plan && clean(l.parcel_nbr) === parcel;
          });
          function showSaleOnMapFromGps(theListing, theFeature) {
            saleMarkersGroup.clearLayers();
            _skipTabSwitch = true;
            var center = centroid(theFeature.geometry.rings);
            map.setView([center[0], center[1]], 18);
            var pl = theListing.price ? '€' + Number(theListing.price).toLocaleString() : '—';
            var pi = L.divIcon({ className: 'sale-marker', html: '<div class="sale-marker-label">' + pl + '</div>', iconSize: [80, 24], iconAnchor: [40, 12] });
            return enrich(center[0], center[1]).then(function(extra) {
              if (gen !== _searchGen) return;
              showParcel(theFeature, extra, '#16a34a');
              if (approx) showError('Approximate match — GPS was not exactly on a parcel boundary. Please verify.', 'warn');
              saleMarkersGroup.addLayer(L.marker([center[0], center[1]], { icon: pi }));
              if (typeof showSaleDetailInPanel === 'function') showSaleDetailInPanel(theListing);
              var el = document.getElementById('searchBarText');
              if (el) {
                el.textContent = theListing.title || ('Parcel ' + theListing.parcel_nbr);
                document.getElementById('searchBar').classList.add('has-result');
              }
            });
          }
          if (listing) {
            return showSaleOnMapFromGps(listing, feature);
          }
          return fetch('/api/listings/check?sheet=' + encodeURIComponent(sheet) + '&plan_nbr=' + encodeURIComponent(plan) + '&parcel_nbr=' + encodeURIComponent(parcel))
            .then(function(r) { return r.json(); })
            .then(function(results) {
              if (gen !== _searchGen) return;
              var active = results.find(function(l) { return l.status === 'active'; });
              if (active) return showSaleOnMapFromGps(active, feature);
              return applyResolvedParcel(feature, approx, gen, approxHint);
            });
        }
        return applyResolvedParcel(feature, approx, gen, approxHint);
      }).catch(function() {}).finally(finish);
    },
    function() {
      if (gen === _searchGen) showError('Could not get your location. Check that permission is allowed.');
      finish();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

document.querySelectorAll('.search-mode-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.search-mode-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.search-mode-panel').forEach(function(p) { p.classList.remove('active'); });
    this.classList.add('active');
    var mode = this.getAttribute('data-search-mode');
    document.getElementById('searchMode' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
  });
});

document.getElementById('bazarakiUrl').addEventListener('input', function() {
  document.getElementById('bazarakiClear').classList.toggle('visible', this.value.length > 0);
});

document.getElementById('bazarakiClear').addEventListener('click', function() {
  document.getElementById('bazarakiUrl').value = '';
  this.classList.remove('visible');
  document.getElementById('bazarakiUrl').focus();
});

document.getElementById('bazarakiUrl').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); doBazarakiSearch(); }
});

function navigateToParcel(sheet, planNbr, parcelNbr, distCode, vilCode) {
  document.getElementById('sheet').value = sheet;
  document.getElementById('plan').value = planNbr;
  document.getElementById('parcel').value = parcelNbr;
  document.getElementById('district').value = distCode || '';
  setMunicipalitySelection(distCode || '', vilCode || '');
  doSearch();
}

function buildParcelShareUrlForItem(item, listId) {
  if (!item) return window.location.href;
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var params = new URLSearchParams();
  params.set('tab', 'search');
  params.set('sheet', norm(item.sheet));
  params.set('plan', norm(item.plan_nbr));
  params.set('parcel', norm(item.parcel_nbr));
  if (item.dist_code) params.set('district', String(item.dist_code));
  var muniForUrl = item.municipality || (currentParcel && currentParcel.municipality);
  var distForUrl = item.dist_code || (currentParcel && currentParcel.dist_code);
  var vilForUrl = vilCodeFromMunicipality(muniForUrl, distForUrl);
  if (vilForUrl) params.set('municipality', vilForUrl);
  if (listId) params.set('list', listId);
  if (currentParcel &&
      norm(currentParcel.sheet) === norm(item.sheet) &&
      norm(currentParcel.plan_nbr) === norm(item.plan_nbr) &&
      norm(currentParcel.parcel_nbr) === norm(item.parcel_nbr)) {
    var c = map.getCenter();
    params.set('lat', c.lat.toFixed(6));
    params.set('lng', c.lng.toFixed(6));
    params.set('z', map.getZoom());
  }
  return window.location.origin + window.location.pathname + '?' + params.toString();
}

function shareParcelFromList(item) {
  if (!item) return;
  var url = buildParcelShareUrlForItem(item, currentListId);
  var ref = formatParcelRefLine(item);
  var title = item.parcel_title ? item.parcel_title : ref;
  if (navigator.share) {
    navigator.share({ title: title, text: title, url: url }).catch(function() {
      if (navigator.clipboard) navigator.clipboard.writeText(url);
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
  }
}

function shareCurrentParcel() {
  if (!currentParcel) return;
  var url = buildParcelShareUrlForItem(currentParcel, null);
  var ref = formatParcelRefLine(currentParcel);
  if (navigator.share) {
    navigator.share({ title: ref, text: ref, url: url }).catch(function() {
      if (navigator.clipboard) navigator.clipboard.writeText(url);
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
  }
  var shareBtn = document.getElementById('detailsShareBtn');
  if (shareBtn) {
    shareBtn.classList.add('done');
    setTimeout(function() { shareBtn.classList.remove('done'); }, 1500);
  }
}

(function initDetailsActionButtons() {
  document.getElementById('detailsContent').addEventListener('click', function(e) {
    if (e.target.closest('#detailsAddBtn')) {
      if (typeof openSavePanel === 'function') openSavePanel();
      return;
    }
    if (e.target.closest('#detailsShareBtn')) {
      shareCurrentParcel();
    }
  });
})();

async function prepareParcelFromListItem(item) {
  if (!item) return false;
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var sheet = norm(item.sheet);
  var plan = norm(item.plan_nbr);
  var parcelNbr = norm(item.parcel_nbr);
  var distCode = item.dist_code ? String(item.dist_code) : '';
  showError('');
  try {
    var feature = await resolveParcelFeature(sheet, plan, parcelNbr, distCode, item.municipality);
    if (!feature) {
      showError('Could not load this saved parcel.');
      return false;
    }
    var attrs = feature.attributes;
    var blockCode = resolveBlockCode(attrs, item);
    if (blockCode) attrs.BLCK_CODE = blockCode;
    var center = centroid(feature.geometry.rings);
    map.setView([center[0], center[1]], 18);
    var extra = await enrich(center[0], center[1]);
    var regMeta = await Promise.resolve(applyRegistrationMeta(registrationMetaFromItem(item), attrs));
    var clean = norm;
    currentParcel = {
      sheet: clean(attrs.SHEET),
      plan_nbr: clean(attrs.PLAN_NBR),
      parcel_nbr: clean(attrs.PARCEL_NBR),
      dist_code: attrs.DIST_CODE || null,
      district: extra.district || '',
      municipality: extra.municipality || '',
      quarter: extra.quarter || '',
      planning_zone: extra.planning_zone || '',
      planning_zone_desc: extra.planning_zone_desc || '',
      block_code: blockCode,
      postal_code: extra.postal_code || '',
      registration_no: regMeta.registration_no || null,
      registration_block: regMeta.registration_block || null,
      centroid_lat: center[0],
      centroid_lng: center[1],
      geometry_rings: JSON.stringify(feature.geometry.rings)
    };
    if (parcelLayer) map.removeLayer(parcelLayer);
    clearListParcels();
    currentParcelOutlineOverride = null;
    var coords = feature.geometry.rings[0].map(function(p) { return [p[1], p[0]]; });
    var color = typeof getParcelOutlineColorForRecord === 'function'
      ? getParcelOutlineColorForRecord(item)
      : '#ff0000';
    parcelLayer = L.polygon(coords, {
      color: color, weight: 4, fillColor: color, fillOpacity: 0.3
    }).addTo(map);
    switchTab('listParcels');
    if (typeof highlightListNav === 'function') highlightListNav();
    if (sidebar.classList.contains('hidden')) openSidebar();
    return true;
  } catch (err) {
    showError('Failed to load parcel: ' + err.message);
    return false;
  }
}

async function openSavedParcelFromList(item) {
  if (!item) return;
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var sheet = norm(item.sheet);
  var plan = norm(item.plan_nbr);
  var parcelNbr = norm(item.parcel_nbr);
  var distCode = item.dist_code ? String(item.dist_code) : '';
  showError('');
  try {
    var feature = await resolveParcelFeature(sheet, plan, parcelNbr, distCode, item.municipality);
    if (!feature) {
      showError('Could not load this saved parcel.');
      return;
    }
    var attrs = feature.attributes;
    var blockCode = resolveBlockCode(attrs, item);
    if (blockCode) attrs.BLCK_CODE = blockCode;
    document.getElementById('sheet').value = attrs.SHEET || sheet;
    document.getElementById('plan').value = attrs.PLAN_NBR || plan;
    document.getElementById('parcel').value = attrs.PARCEL_NBR || parcelNbr;
    document.getElementById('district').value = attrs.DIST_CODE ? String(attrs.DIST_CODE) : distCode;
    setMunicipalitySelection(attrs.DIST_CODE, attrs.VIL_CODE);
    var center = centroid(feature.geometry.rings);
    map.setView([center[0], center[1]], 18);
    updateURL(
      attrs.SHEET || sheet,
      attrs.PLAN_NBR || plan,
      String(attrs.PARCEL_NBR || parcelNbr),
      attrs.DIST_CODE || distCode,
      attrs.VIL_CODE
    );
    var extra = await enrich(center[0], center[1]);
    var regMeta = await resolveRegistrationForAttrs(registrationMetaFromItem(item), attrs);
    enterParcelDetailsFromList();
    showParcel(feature, extra, null, regMeta);
    openSidebar();
  } catch (err) {
    showError('Failed to load parcel: ' + err.message);
  }
}

function clearListParcels() {
  listParcelsGroup.clearLayers();
  listParcelMapLayers = {};
  listParcelMapHoverId = null;
}

function isListParcelsOnMap() {
  return Object.keys(listParcelMapLayers).length > 0;
}

function showListParcelMapTooltip(parcelId) {
  var poly = listParcelMapLayers[parcelId];
  if (!poly) return;
  if (poly.getTooltip()) poly.openTooltip(poly.getBounds().getCenter());
  var item = typeof currentListParcels !== 'undefined'
    ? currentListParcels.find(function(p) { return p.id === parcelId; })
    : null;
  var outlineColor = typeof getParcelOutlineColorForRecord === 'function' && item
    ? getParcelOutlineColorForRecord(item)
    : '#ff0000';
  poly.setStyle({ color: outlineColor, weight: 5, fillColor: outlineColor, fillOpacity: 0.45 });
  poly.bringToFront();
}

function hideListParcelMapTooltip(parcelId) {
  var poly = listParcelMapLayers[parcelId];
  if (!poly) return;
  if (poly.getTooltip()) poly.closeTooltip();
  var item = typeof currentListParcels !== 'undefined'
    ? currentListParcels.find(function(p) { return p.id === parcelId; })
    : null;
  var outlineColor = typeof getParcelOutlineColorForRecord === 'function' && item
    ? getParcelOutlineColorForRecord(item)
    : '#ff0000';
  poly.setStyle({ color: outlineColor, weight: 4, fillColor: outlineColor, fillOpacity: 0.3 });
}

function showAllListParcels(parcels) {
  _searchGen++;
  clearGpsDot();
  clearListParcels();
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  currentParcel = null;

  var btn = document.getElementById('showAllParcelsBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  var queries = parcels.map(function(p) {
    return resolveParcelFeature(p.sheet, p.plan_nbr, p.parcel_nbr, p.dist_code, p.municipality);
  });

  Promise.all(queries).then(function(features) {
    var bounds = L.latLngBounds([]);
    features.forEach(function(feature, i) {
      var item = parcels[i];
      if (!feature) return;
      var coords = feature.geometry.rings[0].map(function(p) { return [p[1], p[0]]; });
      var outlineColor = typeof getParcelOutlineColorForRecord === 'function'
        ? getParcelOutlineColorForRecord(item)
        : '#ff0000';
      var poly = L.polygon(coords, {
        color: outlineColor, weight: 4, fillColor: outlineColor, fillOpacity: 0.3,
        className: 'saved-parcel-map-polygon'
      });
      var tooltipHTML = typeof buildSavedParcelMapTooltip === 'function'
        ? buildSavedParcelMapTooltip(item)
        : '';
      if (tooltipHTML) {
        poly.bindTooltip(tooltipHTML, {
          sticky: true,
          direction: 'top',
          className: 'saved-parcel-map-tooltip',
          opacity: 1
        });
      }
      if (item.id) listParcelMapLayers[item.id] = poly;
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
  clearGpsDot();

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
      setMunicipalitySelection(attrs.DIST_CODE, attrs.VIL_CODE);

      var center = centroid(feature.geometry.rings);
      updateURL(attrs.SHEET || '', attrs.PLAN_NBR || '', attrs.PARCEL_NBR || '', attrs.DIST_CODE || '', attrs.VIL_CODE);

      return enrich(center[0], center[1]).then(function(extra) {
        return resolveRegistrationForAttrs({}, attrs).then(function(regMeta) {
          showParcel(feature, extra, null, regMeta);
        });
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

  if (parcelNbr) {
    document.getElementById('sheet').value = sheet || '';
    document.getElementById('plan').value = plan || '';
    document.getElementById('parcel').value = parcelNbr;
    if (distCode) document.getElementById('district').value = distCode;
    var vilCode = params.get('municipality');
    if (distCode && vilCode) setMunicipalitySelection(distCode, vilCode);
    else if (vilCode && vilCode.indexOf(':') >= 0) {
      var muniParsed = parseMuniOptionValue(vilCode);
      if (muniParsed) {
        document.getElementById('district').value = muniParsed.distCode;
        setMunicipalitySelection(muniParsed.distCode, muniParsed.vilCode);
      }
    }
    doSearch();
  }
}

document.getElementById('district').addEventListener('change', function() {
  populateMunicipalitySelect(this.value);
});

document.getElementById('municipality').addEventListener('change', function() {
  var parsed = parseMuniOptionValue(this.value);
  if (parsed) document.getElementById('district').value = parsed.distCode;
});
