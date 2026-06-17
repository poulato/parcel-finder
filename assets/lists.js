var userLists = [];
var sharedLists = [];
var currentListCanEdit = false;
var listParcelDragId = null;
var currentListId = null;
var currentListRole = null;
var currentListParcels = [];
var parcelDetailsFromList = false;
var parcelDetailsFromGrid = false;
var listParcelSearchQuery = '';
var listParcelOwnershipFilter = 'all';

var LIST_PARCEL_OWNERSHIP_FILTERS = {
  all: 'All parcels',
  full: 'Full ownership',
  partial: 'Partial ownership',
  unset: 'Ownership not set'
};

function isParcelDetailsFromList() {
  return parcelDetailsFromList;
}

function resetSearchBarDisplay() {
  var searchBarEl = document.getElementById('searchBar');
  var searchBarTextEl = document.getElementById('searchBarText');
  if (searchBarEl && searchBarTextEl) {
    searchBarTextEl.textContent = 'Search parcels';
    searchBarEl.classList.remove('has-result');
    searchBarEl.classList.remove('loading');
  }
}

function enterParcelDetailsFromList() {
  parcelDetailsFromList = true;
  var btn = document.getElementById('backToListParcels');
  if (btn) btn.classList.remove('hidden');
}

function leaveParcelDetailsFromList() {
  parcelDetailsFromList = false;
  parcelDetailsFromGrid = false;
  var btn = document.getElementById('backToListParcels');
  if (btn) btn.classList.add('hidden');
}

function preloadListContextFromURL() {
  var params = new URLSearchParams(window.location.search);
  var listId = params.get('list');
  if (!listId || !params.get('parcel')) return;
  enterParcelDetailsFromList();
  if (params.get('grid') === '1') parcelDetailsFromGrid = true;
}

function restoreListContextIfNeeded() {
  if (parcelDetailsFromList) {
    highlightListNav();
    return;
  }
  var params = new URLSearchParams(window.location.search);
  var listId = params.get('list');
  if (!listId || !params.get('parcel')) return;

  enterParcelDetailsFromList();
  if (params.get('grid') === '1') parcelDetailsFromGrid = true;

  if (currentListId !== listId || !currentListParcels.length) {
    openListParcels(listId, undefined, { skipTabSwitch: true }).then(function() {
      highlightListNav();
    });
  } else {
    highlightListNav();
  }
}

function highlightListNav() {
  document.querySelectorAll('.sidebar-tab').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === 'list');
  });
  if (typeof isMobile === 'function' && isMobile()) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === 'list');
    });
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === 'list');
    });
  }
}
var pendingShareToken = null;

function escapeHTML(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseParcelPhotos(item) {
  if (!item || !item.photo_keys) return [];
  if (Array.isArray(item.photo_keys)) return item.photo_keys;
  try { return JSON.parse(item.photo_keys); } catch (e) { return []; }
}

function renderListParcelPhotosHTML(photos) {
  if (!photos.length) return '';
  var srcs = photos.map(function(k) {
    return API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(k);
  });
  var srcsJSON = escapeHTML(JSON.stringify(srcs));
  return (
    '<div class="parcel-list-photos-readonly">' +
      photos.map(function(k, i) {
        return '<img class="parcel-list-photo-thumb" src="' + srcs[i] + '" alt="" data-photo-src="' + srcs[i] + '" data-all-photos=\'' + srcsJSON + '\' />';
      }).join('') +
    '</div>'
  );
}

function refreshListParcelPhotos(parcelId) {
  var item = currentListParcels.find(function(x) { return x.id === parcelId; });
  if (!item) return;
  var listEl = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!listEl) return;
  var info = listEl.querySelector('.parcel-list-info');
  if (!info) return;
  var photos = parseParcelPhotos(item);
  var old = info.querySelector('.parcel-list-photos-readonly');
  var html = renderListParcelPhotosHTML(photos);
  if (!html) {
    if (old) old.remove();
    return;
  }
  if (old) {
    old.outerHTML = html;
  } else {
    var temp = document.createElement('div');
    temp.innerHTML = html;
    info.appendChild(temp.firstElementChild);
  }
}

