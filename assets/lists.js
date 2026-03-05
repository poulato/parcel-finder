var userLists = [];
var currentListId = null;
var currentListParcels = [];

function renderLists() {
  var container = document.getElementById('listsContainer');
  var emptyEl = document.getElementById('listsEmpty');
  if (!userLists.length) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  container.innerHTML = userLists.map(function(list) {
    var shareBadge = list.visibility === 'public' ? '<span class="list-share-badge">Public</span>' : '';
    return (
      '<div class="lists-item" data-list-id="' + list.id + '">' +
        '<div>' +
          '<div class="lists-item-name">' + list.name + shareBadge + '</div>' +
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
}

async function loadLists() {
  if (!authUser) return;
  try {
    var res = await authFetch(API_BASE + '/lists');
    if (!res.ok) throw new Error('failed to load lists');
    userLists = await res.json();
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
    openListParcels(item.getAttribute('data-list-id'));
  }
});

document.addEventListener('click', function() {
  closeAllListMenus();
  var detailDrop = document.getElementById('listDetailDropdown');
  if (detailDrop) detailDrop.classList.add('hidden');
});

async function openListParcels(listId) {
  var list = userLists.find(function(l) { return l.id === listId; });
  if (!list) return;
  currentListId = listId;
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
      var line = 'Parcel ' + item.parcel_nbr + ' \u2022 ' + item.sheet + '/' + item.plan_nbr;
      var area = item.municipality || item.district || '\u2014';
      var data = encodeURIComponent(JSON.stringify({
        sheet: item.sheet, plan_nbr: item.plan_nbr,
        parcel_nbr: item.parcel_nbr, dist_code: item.dist_code
      }));
      return (
        '<div class="parcel-list-item" data-goto-parcel="' + data + '">' +
          '<div class="parcel-list-info"><div>' + line + '</div><div style="color:#94a3b8;font-size:11px;">' + area + '</div></div>' +
          '<button data-remove-id="' + item.id + '">Remove</button>' +
        '</div>'
      );
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('listParcels').addEventListener('click', async function(e) {
  var removeBtn = e.target.closest('[data-remove-id]');
  if (removeBtn) {
    e.stopPropagation();
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

// --- Share list ---
document.getElementById('shareListBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  e.preventDefault();
  document.getElementById('listDetailDropdown').classList.add('hidden');
  openShareModal();
});

function openShareModal() {
  if (!currentListId) return;
  var list = userLists.find(function(l) { return l.id === currentListId; });
  if (!list) return;
  var toggle = document.getElementById('sharePublicToggle');
  var linkSection = document.getElementById('shareLinkSection');
  var linkInput = document.getElementById('shareLinkInput');
  var copiedMsg = document.getElementById('shareCopied');

  toggle.checked = list.visibility === 'public';
  copiedMsg.classList.add('hidden');

  if (list.visibility === 'public' && list.share_token) {
    linkInput.value = buildShareURL(list.share_token);
    linkSection.classList.remove('hidden');
  } else {
    linkSection.classList.add('hidden');
  }

  document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function buildShareURL(token) {
  return window.location.origin + window.location.pathname + '?share=' + token;
}

document.getElementById('shareModalClose').addEventListener('click', closeShareModal);
document.getElementById('shareModal').addEventListener('click', function(e) {
  if (e.target === this) closeShareModal();
});

document.getElementById('sharePublicToggle').addEventListener('change', async function() {
  var newVis = this.checked ? 'public' : 'private';
  var linkSection = document.getElementById('shareLinkSection');
  var linkInput = document.getElementById('shareLinkInput');
  document.getElementById('shareCopied').classList.add('hidden');

  try {
    var res = await authFetch(API_BASE + '/lists/' + encodeURIComponent(currentListId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: newVis })
    });
    if (!res.ok) throw new Error('Failed to update');
    var updated = await res.json();

    var list = userLists.find(function(l) { return l.id === currentListId; });
    if (list) {
      list.visibility = updated.visibility;
      list.share_token = updated.share_token;
    }

    if (updated.visibility === 'public' && updated.share_token) {
      linkInput.value = buildShareURL(updated.share_token);
      linkSection.classList.remove('hidden');
    } else {
      linkSection.classList.add('hidden');
    }
    renderLists();
  } catch (err) {
    console.error(err);
    this.checked = !this.checked;
  }
});

document.getElementById('shareCopyBtn').addEventListener('click', function() {
  var linkInput = document.getElementById('shareLinkInput');
  navigator.clipboard.writeText(linkInput.value).then(function() {
    var msg = document.getElementById('shareCopied');
    msg.classList.remove('hidden');
    setTimeout(function() { msg.classList.add('hidden'); }, 2000);
  });
});

// --- Load shared list from URL ---
async function loadSharedList(token) {
  var apiBase = window.location.hostname === 'localhost' ? 'http://localhost:8788/api' : 'https://geoktimonas-api.hello-118.workers.dev/api';
  try {
    var res = await fetch(apiBase + '/shared/' + encodeURIComponent(token));
    if (!res.ok) throw new Error('not found');
    var data = await res.json();

    document.getElementById('sharedListTitle').textContent = data.name;
    var container = document.getElementById('sharedListParcels');
    var emptyEl = document.getElementById('sharedListEmpty');

    if (!data.parcels || !data.parcels.length) {
      container.innerHTML = '';
      emptyEl.style.display = 'block';
    } else {
      emptyEl.style.display = 'none';
      container.innerHTML = data.parcels.map(function(item) {
        var line = 'Parcel ' + item.parcel_nbr + ' \u2022 ' + item.sheet + '/' + item.plan_nbr;
        var area = item.municipality || item.district || '\u2014';
        var parcelData = encodeURIComponent(JSON.stringify({
          sheet: item.sheet, plan_nbr: item.plan_nbr,
          parcel_nbr: item.parcel_nbr, dist_code: item.dist_code
        }));
        return (
          '<div class="shared-parcel-item" data-goto-parcel="' + parcelData + '">' +
            '<div>' + line + '</div>' +
            '<div style="color:#94a3b8;font-size:11px;">' + area + '</div>' +
          '</div>'
        );
      }).join('');
    }

    switchTab('sharedList');
    openSidebar();
  } catch (err) {
    console.error('Failed to load shared list:', err);
  }
}

document.getElementById('sharedListParcels').addEventListener('click', function(e) {
  var item = e.target.closest('[data-goto-parcel]');
  if (item) {
    var parcelData = JSON.parse(decodeURIComponent(item.getAttribute('data-goto-parcel')));
    _skipTabSwitch = true;
    navigateToParcel(parcelData.sheet, parcelData.plan_nbr, parcelData.parcel_nbr, parcelData.dist_code);
  }
});
