var parcelSavedLists = [];
var parcelSavedRecords = [];

function parseSavedPhotoKeys(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function savedParcelImageUrl(key) {
  return API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(key);
}

function formatAreaSqm(val) {
  if (val == null || val === '') return '';
  var n = Number(val);
  if (isNaN(n)) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m\u00b2';
}

function formatOwnershipPct(val) {
  if (val == null || val === '') return '';
  var n = Number(val);
  if (isNaN(n)) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%';
}

function parseOwnershipFraction(input) {
  if (!input || !String(input).trim()) return { fraction: null, pct: null };
  var str = String(input).trim();
  var m = str.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!m) return { error: 'Enter a fraction like 1/2 or 3/4' };
  var num = Number(m[1]);
  var den = Number(m[2]);
  if (!den || den <= 0 || num < 0) return { error: 'Invalid fraction' };
  if (num > den) return { error: 'Fraction cannot exceed 1 (use 1/1 for 100%)' };
  var pct = (num / den) * 100;
  var gcd = function(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a;
  };
  var g = gcd(num, den);
  return { fraction: (num / g) + '/' + (den / g), pct: pct };
}

function formatOwnershipDisplay(record) {
  if (!record) return '';
  if (record.ownership_fraction) {
    var pctText = record.ownership_pct != null && record.ownership_pct !== ''
      ? formatOwnershipPct(record.ownership_pct)
      : '';
    return pctText ? record.ownership_fraction + ' (' + pctText + ')' : record.ownership_fraction;
  }
  if (record.ownership_pct != null && record.ownership_pct !== '') {
    return formatOwnershipPct(record.ownership_pct);
  }
  return '';
}

var PARCEL_OUTLINE_FULL = '#2563eb';
var PARCEL_OUTLINE_PARTIAL = '#ff0000';

function isFullOwnership(record) {
  if (!record) return false;
  if (record.ownership_pct != null && record.ownership_pct !== '') {
    var n = Number(record.ownership_pct);
    if (!isNaN(n) && n >= 99.995) return true;
  }
  if (record.ownership_fraction === '1/1') return true;
  return false;
}

function getParcelOutlineColorForRecord(record) {
  return isFullOwnership(record) ? PARCEL_OUTLINE_FULL : PARCEL_OUTLINE_PARTIAL;
}

function buildSavedParcelMapTooltip(item) {
  if (!item) return '';
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  var refLine = 'Parcel ' + norm(item.parcel_nbr) + ' \u2022 ' + norm(item.sheet) + '/' + norm(item.plan_nbr);
  var rows = [];

  var place = item.municipality || item.district || '';
  if (place) rows.push({ label: 'Place', value: place });

  var areaSqm = formatAreaSqm(item.area_sqm);
  if (areaSqm) rows.push({ label: 'Area', value: areaSqm });

  var ownership = formatOwnershipDisplay(item);
  if (ownership) rows.push({ label: 'Ownership', value: ownership });

  if (item.location_note) rows.push({ label: 'Location', value: item.location_note });

  var photos = parseSavedPhotoKeys(item.photo_keys);
  if (photos.length) rows.push({ label: 'Photos', value: photos.length + ' photo' + (photos.length === 1 ? '' : 's') });

  if (item.note) rows.push({ label: 'Note', value: String(item.note) });

  var titleHTML = item.parcel_title
    ? '<div class="saved-parcel-map-tooltip-title">' + escapeHTML(item.parcel_title) + '</div>' +
      '<div class="saved-parcel-map-tooltip-ref">' + escapeHTML(refLine) + '</div>'
    : '<div class="saved-parcel-map-tooltip-title">' + escapeHTML(refLine) + '</div>';

  var rowsHTML = rows.map(function(row) {
    return (
      '<div class="saved-parcel-map-tooltip-row">' +
        '<span class="saved-parcel-map-tooltip-label">' + escapeHTML(row.label) + '</span>' +
        '<span class="saved-parcel-map-tooltip-value">' + escapeHTML(row.value) + '</span>' +
      '</div>'
    );
  }).join('');

  return '<div class="saved-parcel-map-tooltip-inner">' + titleHTML + rowsHTML + '</div>';
}

function renderParcelMetaFields() {
  renderParcelTitleField();
  renderParcelAreaField();
  renderParcelOwnershipField();
  renderParcelLocationField();
  renderParcelPhotosField();
  renderParcelNoteField();
}

var parcelDetailsPhotoUploading = false;
var parcelDetailsPhotoUploadCount = 0;

async function uploadSavedParcelImage(file) {
  var res = await authFetch(API_BASE + '/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error('Upload failed');
  var data = await res.json();
  return data.key;
}

async function persistParcelPhotoKeys(parcelId, photoKeys) {
  var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(parcelId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_keys: photoKeys.length ? photoKeys : null })
  });
  if (!res.ok) throw new Error('Failed to save photos');
  var stored = photoKeys.length ? JSON.stringify(photoKeys) : null;
  parcelSavedRecords.forEach(function(rec) {
    if (rec.id === parcelId) rec.photo_keys = stored;
  });
  var listItem = currentListParcels.find(function(x) { return x.id === parcelId; });
  if (listItem) listItem.photo_keys = stored;
  if (typeof refreshListParcelPhotos === 'function') refreshListParcelPhotos(parcelId);
}

