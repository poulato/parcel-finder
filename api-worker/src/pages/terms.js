import { renderStaticPageHead, renderNavBar, renderAppMenu, renderMobileBottomBar, GTM_BODY } from '../layout.js';

export function renderTermsPage(siteUrl, apiOrigin) {
  const head = renderStaticPageHead("Terms of Service", "Terms of Service for Geoktimonas - rules for using our platform.", `${apiOrigin}/terms`);
  return `${head}
<body>
${GTM_BODY}
${renderAppMenu(apiOrigin)}
${renderNavBar(siteUrl, apiOrigin, '')}
<div class="static-page-main">
<h1>Terms of Service</h1>
<p class="static-page-last-updated">Last updated: March 5, 2026</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using Geoktimonas ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

<h2>2. Description of Service</h2>
<p>Geoktimonas is a platform for searching Cyprus land parcels, saving parcels to lists, and browsing or posting sale listings. Parcel data is sourced from the Cyprus Department of Lands and Surveys (DLS).</p>

<h2>3. User Accounts</h2>
<p>You must sign in with a valid Google account to use personalized features. You are responsible for maintaining the security of your account and for all activities under it.</p>

<h2>4. Sale Listings</h2>
<ul>
<li>Listings are subject to admin approval before becoming publicly visible.</li>
<li>You must provide accurate information in your listings. Misleading or fraudulent listings will be removed.</li>
<li>Geoktimonas does not verify land ownership. The optional "Verified" badge indicates only that a parcel certificate was uploaded, not that ownership has been confirmed.</li>
<li>Geoktimonas is not a party to any transaction between buyers and sellers.</li>
</ul>

<h2>5. Prohibited Conduct</h2>
<p>You agree not to:</p>
<ul>
<li>Post false, misleading, or fraudulent listings.</li>
<li>Attempt to gain unauthorized access to other users' accounts or data.</li>
<li>Use the Service for any unlawful purpose.</li>
<li>Scrape, crawl, or otherwise extract data from the Service in an automated manner without permission.</li>
</ul>

<h2>6. Intellectual Property</h2>
<p>The Service and its original content (excluding user-generated content and DLS data) are the property of Geoktimonas. Parcel data is provided by the Cyprus DLS and is subject to their terms.</p>

<h2>7. Limitation of Liability</h2>
<p>Geoktimonas is provided "as is" without warranties of any kind. We are not liable for any damages arising from the use of the Service, including but not limited to inaccurate parcel data, failed transactions, or data loss.</p>

<h2>8. Termination</h2>
<p>We reserve the right to suspend or terminate your access to the Service at any time, with or without cause.</p>

<h2>9. Changes to Terms</h2>
<p>We may update these Terms from time to time. Continued use of the Service constitutes acceptance of any changes.</p>

<h2>10. Contact</h2>
<p>For questions about these Terms, contact us at <a href="mailto:contact@geoktimonas.com">contact@geoktimonas.com</a>.</p>
</div>
${renderMobileBottomBar(siteUrl, apiOrigin, '')}
</body>
</html>`;
}
