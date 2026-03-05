import { renderStaticPageHead, renderNavBar, renderAppMenu, renderMobileBottomBar, GTM_BODY } from '../layout.js';

export function renderPrivacyPage(siteUrl, apiOrigin) {
  const head = renderStaticPageHead("Privacy Policy", "Privacy Policy for Geoktimonas - how we handle your data.", `${apiOrigin}/privacy`);
  return `${head}
<body>
${GTM_BODY}
${renderAppMenu(apiOrigin)}
${renderNavBar(siteUrl, apiOrigin, '')}
<div class="static-page-main">
<h1>Privacy Policy</h1>
<p class="static-page-last-updated">Last updated: March 5, 2026</p>

<h2>1. Data Controller</h2>
<p>Geoktimonas ("we", "us", "our") operates the website <a href="https://geoktimonas.com">geoktimonas.com</a>. For any data protection enquiries, contact us at <a href="mailto:contact@geoktimonas.com">contact@geoktimonas.com</a>.</p>

<h2>2. Legal Basis for Processing (GDPR Art. 6)</h2>
<p>We process your personal data on the following legal bases:</p>
<ul>
<li><strong>Consent (Art. 6(1)(a)):</strong> When you sign in with Google, you consent to the collection of your profile information. You may withdraw consent at any time by deleting your account.</li>
<li><strong>Contract performance (Art. 6(1)(b)):</strong> Processing necessary to provide the Service — saving parcels, managing lists, and posting sale listings.</li>
<li><strong>Legitimate interest (Art. 6(1)(f)):</strong> Security monitoring, fraud prevention, and service improvement.</li>
</ul>

<h2>3. Personal Data We Collect</h2>
<p>We collect and process the following categories of personal data:</p>
<ul>
<li><strong>Identity data:</strong> Full name, email address, and profile picture (from Google Sign-In).</li>
<li><strong>Contact data:</strong> Phone number, if you provide it when creating a sale listing.</li>
<li><strong>Usage data:</strong> Saved parcels, lists you create or are shared with, and sale listings you post.</li>
<li><strong>Uploaded content:</strong> Parcel certificate images and photos you upload for sale listings.</li>
<li><strong>Technical data:</strong> Browser local storage tokens for authentication session management. We do not collect IP addresses, device fingerprints, or use analytics trackers.</li>
</ul>

<h2>4. How We Use Your Data</h2>
<ul>
<li><strong>Authentication:</strong> To verify your identity and provide access to personalised features.</li>
<li><strong>Sale Listings:</strong> Your name, profile picture, and contact information (phone number) are displayed publicly on sale listings you create.</li>
<li><strong>Shared Lists:</strong> Your name and email may be visible to users you share lists with, or who share lists with you.</li>
<li><strong>Admin Review:</strong> Sale listings are reviewed by an administrator before publication. The administrator can see your listing data and email address.</li>
<li><strong>Transactional Emails:</strong> We send emails via Resend for account registration, listing submission confirmations, and listing approval/rejection notifications.</li>
</ul>

<h2>5. Data Sharing & Third Parties</h2>
<p>We do not sell, rent, or trade your personal data. We share data only with the following:</p>
<ul>
<li><strong>Cloudflare, Inc.</strong> — Infrastructure provider (hosting, database, object storage). Cloudflare processes data as a data processor under their <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Privacy Policy</a> and is compliant with EU-US Data Privacy Framework.</li>
<li><strong>Google LLC</strong> — Authentication provider (Google Sign-In). Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy Policy</a> applies to the sign-in process.</li>
<li><strong>Resend, Inc.</strong> — Transactional email delivery. Your email address is shared with Resend solely for sending service-related emails. See <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener">Resend's Privacy Policy</a>.</li>
<li><strong>Cyprus Department of Lands and Surveys (DLS)</strong> — Parcel data is queried from the DLS public API. No personal data is sent to DLS.</li>
</ul>

<h2>6. International Data Transfers</h2>
<p>Your data may be transferred to and processed in countries outside the European Economic Area (EEA), specifically to Cloudflare, Google, and Resend servers. These providers participate in the EU-US Data Privacy Framework and implement appropriate safeguards (Standard Contractual Clauses) as required under GDPR Chapter V.</p>

<h2>7. Data Retention</h2>
<ul>
<li><strong>Account data</strong> (name, email, profile picture): Retained for as long as your account is active.</li>
<li><strong>Saved parcels and lists:</strong> Retained until you delete them or request account deletion.</li>
<li><strong>Sale listings:</strong> Retained until you delete them, they are rejected by an admin, or you request account deletion. Publicly visible listing data (title, price, location, photos) may be cached by search engines.</li>
<li><strong>Uploaded images:</strong> Retained as long as the associated sale listing exists. Deleted when the listing is removed.</li>
</ul>
<p>Upon account deletion, all personal data is permanently removed within 30 days.</p>

<h2>8. Cookies & Local Storage</h2>
<p>We do not use cookies. We use browser <code>localStorage</code> solely to store your authentication token for session persistence. No third-party tracking, advertising, or analytics scripts are used.</p>

<h2>9. Your Rights Under GDPR</h2>
<p>If you are located in the EEA, you have the following rights regarding your personal data:</p>
<ul>
<li><strong>Right of access (Art. 15):</strong> Request a copy of the personal data we hold about you.</li>
<li><strong>Right to rectification (Art. 16):</strong> Request correction of inaccurate personal data.</li>
<li><strong>Right to erasure (Art. 17):</strong> Request deletion of your personal data ("right to be forgotten").</li>
<li><strong>Right to restriction (Art. 18):</strong> Request restriction of processing of your data.</li>
<li><strong>Right to data portability (Art. 20):</strong> Request your data in a structured, machine-readable format.</li>
<li><strong>Right to object (Art. 21):</strong> Object to processing based on legitimate interests.</li>
<li><strong>Right to withdraw consent (Art. 7(3)):</strong> Withdraw consent at any time without affecting the lawfulness of prior processing.</li>
</ul>
<p>To exercise any of these rights, email <a href="mailto:contact@geoktimonas.com">contact@geoktimonas.com</a>. We will respond within 30 days as required by GDPR.</p>

<h2>10. Data Security</h2>
<p>We implement appropriate technical and organisational measures to protect your personal data, including:</p>
<ul>
<li>Encrypted data transmission (HTTPS/TLS).</li>
<li>Secure authentication via Google OAuth 2.0 with JWT token verification.</li>
<li>Access controls restricting database and storage access to authorised services only.</li>
<li>Regular review of data processing practices.</li>
</ul>

<h2>11. Children's Privacy</h2>
<p>The Service is not directed at individuals under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us and we will promptly delete it.</p>

<h2>12. Supervisory Authority</h2>
<p>If you are in the EU/EEA and believe your data protection rights have been violated, you have the right to lodge a complaint with your local data protection supervisory authority. For Cyprus, this is the <strong>Commissioner for Personal Data Protection</strong> (<a href="http://www.dataprotection.gov.cy" target="_blank" rel="noopener">dataprotection.gov.cy</a>).</p>

<h2>13. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. Material changes will be communicated through a notice on the Service. The "Last updated" date at the top indicates when the policy was last revised.</p>

<h2>14. Contact</h2>
<p>For any privacy-related questions, data requests, or complaints:</p>
<p>Email: <a href="mailto:contact@geoktimonas.com">contact@geoktimonas.com</a></p>
</div>
${renderMobileBottomBar(siteUrl, apiOrigin, '')}
</body>
</html>`;
}