function renderParcelPhotosGridEl(grid, parcelId, photos, canEdit) {
  var srcs = photos.map(savedParcelImageUrl);
  var srcsJSON = escapeHTML(JSON.stringify(srcs));
  var thumbs = photos.map(function(k, i) {
    return (
      '<div class="parcel-details-photo-tile">' +
        '<img class="parcel-details-photo-thumb saved-parcel-photo" src="' + srcs[i] + '" alt="" data-photo-src="' + srcs[i] + '" data-all-photos=\'' + srcsJSON + '\' />' +
        (canEdit
          ? '<button type="button" class="parcel-details-photo-remove" data-parcel-details-photo-remove data-photo-key="' + escapeHTML(k) + '" title="Remove photo">&times;</button>'
          : '') +
      '</div>'
    );
  }).join('');

  var addBtn = canEdit
    ? '<button type="button" class="parcel-details-photo-add" id="parcelPhotoAddBtn" title="Add photo">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>' +
        '</svg>' +
        '<span>Add photo</span>' +
      '</button>'
    : '';

  grid.innerHTML = thumbs + addBtn;
}

function renderParcelPhotosField() {
  var section = document.getElementById('parcelPhotosSection');
  var grid = document.getElementById('parcelPhotosGrid');
  if (!section || !grid) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);

  if (!record) {
    section.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  grid.classList.remove('is-uploading');
  renderParcelPhotosGridEl(grid, record.id, parseSavedPhotoKeys(record.photo_keys), canEdit);
}

function showParcelPhotoUploading(count) {
  if (count) parcelDetailsPhotoUploadCount = count;
  var grid = document.getElementById('parcelPhotosGrid');
  if (!grid) return;
  grid.classList.add('is-uploading');
  var addBtn = document.getElementById('parcelPhotoAddBtn');
  if (addBtn) addBtn.classList.add('hidden');
  var need = parcelDetailsPhotoUploadCount || 1;
  var existing = grid.querySelectorAll('.parcel-details-photo-uploading').length;
  for (var i = existing; i < need; i++) {
    var tile = document.createElement('div');
    tile.className = 'parcel-details-photo-tile parcel-details-photo-uploading';
    tile.setAttribute('aria-live', 'polite');
    var label = need > 1 ? 'Uploading ' + (i + 1) + '/' + need + '…' : 'Uploading…';
    tile.innerHTML =
      '<div class="parcel-photo-upload-spinner" aria-hidden="true"></div>' +
      '<span class="parcel-photo-upload-label">' + label + '</span>';
    grid.appendChild(tile);
  }
}

async function uploadParcelPhotoBatch(parcelId, existingKeys, files) {
  var keys = existingKeys.slice();
  var failed = 0;
  for (var i = 0; i < files.length; i++) {
    try {
      var key = await uploadSavedParcelImage(files[i]);
      keys.push(key);
    } catch (err) {
      console.error(err);
      failed++;
    }
  }
  if (failed && keys.length === existingKeys.length) {
    throw new Error('Upload failed');
  }
  if (failed) showError(failed + ' photo(s) failed to upload.');
  if (keys.length > existingKeys.length) {
    await persistParcelPhotoKeys(parcelId, keys);
  }
}

function getParcelRefLabel() {
  if (!currentParcel) return '';
  return 'Parcel ' + currentParcel.parcel_nbr + ' \u2022 ' + currentParcel.sheet + '/' + currentParcel.plan_nbr;
}

function updateParcelSearchBarTitle(record) {
  if (typeof isParcelDetailsFromList === 'function' && isParcelDetailsFromList()) return;
  var searchBarEl = document.getElementById('searchBar');
  var searchBarTextEl = document.getElementById('searchBarText');
  if (!searchBarEl || !searchBarTextEl || !currentParcel) return;
  searchBarTextEl.textContent = (record && record.parcel_title) ? record.parcel_title : getParcelRefLabel();
  searchBarEl.classList.add('has-result');
}

function renderParcelTitleField() {
  var titleEl = document.getElementById('parcelTitleDisplay');
  var subEl = document.getElementById('parcelTitleSub');
  var editBtn = document.getElementById('parcelTitleEditBtn');
  var editor = document.getElementById('parcelTitleEditor');
  if (!titleEl || !currentParcel) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);
  var refLabel = getParcelRefLabel();

  if (editor) editor.classList.add('hidden');
  if (titleEl) titleEl.style.display = '';

  if (record && record.parcel_title) {
    titleEl.textContent = record.parcel_title;
    if (subEl) {
      subEl.textContent = refLabel;
      subEl.classList.remove('hidden');
    }
  } else {
    titleEl.textContent = refLabel;
    if (subEl) subEl.classList.add('hidden');
  }

  if (editBtn) {
    if (canEdit) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }

  if (canEdit) titleEl.classList.add('parcel-title-editable');
  else titleEl.classList.remove('parcel-title-editable');

  updateParcelSearchBarTitle(record);
}

function idsEqual(a, b) {
  return String(a || '') === String(b || '');
}

function getParcelTitleForEditing(record, titleEl) {
  if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();
  if (record && record.parcel_title) return String(record.parcel_title).trim();
  var listItem = record && record.id
    ? currentListParcels.find(function(x) { return idsEqual(x.id, record.id); })
    : findListParcelForCurrentParcel();
  if (listItem && listItem.parcel_title) return String(listItem.parcel_title).trim();
  return '';
}

