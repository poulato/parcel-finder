function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendEmail(env, to, subject, htmlBody) {
  if (!env.RESEND_API_KEY) { console.warn("RESEND_API_KEY not set, skipping email"); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Geoktimonas <contact@geoktimonas.com>",
        to: [to],
        subject,
        html: htmlBody,
      }),
    });
    if (!res.ok) console.error("Resend error:", res.status, await res.text());
  } catch (e) {
    console.error("sendEmail failed:", e);
  }
}

function wrap(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="text-align:center;margin-bottom:24px">
  <span style="font-size:28px">🏡</span>
  <span style="font-size:18px;font-weight:700;color:#f1f5f9;margin-left:8px">${title}</span>
</div>
<div style="background:#1e293b;border-radius:12px;padding:28px 24px;color:#cbd5e1;font-size:15px;line-height:1.7">
  ${body}
</div>
<div style="text-align:center;margin-top:24px;font-size:12px;color:#475569">
  <a href="https://geoktimonas.com" style="color:#4a90d9;text-decoration:none">geoktimonas.com</a> ·
  <a href="https://geoktimonas.com/privacy" style="color:#4a90d9;text-decoration:none">Privacy</a> ·
  <a href="https://geoktimonas.com/terms" style="color:#4a90d9;text-decoration:none">Terms</a>
</div>
</div>
</body></html>`;
}

export function welcomeEmail(userName) {
  const firstName = (userName || '').split(' ')[0] || 'there';
  return {
    subject: "Welcome to Geoktimonas! 🏡",
    html: wrap("Welcome!", `
      <h2 style="color:#f1f5f9;margin:0 0 16px">Welcome, ${esc(firstName)}!</h2>
      <p>Thanks for joining <strong>Geoktimonas</strong> — the Cyprus land parcel finder and marketplace.</p>
      <p>Here's what you can do:</p>
      <ul style="padding-left:20px;margin:12px 0">
        <li><strong>Search</strong> any parcel in Cyprus using the DLS cadastral map</li>
        <li><strong>Save</strong> parcels to lists and share them with others</li>
        <li><strong>List parcels for sale</strong> with photos, certificates, and contact details</li>
      </ul>
      <p style="margin-top:20px">
        <a href="https://geoktimonas.com" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Open Geoktimonas →</a>
      </p>
    `),
  };
}

export function listingPendingEmail(listingTitle, parcelNbr, sheet, planNbr) {
  return {
    subject: "Your listing is under review",
    html: wrap("Listing Submitted", `
      <h2 style="color:#f1f5f9;margin:0 0 16px">Listing Under Review</h2>
      <p>Your listing <strong>"${esc(listingTitle)}"</strong> has been submitted and is now pending admin approval.</p>
      <p>We typically review listings within 24 hours. You'll receive an email once it's approved.</p>
      <p style="color:#94a3b8;margin-top:16px;font-size:13px">Parcel: ${esc(String(parcelNbr))} · Sheet ${esc(String(sheet))}/${esc(String(planNbr))}</p>
    `),
  };
}

export function listingApprovedEmail(userName, listingTitle, listingId) {
  const firstName = (userName || '').split(' ')[0] || 'there';
  return {
    subject: "Your listing has been approved! ✅",
    html: wrap("Listing Approved", `
      <h2 style="color:#6ee7b7;margin:0 0 16px">Listing Approved ✅</h2>
      <p>Great news, ${esc(firstName)}! Your listing <strong>"${esc(listingTitle)}"</strong> has been approved and is now live.</p>
      <p>It's visible to everyone browsing Geoktimonas.</p>
      <p style="margin-top:20px">
        <a href="https://geoktimonas.com/listing/${listingId}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">View Your Listing →</a>
      </p>
    `),
  };
}

export function listingRejectedEmail(userName, listingTitle) {
  const firstName = (userName || '').split(' ')[0] || 'there';
  return {
    subject: "Your listing was not approved",
    html: wrap("Listing Not Approved", `
      <h2 style="color:#fbbf24;margin:0 0 16px">Listing Not Approved</h2>
      <p>Hi ${esc(firstName)}, unfortunately your listing <strong>"${esc(listingTitle)}"</strong> was not approved.</p>
      <p>This may be due to incomplete information, inaccurate details, or a policy violation.</p>
      <p>You can edit your listing and resubmit it for review.</p>
      <p style="margin-top:16px">If you have questions, contact us at <a href="mailto:contact@geoktimonas.com" style="color:#4a90d9">contact@geoktimonas.com</a>.</p>
    `),
  };
}