function renderLists() {
  var container = document.getElementById('listsContainer');
  var emptyEl = document.getElementById('listsEmpty');

  var hasOwned = userLists.length > 0;
  var hasShared = sharedLists.length > 0;

  if (!hasOwned && !hasShared) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  var html = '';

  html += userLists.map(function(list) {
    return (
      '<div class="lists-item" data-list-id="' + list.id + '">' +
        '<div>' +
          '<div class="lists-item-name">' + escapeHTML(list.name) + '</div>' +
          '<div class="lists-item-count">' + (list.parcel_count || 0) + ' parcels</div>' +
        '</div>' +
        '<div class="lists-item-actions">' +
          '<button class="lists-menu-btn" data-menu-list="' + list.id + '" title="Options">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
          '</button>' +
          '<div class="lists-menu-dropdown hidden" data-dropdown-list="' + list.id + '">' +
            '<button data-share-list="' + list.id + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
              ' Share' +
            '</button>' +
            '<button class="menu-danger" data-delete-list="' + list.id + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              ' Delete' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  if (hasShared) {
    html += '<div class="shared-with-me-label">Shared with me</div>';
    html += sharedLists.map(function(list) {
      var roleBadge = '<span class="list-role-badge">' + (list.role === 'editor' ? 'Can edit' : 'View only') + '</span>';
      return (
        '<div class="lists-item lists-item-shared" data-list-id="' + list.id + '" data-list-role="' + list.role + '">' +
          '<div>' +
            '<div class="lists-item-name">' + escapeHTML(list.name) + roleBadge + '</div>' +
            '<div class="lists-item-count">' + (list.parcel_count || 0) + ' parcels</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  container.innerHTML = html;
}

async function loadLists() {
  if (!authUser) return;
  try {
    var res = await authFetch(API_BASE + '/lists');
    if (!res.ok) throw new Error('failed to load lists');
    var data = await res.json();
    if (Array.isArray(data)) {
      userLists = data;
      sharedLists = [];
    } else {
      userLists = data.owned || [];
      sharedLists = data.shared || [];
    }
    renderLists();
  } catch (err) {
    console.error(err);
  }
}

async function createList(name) {
  try {
    var res = await authFetch(API_BASE + '/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    if (!res.ok) throw new Error('failed to create');
    var created = await res.json();
    created.parcel_count = 0;
    userLists.unshift(created);
    renderLists();
    return created;
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function deleteList(listId) {
  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId), {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('failed to delete');
    userLists = userLists.filter(function(l) { return l.id !== listId; });
    renderLists();
  } catch (err) {
    console.error(err);
  }
}

function closeAllListMenus() {
  document.querySelectorAll('.lists-menu-dropdown').forEach(function(d) {
    d.classList.add('hidden');
  });
  document.querySelectorAll('.lists-item-menu-open').forEach(function(el) {
    el.classList.remove('lists-item-menu-open');
  });
  var detailHeader = document.querySelector('.list-detail-header');
  if (detailHeader) detailHeader.classList.remove('list-detail-menu-open');
}

document.getElementById('listsContainer').addEventListener('click', function(e) {
  var menuBtn = e.target.closest('[data-menu-list]');
  if (menuBtn) {
    e.stopPropagation();
    var listId = menuBtn.getAttribute('data-menu-list');
    var dropdown = document.querySelector('[data-dropdown-list="' + listId + '"]');
    var listItem = menuBtn.closest('.lists-item');
    var wasHidden = dropdown.classList.contains('hidden');
    closeAllListMenus();
    if (wasHidden) {
      dropdown.classList.remove('hidden');
      if (listItem) listItem.classList.add('lists-item-menu-open');
    }
    return;
  }

  var deleteBtn = e.target.closest('[data-delete-list]');
  if (deleteBtn) {
    e.stopPropagation();
    closeAllListMenus();
    deleteList(deleteBtn.getAttribute('data-delete-list'));
    return;
  }

  var shareBtn = e.target.closest('[data-share-list]');
  if (shareBtn) {
    e.stopPropagation();
    closeAllListMenus();
    openShareModal(shareBtn.getAttribute('data-share-list'));
    return;
  }

  var item = e.target.closest('[data-list-id]');
  if (item) {
    var role = item.getAttribute('data-list-role') || 'owner';
    openListParcels(item.getAttribute('data-list-id'), role);
  }
});

document.addEventListener('click', function() {
  closeAllListMenus();
  closeAllParcelMenus();
  var detailDrop = document.getElementById('listDetailDropdown');
  if (detailDrop) detailDrop.classList.add('hidden');
});

async function openListParcels(listId, role, options) {
  options = options || {};
  var list = userLists.find(function(l) { return l.id === listId; });
  var isShared = false;
  if (!list) {
    list = sharedLists.find(function(l) { return l.id === listId; });
    isShared = true;
  }
  if (!list) return;

  currentListId = listId;
  currentListRole = role || (isShared ? (list.role || 'viewer') : 'owner');

  var isOwner = currentListRole === 'owner';
  var isEditor = currentListRole === 'editor';
  var canEdit = isOwner || isEditor;
  currentListCanEdit = canEdit;

  var titleEl = document.getElementById('listParcelsTitle');
  var renameInput = document.getElementById('listParcelsRename');
  titleEl.textContent = list.name;
  titleEl.style.display = '';
  renameInput.classList.add('hidden');
  document.getElementById('listDetailDropdown').classList.add('hidden');
  document.getElementById('listParcels').innerHTML = '';
  document.getElementById('listParcelsEmpty').style.display = 'none';
  document.getElementById('listParcelsSearchEmpty').style.display = 'none';
  clearListParcelSearch();
  document.getElementById('showAllParcelsBtn').style.display = 'none';
  var gridBtn = document.getElementById('showParcelGridBtn');
  if (gridBtn) gridBtn.style.display = 'none';
  var printMapBtn = document.getElementById('printMapBtn');
  if (printMapBtn) printMapBtn.style.display = 'none';
  currentListParcels = [];

  var detailMenu = document.querySelector('.list-detail-menu');
  if (detailMenu) detailMenu.style.display = isOwner ? '' : 'none';

  if (!options.skipTabSwitch) switchTab('listParcels');

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/parcels');
    if (!res.ok) throw new Error('failed');
    var parcels = await res.json();
    if (!parcels.length) {
      document.getElementById('listParcelsEmpty').style.display = 'block';
      updateListParcelSearchUI(canEdit);
      var emptyHint = document.getElementById('listReorderHint');
      if (emptyHint) emptyHint.classList.add('hidden');
      return;
    }
    currentListParcels = parcels;
    document.getElementById('showAllParcelsBtn').style.display = '';
    if (gridBtn) gridBtn.style.display = '';
    if (printMapBtn) printMapBtn.style.display = '';
    updateListParcelSearchUI(canEdit);
    renderListParcels(canEdit);
  } catch (err) {
    console.error(err);
  }
}

function notePreviewSingleLine(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

function buildListNoteLineInnerHTML(note) {
  var val = notePreviewSingleLine(note);
  if (val) {
    return '<span class="parcel-list-note-line-text">' + escapeHTML(val) + '</span>';
  }
  return '<span class="parcel-list-note-line-placeholder">Write a note…</span>';
}

var listNoteSuppressNavigation = false;

function getExpandedListNoteId() {
  var expanded = document.querySelector('.parcel-list-note-wrap.expanded [data-autosave-note]');
  return expanded ? expanded.getAttribute('data-autosave-note') : null;
}

function finishListNoteEdit(parcelId, save) {
  var item = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!item) return;
  var wrap = item.querySelector('.parcel-list-note-wrap');
  if (!wrap || !wrap.classList.contains('expanded')) return;
  var textarea = wrap.querySelector('[data-autosave-note]');
  if (save && textarea && typeof flushParcelNoteAutosave === 'function') {
    flushParcelNoteAutosave(parcelId, textarea.value);
  }
  closeListNoteEditor(parcelId);
  listNoteSuppressNavigation = true;
  setTimeout(function() { listNoteSuppressNavigation = false; }, 400);
}

function onListNoteOutsidePointerDown(e) {
  var expandedId = getExpandedListNoteId();
  if (!expandedId) return;
  if (e.target.closest('[data-autosave-note="' + expandedId + '"]')) return;
  finishListNoteEdit(expandedId, true);
}

document.addEventListener('mousedown', onListNoteOutsidePointerDown, true);
document.addEventListener('touchstart', onListNoteOutsidePointerDown, true);

function openListNoteEditor(parcelId) {
  var item = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!item) return;
  var wrap = item.querySelector('.parcel-list-note-wrap');
  if (!wrap || wrap.classList.contains('expanded')) return;
  var line = wrap.querySelector('[data-note-open]');
  var textarea = wrap.querySelector('[data-autosave-note]');
  if (!line || !textarea) return;
  var p = currentListParcels.find(function(x) { return x.id === parcelId; });
  textarea.value = p ? (p.note || '') : '';
  line.classList.add('hidden');
  textarea.removeAttribute('hidden');
  wrap.classList.add('expanded');
  resizeListNoteInput(textarea);
  textarea.focus();
}

function closeListNoteEditor(parcelId) {
  var item = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!item) return;
  var wrap = item.querySelector('.parcel-list-note-wrap');
  if (!wrap) return;
  var line = wrap.querySelector('[data-note-open]');
  var textarea = wrap.querySelector('[data-autosave-note]');
  if (!line || !textarea) return;
  line.innerHTML = buildListNoteLineInnerHTML(textarea.value);
  textarea.setAttribute('hidden', '');
  textarea.style.height = '';
  line.classList.remove('hidden');
  wrap.classList.remove('expanded');
}

function updateListNoteLinePreview(parcelId, noteVal) {
  var item = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!item) return;
  var wrap = item.querySelector('.parcel-list-note-wrap');
  if (!wrap || wrap.classList.contains('expanded')) return;
  var line = wrap.querySelector('[data-note-open]');
  if (!line) return;
  line.innerHTML = buildListNoteLineInnerHTML(noteVal);
}

function clearListParcelSearch() {
  listParcelSearchQuery = '';
  var el = document.getElementById('listParcelSearch');
  if (el) el.value = '';
  listParcelOwnershipFilter = 'all';
  updateListParcelFilterUI();
}

function hasParcelOwnershipData(item) {
  if (!item) return false;
  if (item.ownership_fraction) return true;
  return item.ownership_pct != null && item.ownership_pct !== '';
}

function isParcelPartialOwnership(item) {
  if (!hasParcelOwnershipData(item)) return false;
  return typeof isFullOwnership !== 'function' || !isFullOwnership(item);
}

function parcelMatchesOwnershipFilter(item) {
  switch (listParcelOwnershipFilter) {
    case 'full':
      return typeof isFullOwnership === 'function' && isFullOwnership(item);
    case 'partial':
      return isParcelPartialOwnership(item);
    case 'unset':
      return !hasParcelOwnershipData(item);
    default:
      return true;
  }
}

function isListParcelOwnershipFilterActive() {
  return listParcelOwnershipFilter !== 'all';
}

function updateListParcelFilterUI() {
  var active = isListParcelOwnershipFilterActive();
  var label = LIST_PARCEL_OWNERSHIP_FILTERS[listParcelOwnershipFilter] || 'Filter';
  document.querySelectorAll('.list-parcel-filter-btn').forEach(function(btn) {
    var textEl = btn.querySelector('.list-parcel-filter-btn-text');
    if (textEl) textEl.textContent = active ? label : 'Filter';
    btn.classList.toggle('is-active', active);
  });
  document.querySelectorAll('.list-parcel-filter-dropdown').forEach(function(drop) {
    drop.querySelectorAll('[data-ownership-filter]').forEach(function(opt) {
      opt.classList.toggle('is-selected', opt.getAttribute('data-ownership-filter') === listParcelOwnershipFilter);
    });
  });
}

function closeListParcelFilterDropdowns() {
  document.querySelectorAll('.list-parcel-filter-dropdown').forEach(function(d) {
    d.classList.add('hidden');
  });
  document.querySelectorAll('.list-parcel-filter-btn').forEach(function(btn) {
    btn.setAttribute('aria-expanded', 'false');
  });
}

function toggleListParcelFilterDropdown(btn) {
  var menu = btn.parentElement.querySelector('.list-parcel-filter-dropdown');
  if (!menu) return;
  var wasHidden = menu.classList.contains('hidden');
  closeAllListMenus();
  closeAllParcelMenus();
  closeListParcelFilterDropdowns();
  if (wasHidden) {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function setListParcelOwnershipFilter(value) {
  listParcelOwnershipFilter = value || 'all';
  updateListParcelFilterUI();
  applyListParcelFilters();
}

function parcelMatchesListFilters(item) {
  if (!parcelMatchesListSearch(item, getListParcelSearchQuery())) return false;
  return parcelMatchesOwnershipFilter(item);
}

function applyListParcelFilters() {
  renderListParcels(currentListCanEdit);
  var gridPanel = document.getElementById('parcelGridPanel');
  if (gridPanel && !gridPanel.classList.contains('hidden')) renderParcelGridTable();
  updateListParcelSearchUI(currentListCanEdit);
}

function getListParcelSearchQuery() {
  var el = document.getElementById('listParcelSearch');
  return el ? el.value.trim() : listParcelSearchQuery;
}

function parcelMatchesListSearch(item, query) {
  if (!query) return true;
  var q = query.toLowerCase();
  var fields = [
    item.parcel_title,
    item.location_note,
    item.municipality,
    item.district,
    item.quarter
  ];
  return fields.some(function(v) {
    return v && String(v).toLowerCase().indexOf(q) >= 0;
  });
}

function getFilteredListParcels() {
  return currentListParcels.filter(function(item) {
    return parcelMatchesListFilters(item);
  });
}

function updateListParcelSearchUI(canEdit) {
  canEdit = canEdit != null ? canEdit : currentListCanEdit;
  var wrap = document.getElementById('listParcelSearchWrap');
  var hasParcels = currentListParcels.length > 0;
  if (wrap) wrap.style.display = hasParcels ? '' : 'none';
  document.querySelectorAll('.list-parcel-filter-menu').forEach(function(el) {
    el.style.display = hasParcels ? '' : 'none';
  });
  var isFiltering = getListParcelSearchQuery().length > 0 || isListParcelOwnershipFilterActive();
  var reorderHint = document.getElementById('listReorderHint');
  if (reorderHint) reorderHint.classList.toggle('hidden', !canEdit || !hasParcels || isFiltering);
}

function renderListParcels(canEdit) {
  if (listParcelDragId) return;
  var container = document.getElementById('listParcels');
  if (!container) return;
  var filtered = getFilteredListParcels();
  var searchEmptyEl = document.getElementById('listParcelsSearchEmpty');
  var listEmptyEl = document.getElementById('listParcelsEmpty');
  if (searchEmptyEl) {
    searchEmptyEl.style.display = (currentListParcels.length && filtered.length === 0) ? 'block' : 'none';
  }
  if (listEmptyEl && currentListParcels.length) listEmptyEl.style.display = 'none';
  updateListParcelSearchUI(canEdit);
  container.innerHTML = filtered.map(function(item) {
    return renderParcelItem(item, canEdit);
  }).join('');
}

function normParcelGridVal(v) {
  return String(v == null ? '' : v).replace(/\.0$/, '');
}

function parcelGridCell(value, className) {
  var cls = className || '';
  var inner = value
    ? escapeHTML(value)
    : '<span class="parcel-grid-muted">—</span>';
  return '<td class="' + cls + '">' + inner + '</td>';
}

function parcelGridRegDisplay(item) {
  if (typeof displayRegistration === 'function') {
    var reg = displayRegistration(item.registration_block, item.registration_no);
    if (reg) return reg;
  }
  if (item.registration_no) {
    return typeof formatRegistrationNo === 'function'
      ? formatRegistrationNo(item.registration_no)
      : normParcelGridVal(item.registration_no);
  }
  return '';
}

async function enrichMissingRegistrationsForGrid() {
  if (typeof resolveParcelFeature !== 'function' || typeof resolveRegistrationForAttrs !== 'function') return;
  var targets = currentListParcels.filter(function(item) {
    return !parcelGridRegDisplay(item);
  });
  if (!targets.length) return;
  for (var i = 0; i < targets.length; i++) {
    var item = targets[i];
    try {
      var feature = await resolveParcelFeature(
        normParcelGridVal(item.sheet),
        normParcelGridVal(item.plan_nbr),
        normParcelGridVal(item.parcel_nbr),
        item.dist_code,
        item.municipality
      );
      if (!feature) continue;
      var seed = typeof registrationMetaFromItem === 'function'
        ? registrationMetaFromItem(item)
        : {};
      var regMeta = await resolveRegistrationForAttrs(seed, feature.attributes);
      if (regMeta.registration_no || regMeta.registration_block != null) {
        item.registration_no = regMeta.registration_no || item.registration_no;
        item.registration_block = regMeta.registration_block != null
          ? regMeta.registration_block
          : item.registration_block;
      }
    } catch (err) { /* skip failed lookups */ }
  }
  var panel = document.getElementById('parcelGridPanel');
  if (panel && !panel.classList.contains('hidden')) renderParcelGridTable();
}

function openParcelGridModal() {
  var panel = document.getElementById('parcelGridPanel');
  if (!panel) return;
  var titleEl = document.getElementById('parcelGridPanelTitle');
  var listTitle = document.getElementById('listParcelsTitle');
  if (titleEl && listTitle) titleEl.textContent = listTitle.textContent || 'Parcels';
  var gridSearch = document.getElementById('parcelGridSearch');
  var listSearch = document.getElementById('listParcelSearch');
  if (gridSearch && listSearch) gridSearch.value = listSearch.value;
  renderParcelGridTable();
  document.body.classList.add('parcel-grid-open');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  enrichMissingRegistrationsForGrid();
}

function closeParcelGridModal() {
  var panel = document.getElementById('parcelGridPanel');
  if (panel) {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('parcel-grid-open');
}

function sumParcelGridValues(parcels) {
  var sum = 0;
  var count = 0;
  parcels.forEach(function(item) {
    if (item.parcel_value != null && item.parcel_value !== '') {
      var n = Number(item.parcel_value);
      if (!isNaN(n)) {
        sum += n;
        count++;
      }
    }
  });
  return { sum: sum, count: count };
}

function buildParcelGridRowHTML(item, index, forPrint) {
  var block = typeof displayBlockCode === 'function'
    ? displayBlockCode(item.block_code)
    : normParcelGridVal(item.block_code);
  var regNo = parcelGridRegDisplay(item);
  var area = (item.area_sqm != null && item.area_sqm !== '' && typeof formatAreaSqm === 'function')
    ? formatAreaSqm(item.area_sqm)
    : '';
  var share = typeof formatOwnershipDisplay === 'function'
    ? formatOwnershipDisplay(item)
    : '';
  var value = typeof formatParcelValue === 'function'
    ? formatParcelValue(item.parcel_value)
    : '';
  var shareClass = forPrint ? 'col-share' : 'col-share';
  if (share && typeof isFullOwnership === 'function') {
    shareClass += isFullOwnership(item) ? ' col-share-full' : ' col-share-partial';
  }
  var rowAttrs = forPrint
    ? ''
    : ' class="parcel-grid-row" data-parcel-id="' + item.id + '"';
  return (
    '<tr' + rowAttrs + '>' +
      parcelGridCell(String(index + 1), 'col-num') +
      parcelGridCell(item.parcel_title, 'col-text') +
      parcelGridCell(item.district) +
      parcelGridCell(item.municipality) +
      parcelGridCell(normParcelGridVal(item.sheet), 'col-cadastral') +
      parcelGridCell(normParcelGridVal(item.plan_nbr), 'col-cadastral') +
      parcelGridCell(block, 'col-cadastral') +
      parcelGridCell(normParcelGridVal(item.parcel_nbr), 'col-cadastral') +
      parcelGridCell(regNo, 'col-cadastral') +
      parcelGridCell(area, 'col-cadastral') +
      parcelGridCell(share, shareClass) +
      parcelGridCell(item.location_note, 'col-text') +
      parcelGridCell(value, 'col-value') +
    '</tr>'
  );
}

var mapPrintRestore = null;
var mapPrintReturnContext = null;

var PRINT_BTN_INNER_HTML =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print';

function setPrintButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.textContent = 'Loading...';
  } else {
    btn.disabled = false;
    btn.innerHTML = PRINT_BTN_INNER_HTML;
  }
}

function updateDetailsPrintButton() {
  var btn = document.getElementById('detailsPrintBtn');
  if (!btn) return;
  var show = typeof currentParcel !== 'undefined' && !!currentParcel;
  btn.classList.toggle('hidden', !show);
}

function buildPrintItemFromCurrentParcel() {
  if (typeof findListParcelForCurrentParcel === 'function') {
    var listItem = findListParcelForCurrentParcel();
    if (listItem) return listItem;
  }
  if (typeof parcelSavedRecords !== 'undefined' && parcelSavedRecords.length) {
    return parcelSavedRecords[0];
  }
  return Object.assign({}, currentParcel);
}

function finishMapPrintPreview(btn, title, metaParts, parcels, singleParcel) {
  var titleTarget = document.getElementById('mapPrintTitle');
  var metaTarget = document.getElementById('mapPrintMeta');
  var sheet = document.getElementById('mapPrintSheet');
  if (titleTarget) titleTarget.textContent = title;
  if (metaTarget) metaTarget.textContent = metaParts.join(' \u2022 ');
  if (sheet) {
    sheet.classList.toggle('single-parcel', !!singleParcel);
    sheet.classList.toggle('list-parcels', !singleParcel);
  }
  if (singleParcel) {
    buildMapPrintDetails();
  } else {
    resetMapPrintDetailsPanel();
    buildMapPrintIndex(parcels);
  }
  mountMapInPrintPreview();
  var modal = document.getElementById('mapPrintModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('map-print-preview-open');
  setPrintButtonLoading(btn, false);
}

function resetMapPrintDetailsPanel() {
  var details = document.getElementById('mapPrintDetails');
  var index = document.getElementById('mapPrintIndex');
  if (details) {
    details.classList.add('hidden');
    details.innerHTML = '';
  }
  if (index) index.classList.remove('hidden');
}

function buildMapPrintDetails() {
  var source = document.getElementById('detailsContent');
  var target = document.getElementById('mapPrintDetails');
  var index = document.getElementById('mapPrintIndex');
  if (!source || !target) return;
  if (index) {
    index.classList.add('hidden');
    index.innerHTML = '';
  }
  target.classList.remove('hidden');
  var clone = source.cloneNode(true);
  clone.querySelectorAll(
    'button, input, textarea, select, .hidden, .parcel-area-editor, .parcel-external-links, ' +
    '#detailsActions, #parcelPhotosSection, .parcel-details-note-section, .parcel-meta-edit-btn, ' +
    '.saved-parcel-extra'
  ).forEach(function(el) { el.remove(); });
  var titleHeader = clone.querySelector('.parcel-title-header');
  if (titleHeader && !titleHeader.textContent.trim()) titleHeader.remove();
  target.innerHTML = '';
  target.appendChild(clone);
}

function buildMapPrintIndex(parcels) {
  var list = document.getElementById('mapPrintIndex');
  if (!list) return;
  list.innerHTML = parcels.map(function(item, index) {
    var refLine = typeof formatParcelRefLine === 'function'
      ? formatParcelRefLine(item)
      : 'Parcel ' + item.parcel_nbr;
    var title = item.parcel_title ? escapeHTML(item.parcel_title) + ' \u2014 ' : '';
    var loc = escapeHTML(item.municipality || item.district || '');
    var share = typeof formatOwnershipDisplay === 'function'
      ? formatOwnershipDisplay(item)
      : '';
    var sharePart = share ? ' \u2022 ' + escapeHTML(share) : '';
    var note = item.location_note
      ? ' \u2022 ' + escapeHTML(notePreviewSingleLine(item.location_note))
      : '';
    return (
      '<li><span class="map-print-index-num">' + (index + 1) + '.</span> ' +
      title + escapeHTML(refLine) +
      (loc ? ' \u2022 ' + loc : '') +
      sharePart + note +
      '</li>'
    );
  }).join('');
}

function mountMapInPrintPreview() {
  var mapWrap = document.getElementById('map-wrap');
  var stage = document.getElementById('mapPrintStage');
  if (!mapWrap || !stage || mapPrintRestore) return;
  mapPrintRestore = {
    parent: mapWrap.parentNode,
    next: mapWrap.nextSibling
  };
  stage.appendChild(mapWrap);
  setTimeout(function() {
    if (typeof map !== 'undefined' && map.invalidateSize) map.invalidateSize();
  }, 150);
}

function restoreMapFromPrintPreview() {
  var mapWrap = document.getElementById('map-wrap');
  if (!mapWrap || !mapPrintRestore) return;
  if (mapPrintRestore.next) {
    mapPrintRestore.parent.insertBefore(mapWrap, mapPrintRestore.next);
  } else {
    mapPrintRestore.parent.appendChild(mapWrap);
  }
  mapPrintRestore = null;
  setTimeout(function() {
    if (typeof map !== 'undefined' && map.invalidateSize) map.invalidateSize();
  }, 150);
}

function restoreViewAfterPrintPreview() {
  var ctx = mapPrintReturnContext;
  mapPrintReturnContext = null;
  if (!ctx) return;

  function finishRestore() {
    if (typeof openSidebar === 'function') openSidebar();
    setTimeout(function() {
      if (typeof map !== 'undefined' && map.invalidateSize) map.invalidateSize();
    }, 150);
  }

  if (ctx.view === 'listParcels') {
    if (typeof switchTab === 'function') switchTab('listParcels');
    if (typeof highlightListNav === 'function') highlightListNav();
    finishRestore();
    return;
  }

  if (ctx.view !== 'details') return;

  var needsReload = !(typeof parcelLayer !== 'undefined' && parcelLayer) ||
    (typeof isListParcelsOnMap === 'function' && isListParcelsOnMap() && ctx.hadParcelLayer);

  if (needsReload && ctx.listItemSnapshot && typeof openSavedParcelFromList === 'function') {
    openSavedParcelFromList(ctx.listItemSnapshot).then(function() {
      if (ctx.fromList && typeof highlightListNav === 'function') highlightListNav();
      finishRestore();
    });
    return;
  }

  if (needsReload && ctx.parcelSnapshot && typeof navigateToParcel === 'function') {
    var p = ctx.parcelSnapshot;
    navigateToParcel(p.sheet, p.plan_nbr, p.parcel_nbr, p.dist_code || '');
    if (typeof switchTab === 'function') switchTab('details');
    if (ctx.fromList && typeof highlightListNav === 'function') highlightListNav();
    finishRestore();
    return;
  }

  if (typeof switchTab === 'function') switchTab('details');
  if (ctx.fromList && typeof highlightListNav === 'function') highlightListNav();
  if (typeof parcelLayer !== 'undefined' && parcelLayer && typeof map !== 'undefined') {
    map.fitBounds(parcelLayer.getBounds(), { padding: [50, 50] });
  }
  finishRestore();
}

function clearMapPrintSnapshot() {
  var img = document.getElementById('mapPrintSnapshot');
  var stage = document.getElementById('mapPrintStage');
  if (img) {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
  if (stage) stage.classList.remove('has-snapshot');
}

function applyMapPrintSnapshot(dataUrl) {
  var img = document.getElementById('mapPrintSnapshot');
  var stage = document.getElementById('mapPrintStage');
  if (!img) return Promise.resolve(false);
  if (!dataUrl) {
    clearMapPrintSnapshot();
    return Promise.resolve(false);
  }
  return new Promise(function(resolve) {
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      resolve(ok);
    }
    img.onload = function() {
      if (img.decode) {
        img.decode().then(function() { finish(true); }).catch(function() { finish(true); });
      } else {
        finish(true);
      }
    };
    img.onerror = function() {
      clearMapPrintSnapshot();
      finish(false);
    };
    img.src = dataUrl;
    img.classList.remove('hidden');
    if (stage) stage.classList.add('has-snapshot');
    setTimeout(function() { finish(true); }, 3000);
  });
}

function captureMapForPrint() {
  if (typeof captureMapSnapshotForPrint === 'function') {
    return captureMapSnapshotForPrint();
  }
  return Promise.resolve(null);
}

function closeMapPrintPreview() {
  var modal = document.getElementById('mapPrintModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('map-print-preview-open');
  document.body.classList.remove('map-printing');
  document.body.classList.remove('map-print-no-snapshot');
  if (typeof setMapPrintLayout === 'function') setMapPrintLayout(false);
  clearMapPrintSnapshot();
  restoreMapFromPrintPreview();
  restoreViewAfterPrintPreview();
}

function openMapPrintPreview(triggerBtn) {
  var parcels = getFilteredListParcels();
  if (!parcels.length) return;
  closeListParcelFilterDropdowns();

  mapPrintReturnContext = { view: 'listParcels' };

  var btn = triggerBtn || document.getElementById('printMapBtn');
  setPrintButtonLoading(btn, true);

  if (typeof closeSidebar === 'function') closeSidebar();

  var loadPromise = typeof showAllListParcels === 'function'
    ? showAllListParcels(parcels)
    : Promise.resolve();

  loadPromise.then(function() {
    var titleEl = document.getElementById('listParcelsTitle');
    var title = titleEl ? titleEl.textContent.trim() : 'Parcel list';
    var metaParts = [new Date().toLocaleString(), parcels.length + (parcels.length === 1 ? ' parcel' : ' parcels')];
    if (isListParcelOwnershipFilterActive()) {
      metaParts.push(LIST_PARCEL_OWNERSHIP_FILTERS[listParcelOwnershipFilter]);
    }
    var searchQ = getListParcelSearchQuery();
    if (searchQ) metaParts.push('Search: "' + searchQ + '"');
    finishMapPrintPreview(btn, title, metaParts, parcels, false);
  }).catch(function() {
    setPrintButtonLoading(btn, false);
  });
}

function openSingleParcelPrintPreview(triggerBtn) {
  if (typeof currentParcel === 'undefined' || !currentParcel) return;

  mapPrintReturnContext = {
    view: 'details',
    fromList: typeof isParcelDetailsFromList === 'function' && isParcelDetailsFromList(),
    listItemSnapshot: typeof findListParcelForCurrentParcel === 'function'
      ? findListParcelForCurrentParcel()
      : null,
    parcelSnapshot: Object.assign({}, currentParcel),
    hadParcelLayer: !!(typeof parcelLayer !== 'undefined' && parcelLayer)
  };

  var btn = triggerBtn || document.getElementById('detailsPrintBtn');
  setPrintButtonLoading(btn, true);

  if (typeof closeSidebar === 'function') closeSidebar();

  // Fit map to parcel BEFORE capturing. Cap the zoom so the DLS cadastral
  // layer reliably has data (it returns "Map data not yet available" placeholders
  // when zoomed in too far on a fresh view).
  if (typeof parcelLayer !== 'undefined' && parcelLayer) {
    map.fitBounds(parcelLayer.getBounds(), { padding: [60, 60], maxZoom: 18, animate: false });
  }

  var item = buildPrintItemFromCurrentParcel();
  var titleEl = document.getElementById('parcelTitleDisplay');
  var title = titleEl && titleEl.textContent.trim()
    ? titleEl.textContent.trim()
    : (typeof formatParcelRefLine === 'function' ? formatParcelRefLine(item) : 'Parcel');
  var metaParts = [new Date().toLocaleString()];
  var refLine = typeof formatParcelRefLine === 'function' ? formatParcelRefLine(item) : '';
  if (refLine) metaParts.push(refLine);

  buildMapPrintDetails();

  var titleTarget = document.getElementById('mapPrintTitle');
  var metaTarget = document.getElementById('mapPrintMeta');
  if (titleTarget) titleTarget.textContent = title;
  if (metaTarget) metaTarget.textContent = metaParts.join(' \u2022 ');

  var sheet = document.getElementById('mapPrintSheet');
  if (sheet) {
    sheet.classList.add('single-parcel');
    sheet.classList.remove('list-parcels');
  }

  var modal = document.getElementById('mapPrintModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('map-print-preview-open');

  // Generate the server-side map image after a brief delay for map view to settle
  setTimeout(function() {
    generatePrintMapImage().then(function() {
      setPrintButtonLoading(btn, false);
    }).catch(function() {
      setPrintButtonLoading(btn, false);
    });
  }, 300);
}

function generatePrintMapImage() {
  var imgEl = document.getElementById('mapPrintSnapshot');
  var stage = document.getElementById('mapPrintStage');
  if (!imgEl || typeof map === 'undefined' || !map) return Promise.resolve();

  imgEl.removeAttribute('src');
  imgEl.classList.add('hidden');
  if (stage) stage.classList.remove('has-snapshot');

  var dlsPromise = typeof waitForDlsReady === 'function'
    ? waitForDlsReady(7000)
    : Promise.resolve();
  var readyPromise = dlsPromise.then(function() {
    return typeof waitForMapVisualReady === 'function'
      ? waitForMapVisualReady(5000)
      : Promise.resolve();
  });

  return readyPromise.then(function() {
    var size = map.getSize();
    if (!size || !size.x || !size.y) return;

    var dataUrl = null;
    try {
      var canvas = buildMapCaptureCanvas(size, 2, true);
      dataUrl = exportCaptureCanvas(canvas);
    } catch (e) {
      dataUrl = null;
    }
    if (!dataUrl) return;

    return new Promise(function(resolve) {
      imgEl.onload = function() {
        imgEl.classList.remove('hidden');
        if (stage) stage.classList.add('has-snapshot');
        if (imgEl.decode) {
          imgEl.decode().then(resolve).catch(resolve);
        } else {
          resolve();
        }
      };
      imgEl.onerror = function() { resolve(); };
      imgEl.src = dataUrl;
      setTimeout(resolve, 5000);
    });
  });
}

function openParcelPrintPreview(triggerBtn) {
  openSingleParcelPrintPreview(triggerBtn);
}

function doMapPrint() {
  var btn = document.getElementById('mapPrintDoPrint');
  var prevText = btn ? btn.textContent : 'Print';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Preparing…';
  }

  function finishButton() {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  var imgEl = document.getElementById('mapPrintSnapshot');
  var hasImage = imgEl && imgEl.src && !imgEl.classList.contains('hidden');

  if (hasImage) {
    document.body.classList.add('map-printing');
    setTimeout(function() {
      window.print();
      finishButton();
    }, 100);
    return;
  }

  generatePrintMapImage().then(function() {
    document.body.classList.add('map-printing');
    setTimeout(function() {
      window.print();
      finishButton();
    }, 100);
  }).catch(function() {
    document.body.classList.add('map-printing');
    setTimeout(function() {
      window.print();
      finishButton();
    }, 100);
  });
}

if (!window._mapPrintBound) {
  window._mapPrintBound = true;
  window.addEventListener('beforeprint', function() {
    if (typeof map !== 'undefined' && map.invalidateSize) {
      map.invalidateSize({ animate: false, pan: false });
    }
  });
  window.addEventListener('afterprint', function() {
    document.body.classList.remove('map-printing');
    document.body.classList.remove('map-print-no-snapshot');
    clearMapPrintSnapshot();
    if (typeof map !== 'undefined' && map.invalidateSize) {
      setTimeout(function() { map.invalidateSize(); }, 150);
    }
  });
}

function renderParcelGridTable() {
  var tbody = document.getElementById('parcelGridBody');
  if (!tbody) return;
  var parcels = getFilteredListParcels();
  var valueTotals = sumParcelGridValues(parcels);
  var meta = document.getElementById('parcelGridPanelMeta');
  if (meta) {
    var total = currentListParcels.length;
    var shown = parcels.length;
    var parts = [];
    if (total && shown !== total) {
      parts.push(shown + ' of ' + total + ' parcels');
    } else {
      parts.push(total + (total === 1 ? ' parcel' : ' parcels'));
    }
    if (valueTotals.count > 0 && typeof formatParcelValue === 'function') {
      parts.push('Total ' + formatParcelValue(valueTotals.sum));
    }
    meta.textContent = parts.join(' \u2022 ');
  }
  var foot = document.getElementById('parcelGridFoot');
  var sumCell = document.getElementById('parcelGridValueSum');
  if (foot && sumCell) {
    if (valueTotals.count > 0 && typeof formatParcelValue === 'function') {
      sumCell.textContent = formatParcelValue(valueTotals.sum);
      if (valueTotals.count < parcels.length) {
        sumCell.textContent += ' (' + valueTotals.count + ' with value)';
      }
      foot.classList.remove('hidden');
    } else {
      sumCell.textContent = '';
      foot.classList.add('hidden');
    }
  }
  if (!parcels.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="parcel-grid-empty">No parcels to show</td></tr>';
    if (foot) foot.classList.add('hidden');
    return;
  }
  tbody.innerHTML = parcels.map(function(item, index) {
    return buildParcelGridRowHTML(item, index, false);
  }).join('');
}

function getListParcelOrderIds() {
  return Array.prototype.map.call(
    document.querySelectorAll('#listParcels .parcel-list-item[data-parcel-id]'),
    function(el) { return el.getAttribute('data-parcel-id'); }
  );
}

async function persistListParcelOrder() {
  if (!currentListId) return false;
  var order = getListParcelOrderIds();
  currentListParcels.sort(function(a, b) {
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(currentListId) + '/parcels/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: order })
    });
    if (!res.ok) throw new Error('failed');
    return true;
  } catch (err) {
    console.error(err);
    showError('Failed to save parcel order.');
    return false;
  }
}

function showListOrderSavedFeedback() {
  var hint = document.getElementById('listReorderHint');
  if (!hint) return;
  hint.textContent = 'Order saved';
  hint.classList.add('is-saved');
  setTimeout(function() {
    hint.textContent = 'Drag ⋮⋮ to reorder parcels';
    hint.classList.remove('is-saved');
  }, 1600);
}

function flashListParcelItem(parcelId) {
  var el = document.querySelector('.parcel-list-item[data-parcel-id="' + parcelId + '"]');
  if (!el) return;
  el.classList.add('parcel-list-order-flash');
  setTimeout(function() { el.classList.remove('parcel-list-order-flash'); }, 700);
}

async function moveListParcel(parcelId, delta) {
  var idx = currentListParcels.findIndex(function(p) { return p.id === parcelId; });
  if (idx < 0) return;
  var newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= currentListParcels.length) return;
  closeAllParcelMenus();
  var item = currentListParcels.splice(idx, 1)[0];
  currentListParcels.splice(newIdx, 0, item);
  renderListParcels(currentListCanEdit);
  flashListParcelItem(parcelId);
  await persistListParcelOrder();
  showListOrderSavedFeedback();
}

function renderParcelItem(item, canEdit) {
  var refLine = typeof formatParcelRefLine === 'function'
    ? formatParcelRefLine(item)
    : 'Parcel ' + item.parcel_nbr + ' \u2022 ' + item.sheet + '/' + item.plan_nbr;
  var titleLine = item.parcel_title
    ? '<div class="parcel-list-custom-title">' + escapeHTML(item.parcel_title) + '</div>' +
      '<div class="parcel-list-ref">' + refLine + '</div>'
    : '<div class="parcel-list-primary-title">' + refLine + '</div>';
  var area = item.municipality || item.district || '\u2014';
  var areaSqmLine = (item.area_sqm != null && item.area_sqm !== '' && typeof formatAreaSqm === 'function')
    ? '<div class="parcel-list-area">' + formatAreaSqm(item.area_sqm) + '</div>'
    : '';
  var ownershipLine = (typeof formatOwnershipDisplay === 'function' && formatOwnershipDisplay(item))
    ? '<div class="parcel-list-ownership ' + (typeof isFullOwnership === 'function' && isFullOwnership(item) ? 'parcel-list-ownership-full' : 'parcel-list-ownership-partial') + '">' + escapeHTML(formatOwnershipDisplay(item)) + '</div>'
    : '';
  var locationLine = item.location_note
    ? '<div class="parcel-list-location">' + escapeHTML(item.location_note) + '</div>'
    : '';
  var valueLine = (item.parcel_value != null && item.parcel_value !== '' && typeof formatParcelValue === 'function')
    ? '<div class="parcel-list-value">' + escapeHTML(formatParcelValue(item.parcel_value)) + '</div>'
    : '';
  var data = encodeURIComponent(JSON.stringify({
    sheet: item.sheet, plan_nbr: item.plan_nbr,
    parcel_nbr: item.parcel_nbr, dist_code: item.dist_code
  }));
  var noteHTML = canEdit
    ? '<div class="parcel-list-note-wrap">' +
        '<button type="button" class="parcel-list-note-line" data-note-open="' + item.id + '">' +
          buildListNoteLineInnerHTML(item.note) +
        '</button>' +
        '<textarea class="parcel-list-note-input" data-autosave-note="' + item.id + '" rows="3" placeholder="Write a note…" hidden></textarea>' +
        '<span class="parcel-note-saved-msg hidden" data-note-saved-msg="' + item.id + '">Saved</span>' +
      '</div>'
    : (item.note
      ? '<div class="parcel-note"><span class="parcel-note-text">' + escapeHTML(item.note) + '</span></div>'
      : '');
  var photos = parseParcelPhotos(item);
  var photosHTML = photos.length ? renderListParcelPhotosHTML(photos) : '';
  var shareBtnHTML =
    '<button data-share-parcel="' + item.id + '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
      ' Share' +
    '</button>';
  var editMenuHTML = canEdit
    ? '<button data-move-parcel-up="' + item.id + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>' +
        ' Move up' +
      '</button>' +
      '<button data-move-parcel-down="' + item.id + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        ' Move down' +
      '</button>' +
      '<button data-sale-parcel="' + item.id + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
        ' List for sale' +
      '</button>' +
      '<button class="menu-danger" data-remove-id="' + item.id + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        ' Remove' +
      '</button>'
    : '';
  var menuHTML =
    '<div class="parcel-item-actions">' +
      '<button class="parcel-menu-btn" data-parcel-menu="' + item.id + '" title="Options">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
      '</button>' +
      '<div class="parcel-menu-dropdown hidden" data-parcel-dropdown="' + item.id + '">' +
        shareBtnHTML +
        editMenuHTML +
      '</div>' +
    '</div>';
  var dragHandleHTML = canEdit
    ? '<div class="parcel-list-drag-handle" data-drag-handle role="button" tabindex="0" aria-label="Drag to reorder" title="Drag to reorder">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>' +
      '</div>'
    : '';
  return (
    '<div class="parcel-list-item' + (canEdit ? ' parcel-list-reorderable' : '') + '" data-parcel-id="' + item.id + '">' +
      '<div class="parcel-list-main">' +
        dragHandleHTML +
        '<div class="parcel-list-item-row" data-goto-parcel="' + data + '">' +
        '<div class="parcel-list-info">' +
          titleLine +
          '<div style="color:#94a3b8;font-size:11px;">' + area + '</div>' +
          areaSqmLine +
          ownershipLine +
          locationLine +
          valueLine +
          photosHTML +
        '</div>' +
        menuHTML +
        '</div>' +
      '</div>' +
      noteHTML +
    '</div>'
  );
}

function closeAllParcelMenus() {
  document.querySelectorAll('.parcel-menu-dropdown').forEach(function(d) {
    d.classList.add('hidden');
  });
  document.querySelectorAll('.parcel-list-item-menu-open').forEach(function(el) {
    el.classList.remove('parcel-list-item-menu-open');
  });
}

var listParcelSearchEl = document.getElementById('listParcelSearch');
if (listParcelSearchEl) {
  listParcelSearchEl.addEventListener('input', function() {
    listParcelSearchQuery = this.value.trim();
    applyListParcelFilters();
  });
}

document.addEventListener('click', function(e) {
  var filterBtn = e.target.closest('.list-parcel-filter-btn');
  if (filterBtn) {
    e.stopPropagation();
    toggleListParcelFilterDropdown(filterBtn);
    return;
  }
  var filterOpt = e.target.closest('[data-ownership-filter]');
  if (filterOpt && filterOpt.closest('.list-parcel-filter-dropdown')) {
    setListParcelOwnershipFilter(filterOpt.getAttribute('data-ownership-filter'));
    closeListParcelFilterDropdowns();
    return;
  }
  if (!e.target.closest('.list-parcel-filter-menu')) {
    closeListParcelFilterDropdowns();
  }
});

var showParcelGridBtn = document.getElementById('showParcelGridBtn');
if (showParcelGridBtn) {
  showParcelGridBtn.addEventListener('click', function() {
    if (!currentListParcels.length) return;
    openParcelGridModal();
  });
}

var printMapBtn = document.getElementById('printMapBtn');
if (printMapBtn) {
  printMapBtn.addEventListener('click', function() { openMapPrintPreview(printMapBtn); });
}

var detailsPrintBtn = document.getElementById('detailsPrintBtn');
if (detailsPrintBtn) {
  detailsPrintBtn.addEventListener('click', function() { openParcelPrintPreview(detailsPrintBtn); });
}

var mapPrintClose = document.getElementById('mapPrintClose');
if (mapPrintClose) mapPrintClose.addEventListener('click', closeMapPrintPreview);

var mapPrintCancel = document.getElementById('mapPrintCancel');
if (mapPrintCancel) mapPrintCancel.addEventListener('click', closeMapPrintPreview);

var mapPrintDoPrint = document.getElementById('mapPrintDoPrint');
if (mapPrintDoPrint) mapPrintDoPrint.addEventListener('click', doMapPrint);

var parcelGridPanelClose = document.getElementById('parcelGridPanelClose');
if (parcelGridPanelClose) {
  parcelGridPanelClose.addEventListener('click', closeParcelGridModal);
}

var parcelGridSearchEl = document.getElementById('parcelGridSearch');
if (parcelGridSearchEl) {
  parcelGridSearchEl.addEventListener('input', function() {
    listParcelSearchQuery = this.value.trim();
    var listSearch = document.getElementById('listParcelSearch');
    if (listSearch) listSearch.value = this.value;
    applyListParcelFilters();
  });
}

var parcelGridBody = document.getElementById('parcelGridBody');
if (parcelGridBody) {
  parcelGridBody.addEventListener('click', function(e) {
    var row = e.target.closest('.parcel-grid-row');
    if (!row) return;
    var parcelId = row.getAttribute('data-parcel-id');
    var item = currentListParcels.find(function(p) { return p.id === parcelId; });
    if (!item) return;
    closeParcelGridModal();
    parcelDetailsFromGrid = true;
    if (typeof openSavedParcelFromList === 'function') {
      openSavedParcelFromList(item);
    }
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var panel = document.getElementById('parcelGridPanel');
    if (panel && !panel.classList.contains('hidden')) closeParcelGridModal();
  }
});

document.getElementById('listParcels').addEventListener('input', function(e) {
  var el = e.target.closest('[data-autosave-note]');
  if (!el) return;
  e.stopPropagation();
  if (el.closest('.parcel-list-note-wrap.expanded')) resizeListNoteInput(el);
  if (typeof scheduleParcelNoteAutosave === 'function') {
    scheduleParcelNoteAutosave(el.getAttribute('data-autosave-note'), el.value);
  }
});

document.getElementById('listParcels').addEventListener('blur', function(e) {
  var el = e.target.closest('[data-autosave-note]');
  if (!el) return;
  var wrap = el.closest('.parcel-list-note-wrap');
  if (!wrap || !wrap.classList.contains('expanded')) return;
  finishListNoteEdit(el.getAttribute('data-autosave-note'), true);
}, true);

function resizeListNoteInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(36, el.scrollHeight) + 'px';
}

document.getElementById('listParcels').addEventListener('click', async function(e) {
  var noteOpen = e.target.closest('[data-note-open]');
  if (noteOpen) {
    e.stopPropagation();
    openListNoteEditor(noteOpen.getAttribute('data-note-open'));
    return;
  }
  if (e.target.closest('[data-autosave-note]')) {
    e.stopPropagation();
    return;
  }

  var menuBtn = e.target.closest('[data-parcel-menu]');
  if (menuBtn) {
    e.stopPropagation();
    var pid = menuBtn.getAttribute('data-parcel-menu');
    var dropdown = document.querySelector('[data-parcel-dropdown="' + pid + '"]');
    var listItem = menuBtn.closest('.parcel-list-item');
    var wasHidden = dropdown.classList.contains('hidden');
    closeAllParcelMenus();
    if (wasHidden) {
      dropdown.classList.remove('hidden');
      if (listItem) listItem.classList.add('parcel-list-item-menu-open');
    }
    return;
  }

  if (e.target.closest('.parcel-list-photos-readonly, .parcel-list-photo-thumb')) {
    e.stopPropagation();
  }

  var photoThumb = e.target.closest('.parcel-list-photo-thumb, .parcel-photo-thumb');
  if (photoThumb) {
    e.stopPropagation();
    if (typeof openLightbox === 'function') {
      openLightbox(
        photoThumb.getAttribute('data-photo-src'),
        JSON.parse(photoThumb.getAttribute('data-all-photos'))
      );
    }
    return;
  }

  var parcelShareBtn = e.target.closest('[data-share-parcel]');
  if (parcelShareBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    var shareParcelId = parcelShareBtn.getAttribute('data-share-parcel');
    var shareItem = currentListParcels.find(function(x) { return x.id === shareParcelId; });
    if (shareItem && typeof shareParcelFromList === 'function') {
      shareParcelFromList(shareItem);
    }
    return;
  }

  var moveUpBtn = e.target.closest('[data-move-parcel-up]');
  if (moveUpBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    moveListParcel(moveUpBtn.getAttribute('data-move-parcel-up'), -1);
    return;
  }

  var moveDownBtn = e.target.closest('[data-move-parcel-down]');
  if (moveDownBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    moveListParcel(moveDownBtn.getAttribute('data-move-parcel-down'), 1);
    return;
  }

  var parcelSaleBtn = e.target.closest('[data-sale-parcel]');
  if (parcelSaleBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    var saleParcelId = parcelSaleBtn.getAttribute('data-sale-parcel');
    var saleItem = currentListParcels.find(function(x) { return x.id === saleParcelId; });
    if (saleItem && typeof openParcelSaleFromList === 'function') {
      openParcelSaleFromList(saleItem);
    }
    return;
  }

  var removeBtn = e.target.closest('[data-remove-id]');
  if (removeBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    if (!confirm('Remove this parcel from the list?')) return;
    var id = removeBtn.getAttribute('data-remove-id');
    try {
      var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(id), {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('failed to remove');
      currentListParcels = currentListParcels.filter(function(p) { return p.id !== id; });
      if (!currentListParcels.length) {
        document.getElementById('listParcelsEmpty').style.display = 'block';
        document.getElementById('listParcelsSearchEmpty').style.display = 'none';
        document.getElementById('listParcels').innerHTML = '';
        updateListParcelSearchUI(currentListCanEdit);
      } else {
        renderListParcels(currentListCanEdit);
      }
      await loadLists();
    } catch (err) {
      console.error(err);
    }
    return;
  }

  var parcelItem = e.target.closest('[data-goto-parcel]');
  if (parcelItem) {
    if (listNoteSuppressNavigation) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    var listItemEl = parcelItem.closest('.parcel-list-item');
    var parcelId = listItemEl ? listItemEl.getAttribute('data-parcel-id') : null;
    var saved = parcelId
      ? currentListParcels.find(function(x) { return x.id === parcelId; })
      : null;
    if (saved) {
      openSavedParcelFromList(saved);
      return;
    }
    var parcelData = JSON.parse(decodeURIComponent(parcelItem.getAttribute('data-goto-parcel')));
    navigateToParcel(parcelData.sheet, parcelData.plan_nbr, parcelData.parcel_nbr, parcelData.dist_code);
  }
});

document.getElementById('backToLists').addEventListener('click', function() {
  leaveParcelDetailsFromList();
  closeParcelGridModal();
  currentListId = null;
  currentListRole = null;
  currentListParcels = [];
  clearListParcels();
  history.replaceState(null, '', window.location.pathname);
  switchTab('list');
});

document.getElementById('backToListParcels').addEventListener('click', function() {
  var fromGrid = parcelDetailsFromGrid;
  leaveParcelDetailsFromList();
  switchTab('listParcels');
  highlightListNav();
  if (typeof openSidebar === 'function') openSidebar();
  if (fromGrid) openParcelGridModal();
});

document.getElementById('showAllParcelsBtn').addEventListener('click', function() {
  var parcels = getFilteredListParcels();
  if (!parcels.length) return;
  showAllListParcels(parcels);
});

(function initListParcelMapHover() {
  var container = document.getElementById('listParcels');
  if (!container) return;

  container.addEventListener('mouseover', function(e) {
    var item = e.target.closest('.parcel-list-item[data-parcel-id]');
    if (!item || typeof isListParcelsOnMap !== 'function' || !isListParcelsOnMap()) return;
    var id = item.getAttribute('data-parcel-id');
    if (!id || id === listParcelMapHoverId) return;
    if (listParcelMapHoverId && typeof hideListParcelMapTooltip === 'function') {
      hideListParcelMapTooltip(listParcelMapHoverId);
      var prev = container.querySelector('.parcel-list-item-map-hover');
      if (prev) prev.classList.remove('parcel-list-item-map-hover');
    }
    listParcelMapHoverId = id;
    if (typeof showListParcelMapTooltip === 'function') showListParcelMapTooltip(id);
    item.classList.add('parcel-list-item-map-hover');
  });

  container.addEventListener('mouseout', function(e) {
    var item = e.target.closest('.parcel-list-item[data-parcel-id]');
    if (!item) return;
    var related = e.relatedTarget;
    if (related && item.contains(related)) return;
    var id = item.getAttribute('data-parcel-id');
    if (!id || id !== listParcelMapHoverId) return;
    listParcelMapHoverId = null;
    if (typeof hideListParcelMapTooltip === 'function') hideListParcelMapTooltip(id);
    item.classList.remove('parcel-list-item-map-hover');
  });
})();

// --- List detail 3-dot menu ---
document.getElementById('listDetailMenuBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  var dropdown = document.getElementById('listDetailDropdown');
  var header = document.querySelector('.list-detail-header');
  var wasHidden = dropdown.classList.contains('hidden');
  closeAllListMenus();
  if (wasHidden) {
    dropdown.classList.remove('hidden');
    if (header) header.classList.add('list-detail-menu-open');
  }
});

var renameSkipBlur = false;

function startRename() {
  renameSkipBlur = true;
  var titleEl = document.getElementById('listParcelsTitle');
  var renameInput = document.getElementById('listParcelsRename');
  var list = userLists.find(function(l) { return l.id === currentListId; })
    || sharedLists.find(function(l) { return l.id === currentListId; });
  var currentName = (titleEl && titleEl.textContent.trim()) || (list && list.name) || '';
  renameInput.value = currentName;
  renameInput.setAttribute('value', currentName);
  titleEl.style.display = 'none';
  renameInput.classList.remove('hidden');
  setTimeout(function() {
    renameInput.focus();
    renameInput.setSelectionRange(renameInput.value.length, renameInput.value.length);
    renameSkipBlur = false;
  }, 0);
}

document.getElementById('renameListBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  e.preventDefault();
  document.getElementById('listDetailDropdown').classList.add('hidden');
  startRename();
});

async function commitRename() {
  var titleEl = document.getElementById('listParcelsTitle');
  var renameInput = document.getElementById('listParcelsRename');
  if (renameInput.classList.contains('hidden')) return;
  var newName = renameInput.value.trim();
  renameInput.classList.add('hidden');
  titleEl.style.display = '';
  if (!newName || !currentListId || newName === titleEl.textContent) return;
  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(currentListId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    if (res.ok) {
      titleEl.textContent = newName;
      await loadLists();
    }
  } catch (err) { console.error(err); }
}

document.getElementById('listParcelsRename').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
  if (e.key === 'Escape') {
    this.classList.add('hidden');
    document.getElementById('listParcelsTitle').style.display = '';
  }
});

document.getElementById('listParcelsRename').addEventListener('blur', function() {
  if (renameSkipBlur) return;
  commitRename();
});

document.getElementById('deleteListBtn').addEventListener('click', async function() {
  if (!currentListId) return;
  if (!confirm('Delete this list and all its parcels?')) return;
  await deleteList(currentListId);
  currentListId = null;
  switchTab('list');
});

// --- Share modal (Google Maps style: view link + edit link) ---

var shareViewURL = '';
var shareEditURL = '';
var shareModalListId = null;

document.getElementById('shareListBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  e.preventDefault();
  document.getElementById('listDetailDropdown').classList.add('hidden');
  openShareModal();
});

function buildShareURL(token) {
  return window.location.origin + window.location.pathname + '?share=' + token;
}

function renderSharePeople(data) {
  var container = document.getElementById('sharePeopleList');
  if (!container || !data) return;

  var owner = data.owner || {};
  var members = data.members || [];
  var ownerLabel = owner.name ? escapeHTML(owner.name) : escapeHTML(owner.email || 'You');
  var ownerHTML =
    '<div class="share-person-row share-person-owner">' +
      '<div class="share-person-info">' +
        '<span class="share-person-name">' + ownerLabel + '</span>' +
        (owner.name ? '<span class="share-person-email">' + escapeHTML(owner.email) + '</span>' : '') +
        '<span class="share-person-role">Owner</span>' +
      '</div>' +
    '</div>';

  var membersHTML = members.length
    ? members.map(function(m) {
        var label = m.name ? escapeHTML(m.name) : escapeHTML(m.email);
        return (
          '<div class="share-person-row">' +
            '<div class="share-person-info">' +
              '<span class="share-person-name">' + label + '</span>' +
              (m.name ? '<span class="share-person-email">' + escapeHTML(m.email) + '</span>' : '') +
              '<span class="share-person-role">' + (m.role === 'editor' ? 'Can edit' : 'Can view') + '</span>' +
            '</div>' +
            '<button type="button" class="share-person-remove" data-remove-share="' + escapeHTML(m.id) + '" title="Remove access">&times;</button>' +
          '</div>'
        );
      }).join('')
    : '<div class="share-people-empty">No one else has access yet. Add someone by email or send a link below.</div>';

  container.innerHTML = ownerHTML + membersHTML;
}

function showSharePeopleError(msg) {
  var el = document.getElementById('sharePeopleError');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

async function loadSharePeople(listId) {
  var container = document.getElementById('sharePeopleList');
  if (container) container.innerHTML = '<div class="share-people-empty">Loading…</div>';
  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/shares');
    if (!res.ok) throw new Error('failed');
    var data = await res.json();
    renderSharePeople(data);
    showSharePeopleError('');
  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = '<div class="share-people-empty">Could not load people.</div>';
  }
}

async function openShareModal(listId) {
  var id = listId || currentListId;
  if (!id) return;
  var list = userLists.find(function(l) { return l.id === id; });
  if (!list) return;

  shareModalListId = id;
  document.getElementById('shareModalTitle').textContent = 'Share "' + list.name + '"';
  document.getElementById('shareLinksLoading').style.display = '';
  document.getElementById('shareLinksContent').classList.add('hidden');
  document.getElementById('shareCopiedMsg').classList.add('hidden');
  showSharePeopleError('');
  var emailInput = document.getElementById('shareEmailInput');
  if (emailInput) emailInput.value = '';
  document.getElementById('shareModal').classList.remove('hidden');

  loadSharePeople(id);

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(id) + '/share-links', {
      method: 'POST'
    });
    if (!res.ok) throw new Error('failed');
    var data = await res.json();
    shareViewURL = buildShareURL(data.share_token);
    shareEditURL = buildShareURL(data.edit_token);

    list.share_token = data.share_token;
    list.edit_token = data.edit_token;
    renderLists();
  } catch (err) {
    console.error(err);
  }

  document.getElementById('shareLinksLoading').style.display = 'none';
  document.getElementById('shareLinksContent').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
  shareModalListId = null;
}