function openParcelTitleEditor() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  closeParcelAreaEditor();
  closeParcelOwnershipEditor();
  closeParcelLocationEditor();
  var titleEl = document.getElementById('parcelTitleDisplay');
  var subEl = document.getElementById('parcelTitleSub');
  var editBtn = document.getElementById('parcelTitleEditBtn');
  var editor = document.getElementById('parcelTitleEditor');
  var input = document.getElementById('parcelTitleInput');
  if (!editor || !input) return;
  input.value = getParcelTitleForEditing(record, titleEl);
  editor.classList.remove('hidden');
  if (titleEl) titleEl.style.display = 'none';
  if (subEl) subEl.classList.add('hidden');
  if (editBtn) editBtn.classList.add('hidden');
  input.focus();
}

function closeParcelTitleEditor() {
  var editor = document.getElementById('parcelTitleEditor');
  if (editor) editor.classList.add('hidden');
  renderParcelTitleField();
}

async function saveParcelTitle() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  var input = document.getElementById('parcelTitleInput');
  if (!input) return;
  var titleVal = input.value.trim() || null;
  if (titleVal && titleVal.length > 120) {
    showError('Title must be 120 characters or less.');
    return;
  }
  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(record.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel_title: titleVal })
    });
    if (!res.ok) throw new Error('failed to save title');
    record.parcel_title = titleVal;
    var p = currentListParcels.find(function(x) { return x.id === record.id; });
    if (p) p.parcel_title = titleVal;
    closeParcelTitleEditor();
    renderSavedParcelDetails();
  } catch (err) {
    console.error(err);
    showError('Failed to save title.');
  }
}

function getActiveSavedParcelRecord() {
  var record = null;
  if (parcelSavedRecords.length) {
    if (currentListId) {
      record = parcelSavedRecords.find(function(r) { return idsEqual(r.list_id, currentListId); });
    }
    if (!record) record = parcelSavedRecords[0];
  }
  if (!record && currentParcel && currentListParcels.length) {
    record = findListParcelForCurrentParcel();
  }
  return mergeSavedParcelWithListItem(record);
}

function findListParcelForCurrentParcel() {
  if (!currentParcel || !currentListParcels.length) return null;
  var norm = function(v) { return String(v == null ? '' : v).replace(/\.0$/, ''); };
  return currentListParcels.find(function(p) {
    return norm(p.sheet) === norm(currentParcel.sheet) &&
      norm(p.plan_nbr) === norm(currentParcel.plan_nbr) &&
      norm(p.parcel_nbr) === norm(currentParcel.parcel_nbr) &&
      String(p.dist_code || '') === String(currentParcel.dist_code || '');
  });
}

function mergeSavedParcelWithListItem(record) {
  if (!record) return null;
  var listItem = record.id
    ? currentListParcels.find(function(x) { return idsEqual(x.id, record.id); })
    : findListParcelForCurrentParcel();
  if (!listItem) return record;
  var merged = Object.assign({}, listItem, record);
  ['parcel_title', 'note', 'area_sqm', 'ownership_fraction', 'ownership_pct', 'location_note', 'photo_keys'].forEach(function(key) {
    if ((merged[key] == null || merged[key] === '') && listItem[key] != null && listItem[key] !== '') {
      merged[key] = listItem[key];
    }
  });
  if (!merged.id && listItem.id) merged.id = listItem.id;
  if (!merged.list_id && listItem.list_id) merged.list_id = listItem.list_id;
  return merged;
}

function canEditSavedParcelRecord(record) {
  if (!record || !record.list_id) return false;
  if (idsEqual(currentListId, record.list_id) && currentListRole && currentListRole !== 'viewer') return true;
  if (userLists.some(function(l) { return l.id === record.list_id; })) return true;
  var shared = sharedLists.find(function(l) { return l.id === record.list_id; });
  return shared && shared.role === 'editor';
}

function renderParcelAreaField() {
  var valueEl = document.getElementById('parcelAreaValue');
  var editBtn = document.getElementById('parcelAreaEditBtn');
  var editor = document.getElementById('parcelAreaEditor');
  if (!valueEl) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);

  if (editor) editor.classList.add('hidden');
  if (valueEl) valueEl.style.display = '';

  if (!record) {
    valueEl.textContent = '\u2014';
    if (editBtn) editBtn.classList.add('hidden');
    return;
  }

  if (record.area_sqm != null && record.area_sqm !== '') {
    valueEl.textContent = formatAreaSqm(record.area_sqm);
  } else {
    valueEl.textContent = canEdit ? 'Add area' : '\u2014';
    if (canEdit) valueEl.classList.add('parcel-area-placeholder');
    else valueEl.classList.remove('parcel-area-placeholder');
  }
  if (record.area_sqm != null && record.area_sqm !== '') valueEl.classList.remove('parcel-area-placeholder');

  if (editBtn) {
    if (canEdit) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }
}

function openParcelAreaEditor() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  closeParcelOwnershipEditor();
  closeParcelLocationEditor();
  closeParcelTitleEditor();
  var valueEl = document.getElementById('parcelAreaValue');
  var editBtn = document.getElementById('parcelAreaEditBtn');
  var editor = document.getElementById('parcelAreaEditor');
  var input = document.getElementById('parcelAreaInput');
  if (!editor || !input) return;
  input.value = record.area_sqm != null && record.area_sqm !== '' ? String(record.area_sqm) : '';
  editor.classList.remove('hidden');
  if (valueEl) valueEl.style.display = 'none';
  if (editBtn) editBtn.classList.add('hidden');
  input.focus();
}

