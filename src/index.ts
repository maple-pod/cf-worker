import Hashids from "hashids";

const MAGIC_STRING = "maple-pod-8964-taiwan-no-1";
const hashids = new Hashids(MAGIC_STRING, 8);

export default {
  async fetch(request, env) {

    // Handle CORS preflight request
    const headers = new Headers();
    headers.set(
      "Access-Control-Allow-Origin",
      "https://maple-pod-worker.deviltea.me"
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, maple-pod-magic-string");
    headers.set("content-type", "application/json");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.headers.get("maple-pod-magic-string") !== MAGIC_STRING) {
      return new Response(null, { status: 403 });
    }

    // Handle "GET /api/records/:recordId" request
    if (request.method === "GET") {
      const matched = request.url.match(/\/api\/records\/([a-zA-Z0-9]+)$/);
      const recordId = matched?.[1];

      if (recordId == null) {
        return new Response(null, { status: 404 });
      }

      const rowId = hashids.decode(recordId)[0];

      if (rowId == null) {
        return new Response(null, { status: 404 });
      }

      const result = await env.DB.prepare(
        "SELECT value FROM mapping_records WHERE id = ?"
      )
        .bind(rowId)
        .first();

      if (result == null) {
        return new Response(null, { status: 404 });
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
        return new Response(null, { status: 400 });
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
          return new Response(null, { status: 500 });
        }

        rowId = insertResult.id as number;
      }

      const recordId = hashids.encode(rowId);

      return new Response(JSON.stringify({ recordId }), {
        headers,
        status: 201,
      });
    }

    return new Response(null, { status: 404 });
  },

  async scheduled(_, env) {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7;
    const stmt = env.DB.prepare(
      "DELETE FROM my_table WHERE createdAt < ?"
    ).bind([sevenDaysAgo]);

    try {
      await stmt.run();
      console.log("Old records deleted");
    } catch (err) {
      console.error("Error deleting old records:", err);
    }
  },
} satisfies ExportedHandler<Env>;
