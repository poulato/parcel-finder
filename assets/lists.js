var userLists = [];
var sharedLists = [];
var currentListCanEdit = false;
var listParcelDragId = null;
var currentListId = null;
var currentListRole = null;
var currentListParcels = [];
var parcelDetailsFromList = false;

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
  resetSearchBarDisplay();
}

function leaveParcelDetailsFromList() {
  parcelDetailsFromList = false;
  var btn = document.getElementById('backToListParcels');
  if (btn) btn.classList.add('hidden');
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

async function openListParcels(listId, role) {
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
  document.getElementById('showAllParcelsBtn').style.display = 'none';
  currentListParcels = [];

  var detailMenu = document.querySelector('.list-detail-menu');
  if (detailMenu) detailMenu.style.display = isOwner ? '' : 'none';

  switchTab('listParcels');

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/parcels');
    if (!res.ok) throw new Error('failed');
    var parcels = await res.json();
    if (!parcels.length) {
      document.getElementById('listParcelsEmpty').style.display = 'block';
      var emptyHint = document.getElementById('listReorderHint');
      if (emptyHint) emptyHint.classList.add('hidden');
      return;
    }
    currentListParcels = parcels;
    document.getElementById('showAllParcelsBtn').style.display = '';
    var reorderHint = document.getElementById('listReorderHint');
    if (reorderHint) reorderHint.classList.toggle('hidden', !canEdit);
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

function renderListParcels(canEdit) {
  if (listParcelDragId) return;
  var container = document.getElementById('listParcels');
  if (!container) return;
  container.innerHTML = currentListParcels.map(function(item) {
    return renderParcelItem(item, canEdit);
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
  var refLine = 'Parcel ' + item.parcel_nbr + ' \u2022 ' + item.sheet + '/' + item.plan_nbr;
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
      removeBtn.closest('.parcel-list-item').remove();
      var remaining = document.getElementById('listParcels').children.length;
      if (!remaining) document.getElementById('listParcelsEmpty').style.display = 'block';
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
  currentListId = null;
  currentListRole = null;
  currentListParcels = [];
  clearListParcels();
  history.replaceState(null, '', window.location.pathname);
  switchTab('list');
});

document.getElementById('backToListParcels').addEventListener('click', function() {
  leaveParcelDetailsFromList();
  switchTab('listParcels');
  highlightListNav();
  if (typeof openSidebar === 'function') openSidebar();
});

document.getElementById('showAllParcelsBtn').addEventListener('click', function() {
  if (!currentListParcels.length) return;
  showAllListParcels(currentListParcels);
});

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
    var scrollParent = document.getElementById('viewListParcels');
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