function closeParcelAreaEditor() {
  var editor = document.getElementById('parcelAreaEditor');
  var valueEl = document.getElementById('parcelAreaValue');
  var editBtn = document.getElementById('parcelAreaEditBtn');
  if (editor) editor.classList.add('hidden');
  if (valueEl) valueEl.style.display = '';
  renderParcelAreaField();
}

async function saveParcelArea() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  var input = document.getElementById('parcelAreaInput');
  if (!input) return;
  var raw = input.value.trim();
  var areaVal = raw === '' ? null : Number(raw);
  if (areaVal !== null && (isNaN(areaVal) || areaVal < 0)) {
    showError('Area must be a positive number.');
    return;
  }
  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(record.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_sqm: areaVal })
    });
    if (!res.ok) throw new Error('failed to save area');
    record.area_sqm = areaVal;
    var p = currentListParcels.find(function(x) { return x.id === record.id; });
    if (p) p.area_sqm = areaVal;
    closeParcelAreaEditor();
    renderSavedParcelDetails();
  } catch (err) {
    console.error(err);
    showError('Failed to save area.');
  }
}

function renderParcelOwnershipField() {
  var valueEl = document.getElementById('parcelOwnershipValue');
  var editBtn = document.getElementById('parcelOwnershipEditBtn');
  var editor = document.getElementById('parcelOwnershipEditor');
  if (!valueEl) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);

  if (editor) editor.classList.add('hidden');
  if (valueEl) valueEl.style.display = '';

  if (!record) {
    valueEl.textContent = '\u2014';
    if (editBtn) editBtn.classList.add('hidden');
    return;
  }

  if (record.ownership_fraction || record.ownership_pct != null && record.ownership_pct !== '') {
    valueEl.textContent = formatOwnershipDisplay(record);
    valueEl.classList.remove('parcel-area-placeholder');
    valueEl.classList.remove('parcel-ownership-full', 'parcel-ownership-partial');
    if (isFullOwnership(record)) valueEl.classList.add('parcel-ownership-full');
    else valueEl.classList.add('parcel-ownership-partial');
  } else {
    valueEl.textContent = canEdit ? 'Add ownership (e.g. 1/2)' : '\u2014';
    valueEl.classList.remove('parcel-ownership-full', 'parcel-ownership-partial');
    if (canEdit) valueEl.classList.add('parcel-area-placeholder');
    else valueEl.classList.remove('parcel-area-placeholder');
  }

  if (editBtn) {
    if (canEdit) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }
}

function openParcelOwnershipEditor() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  closeParcelAreaEditor();
  closeParcelLocationEditor();
  closeParcelTitleEditor();
  var valueEl = document.getElementById('parcelOwnershipValue');
  var editBtn = document.getElementById('parcelOwnershipEditBtn');
  var editor = document.getElementById('parcelOwnershipEditor');
  var input = document.getElementById('parcelOwnershipInput');
  if (!editor || !input) return;
  input.value = record.ownership_fraction || '';
  editor.classList.remove('hidden');
  if (valueEl) valueEl.style.display = 'none';
  if (editBtn) editBtn.classList.add('hidden');
  input.focus();
}

function closeParcelOwnershipEditor() {
  var editor = document.getElementById('parcelOwnershipEditor');
  if (editor) editor.classList.add('hidden');
  renderParcelOwnershipField();
}

async function saveParcelOwnership() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  var input = document.getElementById('parcelOwnershipInput');
  if (!input) return;
  var raw = input.value.trim();
  if (!raw) {
    try {
      var clearRes = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(record.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownership_fraction: null })
      });
      if (!clearRes.ok) throw new Error('failed to save ownership');
      record.ownership_fraction = null;
      record.ownership_pct = null;
      var cleared = currentListParcels.find(function(x) { return x.id === record.id; });
      if (cleared) {
        cleared.ownership_fraction = null;
        cleared.ownership_pct = null;
      }
      closeParcelOwnershipEditor();
      renderSavedParcelDetails();
      if (typeof updateParcelOwnershipAppearance === 'function') updateParcelOwnershipAppearance();
    } catch (err) {
      console.error(err);
      showError('Failed to save ownership.');
    }
    return;
  }
  var parsed = parseOwnershipFraction(raw);
  if (parsed.error) {
    showError(parsed.error);
    return;
  }
  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(record.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownership_fraction: parsed.fraction })
    });
    if (!res.ok) throw new Error('failed to save ownership');
    record.ownership_fraction = parsed.fraction;
    record.ownership_pct = parsed.pct;
    var p = currentListParcels.find(function(x) { return x.id === record.id; });
    if (p) {
      p.ownership_fraction = parsed.fraction;
      p.ownership_pct = parsed.pct;
    }
    closeParcelOwnershipEditor();
    renderSavedParcelDetails();
    if (typeof updateParcelOwnershipAppearance === 'function') updateParcelOwnershipAppearance();
  } catch (err) {
    console.error(err);
    showError('Failed to save ownership.');
  }
}

