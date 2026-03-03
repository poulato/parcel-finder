function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function getUserId(url, body) {
  const fromQuery = url.searchParams.get("user_id");
  if (fromQuery) return fromQuery;
  if (body && body.user_id) return body.user_id;
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

    if (path === "/api/parcels" && request.method === "GET") {
      const userId = getUserId(url);
      if (!userId) return json({ error: "user_id is required" }, 400);

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, sheet, plan_nbr, parcel_nbr, dist_code,
                district, municipality, planning_zone, planning_zone_desc,
                block_code, created_at
         FROM saved_parcels
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC`
      ).bind(userId).all();

      return json(results || []);
    }

    if (path === "/api/parcels" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON body" }, 400);

      const userId = getUserId(url, body);
      if (!userId) return json({ error: "user_id is required" }, 400);
      if (!body.sheet || !body.plan_nbr || !body.parcel_nbr) {
        return json({ error: "sheet, plan_nbr, parcel_nbr are required" }, 400);
      }

      const id = crypto.randomUUID();
      const stmt = env.DB.prepare(
        `INSERT INTO saved_parcels (
          id, user_id, sheet, plan_nbr, parcel_nbr, dist_code,
          district, municipality, planning_zone, planning_zone_desc, block_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        userId,
        body.sheet,
        body.plan_nbr,
        body.parcel_nbr,
        body.dist_code ?? null,
        body.district ?? null,
        body.municipality ?? null,
        body.planning_zone ?? null,
        body.planning_zone_desc ?? null,
        body.block_code ?? null
      );

      try {
        await stmt.run();
      } catch (err) {
        // Unique index violation means already in list.
        if (String(err).includes("UNIQUE")) {
          return json({ error: "Parcel already exists for user" }, 409);
        }
        return json({ error: "Failed to save parcel", details: String(err) }, 500);
      }

      const { results } = await env.DB.prepare(
        `SELECT id, user_id, sheet, plan_nbr, parcel_nbr, dist_code,
                district, municipality, planning_zone, planning_zone_desc,
                block_code, created_at
         FROM saved_parcels
         WHERE id = ?`
      ).bind(id).all();

      return json(results?.[0] || { id }, 201);
    }

    if (path.startsWith("/api/parcels/") && request.method === "DELETE") {
      const id = decodeURIComponent(path.replace("/api/parcels/", ""));
      const userId = getUserId(url);
      if (!id) return json({ error: "id is required" }, 400);
      if (!userId) return json({ error: "user_id is required" }, 400);

      const { meta } = await env.DB.prepare(
        `DELETE FROM saved_parcels WHERE id = ? AND user_id = ?`
      ).bind(id, userId).run();

      if (!meta || !meta.changes) return json({ error: "Parcel not found" }, 404);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
};