document.getElementById('shareModalClose').addEventListener('click', closeShareModal);
document.getElementById('shareModal').addEventListener('click', function(e) {
  if (e.target === this) closeShareModal();

  var removeBtn = e.target.closest('[data-remove-share]');
  if (removeBtn && shareModalListId) {
    e.stopPropagation();
    var shareId = removeBtn.getAttribute('data-remove-share');
    removeBtn.disabled = true;
    authFetch(API_BASE + '/lists/' + encodeURIComponent(shareModalListId) + '/shares/' + encodeURIComponent(shareId), {
      method: 'DELETE'
    }).then(function(res) {
      if (!res.ok) throw new Error('failed');
      return loadSharePeople(shareModalListId);
    }).catch(function(err) {
      console.error(err);
      showSharePeopleError('Could not remove access.');
      removeBtn.disabled = false;
    });
    return;
  }
});

document.getElementById('shareAddPersonBtn').addEventListener('click', async function() {
  if (!shareModalListId) return;
  var input = document.getElementById('shareEmailInput');
  var roleSelect = document.getElementById('shareRoleSelect');
  var btn = document.getElementById('shareAddPersonBtn');
  var email = (input && input.value || '').trim();
  if (!email) {
    showSharePeopleError('Enter an email address.');
    return;
  }
  btn.disabled = true;
  showSharePeopleError('');
  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(shareModalListId) + '/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, role: roleSelect ? roleSelect.value : 'viewer' })
    });
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error(data.error || 'Failed to add person');
    if (input) input.value = '';
    await loadSharePeople(shareModalListId);
  } catch (err) {
    console.error(err);
    showSharePeopleError(err.message || 'Could not add person.');
  }
  btn.disabled = false;
});