function renderParcelLocationField() {
  var valueEl = document.getElementById('parcelLocationValue');
  var editBtn = document.getElementById('parcelLocationEditBtn');
  var editor = document.getElementById('parcelLocationEditor');
  if (!valueEl) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);

  if (editor) editor.classList.add('hidden');
  if (valueEl) valueEl.style.display = '';

  if (!record) {
    valueEl.textContent = '\u2014';
    if (editBtn) editBtn.classList.add('hidden');
    return;
  }

  if (record.location_note) {
    valueEl.textContent = record.location_note;
    valueEl.classList.remove('parcel-area-placeholder');
  } else {
    valueEl.textContent = canEdit ? 'Add location' : '\u2014';
    if (canEdit) valueEl.classList.add('parcel-area-placeholder');
    else valueEl.classList.remove('parcel-area-placeholder');
  }

  if (editBtn) {
    if (canEdit) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
  }
}

function openParcelLocationEditor() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  closeParcelAreaEditor();
  closeParcelOwnershipEditor();
  closeParcelTitleEditor();
  var valueEl = document.getElementById('parcelLocationValue');
  var editBtn = document.getElementById('parcelLocationEditBtn');
  var editor = document.getElementById('parcelLocationEditor');
  var input = document.getElementById('parcelLocationInput');
  if (!editor || !input) return;
  input.value = record.location_note || '';
  editor.classList.remove('hidden');
  if (valueEl) valueEl.style.display = 'none';
  if (editBtn) editBtn.classList.add('hidden');
  input.focus();
}

function closeParcelLocationEditor() {
  var editor = document.getElementById('parcelLocationEditor');
  if (editor) editor.classList.add('hidden');
  renderParcelLocationField();
}

async function saveParcelLocation() {
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  var input = document.getElementById('parcelLocationInput');
  if (!input) return;
  var locationVal = input.value.trim() || null;
  if (locationVal && locationVal.length > 500) {
    showError('Location must be 500 characters or less.');
    return;
  }
  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(record.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_note: locationVal })
    });
    if (!res.ok) throw new Error('failed to save location');
    record.location_note = locationVal;
    var p = currentListParcels.find(function(x) { return x.id === record.id; });
    if (p) p.location_note = locationVal;
    closeParcelLocationEditor();
    renderSavedParcelDetails();
  } catch (err) {
    console.error(err);
    showError('Failed to save location.');
  }
}

function notePreviewSingleLine(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

function updateDetailsNoteLinePreview(noteVal) {
  var lineText = document.getElementById('parcelNoteLineText');
  var placeholder = document.getElementById('parcelNoteLinePlaceholder');
  var val = notePreviewSingleLine(noteVal);
  if (val) {
    if (placeholder) placeholder.classList.add('hidden');
    if (lineText) {
      lineText.textContent = val;
      lineText.classList.remove('hidden');
    }
  } else {
    if (lineText) lineText.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }
}

function openDetailsNoteEditor() {
  var box = document.querySelector('.parcel-details-note-box');
  var line = document.getElementById('parcelNoteLine');
  var input = document.getElementById('parcelNoteInput');
  if (!box || !line || !input || input.disabled) return;
  if (box.classList.contains('expanded')) return;
  var record = getActiveSavedParcelRecord();
  if (!record) return;
  input.value = record.note || '';
  line.classList.add('hidden');
  input.removeAttribute('hidden');
  box.classList.add('expanded');
  resizeDetailsNoteInput(input);
  input.focus();
}

function closeDetailsNoteEditor() {
  var box = document.querySelector('.parcel-details-note-box');
  var line = document.getElementById('parcelNoteLine');
  var input = document.getElementById('parcelNoteInput');
  if (!box || !line || !input) return;
  updateDetailsNoteLinePreview(input.value);
  input.setAttribute('hidden', '');
  input.style.height = '';
  line.classList.remove('hidden');
  box.classList.remove('expanded');
}

function renderParcelNoteField() {
  var section = document.getElementById('parcelNoteSection');
  var input = document.getElementById('parcelNoteInput');
  var line = document.getElementById('parcelNoteLine');
  if (!section || !input) return;

  var record = getActiveSavedParcelRecord();
  var canEdit = record && canEditSavedParcelRecord(record);
  var box = document.querySelector('.parcel-details-note-box');

  if (!record) {
    section.classList.add('hidden');
    input.value = '';
    input.disabled = true;
    if (box) box.classList.remove('expanded');
    return;
  }

  section.classList.remove('hidden');
  var note = record.note || '';
  if (input !== document.activeElement && (!box || !box.classList.contains('expanded'))) {
    input.value = note;
    updateDetailsNoteLinePreview(note);
    if (line) line.classList.remove('hidden');
    input.setAttribute('hidden', '');
    if (box) box.classList.remove('expanded');
  }
  input.disabled = !canEdit;
  input.readOnly = !canEdit;
  section.classList.toggle('parcel-details-note-readonly', !canEdit);
  if (line) line.disabled = !canEdit;
}

var noteAutosaveTimers = {};
var noteSavedFeedbackTimers = {};

function showNoteSavedFeedback(parcelId) {
  var active = getActiveSavedParcelRecord();
  if (active && active.id === parcelId) {
    var detailsMsg = document.getElementById('parcelNoteSavedMsg');
    if (detailsMsg) flashNoteSavedMessage(detailsMsg, 'details');
  }
  var listMsg = document.querySelector('[data-note-saved-msg="' + parcelId + '"]');
  if (listMsg) flashNoteSavedMessage(listMsg, parcelId);
}

function flashNoteSavedMessage(el, timerKey) {
  el.classList.remove('hidden');
  clearTimeout(noteSavedFeedbackTimers[timerKey]);
  noteSavedFeedbackTimers[timerKey] = setTimeout(function() {
    el.classList.add('hidden');
  }, 2000);
}

function scheduleParcelNoteAutosave(parcelId, rawValue) {
  clearTimeout(noteAutosaveTimers[parcelId]);
  noteAutosaveTimers[parcelId] = setTimeout(function() {
    flushParcelNoteAutosave(parcelId, rawValue);
  }, 600);
}

async function flushParcelNoteAutosave(parcelId, rawValue) {
  clearTimeout(noteAutosaveTimers[parcelId]);
  var noteVal = rawValue ? String(rawValue).trim() || null : null;
  var record = parcelSavedRecords.find(function(r) { return r.id === parcelId; });
  var listItem = currentListParcels.find(function(x) { return x.id === parcelId; });
  if (!record && !listItem) return;
  if (!record || !canEditSavedParcelRecord(record)) return;

  var current = record.note || null;
  if (current === noteVal) return;

  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(parcelId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteVal })
    });
    if (!res.ok) throw new Error('failed to save note');
    record.note = noteVal;
    if (listItem) listItem.note = noteVal;
    var detailsInput = document.getElementById('parcelNoteInput');
    var active = getActiveSavedParcelRecord();
    if (detailsInput && active && active.id === parcelId && detailsInput !== document.activeElement) {
      detailsInput.value = noteVal || '';
      updateDetailsNoteLinePreview(noteVal);
    }
    if (typeof updateListNoteLinePreview === 'function') {
      updateListNoteLinePreview(parcelId, noteVal);
    }
    showNoteSavedFeedback(parcelId);
  } catch (err) {
    console.error(err);
    showError('Failed to save note.');
  }
}

