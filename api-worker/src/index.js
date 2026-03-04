const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let cachedCerts = null;
let certsExpiry = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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

      const { results } = await env.DB.prepare(
        `SELECT l.id, l.name, l.visibility, l.share_token, l.created_at, COUNT(p.id) as parcel_count
         FROM lists l
         LEFT JOIN saved_parcels p ON p.list_id = l.id
         WHERE l.user_id = ?
         GROUP BY l.id
         ORDER BY datetime(l.created_at) DESC`
      ).bind(user.id).all();

      return json(results || []);
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

    if (path.startsWith("/api/lists/") && !path.includes("/parcels") && request.method === "DELETE") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const listId = decodeURIComponent(path.replace("/api/lists/", ""));
      if (!listId) return json({ error: "list id is required" }, 400);

      // Delete parcels in the list first, then the list
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
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid body" }, 400);

      const updates = [];
      const binds = [];

      if (body.name && body.name.trim()) {
        updates.push("name = ?");
        binds.push(body.name.trim());
      }

      if (body.visibility !== undefined) {
        const allowed = ["private", "public"];
        if (!allowed.includes(body.visibility)) {
          return json({ error: "visibility must be private or public" }, 400);
        }
        updates.push("visibility = ?");
        binds.push(body.visibility);

        if (body.visibility === "public") {
          const existing = await env.DB.prepare(
            `SELECT share_token FROM lists WHERE id = ? AND user_id = ?`
          ).bind(listId, user.id).first();
          if (existing && !existing.share_token) {
            const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
            updates.push("share_token = ?");
            binds.push(token);
          }
        } else if (body.visibility === "private") {
          updates.push("share_token = NULL");
        }
      }

      if (!updates.length) return json({ error: "Nothing to update" }, 400);

      binds.push(listId, user.id);
      const { meta } = await env.DB.prepare(
        `UPDATE lists SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
      ).bind(...binds).run();

      if (!meta || !meta.changes) return json({ error: "List not found" }, 404);

      const updated = await env.DB.prepare(
        `SELECT id, name, visibility, share_token FROM lists WHERE id = ?`
      ).bind(listId).first();
      return json(updated || { ok: true });
    }

    // --- Shared / Public lists ---

    if (path.match(/^\/api\/shared\/[^/]+$/) && request.method === "GET") {
      const token = decodeURIComponent(path.split("/")[3]);
      const list = await env.DB.prepare(
        `SELECT l.id, l.name, l.visibility, l.user_id FROM lists l WHERE l.share_token = ? AND l.visibility = 'public'`
      ).bind(token).first();

      if (!list) return json({ error: "List not found or not public" }, 404);

      const { results: parcels } = await env.DB.prepare(
        `SELECT id, sheet, plan_nbr, parcel_nbr, dist_code, district, municipality,
                planning_zone, planning_zone_desc, block_code, created_at
         FROM saved_parcels WHERE list_id = ?
         ORDER BY datetime(created_at) DESC`
      ).bind(list.id).all();

      return json({
        id: list.id,
        name: list.name,
        parcels: parcels || []
      });
    }

    // --- Parcels ---

    if (path.match(/^\/api\/lists\/[^/]+\/parcels$/) && request.method === "GET") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const listId = decodeURIComponent(path.split("/")[3]);

      const { results } = await env.DB.prepare(
        `SELECT id, list_id, sheet, plan_nbr, parcel_nbr, dist_code,
                district, municipality, planning_zone, planning_zone_desc,
                block_code, created_at
         FROM saved_parcels
         WHERE list_id = ? AND user_id = ?
         ORDER BY datetime(created_at) DESC`
      ).bind(listId, user.id).all();

      return json(results || []);
    }

    if (path.match(/^\/api\/lists\/[^/]+\/parcels$/) && request.method === "POST") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const listId = decodeURIComponent(path.split("/")[3]);
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
          id, user.id, listId,
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
         WHERE p.user_id = ?
         AND REPLACE(p.sheet, '.0', '') = ?
         AND REPLACE(p.plan_nbr, '.0', '') = ?
         AND REPLACE(p.parcel_nbr, '.0', '') = ?
         AND IFNULL(p.dist_code, -1) = ?`
      ).bind(user.id, norm(sheet), norm(plan), norm(parcel), distVal).all();

      return json((results || []).map(r => r.list_id));
    }

    if (path.match(/^\/api\/parcels\/[^/]+$/) && request.method === "DELETE") {
      const user = await getAuthUser(request, env);
      if (!user) return json({ error: "Authentication required" }, 401);

      const id = decodeURIComponent(path.replace("/api/parcels/", ""));
      if (!id) return json({ error: "id is required" }, 400);

      const { meta } = await env.DB.prepare(
        `DELETE FROM saved_parcels WHERE id = ? AND user_id = ?`
      ).bind(id, user.id).run();

      if (!meta || !meta.changes) return json({ error: "Parcel not found" }, 404);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
};