document.getElementById('shareEmailInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('shareAddPersonBtn').click();
  }
});

function showCopiedMsg() {
  var msg = document.getElementById('shareCopiedMsg');
  msg.classList.remove('hidden');
  setTimeout(function() { msg.classList.add('hidden'); }, 2000);
}

document.getElementById('copyViewLink').addEventListener('click', function() {
  navigator.clipboard.writeText(shareViewURL).then(showCopiedMsg);
});

document.getElementById('copyEditLink').addEventListener('click', function() {
  navigator.clipboard.writeText(shareEditURL).then(showCopiedMsg);
});

(function initListParcelPointerReorder() {
  var container = document.getElementById('listParcels');
  if (!container) return;

  var active = null;

  function getDragAfterElement(y) {
    var items = container.querySelectorAll('.parcel-list-item:not(.parcel-list-dragging)');
    var closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for (var i = 0; i < items.length; i++) {
      var child = items[i];
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset: offset, element: child };
      }
    }
    return closest.element;
  }

  function positionFloatingItem(clientY) {
    if (!active) return;
    var containerRect = container.getBoundingClientRect();
    var item = active.item;
    item.style.top = (clientY - containerRect.top - active.grabOffsetY) + 'px';
  }

  function movePlaceholderToPointer(clientY) {
    if (!active) return;
    var placeholder = active.placeholder;
    var after = getDragAfterElement(clientY);
    if (!after) container.appendChild(placeholder);
    else container.insertBefore(placeholder, after);
  }

  function stopDocumentDragListeners() {
    document.removeEventListener('pointermove', onDocumentPointerMove);
    document.removeEventListener('pointerup', onDocumentPointerEnd);
    document.removeEventListener('pointercancel', onDocumentPointerEnd);
  }

  function clearActive() {
    if (!active) return;
    stopDocumentDragListeners();
    var item = active.item;
    var placeholder = active.placeholder;
    item.classList.remove('parcel-list-dragging');
    item.style.position = '';
    item.style.left = '';
    item.style.top = '';
    item.style.width = '';
    item.style.zIndex = '';
    item.style.margin = '';
    item.style.pointerEvents = '';
    if (placeholder && placeholder.parentNode) {
      container.insertBefore(item, placeholder);
      placeholder.remove();
    }
    container.classList.remove('parcel-list-reordering');
    active = null;
    listParcelDragId = null;
    listNoteSuppressNavigation = false;
  }

  function finishActive() {
    if (!active) return;
    var item = active.item;
    var placeholder = active.placeholder;
    var parcelId = item.getAttribute('data-parcel-id');
    var startIndex = active.startIndex;
    clearActive();
    if (!placeholder || !parcelId) return;
    var endIndex = getListParcelOrderIds().indexOf(parcelId);
    if (startIndex === endIndex) return;
    persistListParcelOrder().then(function(ok) {
      if (ok) {
        flashListParcelItem(parcelId);
        showListOrderSavedFeedback();
      }
    });
  }

  function autoScrollForPointer(clientY) {
    var view = document.getElementById('viewListParcels');
    var scrollParent = view ? view.querySelector('.sidebar-view-scroll') : null;
    if (!scrollParent) scrollParent = view;
    if (!scrollParent) return;
    var rect = scrollParent.getBoundingClientRect();
    var margin = 56;
    if (clientY < rect.top + margin) scrollParent.scrollTop -= 14;
    else if (clientY > rect.bottom - margin) scrollParent.scrollTop += 14;
  }

  function onDocumentPointerMove(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    active.lastClientY = e.clientY;
    autoScrollForPointer(e.clientY);
    movePlaceholderToPointer(e.clientY);
    positionFloatingItem(e.clientY);
  }

  function onDocumentPointerEnd(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    if (e.type === 'pointercancel') {
      var startIndex = active.startIndex;
      var placeholder = active.placeholder;
      var items = container.querySelectorAll('.parcel-list-item:not(.parcel-list-dragging)');
      if (startIndex >= items.length) container.appendChild(placeholder);
      else container.insertBefore(placeholder, items[startIndex]);
      clearActive();
      return;
    }
    finishActive();
  }

  container.addEventListener('pointerdown', function(e) {
    if (!e.target.closest('[data-drag-handle]')) return;
    if (getListParcelSearchQuery()) return;
    var item = e.target.closest('.parcel-list-item');
    if (!item || active) return;
    e.preventDefault();
    e.stopPropagation();

    var containerRect = container.getBoundingClientRect();
    var rect = item.getBoundingClientRect();
    var placeholder = document.createElement('div');
    placeholder.className = 'parcel-list-drag-placeholder';
    placeholder.style.height = rect.height + 'px';
    container.insertBefore(placeholder, item);

    item.classList.add('parcel-list-dragging');
    item.style.position = 'absolute';
    item.style.left = (rect.left - containerRect.left) + 'px';
    item.style.top = (rect.top - containerRect.top) + 'px';
    item.style.width = rect.width + 'px';
    item.style.zIndex = '1200';
    item.style.pointerEvents = 'none';
    item.style.margin = '0';

    active = {
      item: item,
      placeholder: placeholder,
      pointerId: e.pointerId,
      grabOffsetY: e.clientY - rect.top,
      lastClientY: e.clientY,
      startIndex: getListParcelOrderIds().indexOf(item.getAttribute('data-parcel-id'))
    };
    listParcelDragId = item.getAttribute('data-parcel-id');
    listNoteSuppressNavigation = true;
    container.classList.add('parcel-list-reordering');

    document.addEventListener('pointermove', onDocumentPointerMove);
    document.addEventListener('pointerup', onDocumentPointerEnd);
    document.addEventListener('pointercancel', onDocumentPointerEnd);
  });
})();

// --- Join shared list (requires auth) ---

async function joinSharedList(token) {
  try {
    var res = await authFetch(API_BASE + '/shared/' + encodeURIComponent(token) + '/join', {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to join');
    var data = await res.json();

    history.replaceState(null, '', window.location.pathname);

    await loadLists();
    openListParcels(data.list_id, data.role);

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
  } catch (err) {
    console.error('Failed to join shared list:', err);
  }
}

function loadSharedList(token) {
  if (authUser && authToken) {
    joinSharedList(token);
  } else {
    pendingShareToken = token;
    sessionStorage.setItem('pending_share_token', token);
    switchTab('list');
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
}

function processPendingShareToken() {
  var token = pendingShareToken || sessionStorage.getItem('pending_share_token');
  if (token) {
    pendingShareToken = null;
    sessionStorage.removeItem('pending_share_token');
    joinSharedList(token);
  }
}
