import Hashids from "hashids";



export default {
  async fetch(request, env) {
    console.log(env)

    const headers = new Headers();
    headers.set(
      "Access-Control-Allow-Origin",
      env.CORS_ORIGIN
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", `Content-Type, ${env.MAGIC_HEADER_KEY}`);
    headers.set("content-type", "application/json");

    if (request.method === "OPTIONS") {
      return new Response(null, {headers, status: 204 });
    }

    if (request.headers.get(env.MAGIC_HEADER_KEY) !== env.MAGIC_HEADER_VALUE) {
      return new Response(null, { headers,status: 403 });
    }

    // Handle "GET /api/records/:recordId" request
    if (request.method === "GET") {
      const matched = request.url.match(/\/api\/records\/([a-zA-Z0-9]+)$/);
      const recordId = matched?.[1];

      if (recordId == null) {
        return new Response(null, { status: 404 });
      }

      const hashids = new Hashids(env.ENCODING_SALT, 8);
      const rowId = hashids.decode(recordId)[0];

      if (rowId == null) {
        return new Response(null, { headers,status: 404 });
      }

      const result = await env.DB.prepare(
        "SELECT value FROM mapping_records WHERE id = ?"
      )
        .bind(rowId)
        .first();

      if (result == null) {
        return new Response(null, { headers,status: 404 });
      }

      return new Response(JSON.stringify(result), {
        headers,
      });
    }

    // Handle "POST /api/records" request
    if (request.method === "POST" && request.url.match(/\/api\/records$/)) {
      const body = await request.json();
      const { value } = body as { value: unknown };

      if (typeof value !== "string") {
        return new Response(null, { headers,status: 400 });
      }

      let rowId: number;

      const updateResult = await env.DB.prepare(
        "UPDATE mapping_records SET createdAt = strftime('%s','now') WHERE value = ? RETURNING id"
      )
        .bind(value)
        .first();

      if (updateResult != null) {
        rowId = updateResult.id as number;
      } else {
        const insertResult = await env.DB.prepare(
          "INSERT INTO mapping_records (value) VALUES (?) RETURNING id"
        )
          .bind(value)
          .first();

        if (insertResult == null) {
          return new Response(null, { headers,status: 500 });
        }

        rowId = insertResult.id as number;
      }

      const hashids = new Hashids(env.ENCODING_SALT, 8);
      const recordId = hashids.encode(rowId);

      return new Response(JSON.stringify({ recordId }), {
        headers,
        status: 201,
      });
    }

    return new Response(null, { headers,status: 404 });
  },

  async scheduled(_, env) {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 60 * 60;
    const stmt = env.DB.prepare(
      "DELETE FROM mapping_records WHERE createdAt < ?"
    ).bind([oneHourAgo]);

    try {
      await stmt.run();
      console.log("Records older than one hour deleted");
    } catch (err) {
      console.error("Error deleting old records:", err);
    }
  },
} satisfies ExportedHandler<Env>;
