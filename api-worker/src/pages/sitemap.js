export function renderSitemap(listings, siteUrl, apiOrigin) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${siteUrl}/</loc><priority>1.0</priority></url>
<url><loc>${apiOrigin}/listings</loc><priority>0.9</priority><changefreq>daily</changefreq></url>
`;
  for (const r of listings) {
    const lastmod = r.created_at ? r.created_at.split(' ')[0] : '';
    xml += `<url><loc>${apiOrigin}/listing/${r.id}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq></url>\n`;
  }
  xml += `</urlset>`;
  return xml;
}
