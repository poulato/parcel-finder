var userLists = [];
var sharedLists = [];
var currentListId = null;
var currentListRole = null;
var currentListParcels = [];
var pendingShareToken = null;

function escapeHTML(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    var shareBadge = (list.share_token || list.edit_token) ? '<span class="list-share-badge">Shared</span>' : '';
    return (
      '<div class="lists-item" data-list-id="' + list.id + '">' +
        '<div>' +
          '<div class="lists-item-name">' + escapeHTML(list.name) + shareBadge + '</div>' +
          '<div class="lists-item-count">' + (list.parcel_count || 0) + ' parcels</div>' +
        '</div>' +
        '<div class="lists-item-actions">' +
          '<button class="lists-menu-btn" data-menu-list="' + list.id + '" title="Options">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
          '</button>' +
          '<div class="lists-menu-dropdown hidden" data-dropdown-list="' + list.id + '">' +
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
}

document.getElementById('listsContainer').addEventListener('click', function(e) {
  var menuBtn = e.target.closest('[data-menu-list]');
  if (menuBtn) {
    e.stopPropagation();
    var listId = menuBtn.getAttribute('data-menu-list');
    var dropdown = document.querySelector('[data-dropdown-list="' + listId + '"]');
    var wasHidden = dropdown.classList.contains('hidden');
    closeAllListMenus();
    if (wasHidden) dropdown.classList.remove('hidden');
    return;
  }

  var deleteBtn = e.target.closest('[data-delete-list]');
  if (deleteBtn) {
    e.stopPropagation();
    closeAllListMenus();
    deleteList(deleteBtn.getAttribute('data-delete-list'));
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
  var shareBtn = document.getElementById('shareListBtn');
  if (detailMenu) detailMenu.style.display = isOwner ? '' : 'none';
  if (shareBtn) shareBtn.style.display = isOwner ? '' : 'none';

  switchTab('listParcels');

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(listId) + '/parcels');
    if (!res.ok) throw new Error('failed');
    var parcels = await res.json();
    if (!parcels.length) {
      document.getElementById('listParcelsEmpty').style.display = 'block';
      return;
    }
    currentListParcels = parcels;
    document.getElementById('showAllParcelsBtn').style.display = '';
    document.getElementById('listParcels').innerHTML = parcels.map(function(item) {
      return renderParcelItem(item, canEdit);
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

function renderParcelItem(item, canEdit) {
  var line = 'Parcel ' + item.parcel_nbr + ' \u2022 ' + item.sheet + '/' + item.plan_nbr;
  var area = item.municipality || item.district || '\u2014';
  var data = encodeURIComponent(JSON.stringify({
    sheet: item.sheet, plan_nbr: item.plan_nbr,
    parcel_nbr: item.parcel_nbr, dist_code: item.dist_code
  }));
  var noteHTML = item.note
    ? '<div class="parcel-note" data-note-id="' + item.id + '">' +
        '<span class="parcel-note-text">' + escapeHTML(item.note) + '</span>' +
      '</div>'
    : '';
  var noteLbl = item.note ? 'Edit Note' : 'Add Note';
  var menuHTML = '';
  if (canEdit) {
    menuHTML =
      '<div class="parcel-item-actions">' +
        '<button class="parcel-menu-btn" data-parcel-menu="' + item.id + '" title="Options">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>' +
        '</button>' +
        '<div class="parcel-menu-dropdown hidden" data-parcel-dropdown="' + item.id + '">' +
          '<button data-add-note="' + item.id + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
            ' ' + noteLbl +
          '</button>' +
          '<button class="menu-danger" data-remove-id="' + item.id + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
            ' Remove' +
          '</button>' +
        '</div>' +
      '</div>';
  }
  return (
    '<div class="parcel-list-item" data-goto-parcel="' + data + '">' +
      '<div class="parcel-list-info">' +
        '<div>' + line + '</div>' +
        '<div style="color:#94a3b8;font-size:11px;">' + area + '</div>' +
        noteHTML +
      '</div>' +
      menuHTML +
    '</div>'
  );
}

function openNoteEditor(parcelId, existingNote) {
  var container = document.getElementById('listParcels');
  var item = container.querySelector('[data-remove-id="' + parcelId + '"]');
  if (!item) return;
  var listItem = item.closest('.parcel-list-item');
  var info = listItem.querySelector('.parcel-list-info');

  var existing = info.querySelector('.parcel-note-editor');
  if (existing) return;

  var oldNote = info.querySelector('.parcel-note');
  if (oldNote) oldNote.style.display = 'none';

  var editor = document.createElement('div');
  editor.className = 'parcel-note-editor';
  editor.innerHTML =
    '<textarea class="parcel-note-input" placeholder="Add a note..." rows="2">' + escapeHTML(existingNote || '') + '</textarea>' +
    '<div class="parcel-note-editor-actions">' +
      '<button class="note-save-btn" data-save-note="' + parcelId + '">Save</button>' +
      '<button class="note-cancel-btn" data-cancel-note="' + parcelId + '">Cancel</button>' +
    '</div>';
  info.appendChild(editor);

  var textarea = editor.querySelector('textarea');
  textarea.addEventListener('click', function(ev) { ev.stopPropagation(); });
  textarea.focus();
}

async function saveNote(parcelId) {
  var container = document.getElementById('listParcels');
  var item = container.querySelector('[data-remove-id="' + parcelId + '"]');
  if (!item) return;
  var listItem = item.closest('.parcel-list-item');
  var editor = listItem.querySelector('.parcel-note-editor');
  if (!editor) return;

  var noteText = editor.querySelector('textarea').value.trim();
  try {
    var res = await authFetch(API_BASE + '/parcels/' + encodeURIComponent(parcelId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText })
    });
    if (!res.ok) throw new Error('failed to save note');

    var p = currentListParcels.find(function(x) { return x.id === parcelId; });
    if (p) p.note = noteText || null;

    editor.remove();

    var info = listItem.querySelector('.parcel-list-info');
    var oldNote = info.querySelector('.parcel-note');
    var dropdownNoteBtn = listItem.querySelector('[data-add-note="' + parcelId + '"]');

    if (noteText) {
      if (oldNote) {
        oldNote.querySelector('.parcel-note-text').textContent = noteText;
        oldNote.style.display = '';
      } else {
        var noteDiv = document.createElement('div');
        noteDiv.className = 'parcel-note';
        noteDiv.setAttribute('data-note-id', parcelId);
        noteDiv.innerHTML = '<span class="parcel-note-text">' + escapeHTML(noteText) + '</span>';
        info.appendChild(noteDiv);
      }
      if (dropdownNoteBtn) dropdownNoteBtn.lastChild.textContent = ' Edit Note';
    } else {
      if (oldNote) oldNote.remove();
      if (dropdownNoteBtn) dropdownNoteBtn.lastChild.textContent = ' Add Note';
    }
  } catch (err) {
    console.error(err);
  }
}

function cancelNoteEditor(parcelId) {
  var container = document.getElementById('listParcels');
  var item = container.querySelector('[data-remove-id="' + parcelId + '"]');
  if (!item) return;
  var listItem = item.closest('.parcel-list-item');
  var editor = listItem.querySelector('.parcel-note-editor');
  if (editor) editor.remove();

  var info = listItem.querySelector('.parcel-list-info');
  var oldNote = info.querySelector('.parcel-note');
  if (oldNote) oldNote.style.display = '';
}

function closeAllParcelMenus() {
  document.querySelectorAll('.parcel-menu-dropdown').forEach(function(d) {
    d.classList.add('hidden');
  });
}

document.getElementById('listParcels').addEventListener('click', async function(e) {
  var menuBtn = e.target.closest('[data-parcel-menu]');
  if (menuBtn) {
    e.stopPropagation();
    var pid = menuBtn.getAttribute('data-parcel-menu');
    var dropdown = document.querySelector('[data-parcel-dropdown="' + pid + '"]');
    var wasHidden = dropdown.classList.contains('hidden');
    closeAllParcelMenus();
    if (wasHidden) dropdown.classList.remove('hidden');
    return;
  }

  var saveBtn = e.target.closest('[data-save-note]');
  if (saveBtn) {
    e.stopPropagation();
    saveNote(saveBtn.getAttribute('data-save-note'));
    return;
  }

  var cancelBtn = e.target.closest('[data-cancel-note]');
  if (cancelBtn) {
    e.stopPropagation();
    cancelNoteEditor(cancelBtn.getAttribute('data-cancel-note'));
    return;
  }

  var addNoteBtn = e.target.closest('[data-add-note]');
  if (addNoteBtn) {
    e.stopPropagation();
    closeAllParcelMenus();
    var noteId = addNoteBtn.getAttribute('data-add-note');
    var p = currentListParcels.find(function(x) { return x.id === noteId; });
    openNoteEditor(noteId, p ? p.note || '' : '');
    return;
  }

  var noteEl = e.target.closest('[data-note-id]');
  if (noteEl) {
    e.stopPropagation();
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
    var parcelData = JSON.parse(decodeURIComponent(parcelItem.getAttribute('data-goto-parcel')));
    _skipTabSwitch = true;
    navigateToParcel(parcelData.sheet, parcelData.plan_nbr, parcelData.parcel_nbr, parcelData.dist_code);
  }
});

document.getElementById('backToLists').addEventListener('click', function() {
  currentListId = null;
  currentListRole = null;
  currentListParcels = [];
  clearListParcels();
  history.replaceState(null, '', window.location.pathname);
  switchTab('list');
});

document.getElementById('showAllParcelsBtn').addEventListener('click', function() {
  if (!currentListParcels.length) return;
  showAllListParcels(currentListParcels);
});

// --- List detail 3-dot menu ---
document.getElementById('listDetailMenuBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('listDetailDropdown').classList.toggle('hidden');
});

var renameSkipBlur = false;

function startRename() {
  renameSkipBlur = true;
  var titleEl = document.getElementById('listParcelsTitle');
  var renameInput = document.getElementById('listParcelsRename');
  renameInput.value = titleEl.textContent;
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

document.getElementById('shareListBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  e.preventDefault();
  document.getElementById('listDetailDropdown').classList.add('hidden');
  openShareModal();
});

function buildShareURL(token) {
  return window.location.origin + window.location.pathname + '?share=' + token;
}

async function openShareModal() {
  if (!currentListId) return;
  var list = userLists.find(function(l) { return l.id === currentListId; });
  if (!list) return;

  document.getElementById('shareModalTitle').textContent = 'Share "' + list.name + '"';
  document.getElementById('shareLinksLoading').style.display = '';
  document.getElementById('shareLinksContent').classList.add('hidden');
  document.getElementById('shareCopiedMsg').classList.add('hidden');
  document.getElementById('shareModal').classList.remove('hidden');

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(currentListId) + '/share-links', {
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
}

document.getElementById('shareModalClose').addEventListener('click', closeShareModal);
document.getElementById('shareModal').addEventListener('click', function(e) {
  if (e.target === this) closeShareModal();
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
