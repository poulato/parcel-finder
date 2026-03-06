const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let cachedCerts = null;
let certsExpiry = 0;

const ALLOWED_ORIGINS = [
  "https://geoktimonas.com",
  "http://localhost:3001",
  "http://localhost:8788",
];

function getCorsOrigin(request) {
  const origin = request?.headers?.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getCorsOrigin(request),
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function getGoogleCerts() {
  if (cachedCerts && Date.now() < certsExpiry) return cachedCerts;
  const res = await fetch(GOOGLE_CERTS_URL);
  const jwks = await res.json();
  cachedCerts = jwks.keys;
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAge = parseInt((cacheControl.match(/max-age=(\d+)/) || [])[1] || "3600");
  certsExpiry = Date.now() + maxAge * 1000;
  return cachedCerts;
}

async function verifyGoogleToken(idToken, clientId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token expired");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com")
    throw new Error("Invalid issuer");
  if (payload.aud !== clientId) throw new Error("Invalid audience");

  const certs = await getGoogleCerts();
  const cert = certs.find((k) => k.kid === header.kid);
  if (!cert) throw new Error("Key not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: cert.kty, n: cert.n, e: cert.e, alg: cert.alg, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signature = base64urlDecode(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!valid) throw new Error("Invalid signature");

  return payload;
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const payload = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
    const dbUser = await env.DB.prepare(
      `SELECT suspended FROM users WHERE id = ?`
    ).bind(payload.sub).first();
    if (dbUser && dbUser.suspended) return { suspended: true };
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (e) {
    return null;
  }
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

import { sendEmail, welcomeEmail, listingPendingEmail, listingApprovedEmail, listingRejectedEmail } from './emails.js';
import { esc, getSiteUrl } from './layout.js';
import { renderListingsPage } from './pages/listings.js';
import { renderListingDetailPage } from './pages/listing-detail.js';
import { renderPrivacyPage } from './pages/privacy.js';
import { renderTermsPage } from './pages/terms.js';
import { renderSitemap } from './pages/sitemap.js';

function isAdmin(user, env) {
  const adminEmail = env.ADMIN_EMAIL || "pavlibeis@gmail.com";
  return user && user.email && user.email.toLowerCase() === adminEmail.toLowerCase();
}

async function getListAccess(env, listId, user) {
  if (!user) return null;
  const list = await env.DB.prepare(
    `SELECT id, user_id, name FROM lists WHERE id = ?`
  ).bind(listId).first();
  if (!list) return null;
  if (list.user_id === user.id) return { list, role: "owner" };
  const share = await env.DB.prepare(
    `SELECT role FROM list_shares WHERE list_id = ? AND LOWER(email) = LOWER(?)`
  ).bind(listId, user.email).first();
  if (share) return { list, role: share.role };
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": getCorsOrigin(request),
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (path === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "geoktimonas-api" });
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Not authenticated" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);
      return json(user);
    }

    // --- User registration (first sign-in tracking + welcome email) ---

    if (path === "/api/auth/register" && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const existing = await env.DB.prepare(
        `SELECT id FROM users WHERE id = ?`
      ).bind(user.id).first();

      if (existing) {
        return json({ registered: false, message: "Already registered" });
      }

      await env.DB.prepare(
        `INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)`
      ).bind(user.id, user.email, user.name || null, user.picture || null).run();

      const welcome = welcomeEmail(user.name);
      ctx.waitUntil(sendEmail(env, user.email, welcome.subject, welcome.html));

      return json({ registered: true });
    }

    // --- Lists ---

    if (path === "/api/lists" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const { results: owned } = await env.DB.prepare(
        `SELECT l.id, l.name, l.visibility, l.share_token, l.edit_token, l.created_at, COUNT(p.id) as parcel_count
         FROM lists l
         LEFT JOIN saved_parcels p ON p.list_id = l.id
         WHERE l.user_id = ?
         GROUP BY l.id
         ORDER BY datetime(l.created_at) DESC`
      ).bind(user.id).all();

      const { results: shared } = await env.DB.prepare(
        `SELECT l.id, l.name, l.created_at, s.role, COUNT(p.id) as parcel_count
         FROM list_shares s
         JOIN lists l ON l.id = s.list_id
         LEFT JOIN saved_parcels p ON p.list_id = l.id
         WHERE LOWER(s.email) = LOWER(?)
         GROUP BY l.id
         ORDER BY datetime(l.created_at) DESC`
      ).bind(user.email).all();

      return json({
        owned: owned || [],
        shared: (shared || []).map(s => ({ ...s, is_shared: true }))
      });
    }

    if (path === "/api/lists" && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const body = await request.json().catch(() => null);
      if (!body || !body.name) return json({ error: "name is required" }, 400);

      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO lists (id, user_id, name) VALUES (?, ?, ?)`
      ).bind(id, user.id, body.name.trim()).run();

      const { results } = await env.DB.prepare(
        `SELECT id, name, created_at FROM lists WHERE id = ?`
      ).bind(id).all();

      return json(results?.[0] || { id, name: body.name.trim() }, 201);
    }

    if (path.startsWith("/api/lists/") && !path.includes("/parcels") && !path.includes("/share") && request.method === "DELETE") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const listId = decodeURIComponent(path.replace("/api/lists/", ""));
      if (!listId) return json({ error: "list id is required" }, 400);

      await env.DB.prepare(
        `DELETE FROM saved_parcels WHERE list_id = ? AND user_id = ?`
      ).bind(listId, user.id).run();

      const { meta } = await env.DB.prepare(
        `DELETE FROM lists WHERE id = ? AND user_id = ?`
      ).bind(listId, user.id).run();

      if (!meta || !meta.changes) return json({ error: "List not found" }, 404);
      return json({ ok: true });
    }

    if (path.match(/^\/api\/lists\/[^/]+$/) && request.method === "PUT") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const listId = decodeURIComponent(path.split("/")[3]);
      const access = await getListAccess(env, listId, user);
      if (!access || access.role !== "owner") return json({ error: "Not authorized" }, 403);

      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);

      const updates = [];
      const binds = [];

      if (body.name && body.name.trim()) {
        updates.push("name = ?");
        binds.push(body.name.trim());
      }

      if (!updates.length) return json({ error: "Nothing to update" }, 400);

      binds.push(listId);
      const { meta } = await env.DB.prepare(
        `UPDATE lists SET ${updates.join(", ")} WHERE id = ?`
      ).bind(...binds).run();

      if (!meta || !meta.changes) return json({ error: "List not found" }, 404);

      const updated = await env.DB.prepare(
        `SELECT id, name, visibility, share_token, edit_token FROM lists WHERE id = ?`
      ).bind(listId).first();
      return json(updated || { ok: true });
    }

    // --- Share links (generate view + edit tokens) ---

    if (path.match(/^\/api\/lists\/[^/]+\/share-links$/) && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const listId = decodeURIComponent(path.split("/")[3]);
      const list = await env.DB.prepare(
        `SELECT id, share_token, edit_token FROM lists WHERE id = ? AND user_id = ?`
      ).bind(listId, user.id).first();
      if (!list) return json({ error: "List not found" }, 404);

      const shareToken = list.share_token || generateToken();
      const editToken = list.edit_token || generateToken();

      if (!list.share_token || !list.edit_token) {
        await env.DB.prepare(
          `UPDATE lists SET share_token = ?, edit_token = ?, visibility = 'public' WHERE id = ?`
        ).bind(shareToken, editToken, listId).run();
      }

      return json({ share_token: shareToken, edit_token: editToken });
    }

    // --- Join shared list (requires auth, auto-saves to user's lists) ---

    if (path.match(/^\/api\/shared\/[^/]+\/join$/) && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const token = decodeURIComponent(path.split("/")[3]);

      let list = await env.DB.prepare(
        `SELECT id, name, user_id FROM lists WHERE share_token = ?`
      ).bind(token).first();
      let role = "viewer";

      if (!list) {
        list = await env.DB.prepare(
          `SELECT id, name, user_id FROM lists WHERE edit_token = ?`
        ).bind(token).first();
        role = "editor";
      }

      if (!list) return json({ error: "List not found" }, 404);

      if (list.user_id === user.id) {
        return json({ list_id: list.id, role: "owner", name: list.name });
      }

      const existing = await env.DB.prepare(
        `SELECT id, role FROM list_shares WHERE list_id = ? AND LOWER(email) = LOWER(?)`
      ).bind(list.id, user.email).first();

      if (existing) {
        if (role === "editor" && existing.role === "viewer") {
          await env.DB.prepare(
            `UPDATE list_shares SET role = 'editor' WHERE id = ?`
          ).bind(existing.id).run();
        } else {
          role = existing.role;
        }
      } else {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO list_shares (id, list_id, email, role) VALUES (?, ?, ?, ?)`
        ).bind(id, list.id, user.email.toLowerCase(), role).run();
      }

      return json({ list_id: list.id, role, name: list.name });
    }

    // --- Parcels ---

    if (path.match(/^\/api\/lists\/[^/]+\/parcels$/) && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const listId = decodeURIComponent(path.split("/")[3]);
      const access = await getListAccess(env, listId, user);
      if (!access) return json({ error: "Not authorized" }, 403);

      const { results } = await env.DB.prepare(
        `SELECT id, list_id, sheet, plan_nbr, parcel_nbr, dist_code,
                district, municipality, planning_zone, planning_zone_desc,
                block_code, note, created_at
         FROM saved_parcels
         WHERE list_id = ?
         ORDER BY datetime(created_at) DESC`
      ).bind(listId).all();

      return json(results || []);
    }

    if (path.match(/^\/api\/lists\/[^/]+\/parcels$/) && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const listId = decodeURIComponent(path.split("/")[3]);
      const access = await getListAccess(env, listId, user);
      if (!access || (access.role !== "owner" && access.role !== "editor")) {
        return json({ error: "Not authorized" }, 403);
      }

      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON body" }, 400);
      if (!body.sheet || !body.plan_nbr || !body.parcel_nbr) {
        return json({ error: "sheet, plan_nbr, parcel_nbr are required" }, 400);
      }

      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          `INSERT INTO saved_parcels (
            id, user_id, list_id, sheet, plan_nbr, parcel_nbr, dist_code,
            district, municipality, planning_zone, planning_zone_desc, block_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id, access.list.user_id, listId,
          body.sheet, body.plan_nbr, body.parcel_nbr,
          body.dist_code ?? null, body.district ?? null,
          body.municipality ?? null, body.planning_zone ?? null,
          body.planning_zone_desc ?? null, body.block_code ?? null
        ).run();
      } catch (err) {
        if (String(err).includes("UNIQUE")) {
          return json({ error: "Parcel already exists in this list" }, 409);
        }
        console.error("Failed to save parcel:", err);
        return json({ error: "Failed to save parcel" }, 500);
      }

      const { results } = await env.DB.prepare(
        `SELECT id, list_id, sheet, plan_nbr, parcel_nbr, dist_code,
                district, municipality, planning_zone, planning_zone_desc,
                block_code, created_at
         FROM saved_parcels WHERE id = ?`
      ).bind(id).all();

      return json(results?.[0] || { id }, 201);
    }

    if (path === "/api/parcels/check" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json([]);

      const sheet = url.searchParams.get("sheet");
      const plan = url.searchParams.get("plan_nbr");
      const parcel = url.searchParams.get("parcel_nbr");
      const dist = url.searchParams.get("dist_code");
      if (!sheet || !plan || !parcel) return json([]);

      const distVal = dist ? parseInt(dist) : -1;
      const norm = s => s ? s.replace(/\.0$/, '') : s;

      const { results } = await env.DB.prepare(
        `SELECT DISTINCT p.list_id FROM saved_parcels p
         JOIN lists l ON l.id = p.list_id
         LEFT JOIN list_shares s ON s.list_id = l.id AND LOWER(s.email) = LOWER(?)
         WHERE (l.user_id = ? OR s.id IS NOT NULL)
         AND REPLACE(p.sheet, '.0', '') = ?
         AND REPLACE(p.plan_nbr, '.0', '') = ?
         AND REPLACE(p.parcel_nbr, '.0', '') = ?
         AND IFNULL(p.dist_code, -1) = ?`
      ).bind(user.email, user.id, norm(sheet), norm(plan), norm(parcel), distVal).all();

      return json((results || []).map(r => r.list_id));
    }

    if (path.match(/^\/api\/parcels\/[^/]+$/) && request.method === "PATCH") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const id = decodeURIComponent(path.replace("/api/parcels/", ""));
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);

      const note = body.note !== undefined ? (body.note || null) : undefined;
      if (note === undefined) return json({ error: "Nothing to update" }, 400);

      const parcel = await env.DB.prepare(
        `SELECT list_id FROM saved_parcels WHERE id = ?`
      ).bind(id).first();
      if (!parcel) return json({ error: "Parcel not found" }, 404);

      const access = await getListAccess(env, parcel.list_id, user);
      if (!access || (access.role !== "owner" && access.role !== "editor")) {
        return json({ error: "Not authorized" }, 403);
      }

      await env.DB.prepare(
        `UPDATE saved_parcels SET note = ? WHERE id = ?`
      ).bind(note, id).run();

      return json({ ok: true, note });
    }

    if (path.match(/^\/api\/parcels\/[^/]+$/) && request.method === "DELETE") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const id = decodeURIComponent(path.replace("/api/parcels/", ""));
      if (!id) return json({ error: "id is required" }, 400);

      const parcel = await env.DB.prepare(
        `SELECT list_id FROM saved_parcels WHERE id = ?`
      ).bind(id).first();
      if (!parcel) return json({ error: "Parcel not found" }, 404);

      const access = await getListAccess(env, parcel.list_id, user);
      if (!access || (access.role !== "owner" && access.role !== "editor")) {
        return json({ error: "Not authorized" }, 403);
      }

      await env.DB.prepare(
        `DELETE FROM saved_parcels WHERE id = ?`
      ).bind(id).run();

      return json({ ok: true });
    }

    // --- Image upload (R2) ---

    if (path === "/api/upload" && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        return json({ error: "Only image uploads are allowed" }, 400);
      }

      const contentLength = parseInt(request.headers.get("content-length") || "0");
      if (contentLength > 5 * 1024 * 1024) {
        return json({ error: "Image must be under 5MB" }, 400);
      }

      const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
      const key = `${crypto.randomUUID()}.${ext}`;
      const body = await request.arrayBuffer();

      if (body.byteLength > 5 * 1024 * 1024) {
        return json({ error: "Image must be under 5MB" }, 400);
      }

      await env.IMAGES.put(key, body, {
        httpMetadata: { contentType },
      });

      return json({ key });
    }

    if (path.match(/^\/api\/images\/[^/]+$/) && request.method === "GET") {
      const key = decodeURIComponent(path.replace("/api/images/", ""));
      const obj = await env.IMAGES.get(key);
      if (!obj) {
        return new Response("Not found", { status: 404 });
      }
      const headers = new Headers();
      headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Access-Control-Allow-Origin", getCorsOrigin(request));
      return new Response(obj.body, { headers });
    }

    // --- Sale listings ---

    if (path === "/api/listings" && request.method === "GET") {
      const district = url.searchParams.get("district");
      const minPrice = url.searchParams.get("min_price");
      const maxPrice = url.searchParams.get("max_price");

      let sql = `SELECT id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
                        dist_code, district, municipality, planning_zone, title, price,
                        description, contact, certificate_key, photo_keys, status, views, created_at,
                        centroid_lat, centroid_lng, geometry_rings
                 FROM sale_listings WHERE status = 'active'`;
      const binds = [];

      if (district) {
        sql += ` AND dist_code = ?`;
        binds.push(parseInt(district));
      }
      if (minPrice) {
        sql += ` AND price >= ?`;
        binds.push(parseInt(minPrice));
      }
      if (maxPrice) {
        sql += ` AND price <= ?`;
        binds.push(parseInt(maxPrice));
      }
      sql += ` ORDER BY datetime(created_at) DESC LIMIT 100`;

      const stmt = binds.length
        ? env.DB.prepare(sql).bind(...binds)
        : env.DB.prepare(sql);
      const { results } = await stmt.all();
      return json(results || []);
    }

    if (path === "/api/listings/check" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      const sheet = url.searchParams.get("sheet");
      const plan = url.searchParams.get("plan_nbr");
      const parcel = url.searchParams.get("parcel_nbr");
      if (!sheet || !plan || !parcel) return json([]);

      const norm = s => s ? s.replace(/\.0$/, '') : s;
      let sql = `SELECT id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
                dist_code, district, municipality, planning_zone, title, price,
                description, contact, certificate_key, photo_keys, status, views, created_at
         FROM sale_listings
         WHERE REPLACE(sheet, '.0', '') = ?
         AND REPLACE(plan_nbr, '.0', '') = ?
         AND REPLACE(parcel_nbr, '.0', '') = ?
         AND (status = 'active'`;
      const binds = [norm(sheet), norm(plan), norm(parcel)];

      if (user) {
        sql += ` OR user_id = ?`;
        binds.push(user.id);
      }
      sql += `) ORDER BY datetime(created_at) DESC`;

      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return json(results || []);
    }

    if (path.match(/^\/api\/listings\/[^/]+\/view$/) && request.method === "POST") {
      const id = decodeURIComponent(path.split("/")[3]);
      await env.DB.prepare(
        `UPDATE sale_listings SET views = COALESCE(views, 0) + 1 WHERE id = ?`
      ).bind(id).run();
      return json({ ok: true });
    }

    if (path === "/api/listings" && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);
      if (!body.sheet || !body.plan_nbr || !body.parcel_nbr) {
        return json({ error: "Parcel identifiers required" }, 400);
      }
      if (!body.contact) {
        return json({ error: "Contact info is required" }, 400);
      }

      const id = crypto.randomUUID();
      const autoApprove = isAdmin(user, env);
      await env.DB.prepare(
        `INSERT INTO sale_listings (
          id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
          dist_code, district, municipality, planning_zone,
          title, price, description, contact, certificate_key, photo_keys, status,
          centroid_lat, centroid_lng, geometry_rings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, user.id, user.name || null, user.picture || null,
        body.sheet, body.plan_nbr, body.parcel_nbr,
        body.dist_code ?? null, body.district ?? null,
        body.municipality ?? null, body.planning_zone ?? null,
        body.title ?? null, body.price ?? null, body.description ?? null,
        body.contact,
        body.certificate_key ?? null,
        body.photo_keys ? JSON.stringify(body.photo_keys) : null,
        autoApprove ? 'active' : 'pending',
        body.centroid_lat ?? null, body.centroid_lng ?? null,
        body.geometry_rings ?? null
      ).run();

      const row = await env.DB.prepare(
        `SELECT * FROM sale_listings WHERE id = ?`
      ).bind(id).first();

      if (!autoApprove) {
        const pending = listingPendingEmail(body.title || `Parcel ${body.parcel_nbr}`, body.parcel_nbr, body.sheet, body.plan_nbr);
        ctx.waitUntil(sendEmail(env, user.email, pending.subject, pending.html));
      }

      return json(row || { id }, 201);
    }

    if (path.match(/^\/api\/listings\/[^/]+$/) && request.method === "PUT") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const id = decodeURIComponent(path.split("/")[3]);
      const listing = await env.DB.prepare(
        `SELECT id, user_id FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      if (!listing) return json({ error: "Not found" }, 404);
      const admin = isAdmin(user, env);
      if (listing.user_id !== user.id && !admin) return json({ error: "Not authorized" }, 403);

      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);

      const updates = [];
      const binds = [];

      if (body.title !== undefined) { updates.push("title = ?"); binds.push(body.title ?? null); }
      if (body.price !== undefined) { updates.push("price = ?"); binds.push(body.price ?? null); }
      if (body.description !== undefined) { updates.push("description = ?"); binds.push(body.description ?? null); }
      if (body.contact !== undefined) { updates.push("contact = ?"); binds.push(body.contact); }
      if (body.certificate_key !== undefined) { updates.push("certificate_key = ?"); binds.push(body.certificate_key ?? null); }
      if (body.photo_keys !== undefined) { updates.push("photo_keys = ?"); binds.push(body.photo_keys ? JSON.stringify(body.photo_keys) : null); }
      if (body.status !== undefined && admin) { updates.push("status = ?"); binds.push(body.status); }
      else if (!admin) {
        updates.push("status = ?"); binds.push("pending");
      }

      if (!updates.length) return json({ error: "Nothing to update" }, 400);

      binds.push(id);
      await env.DB.prepare(
        `UPDATE sale_listings SET ${updates.join(", ")} WHERE id = ?`
      ).bind(...binds).run();

      const updated = await env.DB.prepare(
        `SELECT * FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      return json(updated || { ok: true });
    }

    if (path.match(/^\/api\/listings\/[^/]+$/) && request.method === "DELETE") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);
      if (user.suspended) return json({ error: "Account suspended" }, 403);

      const id = decodeURIComponent(path.split("/")[3]);
      const listing = await env.DB.prepare(
        `SELECT id, user_id FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      if (!listing) return json({ error: "Not found" }, 404);
      if (listing.user_id !== user.id) return json({ error: "Not authorized" }, 403);

      await env.DB.prepare(
        `UPDATE sale_listings SET status = 'removed' WHERE id = ?`
      ).bind(id).run();

      return json({ ok: true });
    }

    // --- Admin ---

    if (path === "/api/admin/stats" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const [users, lists, saved, totalViews] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as c FROM users`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM lists`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM saved_parcels`).first(),
        env.DB.prepare(`SELECT COALESCE(SUM(views), 0) as c FROM sale_listings`).first(),
      ]);
      return json({
        users: users?.c || 0,
        lists: lists?.c || 0,
        saved_parcels: saved?.c || 0,
        total_views: totalViews?.c || 0,
      });
    }

    if (path === "/api/admin/lists" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const { results } = await env.DB.prepare(
        `SELECT l.id, l.name, l.visibility, l.created_at,
                u.name as owner_name, u.email as owner_email, u.picture as owner_picture,
                COUNT(p.id) as parcel_count
         FROM lists l
         LEFT JOIN users u ON u.id = l.user_id
         LEFT JOIN saved_parcels p ON p.list_id = l.id
         GROUP BY l.id
         ORDER BY datetime(l.created_at) DESC LIMIT 500`
      ).all();
      return json(results || []);
    }

    if (path === "/api/admin/users" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const { results } = await env.DB.prepare(
        `SELECT id, email, name, picture, suspended, created_at FROM users ORDER BY datetime(created_at) DESC LIMIT 500`
      ).all();
      return json(results || []);
    }

    if (path.match(/^\/api\/admin\/users\/[^/]+\/suspend$/) && request.method === "PATCH") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const userId = decodeURIComponent(path.split("/")[4]);
      const body = await request.json().catch(() => null);
      if (!body || body.suspended === undefined) return json({ error: "suspended field required" }, 400);

      const target = await env.DB.prepare(`SELECT id, email FROM users WHERE id = ?`).bind(userId).first();
      if (!target) return json({ error: "User not found" }, 404);
      if (target.email.toLowerCase() === (env.ADMIN_EMAIL || "pavlibeis@gmail.com").toLowerCase()) {
        return json({ error: "Cannot suspend admin" }, 400);
      }

      await env.DB.prepare(
        `UPDATE users SET suspended = ? WHERE id = ?`
      ).bind(body.suspended ? 1 : 0, userId).run();

      return json({ ok: true, suspended: !!body.suspended });
    }

    if (path === "/api/admin/listings" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const statusFilter = url.searchParams.get("status") || "pending";
      const { results } = await env.DB.prepare(
        `SELECT id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
                dist_code, district, municipality, planning_zone, title, price,
                description, contact, certificate_key, photo_keys, status, views, created_at
         FROM sale_listings WHERE status = ?
         ORDER BY datetime(created_at) ASC LIMIT 200`
      ).bind(statusFilter).all();
      return json(results || []);
    }

    if (path.match(/^\/api\/admin\/listings\/[^/]+$/) && request.method === "PATCH") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user, env)) return json({ error: "Not authorized" }, 403);

      const id = decodeURIComponent(path.split("/")[4]);
      const body = await request.json().catch(() => null);
      if (!body || !body.status) return json({ error: "status is required" }, 400);
      if (!["active", "rejected"].includes(body.status)) {
        return json({ error: "status must be 'active' or 'rejected'" }, 400);
      }

      const listing = await env.DB.prepare(
        `SELECT id, user_id, title, parcel_nbr, sheet, plan_nbr FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      if (!listing) return json({ error: "Listing not found" }, 404);

      await env.DB.prepare(
        `UPDATE sale_listings SET status = ? WHERE id = ?`
      ).bind(body.status, id).run();

      const owner = await env.DB.prepare(
        `SELECT email, name FROM users WHERE id = ?`
      ).bind(listing.user_id).first();

      if (owner && owner.email) {
        const listingTitle = listing.title || `Parcel ${listing.parcel_nbr}`;
        if (body.status === 'active') {
          const approved = listingApprovedEmail(owner.name, listingTitle, id);
          ctx.waitUntil(sendEmail(env, owner.email, approved.subject, approved.html));
        } else if (body.status === 'rejected') {
          const rejected = listingRejectedEmail(owner.name, listingTitle);
          ctx.waitUntil(sendEmail(env, owner.email, rejected.subject, rejected.html));
        }
      }

      return json({ ok: true, status: body.status });
    }

    // --- SEO: All listings page ---

    if (path === "/listings" && request.method === "GET") {
      const siteUrl = getSiteUrl(url);
      const apiOrigin = url.origin;
      const district = url.searchParams.get("district") || "";
      let sql = `SELECT id, title, price, municipality, district, parcel_nbr, sheet, plan_nbr, dist_code, photo_keys, certificate_key, created_at
                 FROM sale_listings WHERE status = 'active'`;
      const binds = [];
      if (district) { sql += ` AND dist_code = ?`; binds.push(parseInt(district)); }
      sql += ` ORDER BY datetime(created_at) DESC LIMIT 100`;
      const stmt = binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
      const { results } = await stmt.all();
      const districtNames = { 1: "Nicosia", 2: "Famagusta", 3: "Larnaca", 4: "Paphos", 5: "Limassol" };
      const filterLabel = district ? (districtNames[district] || "District " + district) : "All Cyprus";
      const html = renderListingsPage(results || [], district, filterLabel, siteUrl, apiOrigin);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
    }

    // --- SEO: Server-rendered listing page ---

    if (path.match(/^\/listing\/[^/]+$/) && request.method === "GET") {
      const id = decodeURIComponent(path.split("/")[2]);
      const listing = await env.DB.prepare(
        `SELECT * FROM sale_listings WHERE id = ? AND status = 'active'`
      ).bind(id).first();
      if (!listing) return new Response("Listing not found", { status: 404, headers: { "Content-Type": "text/html" } });
      ctx.waitUntil(env.DB.prepare(`UPDATE sale_listings SET views = COALESCE(views, 0) + 1 WHERE id = ?`).bind(id).run());
      const html = renderListingDetailPage(listing, id, getSiteUrl(url), url.origin);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
    }

    // --- Privacy Policy ---

    if (path === "/privacy" && request.method === "GET") {
      const html = renderPrivacyPage(getSiteUrl(url), url.origin);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
    }

    // --- Terms of Service ---

    if (path === "/terms" && request.method === "GET") {
      const html = renderTermsPage(getSiteUrl(url), url.origin);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
    }

    // --- SEO: Sitemap ---

    if (path === "/sitemap.xml" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, created_at FROM sale_listings WHERE status = 'active' ORDER BY datetime(created_at) DESC LIMIT 1000`
      ).all();
      const xml = renderSitemap(results || [], getSiteUrl(url), url.origin);
      return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }

    return json({ error: "Not found" }, 404);
  },
};
