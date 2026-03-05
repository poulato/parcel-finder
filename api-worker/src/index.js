const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let cachedCerts = null;
let certsExpiry = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
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

const ADMIN_EMAIL = "pavlibeis@gmail.com";

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getSiteUrl(url, env) {
  return url.origin;
}

function isAdmin(user) {
  return user && user.email && user.email.toLowerCase() === ADMIN_EMAIL;
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (path === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "geoktimonas-api" });
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Not authenticated" }, 401);
      return json(user);
    }

    // --- Lists ---

    if (path === "/api/lists" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

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
        return json({ error: "Failed to save parcel", details: String(err) }, 500);
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

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        return json({ error: "Only image uploads are allowed" }, 400);
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
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(obj.body, { headers });
    }

    // --- Sale listings ---

    if (path === "/api/listings" && request.method === "GET") {
      const district = url.searchParams.get("district");
      const minPrice = url.searchParams.get("min_price");
      const maxPrice = url.searchParams.get("max_price");

      let sql = `SELECT id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
                        dist_code, district, municipality, planning_zone, title, price,
                        description, contact, certificate_key, photo_keys, status, created_at
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
                description, contact, certificate_key, photo_keys, status, created_at
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

    if (path === "/api/listings" && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);
      if (!body.sheet || !body.plan_nbr || !body.parcel_nbr) {
        return json({ error: "Parcel identifiers required" }, 400);
      }
      if (!body.contact) {
        return json({ error: "Contact info is required" }, 400);
      }

      const id = crypto.randomUUID();
      const autoApprove = isAdmin(user);
      await env.DB.prepare(
        `INSERT INTO sale_listings (
          id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
          dist_code, district, municipality, planning_zone,
          title, price, description, contact, certificate_key, photo_keys, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, user.id, user.name || null, user.picture || null,
        body.sheet, body.plan_nbr, body.parcel_nbr,
        body.dist_code ?? null, body.district ?? null,
        body.municipality ?? null, body.planning_zone ?? null,
        body.title ?? null, body.price ?? null, body.description ?? null,
        body.contact,
        body.certificate_key ?? null,
        body.photo_keys ? JSON.stringify(body.photo_keys) : null,
        autoApprove ? 'active' : 'pending'
      ).run();

      const row = await env.DB.prepare(
        `SELECT * FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      return json(row || { id }, 201);
    }

    if (path.match(/^\/api\/listings\/[^/]+$/) && request.method === "PUT") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const id = decodeURIComponent(path.split("/")[3]);
      const listing = await env.DB.prepare(
        `SELECT id, user_id FROM sale_listings WHERE id = ?`
      ).bind(id).first();
      if (!listing) return json({ error: "Not found" }, 404);
      if (listing.user_id !== user.id) return json({ error: "Not authorized" }, 403);

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
      if (!isAdmin(user)) {
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

    if (path === "/api/admin/listings" && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user)) return json({ error: "Not authorized" }, 403);

      const statusFilter = url.searchParams.get("status") || "pending";
      const { results } = await env.DB.prepare(
        `SELECT id, user_id, user_name, user_picture, sheet, plan_nbr, parcel_nbr,
                dist_code, district, municipality, planning_zone, title, price,
                description, contact, certificate_key, photo_keys, status, created_at
         FROM sale_listings WHERE status = ?
         ORDER BY datetime(created_at) ASC LIMIT 200`
      ).bind(statusFilter).all();
      return json(results || []);
    }

    if (path.match(/^\/api\/admin\/listings\/[^/]+$/) && request.method === "PATCH") {
      const user = await getAuthUser(request, env);
      if (!user || !isAdmin(user)) return json({ error: "Not authorized" }, 403);

      const id = decodeURIComponent(path.split("/")[4]);
      const body = await request.json().catch(() => null);
      if (!body || !body.status) return json({ error: "status is required" }, 400);
      if (!["active", "rejected"].includes(body.status)) {
        return json({ error: "status must be 'active' or 'rejected'" }, 400);
      }

      const { meta } = await env.DB.prepare(
        `UPDATE sale_listings SET status = ? WHERE id = ?`
      ).bind(body.status, id).run();
      if (!meta || !meta.changes) return json({ error: "Listing not found" }, 404);

      return json({ ok: true, status: body.status });
    }

    // --- SEO: All listings page ---

    if (path === "/listings" && request.method === "GET") {
      const siteUrl = getSiteUrl(url, env);
      const apiOrigin = url.origin;

      const district = url.searchParams.get("district") || "";
      let sql = `SELECT id, title, price, municipality, district, parcel_nbr, sheet, plan_nbr, dist_code, photo_keys, certificate_key, created_at
                 FROM sale_listings WHERE status = 'active'`;
      const binds = [];
      if (district) { sql += ` AND dist_code = ?`; binds.push(parseInt(district)); }
      sql += ` ORDER BY datetime(created_at) DESC LIMIT 100`;

      const stmt = binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql);
      const { results } = await stmt.all();
      const listings = results || [];

      const districtNames = { 1: "Nicosia", 2: "Famagusta", 3: "Larnaca", 4: "Paphos", 5: "Limassol" };
      const filterLabel = district ? (districtNames[district] || "District " + district) : "All Cyprus";

      const cardsHTML = listings.length ? listings.map(l => {
        const price = l.price ? `€${Number(l.price).toLocaleString()}` : 'Negotiable';
        const loc = l.municipality || l.district || '';
        let photos = [];
        try { photos = l.photo_keys ? JSON.parse(l.photo_keys) : []; } catch(e) {}
        const thumb = photos.length ? `<img class="card-thumb" src="${apiOrigin}/api/images/${encodeURIComponent(photos[0])}" alt="${esc(l.title || 'Land')}" loading="lazy"/>` : '<div class="card-thumb card-thumb-empty">🏞️</div>';
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

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Land for Sale in ${esc(filterLabel)} | Geoktimonas</title>
<meta name="description" content="Browse ${listings.length} land parcels for sale in ${esc(filterLabel)}. Find prices, locations, photos, and verified certificates on Geoktimonas."/>
<link rel="canonical" href="${apiOrigin}/listings${district ? '?district=' + district : ''}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="Land for Sale in ${esc(filterLabel)} | Geoktimonas"/>
<meta property="og:description" content="Browse ${listings.length} land parcels for sale in ${esc(filterLabel)}."/>
<meta property="og:url" content="${apiOrigin}/listings"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#131c2e;color:#e2e8f0;min-height:100vh}
.layout{display:flex;min-height:100vh}
.rail{width:56px;flex-shrink:0;background:#0f172a;border-right:1px solid #1e293b;display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:4px}
.rail-logo{width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:12px;text-decoration:none}
.rail-btn{width:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 0;background:none;border:none;border-radius:8px;color:#64748b;font-size:10px;font-weight:600;cursor:pointer;text-decoration:none;transition:color .15s,background .15s}
.rail-btn:hover{color:#cbd5e1;background:rgba(148,163,184,.1)}
.rail-btn.active{color:#4a90d9;background:rgba(74,144,217,.1)}
.rail-icon{width:20px;height:20px}
.main{flex:1;min-width:0;padding:24px;overflow-y:auto;max-width:800px;background:#131c2e}
h2{font-size:20px;font-weight:700;margin-bottom:4px;color:#f1f5f9}
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
  .rail{display:none}
  .main{padding:16px}
  .card-thumb,.card-thumb-empty{width:90px;min-height:80px}
}
</style>
</head>
<body>
<div class="layout">
<nav class="rail">
<a class="rail-logo" href="${siteUrl}/">🏡</a>
<a class="rail-btn" href="${siteUrl}/?tab=search">
<svg class="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
Search
</a>
<a class="rail-btn" href="${siteUrl}/?tab=list">
<svg class="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
Saved
</a>
<a class="rail-btn" href="${siteUrl}/?tab=sale">
<svg class="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
Sale
</a>
<a class="rail-btn active" href="${apiOrigin}/listings">
<svg class="rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
List
</a>
</nav>
<div class="main">
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
</div>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=3600",
        },
      });
    }

    // --- SEO: Server-rendered listing page ---

    if (path.match(/^\/listing\/[^/]+$/) && request.method === "GET") {
      const id = decodeURIComponent(path.split("/")[2]);
      const listing = await env.DB.prepare(
        `SELECT * FROM sale_listings WHERE id = ? AND status = 'active'`
      ).bind(id).first();

      if (!listing) {
        return new Response("Listing not found", { status: 404, headers: { "Content-Type": "text/html" } });
      }

      const siteUrl = getSiteUrl(url, env);
      const apiOrigin = url.origin;
      const appUrl = `${siteUrl}/?sheet=${listing.sheet}&plan=${listing.plan_nbr}&parcel=${listing.parcel_nbr}&district=${listing.dist_code || ''}`;

      const title = listing.title || `Land for Sale – Parcel ${listing.parcel_nbr}`;
      const price = listing.price ? `€${Number(listing.price).toLocaleString()}` : 'Negotiable';
      const loc = listing.municipality || listing.district || 'Cyprus';
      const desc = listing.description
        ? listing.description.substring(0, 200)
        : `${price} – Land parcel ${listing.parcel_nbr} (${listing.sheet}/${listing.plan_nbr}) in ${loc}, Cyprus.`;

      let photos = [];
      try { photos = listing.photo_keys ? JSON.parse(listing.photo_keys) : []; } catch(e) {}
      const ogImage = photos.length
        ? `${apiOrigin}/api/images/${encodeURIComponent(photos[0])}`
        : '';

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

      const html = `<!DOCTYPE html>
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
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.header{background:#1e293b;border-bottom:1px solid #334155;padding:16px 24px;display:flex;align-items:center;gap:10px}
.header h1{font-size:18px;font-weight:600}
.header span{font-size:22px}
.container{max-width:720px;margin:0 auto;padding:24px 16px}
.gallery{display:flex;gap:8px;overflow-x:auto;margin-bottom:20px;border-radius:8px}
.gallery img{height:260px;object-fit:cover;border-radius:8px;flex-shrink:0}
.title{font-size:22px;font-weight:700;margin-bottom:4px}
.price{font-size:20px;color:#6b9eff;font-weight:700;margin-bottom:8px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:3px 10px;border-radius:4px;margin-bottom:12px}
.verified{background:#064e3b;color:#6ee7b7}
.meta{font-size:14px;color:#94a3b8;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px}
.desc{font-size:15px;line-height:1.6;color:#cbd5e1;margin-bottom:20px}
.poster{display:flex;align-items:center;gap:10px;font-size:14px;color:#94a3b8;margin-bottom:8px}
.poster img{width:32px;height:32px;border-radius:50%}
.contact{font-size:14px;color:#94a3b8;margin-bottom:24px}
.cta{display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;transition:background .15s}
.cta:hover{background:#1d4ed8}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center}
.footer a{color:#6b9eff;text-decoration:none}
</style>
</head>
<body>
<div class="header"><span>🏡</span><h1>Geoktimonas</h1></div>
<div class="container">
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
<div class="contact">📞 ${esc(listing.contact)}</div>
<a class="cta" href="${appUrl}">View on Map →</a>
<div class="footer">
<p>Land listing on <a href="${siteUrl}">Geoktimonas</a> · <a href="${apiOrigin}/listings">Browse all listings</a></p>
</div>
</div>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=3600",
        },
      });
    }

    // --- SEO: Sitemap ---

    if (path === "/sitemap.xml" && request.method === "GET") {
      const siteUrl = getSiteUrl(url, env);
      const apiOrigin = url.origin;

      const { results } = await env.DB.prepare(
        `SELECT id, created_at FROM sale_listings WHERE status = 'active' ORDER BY datetime(created_at) DESC LIMIT 1000`
      ).all();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${siteUrl}/</loc><priority>1.0</priority></url>
<url><loc>${apiOrigin}/listings</loc><priority>0.9</priority><changefreq>daily</changefreq></url>
`;
      for (const r of (results || [])) {
        const lastmod = r.created_at ? r.created_at.split(' ')[0] : '';
        xml += `<url><loc>${apiOrigin}/listing/${r.id}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq></url>\n`;
      }
      xml += `</urlset>`;

      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
