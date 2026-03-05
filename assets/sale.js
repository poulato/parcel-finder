var saleListings = [];
var _saleMapGen = 0;
var lightboxImages = [];
var lightboxIndex = 0;

function addSalePriceMarker(listing, center) {
  var pl = listing.price ? '€' + Number(listing.price).toLocaleString() : '—';
  var pi = L.divIcon({ className: 'sale-marker', html: '<div class="sale-marker-label">' + pl + '</div>', iconSize: [80, 24], iconAnchor: [40, 12] });
  saleMarkersGroup.addLayer(L.marker([center[0], center[1]], { icon: pi }));
}

function openLightbox(src, allSrcs) {
  lightboxImages = allSrcs || [src];
  lightboxIndex = Math.max(0, lightboxImages.indexOf(src));
  renderLightbox();
  document.getElementById('imageLightbox').classList.remove('hidden');
}

function renderLightbox() {
  var lb = document.getElementById('imageLightbox');
  lb.querySelector('.lightbox-img').src = lightboxImages[lightboxIndex];
  lb.querySelector('.lightbox-prev').style.display = lightboxImages.length > 1 ? '' : 'none';
  lb.querySelector('.lightbox-next').style.display = lightboxImages.length > 1 ? '' : 'none';
  var counter = lb.querySelector('.lightbox-counter');
  counter.textContent = lightboxImages.length > 1 ? (lightboxIndex + 1) + ' / ' + lightboxImages.length : '';
}

function closeLightbox() {
  document.getElementById('imageLightbox').classList.add('hidden');
}

function lightboxPrev(e) {
  e.stopPropagation();
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}

function lightboxNext(e) {
  e.stopPropagation();
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  renderLightbox();
}

document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('imageLightbox');
  if (lb.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; renderLightbox(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; renderLightbox(); }
});

function districtName(code) {
  var names = { 1: 'Nicosia', 2: 'Famagusta', 3: 'Kyrenia', 4: 'Larnaca', 5: 'Limassol', 6: 'Paphos' };
  return names[code] || '';
}

async function loadSaleListings(filters) {
  _searchGen++;
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  clearListParcels();
  saleMarkersGroup.clearLayers();
  currentParcel = null;

  var filterBtn = document.getElementById('saleFilterBtn');
  if (filterBtn) { filterBtn.disabled = true; filterBtn.textContent = 'Loading...'; }

  var qs = '';
  if (filters) {
    var parts = [];
    if (filters.district) parts.push('district=' + encodeURIComponent(filters.district));
    if (filters.min_price) parts.push('min_price=' + encodeURIComponent(filters.min_price));
    if (filters.max_price) parts.push('max_price=' + encodeURIComponent(filters.max_price));
    if (parts.length) qs = '?' + parts.join('&');
  }
  try {
    var res = await fetch(API_BASE + '/listings' + qs);
    if (!res.ok) throw new Error('failed');
    saleListings = await res.json();
  } catch (e) {
    console.error(e);
    saleListings = [];
  }
  var pendingId = new URLSearchParams(window.location.search).get('listing');
  var match = pendingId ? saleListings.find(function(l) { return l.id === pendingId; }) : null;

  if (match) {
    if (filterBtn) { filterBtn.disabled = false; filterBtn.textContent = 'Search Listings'; }
    showSaleDetailInPanel(match);
    var searchBarTextEl = document.getElementById('searchBarText');
    var searchBarEl = document.getElementById('searchBar');
    if (searchBarTextEl) {
      searchBarTextEl.textContent = match.title || ('Parcel ' + match.parcel_nbr);
      searchBarEl.classList.add('has-result');
    }
    _skipTabSwitch = true;
    findParcel(match.sheet, match.plan_nbr, match.parcel_nbr, match.dist_code)
      .then(function(data) {
        var features = data.features || [];
        if (!features.length) return;
        return pickFeatureByMunicipality(features, match.municipality)
          .then(function(feature) {
            saleMarkersGroup.clearLayers();
            var center = centroid(feature.geometry.rings);
            map.setView([center[0], center[1]], 18);
            addSalePriceMarker(match, center);
            return enrich(center[0], center[1]).then(function(extra) {
              showParcel(feature, extra, '#16a34a');
            });
          });
      });
  } else {
    renderSaleListings();
    await showSaleListingsOnMap();
  }
  if (filterBtn) { filterBtn.disabled = false; filterBtn.textContent = 'Search Listings'; }
}

