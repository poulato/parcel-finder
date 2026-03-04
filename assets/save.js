var parcelSavedLists = [];

async function checkParcelSaved() {
  parcelSavedLists = [];
  if (!authUser || !currentParcel) { updateSaveButton(); return; }
  try {
    var qs = 'sheet=' + encodeURIComponent(currentParcel.sheet) +
      '&plan_nbr=' + encodeURIComponent(currentParcel.plan_nbr) +
      '&parcel_nbr=' + encodeURIComponent(currentParcel.parcel_nbr);
    if (currentParcel.dist_code) qs += '&dist_code=' + encodeURIComponent(currentParcel.dist_code);
    var res = await authFetch(API_BASE + '/parcels/check?' + qs);
    if (res.ok) parcelSavedLists = await res.json();
  } catch (e) { /* silent */ }
  updateSaveButton();
}

function updateSaveButton() {
  var btn = document.getElementById('detailsAddBtn');
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
  if (!userLists.length) {
    picker.innerHTML = '<div style="color:#64748b; font-size:12px; margin-bottom:8px;">No lists yet. Create one below.</div>';
    return;
  }
  picker.innerHTML = userLists.map(function(list) {
    var isSaved = parcelSavedLists.indexOf(list.id) !== -1;
    var icon = isSaved
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    var check = isSaved
      ? '<svg class="save-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5a0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : '';
    return (
      '<div class="save-list-item' + (isSaved ? ' saved' : '') + '" data-save-to="' + list.id + '">' +
        icon +
        '<span class="save-list-name">' + list.name + '</span>' +
        check +
      '</div>'
    );
  }).join('');
}

async function openSavePanel() {
  if (!authUser) { handleAuthClick(); return; }
  await checkParcelSaved();
  var title = document.querySelector('.save-panel-title');
  title.textContent = parcelSavedLists.length > 0 ? 'Saved in your lists' : 'Save to list';
  renderSavePanel();
  document.getElementById('saveOverlay').classList.remove('hidden');
}

function closeSavePanel() {
  document.getElementById('saveOverlay').classList.add('hidden');
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
