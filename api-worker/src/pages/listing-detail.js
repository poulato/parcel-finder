import { esc, renderNavBar, renderAppMenu, renderMobileBottomBar, GTM_HEAD, GTM_BODY } from '../layout.js';

export function renderListingDetailPage(listing, id, siteUrl, apiOrigin) {
  const appUrl = `${siteUrl}/?tab=sale&listing=${encodeURIComponent(id)}`;
  const title = listing.title || `Land for Sale – Parcel ${listing.parcel_nbr}`;
  const price = listing.price ? `€${Number(listing.price).toLocaleString()}` : 'Negotiable';
  const loc = listing.municipality || listing.district || 'Cyprus';
  const desc = listing.description
    ? listing.description.substring(0, 200)
    : `${price} – Land parcel ${listing.parcel_nbr} (${listing.sheet}/${listing.plan_nbr}) in ${loc}, Cyprus.`;

  let photos = [];
  try { photos = listing.photo_keys ? JSON.parse(listing.photo_keys) : []; } catch(e) {}
  const ogImage = photos.length ? `${apiOrigin}/api/images/${encodeURIComponent(photos[0])}` : '';

  const photosHTML = photos.length
    ? `<div class="gallery">${photos.map(k =>
        `<img src="${apiOrigin}/api/images/${encodeURIComponent(k)}" alt="${esc(title)}" loading="lazy" />`
      ).join('')}</div>`
    : '';

  const certBadge = listing.certificate_key
    ? '<span class="badge verified">✓ Certificate Verified</span>'
    : '';

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": title,
    "description": desc,
    "url": `${apiOrigin}/listing/${id}`,
    "datePosted": listing.created_at,
    ...(listing.price && { "price": listing.price, "priceCurrency": "EUR" }),
    "address": {
      "@type": "PostalAddress",
      "addressLocality": listing.municipality || '',
      "addressRegion": listing.district || '',
      "addressCountry": "CY"
    },
    ...(ogImage && { "image": ogImage })
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} – ${price} | Geoktimonas</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${apiOrigin}/listing/${id}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(title)} – ${price}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${apiOrigin}/listing/${id}"/>
${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"/>
<meta name="twitter:title" content="${esc(title)} – ${price}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
${ogImage ? `<meta name="twitter:image" content="${ogImage}"/>` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="stylesheet" href="/assets/styles.css"/>
${GTM_HEAD}
<style>
.listing-detail-main{margin-left:56px;max-width:720px;padding:24px 16px}
.gallery{display:flex;gap:8px;overflow-x:auto;margin-bottom:20px;border-radius:8px;-webkit-overflow-scrolling:touch}
.gallery img{height:260px;object-fit:cover;border-radius:8px;flex-shrink:0}
.title{font-size:22px;font-weight:700;margin-bottom:4px;color:#f1f5f9}
.price{font-size:20px;color:#6b9eff;font-weight:700;margin-bottom:8px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:4px;margin-bottom:12px}
.verified{background:#064e3b;color:#6ee7b7}
.meta{font-size:14px;color:#94a3b8;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px}
.desc{font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:20px;word-break:break-word}
.poster{display:flex;align-items:center;gap:10px;font-size:14px;color:#94a3b8;margin-bottom:8px}
.poster img{width:32px;height:32px;border-radius:50%}
.contact{font-size:14px;color:#94a3b8;margin-bottom:24px;cursor:pointer}
.contact:hover{color:#cbd5e1}
.cta{display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;transition:background .15s}
.cta:hover{background:#1d4ed8}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center}
.footer a{color:#6b9eff;text-decoration:none}
@media(max-width:700px){
  #iconRail{display:none!important}
  .listing-detail-main{margin-left:0;padding:12px;padding-bottom:72px}
  .gallery{gap:6px;margin-bottom:14px}
  .gallery img{height:180px;border-radius:6px}
  .title{font-size:18px}
  .price{font-size:18px}
  .meta{font-size:13px;gap:4px}
  .desc{font-size:14px}
  .cta{display:block;text-align:center;width:100%;padding:14px;font-size:16px}
}
</style>
</head>
<body>
${GTM_BODY}
${renderAppMenu(apiOrigin)}
${renderNavBar(siteUrl, apiOrigin, 'list')}
<div class="listing-detail-main">
${photosHTML}
<div class="title">${esc(title)}</div>
<div class="price">${price}</div>
${certBadge}
<div class="meta">
<span>📍 ${esc(loc)}</span>
<span>• Parcel ${esc(String(listing.parcel_nbr))} • Sheet ${esc(String(listing.sheet))}/${esc(String(listing.plan_nbr))}</span>
</div>
${listing.description ? `<div class="desc">${esc(listing.description)}</div>` : ''}
<div class="poster">
${listing.user_picture ? `<img src="${esc(listing.user_picture)}" alt=""/>` : ''}
<span>${esc(listing.user_name || 'Anonymous')}</span>
</div>
<div class="contact" onclick="navigator.clipboard.writeText('${esc((listing.contact || '').replace(/\s/g, ''))}');this.textContent='Copied!';setTimeout(()=>{this.innerHTML='📞 ${esc(listing.contact)}'}, 1500)" title="Click to copy">📞 ${esc(listing.contact)}</div>
<a class="cta" href="${appUrl}">View on Map →</a>
<div class="footer">
<p>Land listing on <a href="${siteUrl}">Geoktimonas</a> · <a href="${apiOrigin}/listings">Browse all listings</a></p>
</div>
</div>
${renderMobileBottomBar(siteUrl, apiOrigin, 'list')}
</body>
</html>`;
}
