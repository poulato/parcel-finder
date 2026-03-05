import { esc, renderNavBar, renderAppMenu, renderMobileBottomBar, GTM_HEAD, GTM_BODY } from '../layout.js';

export function renderListingsPage(listings, district, filterLabel, siteUrl, apiOrigin) {
  const cardsHTML = listings.length ? listings.map(l => {
    const price = l.price ? `€${Number(l.price).toLocaleString()}` : 'Negotiable';
    const loc = l.municipality || l.district || '';
    let photos = [];
    try { photos = l.photo_keys ? JSON.parse(l.photo_keys) : []; } catch(e) {}
    const thumb = photos.length
      ? `<img class="card-thumb" src="${apiOrigin}/api/images/${encodeURIComponent(photos[0])}" alt="${esc(l.title || 'Land')}" loading="lazy"/>`
      : '<div class="card-thumb card-thumb-empty">🏞️</div>';
    const cert = l.certificate_key ? '<span class="cert">✓ Verified</span>' : '';
    return `<a class="card" href="${apiOrigin}/listing/${l.id}">
${thumb}
<div class="card-body">
<div class="card-title">${esc(l.title || 'Land for Sale')}</div>
<div class="card-price">${price} ${cert}</div>
<div class="card-loc">📍 ${esc(loc)} · Parcel ${esc(String(l.parcel_nbr))} · ${esc(String(l.sheet))}/${esc(String(l.plan_nbr))}</div>
</div>
</a>`;
  }).join('') : '<p class="empty">No listings found.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Land for Sale in ${esc(filterLabel)} | Geoktimonas</title>
<meta name="description" content="Browse ${listings.length} land parcels for sale in ${esc(filterLabel)}. Find prices, locations, photos, and verified certificates on Geoktimonas."/>
<link rel="canonical" href="${apiOrigin}/listings${district ? '?district=' + district : ''}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="Land for Sale in ${esc(filterLabel)} | Geoktimonas"/>
<meta property="og:description" content="Browse ${listings.length} land parcels for sale in ${esc(filterLabel)}."/>
<meta property="og:url" content="${apiOrigin}/listings"/>
<link rel="stylesheet" href="/assets/styles.css"/>
${GTM_HEAD}
<style>
.listings-main{flex:1;min-width:0;padding:24px;overflow-y:auto;max-width:800px;margin-left:56px;background:#131c2e}
.listings-main h2{font-size:20px;font-weight:700;margin-bottom:4px;color:#f1f5f9}
.subtitle{font-size:14px;color:#64748b;margin-bottom:20px}
.filters{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
.filter-link{display:inline-block;padding:6px 14px;border-radius:20px;font-size:12px;text-decoration:none;background:transparent;border:1px solid #334155;color:#94a3b8;transition:all .15s;font-weight:500}
.filter-link:hover{border-color:#4a90d9;color:#e2e8f0}
.filter-link.active{background:#4a90d9;color:#fff;border-color:#4a90d9}
.grid{display:flex;flex-direction:column;gap:10px}
.card{display:flex;gap:0;background:#1a2536;border:1px solid #243044;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;transition:all .15s}
.card:hover{border-color:#4a90d9;transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
.card-thumb{width:130px;min-height:110px;object-fit:cover;flex-shrink:0}
.card-thumb-empty{width:130px;min-height:110px;display:flex;align-items:center;justify-content:center;background:#0f172a;font-size:28px;flex-shrink:0}
.card-body{padding:14px 16px;min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center}
.card-title{font-size:15px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f1f5f9}
.card-price{font-size:15px;color:#4a90d9;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.card-loc{font-size:12px;color:#94a3b8}
.cert{font-size:10px;color:#6ee7b7;background:#064e3b;padding:2px 7px;border-radius:10px;font-weight:600}
.empty{text-align:center;color:#64748b;padding:40px 0}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center}
.footer a{color:#4a90d9;text-decoration:none}
@media(max-width:700px){
  #iconRail{display:none!important}
  .listings-main{margin-left:0;padding:12px;padding-bottom:72px}
  .card{flex-direction:column}
  .card-thumb,.card-thumb-empty{width:100%;height:160px;min-height:auto}
  .card-body{padding:12px}
  .card-title{white-space:normal;font-size:15px}
  .card-price{font-size:16px}
  .card-loc{font-size:12px}
  .filter-link{padding:8px 16px;font-size:13px}
}
</style>
</head>
<body>
${GTM_BODY}
${renderAppMenu(apiOrigin)}
${renderNavBar(siteUrl, apiOrigin, 'list')}
<div class="listings-main">
<h2>Land for Sale</h2>
<p class="subtitle">${listings.length} listing${listings.length !== 1 ? 's' : ''} in ${esc(filterLabel)}</p>
<div class="filters">
<a class="filter-link${!district ? ' active' : ''}" href="${apiOrigin}/listings">All</a>
<a class="filter-link${district === '1' ? ' active' : ''}" href="${apiOrigin}/listings?district=1">Nicosia</a>
<a class="filter-link${district === '2' ? ' active' : ''}" href="${apiOrigin}/listings?district=2">Famagusta</a>
<a class="filter-link${district === '3' ? ' active' : ''}" href="${apiOrigin}/listings?district=3">Larnaca</a>
<a class="filter-link${district === '4' ? ' active' : ''}" href="${apiOrigin}/listings?district=4">Paphos</a>
<a class="filter-link${district === '5' ? ' active' : ''}" href="${apiOrigin}/listings?district=5">Limassol</a>
</div>
<div class="grid">${cardsHTML}</div>
<div class="footer">
<p><a href="${siteUrl}/">Geoktimonas</a> – Cyprus parcel finder & marketplace.</p>
</div>
</div>
${renderMobileBottomBar(siteUrl, apiOrigin, 'list')}
</body>
</html>`;
}