function renderSavedParcelDetails() {
  var container = document.getElementById('savedParcelExtra');
  if (!container) return;

  var records = parcelSavedRecords.slice();
  if (currentListId) {
    var inList = records.filter(function(r) { return r.list_id === currentListId; });
    if (inList.length) records = inList;
  }

  var sections = records.map(function(r) {
    if (!r.parcel_title) return '';
    var label = r.list_name ? escapeHTML(r.list_name) : 'Saved list';
    var customTitleHTML = '<div class="saved-parcel-custom-title">' + escapeHTML(r.parcel_title) + '</div>';
    return (
      '<div class="saved-parcel-block">' +
        '<div class="saved-parcel-label">' + label + '</div>' +
        customTitleHTML +
      '</div>'
    );
  }).filter(Boolean);

  container.innerHTML = sections.join('');
  container.style.display = sections.length ? '' : 'none';
  renderParcelMetaFields();
}

async function checkParcelSaved() {
  var listSeed = findListParcelForCurrentParcel();
  parcelSavedLists = [];
  parcelSavedRecords = [];
  if (listSeed) {
    parcelSavedRecords = [mergeSavedParcelWithListItem(Object.assign({}, listSeed))];
    parcelSavedLists = [listSeed.list_id];
    updateSaveButton();
    renderSavedParcelDetails();
    renderParcelMetaFields();
    if (typeof updateParcelOwnershipAppearance === 'function') updateParcelOwnershipAppearance();
  }
  if (!authUser || !currentParcel) {
    if (!listSeed) {
      updateSaveButton();
      renderSavedParcelDetails();
      renderParcelMetaFields();
      if (typeof updateParcelOwnershipAppearance === 'function') updateParcelOwnershipAppearance();
    }
    return;
  }
  try {
    var qs = 'sheet=' + encodeURIComponent(currentParcel.sheet) +
      '&plan_nbr=' + encodeURIComponent(currentParcel.plan_nbr) +
      '&parcel_nbr=' + encodeURIComponent(currentParcel.parcel_nbr);
    if (currentParcel.dist_code) qs += '&dist_code=' + encodeURIComponent(currentParcel.dist_code);
    var res = await authFetch(API_BASE + '/parcels/check?' + qs);
    if (res.ok) {
      var data = await res.json();
      if (Array.isArray(data)) {
        if (data.length && typeof data[0] === 'string') {
          parcelSavedRecords = data.map(function(listId) { return { list_id: listId }; });
        } else {
          parcelSavedRecords = data.map(function(r) { return mergeSavedParcelWithListItem(r); });
        }
        parcelSavedLists = parcelSavedRecords.map(function(r) { return r.list_id; });
      }
    }
  } catch (e) { /* silent */ }
  updateSaveButton();
  renderSavedParcelDetails();
  if (typeof updateParcelOwnershipAppearance === 'function') updateParcelOwnershipAppearance();
}

function updateSaveButton() {
  var btn = document.getElementById('detailsAddBtn');
  if (!btn) return;
  var label = btn.parentElement.querySelector('.action-label');
  if (parcelSavedLists.length > 0) {
    btn.classList.add('is-saved');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    label.textContent = 'Saved';
  } else {
    btn.classList.remove('is-saved');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    label.textContent = 'Save';
  }
}