function renderSaleListings() {
  var container = document.getElementById('saleResults');
  var emptyEl = document.getElementById('saleEmpty');

  if (!saleListings.length) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  container.innerHTML = saleListings.map(function(l) {
    var priceText = l.price ? '€' + Number(l.price).toLocaleString() : 'Negotiable';
    var verifiedBadge = l.certificate_key
      ? '<span class="listing-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Verified</span>'
      : '';
    var loc = l.municipality || districtName(l.dist_code) || '';
    var photos = [];
    try { photos = l.photo_keys ? JSON.parse(l.photo_keys) : []; } catch(e) {}
    var thumbHTML = photos.length
      ? '<div class="listing-card-thumb"><img class="listing-thumb" src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(photos[0]) + '" alt="" /></div>'
      : '';
    return (
      '<div class="listing-card" data-listing-id="' + l.id + '" data-listing-parcel=\'' + escapeHTML(JSON.stringify({
        sheet: l.sheet, plan_nbr: l.plan_nbr, parcel_nbr: l.parcel_nbr, dist_code: l.dist_code
      })) + '\'>' +
        '<div class="listing-card-body">' +
          '<div class="listing-card-info">' +
            '<div class="listing-card-title">' + escapeHTML(l.title || 'Parcel ' + l.parcel_nbr) + '</div>' +
            '<div class="listing-card-price">' + priceText + ' ' + verifiedBadge + '</div>' +
            (loc ? '<div class="listing-card-loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + escapeHTML(loc) + '</div>' : '') +
            '<div class="listing-card-loc" style="font-size:11px;color:#64748b">👁 ' + (l.views || 0) + ' views</div>' +
          '</div>' +
          thumbHTML +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function showSaleListingsOnMap() {
  _saleMapGen++;
  _searchGen++;
  var gen = _saleMapGen;
  saleMarkersGroup.clearLayers();
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  clearListParcels();
  currentParcel = null;
  var overlay = document.getElementById('mapLoadingOverlay');
  if (!saleListings.length) { if (overlay) overlay.classList.add('hidden'); return Promise.resolve(); }

  var cached = [];
  var needFetch = [];
  saleListings.forEach(function(l) {
    if (l.centroid_lat && l.centroid_lng && l.geometry_rings) {
      try {
        var rings = typeof l.geometry_rings === 'string' ? JSON.parse(l.geometry_rings) : l.geometry_rings;
        cached.push({ listing: l, rings: rings, center: [l.centroid_lat, l.centroid_lng] });
      } catch(e) { needFetch.push(l); }
    } else {
      needFetch.push(l);
    }
  });

  if (needFetch.length) {
    if (overlay) overlay.classList.remove('hidden');
  }

  function addListingToMap(listing, rings, center) {
    var coords = rings[0].map(function(p) { return [p[1], p[0]]; });
    var poly = L.polygon(coords, {
      color: '#16a34a', weight: 4, fillColor: '#16a34a', fillOpacity: 0.2
    });
    function onListingClick() {
      var l = saleListings.find(function(s) { return s.id === listing.id; });
      if (!l) return;
      saleMarkersGroup.clearLayers();
      _skipTabSwitch = true;
      map.setView([center[0], center[1]], 18);
      var sb = document.getElementById('searchBar');
      if (sb) sb.classList.add('loading');
      addSalePriceMarker(l, center);
      enrich(center[0], center[1]).then(function(extra) {
        showParcel({ geometry: { rings: rings }, attributes: {} }, extra, '#16a34a');
      }).finally(function() { if (sb) sb.classList.remove('loading'); });
      showSaleDetailInPanel(l);
      var el = document.getElementById('searchBarText');
      if (el) {
        el.textContent = l.title || ('Parcel ' + l.parcel_nbr);
        document.getElementById('searchBar').classList.add('has-result');
      }
    }
    poly.on('click', onListingClick);
    saleMarkersGroup.addLayer(poly);

    var priceLabel = listing.price ? '€' + Number(listing.price).toLocaleString() : '—';
    var icon = L.divIcon({
      className: 'sale-marker',
      html: '<div class="sale-marker-label">' + priceLabel + '</div>',
      iconSize: [80, 24],
      iconAnchor: [40, 12]
    });
    var marker = L.marker([center[0], center[1]], { icon: icon });
    marker.on('click', onListingClick);
    saleMarkersGroup.addLayer(marker);
    return poly;
  }

  var bounds = L.latLngBounds([]);
  cached.forEach(function(c) {
    var poly = addListingToMap(c.listing, c.rings, c.center);
    if (poly) bounds.extend(poly.getBounds());
  });

  var fetchPromise = Promise.resolve();
  if (needFetch.length) {
    var queries = needFetch.map(function(l) {
      return findParcel(l.sheet, l.plan_nbr, l.parcel_nbr, l.dist_code)
        .then(function(data) {
          var features = data.features || [];
          if (!features.length) return null;
          return pickFeatureByMunicipality(features, l.municipality)
            .then(function(feature) { return { listing: l, feature: feature }; });
        })
        .catch(function() { return null; });
    });
    fetchPromise = Promise.all(queries).then(function(results) {
      if (gen !== _saleMapGen) return;
      results.forEach(function(r) {
        if (!r || !r.feature) return;
        var center = centroid(r.feature.geometry.rings);
        var poly = addListingToMap(r.listing, r.feature.geometry.rings, center);
        if (poly) bounds.extend(poly.getBounds());
      });
    });
  }

  return fetchPromise.then(function() {
    if (gen !== _saleMapGen) return;
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }).finally(function() {
    if (overlay) overlay.classList.add('hidden');
  });
}

function clearSaleMarkers() {
  _saleMapGen++;
  saleMarkersGroup.clearLayers();
}

document.getElementById('saleResults').addEventListener('click', function(e) {
  var card = e.target.closest('[data-listing-parcel]');
  if (!card) return;
  var parcelData = JSON.parse(card.getAttribute('data-listing-parcel'));
  var listingId = card.getAttribute('data-listing-id');
  var listing = saleListings.find(function(l) { return l.id === listingId; });
  saleMarkersGroup.clearLayers();
  _skipTabSwitch = true;

  var searchBarTextEl = document.getElementById('searchBarText');
  var searchBarEl = document.getElementById('searchBar');
  if (listing) {
    showSaleDetailInPanel(listing);
    if (searchBarTextEl) {
      searchBarTextEl.textContent = listing.title || ('Parcel ' + listing.parcel_nbr);
      searchBarEl.classList.add('has-result');
    }
  }
  if (searchBarEl) searchBarEl.classList.add('loading');

  findParcel(parcelData.sheet, parcelData.plan_nbr, parcelData.parcel_nbr, parcelData.dist_code)
    .then(function(data) {
      var features = data.features || [];
      if (!features.length) return;
      return pickFeatureByMunicipality(features, listing ? listing.municipality : null)
        .then(function(feature) {
          var center = centroid(feature.geometry.rings);
          map.setView([center[0], center[1]], 18);
          if (listing) addSalePriceMarker(listing, center);
          return enrich(center[0], center[1]).then(function(extra) {
            showParcel(feature, extra, '#16a34a');
          });
        });
    })
    .catch(function(err) { console.error('Failed to load parcel:', err); })
    .finally(function() { if (searchBarEl) searchBarEl.classList.remove('loading'); });
});

document.getElementById('backToSaleList').addEventListener('click', function() {
  _searchGen++;
  if (parcelLayer) { map.removeLayer(parcelLayer); parcelLayer = null; }
  currentParcel = null;
  document.getElementById('viewSaleDetail').classList.remove('active');
  document.getElementById('viewSale').classList.add('active');
  renderSaleListings();
  showSaleListingsOnMap();
  var searchBarTextEl = document.getElementById('searchBarText');
  var searchBarEl = document.getElementById('searchBar');
  if (searchBarTextEl) {
    searchBarTextEl.textContent = 'Search parcels';
    searchBarEl.classList.remove('has-result');
  }
  var u = new URL(window.location.href);
  u.searchParams.delete('listing');
  history.replaceState(null, '', u.toString());
});

document.getElementById('saleFilterBtn').addEventListener('click', function() {
  var district = document.getElementById('saleDistrict').value;
  var minP = document.getElementById('saleMinPrice').value;
  var maxP = document.getElementById('saleMaxPrice').value;
  loadSaleListings({
    district: district || null,
    min_price: minP || null,
    max_price: maxP || null
  });
});

async function checkParcelListing() {
  if (!currentParcel) return null;
  var qs = 'sheet=' + encodeURIComponent(currentParcel.sheet) +
    '&plan_nbr=' + encodeURIComponent(currentParcel.plan_nbr) +
    '&parcel_nbr=' + encodeURIComponent(currentParcel.parcel_nbr);
  try {
    var headers = {};
    var token = localStorage.getItem('geo_auth_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(API_BASE + '/listings/check?' + qs, { headers: headers });
    if (!res.ok) return null;
    var listings = await res.json();
    if (!listings.length) return null;
    if (typeof authUser !== 'undefined' && authUser) {
      var own = listings.find(function(l) { return l.user_id === authUser.id; });
      if (own) return own;
    }
    var active = listings.find(function(l) { return l.status === 'active'; });
    return active || listings[0];
  } catch (e) {
    return null;
  }
}

async function uploadImage(file) {
  var res = await authFetch(API_BASE + '/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error('Upload failed');
  var data = await res.json();
  return data.key;
}

function openSaleOverlay() {
  document.getElementById('saleModal').classList.remove('hidden');
}

function closeSaleOverlay() {
  document.getElementById('saleModal').classList.add('hidden');
  document.getElementById('saleOverlayFooter').innerHTML = '';
}

document.getElementById('saleOverlayClose').addEventListener('click', closeSaleOverlay);
document.getElementById('saleModal').addEventListener('click', function(e) {
  if (e.target === this) closeSaleOverlay();
});

function showSaleForm(existingListing) {
  var isEdit = !!existingListing;
  document.getElementById('saleOverlayTitle').textContent = isEdit ? 'Edit Listing' : 'List for Sale';

  var content = document.getElementById('saleOverlayContent');
  var listing = existingListing || {};

  var existingPhotos = [];
  try { existingPhotos = listing.photo_keys ? JSON.parse(listing.photo_keys) : []; } catch(e) {}

  content.innerHTML =
    '<div class="sale-form">' +
      '<div class="field">' +
        '<label>Title *</label>' +
        '<input type="text" id="saleTitle" placeholder="e.g. Seaside plot in Limassol" value="' + escapeHTML(listing.title || '') + '" />' +
      '</div>' +
      '<div class="field">' +
        '<label>Price (€)</label>' +
        '<input type="number" id="salePrice" placeholder="Leave empty for negotiable" value="' + (listing.price || '') + '" />' +
      '</div>' +
      '<div class="field">' +
        '<label>Description</label>' +
        '<textarea id="saleDesc" rows="3" placeholder="Describe the parcel...">' + escapeHTML(listing.description || '') + '</textarea>' +
      '</div>' +
      '<div class="field">' +
        '<label>Phone number *</label>' +
        '<div class="phone-row">' +
          '<select id="salePhonePrefix">' +
            '<option value="+357"' + ((listing.contact || '').indexOf('+30') === 0 ? '' : ' selected') + '>🇨🇾 +357</option>' +
            '<option value="+30"' + ((listing.contact || '').indexOf('+30') === 0 ? ' selected' : '') + '>🇬🇷 +30</option>' +
          '</select>' +
          '<input type="tel" id="salePhone" placeholder="99123456" value="' + escapeHTML((listing.contact || '').replace(/^\+357\s?/, '').replace(/^\+30\s?/, '')) + '" />' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Parcel Certificate (optional)</label>' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:6px;">If you add a valid parcel certificate, your listing will be marked as <span style="color:#6ee7b7;font-weight:600;">✓ Verified</span>, increasing trust and visibility for buyers.</div>' +
        '<div class="upload-area" id="certUploadArea">' +
          (listing.certificate_key
            ? '<div class="upload-preview"><img src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(listing.certificate_key) + '" /><span class="listing-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Verified</span></div>'
            : '<span class="upload-placeholder">Click to upload certificate</span>') +
          '<input type="file" id="certFile" accept="image/*" style="display:none;" />' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Photos (up to 5, optional)</label>' +
        '<div class="photo-upload-grid" id="photoGrid">' +
          existingPhotos.map(function(k) {
            return '<div class="photo-thumb" data-photo-key="' + k + '"><img src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(k) + '" /><button class="photo-remove" data-remove-photo="' + k + '">&times;</button></div>';
          }).join('') +
          (existingPhotos.length < 5 ? '<div class="photo-add" id="photoAddBtn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>' : '') +
          '<input type="file" id="photoFile" accept="image/*" style="display:none;" />' +
        '</div>' +
      '</div>' +
    '</div>';

  var footer = document.getElementById('saleOverlayFooter');
  footer.innerHTML =
    '<button id="saleSubmitBtn" class="sale-submit-btn">' + (isEdit ? 'Update Listing' : 'List for Sale') + '</button>' +
    (isEdit ? '<button id="saleRemoveBtn" class="sale-remove-btn">Remove Listing</button>' : '');

  var certUploadState = { key: listing.certificate_key || null };
  var photoKeysState = existingPhotos.slice();

  var certArea = document.getElementById('certUploadArea');
  var certInput = document.getElementById('certFile');
  certArea.addEventListener('click', function() { certInput.click(); });
  certInput.addEventListener('click', function(ev) { ev.stopPropagation(); });
  certInput.addEventListener('change', async function() {
    if (!this.files.length) return;
    certArea.innerHTML = '<span class="upload-placeholder">Uploading...</span><input type="file" id="certFile" accept="image/*" style="display:none;" />';
    try {
      var key = await uploadImage(this.files[0]);
      certUploadState.key = key;
      certArea.innerHTML =
        '<div class="upload-preview"><img src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(key) + '" /><span class="listing-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Verified</span></div>' +
        '<input type="file" id="certFile" accept="image/*" style="display:none;" />';
    } catch(e) {
      certArea.innerHTML = '<span class="upload-placeholder">Upload failed, try again</span><input type="file" id="certFile" accept="image/*" style="display:none;" />';
    }
  });

  function rebindPhotoEvents() {
    var addBtn = document.getElementById('photoAddBtn');
    var fileInput = document.getElementById('photoFile');
    if (addBtn && fileInput) {
      addBtn.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('click', function(ev) { ev.stopPropagation(); });
      fileInput.addEventListener('change', async function() {
        if (!this.files.length) return;
        if (photoKeysState.length >= 5) return;
        addBtn.innerHTML = '<span style="font-size:11px;">...</span>';
        try {
          var key = await uploadImage(this.files[0]);
          photoKeysState.push(key);
          renderPhotoGrid();
        } catch(e) {
          addBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        }
      });
    }
    document.querySelectorAll('[data-remove-photo]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var k = this.getAttribute('data-remove-photo');
        photoKeysState = photoKeysState.filter(function(pk) { return pk !== k; });
        renderPhotoGrid();
      });
    });
  }

  function renderPhotoGrid() {
    var grid = document.getElementById('photoGrid');
    grid.innerHTML =
      photoKeysState.map(function(k) {
        return '<div class="photo-thumb" data-photo-key="' + k + '"><img src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(k) + '" /><button class="photo-remove" data-remove-photo="' + k + '">&times;</button></div>';
      }).join('') +
      (photoKeysState.length < 5 ? '<div class="photo-add" id="photoAddBtn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>' : '') +
      '<input type="file" id="photoFile" accept="image/*" style="display:none;" />';
    rebindPhotoEvents();
  }

  rebindPhotoEvents();

  document.getElementById('saleSubmitBtn').addEventListener('click', async function() {
    var titleVal = document.getElementById('saleTitle').value.trim();
    if (!titleVal) {
      alert('Title is required.');
      return;
    }
    var phonePrefix = document.getElementById('salePhonePrefix').value;
    var phoneNum = document.getElementById('salePhone').value.trim();
    if (!phoneNum) {
      alert('Phone number is required.');
      return;
    }
    var contact = phonePrefix + ' ' + phoneNum;
    var priceVal = document.getElementById('salePrice').value.trim();
    var body = {
      title: titleVal,
      price: priceVal ? parseInt(priceVal) : null,
      description: document.getElementById('saleDesc').value.trim() || null,
      contact: contact,
      certificate_key: certUploadState.key || null,
      photo_keys: photoKeysState.length ? photoKeysState : null
    };

    this.disabled = true;
    this.textContent = 'Saving...';

    try {
      var url, method;
      if (isEdit) {
        url = API_BASE + '/listings/' + encodeURIComponent(listing.id);
        method = 'PUT';
      } else {
        url = API_BASE + '/listings';
        method = 'POST';
        body.sheet = currentParcel.sheet;
        body.plan_nbr = currentParcel.plan_nbr;
        body.parcel_nbr = currentParcel.parcel_nbr;
        body.dist_code = currentParcel.dist_code;
        body.district = currentParcel.district;
        body.municipality = currentParcel.municipality;
        body.planning_zone = currentParcel.planning_zone;
        body.centroid_lat = currentParcel.centroid_lat;
        body.centroid_lng = currentParcel.centroid_lng;
        body.geometry_rings = currentParcel.geometry_rings;
      }
      var res = await authFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        var err = await res.json().catch(function() { return {}; });
        throw new Error(err.error || 'Failed');
      }
      var saved = await res.json().catch(function() { return {}; });
      closeSaleOverlay();
      updateSaleButton(saved);
      if (saved.status === 'pending') {
        alert('Your listing has been submitted and is pending admin approval.');
      }
    } catch (e) {
      alert(e.message || 'Failed to save listing');
      this.disabled = false;
      this.textContent = isEdit ? 'Update Listing' : 'List for Sale';
    }
  });

  var removeBtn = document.getElementById('saleRemoveBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async function() {
      if (!confirm('Remove this listing?')) return;
      try {
        var res = await authFetch(API_BASE + '/listings/' + encodeURIComponent(listing.id), {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('failed');
        closeSaleOverlay();
        updateSaleButton(null);
      } catch (e) {
        alert('Failed to remove listing');
      }
    });
  }

  openSaleOverlay();
}

function buildListingDetailHTML(listing) {
  var priceText = listing.price ? '€' + Number(listing.price).toLocaleString() : 'Negotiable';
  var verifiedBadge = listing.certificate_key
    ? '<span class="listing-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Verified</span>'
    : '';
  var photos = [];
  try { photos = listing.photo_keys ? JSON.parse(listing.photo_keys) : []; } catch(e) {}

  var photoSrcs = photos.map(function(k) { return API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(k); });
  var photoSrcsJSON = escapeHTML(JSON.stringify(photoSrcs));
  var photosHTML = photos.length
    ? '<div class="listing-gallery">' + photoSrcs.map(function(src) {
        return '<img class="listing-gallery-img" src="' + src + '" alt="" data-all-photos=\'' + photoSrcsJSON + '\' onclick="openLightbox(this.src, JSON.parse(this.getAttribute(\'data-all-photos\')))" />';
      }).join('') + '</div>'
    : '';

  var certHTML = listing.certificate_key
    ? '<div class="listing-cert"><img src="' + API_BASE.replace('/api', '') + '/api/images/' + encodeURIComponent(listing.certificate_key) + '" alt="Certificate" onclick="openLightbox(this.src)" /></div>'
    : '';

  var loc = listing.municipality || districtName(listing.dist_code) || '';

  var posterName = escapeHTML(listing.user_name || 'Anonymous');

  var statusBadge = '';
  if (listing.status === 'pending') {
    statusBadge = '<span class="listing-status-badge listing-status-pending">Pending Approval</span>';
  } else if (listing.status === 'rejected') {
    statusBadge = '<span class="listing-status-badge listing-status-rejected">Rejected</span>';
  }

  return '<div class="listing-detail">' +
    photosHTML +
    '<div class="listing-detail-header">' +
      (listing.title ? '<div class="listing-detail-title">' + escapeHTML(listing.title) + '</div>' : '') +
      '<div class="listing-detail-price">' + priceText + '</div>' +
    '</div>' +
    (statusBadge ? '<div style="margin:2px 0;">' + statusBadge + '</div>' : '') +
    (verifiedBadge ? '<div style="margin:2px 0;">' + verifiedBadge + '</div>' : '') +
    '<div class="listing-detail-meta">' +
      (loc ? '<span class="listing-detail-loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + escapeHTML(loc) + '</span>' : '') +
      '<span class="listing-detail-parcel">&bull; Parcel ' + listing.parcel_nbr + ' &bull; ' + listing.sheet + '/' + listing.plan_nbr + '</span>' +
      '<span>&bull; 👁 ' + (listing.views || 0) + ' views</span>' +
    '</div>' +
    (listing.description ? '<div class="listing-detail-desc">' + escapeHTML(listing.description) + '</div>' : '') +
    '<div class="listing-detail-footer">' +
      '<div class="listing-detail-poster-inline">' +
        (listing.user_picture ? '<img class="listing-poster-avatar" src="' + listing.user_picture + '" />' : '') +
        '<span>' + posterName + '</span>' +
      '</div>' +
      '<div class="listing-detail-contact-inline" style="cursor:pointer" onclick="copyPhone(\'' + escapeHTML((listing.contact || '').replace(/\s/g, '')) + '\')" title="Click to copy">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ' +
        escapeHTML(listing.contact) +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
      (listing.status === 'active' ? '<button class="listing-share-btn" style="flex:1" onclick="copyListingLink(\'' + listing.id + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share</button>' : '') +
      '<button class="listing-share-btn" style="flex:1" onclick="goToParcelSearch(\'' + escapeHTML(listing.sheet) + '\',\'' + escapeHTML(listing.plan_nbr) + '\',\'' + escapeHTML(listing.parcel_nbr) + '\',\'' + escapeHTML(listing.dist_code || '') + '\',\'' + escapeHTML(listing.municipality || '') + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Parcel Details</button>' +
    '</div>' +
  '</div>';
}

function copyPhone(num) {
  navigator.clipboard.writeText(num).then(function() {
    var el = document.querySelector('.listing-detail-contact-inline');
    if (el) {
      var orig = el.innerHTML;
      el.textContent = 'Copied!';
      setTimeout(function() { el.innerHTML = orig; }, 1500);
    }
  });
}

function goToParcelSearch(sheet, plan, parcel, dist, municipality) {
  saleMarkersGroup.clearLayers();
  document.getElementById('sheet').value = sheet;
  document.getElementById('plan').value = plan;
  document.getElementById('parcel').value = parcel;
  document.getElementById('district').value = dist || '';
  _searchMunicipality = municipality || null;
  switchTab('search');
  doSearch();
}

function copyListingLink(listingId) {
  var listingUrl = window.location.origin + '/listing/' + listingId;
  navigator.clipboard.writeText(listingUrl).then(function() {
    var btn = document.querySelector('.listing-share-btn');
    if (btn) { btn.textContent = 'Link copied!'; setTimeout(function() { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share Listing'; }, 2000); }
  });
}

function showSaleDetailInPanel(listing) {
  document.querySelectorAll('.sidebar-view').forEach(function(v) { v.classList.remove('active'); });
  document.getElementById('viewSaleDetail').classList.add('active');
  document.getElementById('saleDetailContent').innerHTML = buildListingDetailHTML(listing);
  openSidebar();
  if (typeof isMobile === 'function' && isMobile()) {
    document.querySelectorAll('.bottom-tab').forEach(function(b) { b.classList.remove('active'); });
    var saleBtn = document.querySelector('.bottom-tab[data-tab="sale"]');
    if (saleBtn) saleBtn.classList.add('active');
  } else {
    document.querySelectorAll('.rail-btn').forEach(function(b) { b.classList.remove('active'); });
    var saleBtn = document.querySelector('.rail-btn[data-tab="sale"]');
    if (saleBtn) saleBtn.classList.add('active');
  }
  fetch(API_BASE + '/listings/' + encodeURIComponent(listing.id) + '/view', { method: 'POST' }).catch(function() {});
  var u = new URL(window.location.href);
  u.searchParams.set('listing', listing.id);
  history.replaceState(null, '', u.toString());
}

function showListingDetail(listing) {
  document.getElementById('saleOverlayTitle').textContent = 'Listing Details';
  document.getElementById('saleOverlayContent').innerHTML = buildListingDetailHTML(listing);
  openSaleOverlay();
}

function updateSaleButton(listing) {
  var btn = document.getElementById('detailsSaleBtn');
  var label = btn.parentElement.querySelector('.action-label');
  if (listing) {
    btn.classList.add('is-listed');
    if (listing.status === 'pending') {
      label.textContent = 'Pending';
    } else if (listing.status === 'rejected') {
      label.textContent = 'Rejected';
    } else {
      label.textContent = 'Listed';
    }
  } else {
    btn.classList.remove('is-listed');
    label.textContent = 'Sale';
  }
}

async function handleSaleButtonClick() {
  if (!currentParcel) return;

  var listing = await checkParcelListing();
  if (listing && listing.status === 'active' && (!authUser || listing.user_id !== authUser.id)) {
    showListingDetail(listing);
    return;
  }
  if (!authUser) { handleAuthClick('Sign in to list a parcel for sale'); return; }
  if (!listing) {
    showSaleForm(null);
    return;
  }
  if (listing.user_id === authUser.id) {
    showSaleForm(listing);
  } else {
    showSaleForm(null);
  }
}

document.getElementById('detailsSaleBtn').addEventListener('click', function() {
  handleSaleButtonClick();
});

