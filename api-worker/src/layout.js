export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function getSiteUrl(url) {
  return url.origin;
}

export const GTM_HEAD = `<script>if(location.hostname!=='localhost'){(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5F2S9Q2W');}</script>`;

export const GTM_BODY = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5F2S9Q2W"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;


export function renderNavBar(siteUrl, apiOrigin, activePage) {
  return `<nav id="iconRail">
<button class="rail-menu-btn" onclick="toggleAppMenu()" title="Menu">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>
<a class="rail-btn${activePage === 'search' ? ' active' : ''}" href="${siteUrl}/?tab=search" title="Search">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
<span>Search</span>
</a>
<a class="rail-btn${activePage === 'saved' ? ' active' : ''}" href="${siteUrl}/?tab=list" title="Saved">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
<span>Saved</span>
</a>
<a class="rail-btn${activePage === 'sale' ? ' active' : ''}" href="${siteUrl}/?tab=sale" title="Sale">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
<span>Sale</span>
</a>
<a class="rail-btn${activePage === 'list' ? ' active' : ''}" href="${apiOrigin}/listings" title="Listings">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
<span>List</span>
</a>
</nav>`;
}

export function renderMobileBottomBar(siteUrl, apiOrigin, activePage) {
  return `<nav id="bottomBar">
<a class="bottom-tab${activePage === 'search' ? ' active' : ''}" href="${siteUrl}/?tab=search">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
<span>Search</span>
</a>
<a class="bottom-tab${activePage === 'saved' ? ' active' : ''}" href="${siteUrl}/?tab=list">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
<span>Saved</span>
</a>
<a class="bottom-tab${activePage === 'sale' ? ' active' : ''}" href="${siteUrl}/?tab=sale">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
<span>Sale</span>
</a>
<a class="bottom-tab${activePage === 'list' ? ' active' : ''}" href="${apiOrigin}/listings">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
<span>List</span>
</a>
</nav>`;
}

export function renderAppMenu(apiOrigin) {
  return `<div id="appMenuBackdrop" class="app-menu-backdrop hidden" onclick="closeAppMenu()"></div>
<div id="appMenu" class="app-menu hidden">
<div class="app-menu-header">
<span class="app-menu-title">🏡 Geoktimonas</span>
<button class="app-menu-close" onclick="closeAppMenu()">&times;</button>
</div>
<div class="app-menu-links">
<a href="mailto:contact@geoktimonas.com" class="app-menu-link">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
Contact
</a>
<a href="${apiOrigin}/privacy" class="app-menu-link">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
Privacy Policy
</a>
<a href="${apiOrigin}/terms" class="app-menu-link">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
Terms of Service
</a>
</div>
<div class="app-menu-footer">© 2026 Geoktimonas</div>
</div>
<script>
function toggleAppMenu(){var m=document.getElementById("appMenu"),b=document.getElementById("appMenuBackdrop");if(m.classList.contains("hidden")||!m.classList.contains("open")){m.classList.remove("hidden");b.classList.remove("hidden");requestAnimationFrame(function(){m.classList.add("open")})}else closeAppMenu()}
function closeAppMenu(){var m=document.getElementById("appMenu"),b=document.getElementById("appMenuBackdrop");m.classList.remove("open");setTimeout(function(){m.classList.add("hidden");b.classList.add("hidden")},250)}
</script>`;
}

export function renderStaticPageHead(title, description, canonicalUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>${esc(title)} | Geoktimonas</title>
<meta name="description" content="${esc(description)}"/>
<link rel="canonical" href="${canonicalUrl}"/>
<link rel="stylesheet" href="/assets/styles.css"/>
${GTM_HEAD}
<style>
.static-page-main{margin-left:56px;max-width:720px;padding:32px 24px}
.static-page-main h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px}
.static-page-main h2{font-size:17px;font-weight:600;color:#e2e8f0;margin-top:28px;margin-bottom:8px}
.static-page-main p,.static-page-main li{font-size:14px;line-height:1.7;color:#cbd5e1;margin-bottom:10px}
.static-page-main ul{padding-left:20px;margin-bottom:12px}
.static-page-main a{color:#4a90d9;text-decoration:none}
.static-page-main a:hover{text-decoration:underline}
.static-page-last-updated{font-size:12px;color:#64748b;margin-bottom:24px}
@media(max-width:700px){
  #iconRail{display:none!important}
  .static-page-main{margin-left:0;padding:16px 12px;padding-bottom:72px}
  .static-page-main h1{font-size:19px}
  .static-page-main h2{font-size:16px}
}
</style>
</head>`;
}