function renderSavePanel() {
  var picker = document.getElementById('saveListPicker');
  var allLists = userLists.length || sharedLists.length;
  if (!allLists) {
    picker.innerHTML = '<div style="color:#64748b; font-size:12px; margin-bottom:8px;">No lists yet. Create one below.</div>';
    return;
  }

  function renderItem(list, canToggle) {
    var isSaved = parcelSavedLists.indexOf(list.id) !== -1;
    var icon = isSaved
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    var check = isSaved
      ? '<svg class="save-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : '';
    var cls = 'save-list-item' + (isSaved ? ' saved' : '') + (!canToggle ? ' save-list-readonly' : '');
    var attr = canToggle ? ' data-save-to="' + list.id + '"' : '';
    return (
      '<div class="' + cls + '"' + attr + '>' +
        icon +
        '<span class="save-list-name">' + escapeHTML(list.name) + '</span>' +
        check +
      '</div>'
    );
  }

  var html = userLists.map(function(list) {
    return renderItem(list, true);
  }).join('');

  if (sharedLists.length) {
    var relevantShared = sharedLists.filter(function(list) {
      var isSaved = parcelSavedLists.indexOf(list.id) !== -1;
      return isSaved || list.role === 'editor';
    });
    if (relevantShared.length) {
      html += '<div style="font-size:11px;color:#64748b;margin:10px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Shared with me</div>';
      html += relevantShared.map(function(list) {
        var canToggle = list.role === 'editor';
        return renderItem(list, canToggle);
      }).join('');
    }
  }

  picker.innerHTML = html;
}

async function openSavePanel() {
  if (!authUser) { handleAuthClick('Sign in to save parcels'); return; }
  await checkParcelSaved();
  var title = document.querySelector('.save-panel-title');
  title.textContent = parcelSavedLists.length > 0 ? 'Saved in your lists' : 'Save to list';
  renderSavePanel();
  document.getElementById('saveModal').classList.remove('hidden');
}

function closeSavePanel() {
  document.getElementById('saveModal').classList.add('hidden');
}

document.getElementById('saveListPicker').addEventListener('click', async function(e) {
  var item = e.target.closest('[data-save-to]');
  if (!item || !currentParcel) return;
  var listId = item.getAttribute('data-save-to');
  var isSaved = item.classList.contains('saved');

  if (isSaved) {
    try {
      var parcelsRes = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/parcels');
      if (!parcelsRes.ok) throw new Error('failed');
      var parcels = await parcelsRes.json();
      var norm = function(s) { return String(s == null ? '' : s).replace(/\.0$/, ''); };
      var match = parcels.find(function(p) {
        return norm(p.sheet) === norm(currentParcel.sheet) &&
          norm(p.plan_nbr) === norm(currentParcel.plan_nbr) &&
          norm(p.parcel_nbr) === norm(currentParcel.parcel_nbr) &&
          String(p.dist_code || '') == String(currentParcel.dist_code || '');
      });
      if (match) {
        var delRes = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(match.id), {
          method: 'DELETE'
        });
        if (!delRes.ok) throw new Error('failed');
      }
      await loadLists();
      await checkParcelSaved();
      renderSavePanel();
    } catch (err) { console.error(err); }
    return;
  }

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentParcel)
    });
    if (res.status === 409) {
      parcelSavedLists.push(listId);
      updateSaveButton();
      renderSavePanel();
      return;
    }
    if (!res.ok) throw new Error('failed');
    await loadLists();
    parcelSavedLists.push(listId);
    updateSaveButton();
    renderSavePanel();
  } catch (err) {
    console.error(err);
  }
});

function openNewListModal() {
  document.getElementById('newListName').value = '';
  document.getElementById('newListModal').classList.remove('hidden');
  setTimeout(function() { document.getElementById('newListName').focus(); }, 50);
}

function closeNewListModal() {
  document.getElementById('newListModal').classList.add('hidden');
}

document.getElementById('newListBtn').addEventListener('click', function() {
  openNewListModal();
});

document.getElementById('newListBtnTop').addEventListener('click', function() {
  openNewListModal();
});

document.getElementById('newListCancel').addEventListener('click', function() {
  closeNewListModal();
});

document.getElementById('newListModal').addEventListener('click', function(e) {
  if (e.target === this) closeNewListModal();
});

document.getElementById('newListSave').addEventListener('click', async function() {
  var name = document.getElementById('newListName').value.trim();
  if (!name) return;
  var created = await createList(name);
  if (created) {
    closeNewListModal();
    renderSavePanel();
  }
});

document.getElementById('newListName').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('newListSave').click(); }
});

document.getElementById('saveOverlayClose').addEventListener('click', function() {
  closeSavePanel();
});

document.getElementById('saveModal').addEventListener('click', function(e) {
  if (e.target === this) closeSavePanel();
});

document.getElementById('detailsContent').addEventListener('click', function(e) {
  var img = e.target.closest('.saved-parcel-photo');
  if (img && typeof openLightbox === 'function') {
    openLightbox(
      img.getAttribute('data-photo-src'),
      JSON.parse(img.getAttribute('data-all-photos'))
    );
    return;
  }
  if (e.target.closest('#parcelOpenDlsBtn')) {
    openParcelInDls();
    return;
  }
  if (e.target.closest('#parcelOpenGmapsBtn')) {
    openParcelInGoogleMaps();
    return;
  }
  if (e.target.closest('#parcelTitleEditBtn') || e.target.closest('#parcelTitleDisplay.parcel-title-editable')) {
    openParcelTitleEditor();
    return;
  }
  if (e.target.closest('#parcelTitleSaveBtn')) {
    saveParcelTitle();
    return;
  }
  if (e.target.closest('#parcelTitleCancelBtn')) {
    closeParcelTitleEditor();
    return;
  }
  if (e.target.closest('#parcelAreaEditBtn') || e.target.closest('#parcelAreaValue.parcel-area-placeholder')) {
    openParcelAreaEditor();
    return;
  }
  if (e.target.closest('#parcelAreaSaveBtn')) {
    saveParcelArea();
    return;
  }
  if (e.target.closest('#parcelAreaCancelBtn')) {
    closeParcelAreaEditor();
    return;
  }
  if (e.target.closest('#parcelOwnershipEditBtn') || e.target.closest('#parcelOwnershipValue.parcel-area-placeholder')) {
    openParcelOwnershipEditor();
    return;
  }
  if (e.target.closest('#parcelOwnershipSaveBtn')) {
    saveParcelOwnership();
    return;
  }
  if (e.target.closest('#parcelOwnershipCancelBtn')) {
    closeParcelOwnershipEditor();
    return;
  }
  if (e.target.closest('#parcelLocationEditBtn') || e.target.closest('#parcelLocationValue.parcel-area-placeholder')) {
    openParcelLocationEditor();
    return;
  }
  if (e.target.closest('#parcelLocationSaveBtn')) {
    saveParcelLocation();
    return;
  }
  if (e.target.closest('#parcelLocationCancelBtn')) {
    closeParcelLocationEditor();
    return;
  }
  if (e.target.closest('#parcelNoteLine')) {
    openDetailsNoteEditor();
    return;
  }
  if (e.target.closest('#parcelPhotoAddBtn')) {
    var fileInput = document.getElementById('parcelPhotoFile');
    if (fileInput && !parcelDetailsPhotoUploading) fileInput.click();
    return;
  }
  var removeDetailsPhoto = e.target.closest('[data-parcel-details-photo-remove]');
  if (removeDetailsPhoto) {
    var record = getActiveSavedParcelRecord();
    if (!record || !canEditSavedParcelRecord(record)) return;
    var rmKey = removeDetailsPhoto.getAttribute('data-photo-key');
    var keys = parseSavedPhotoKeys(record.photo_keys).filter(function(k) { return k !== rmKey; });
    persistParcelPhotoKeys(record.id, keys).then(function() {
      renderParcelPhotosField();
    }).catch(function(err) {
      console.error(err);
      showError('Failed to remove photo.');
    });
    return;
  }
  var detailsPhoto = e.target.closest('.parcel-details-photo-thumb');
  if (detailsPhoto && typeof openLightbox === 'function') {
    openLightbox(
      detailsPhoto.getAttribute('data-photo-src'),
      JSON.parse(detailsPhoto.getAttribute('data-all-photos'))
    );
    return;
  }
});

document.getElementById('detailsContent').addEventListener('change', function(e) {
  if (e.target.id !== 'parcelPhotoFile') return;
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  var input = e.target;
  if (!input.files || !input.files.length) return;
  var keys = parseSavedPhotoKeys(record.photo_keys);
  var files = Array.prototype.slice.call(input.files);
  if (!files.length) {
    input.value = '';
    return;
  }
  if (parcelDetailsPhotoUploading) return;
  parcelDetailsPhotoUploading = true;
  parcelDetailsPhotoUploadCount = files.length;
  showParcelPhotoUploading(files.length);
  uploadParcelPhotoBatch(record.id, keys, files).catch(function(err) {
    console.error(err);
    showError('Failed to upload photo.');
  }).finally(function() {
    parcelDetailsPhotoUploading = false;
    parcelDetailsPhotoUploadCount = 0;
    input.value = '';
    renderParcelPhotosField();
  });
});

document.getElementById('detailsContent').addEventListener('input', function(e) {
  if (e.target.id !== 'parcelNoteInput') return;
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  if (e.target.closest('.parcel-details-note-box.expanded')) resizeDetailsNoteInput(e.target);
  scheduleParcelNoteAutosave(record.id, e.target.value);
});

document.getElementById('detailsContent').addEventListener('blur', function(e) {
  if (e.target.id !== 'parcelNoteInput') return;
  var record = getActiveSavedParcelRecord();
  if (!record || !canEditSavedParcelRecord(record)) return;
  flushParcelNoteAutosave(record.id, e.target.value);
  closeDetailsNoteEditor();
}, true);

function resizeDetailsNoteInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(36, el.scrollHeight) + 'px';
}

document.getElementById('detailsContent').addEventListener('keydown', function(e) {
  if (e.target.id === 'parcelTitleInput') {
    if (e.key === 'Enter') { e.preventDefault(); saveParcelTitle(); }
    if (e.key === 'Escape') closeParcelTitleEditor();
    return;
  }
  if (e.target.id === 'parcelAreaInput') {
    if (e.key === 'Enter') { e.preventDefault(); saveParcelArea(); }
    if (e.key === 'Escape') closeParcelAreaEditor();
    return;
  }
  if (e.target.id === 'parcelOwnershipInput') {
    if (e.key === 'Enter') { e.preventDefault(); saveParcelOwnership(); }
    if (e.key === 'Escape') closeParcelOwnershipEditor();
    return;
  }
  if (e.target.id === 'parcelLocationInput') {
    if (e.key === 'Enter') { e.preventDefault(); saveParcelLocation(); }
    if (e.key === 'Escape') closeParcelLocationEditor();
  }
});
