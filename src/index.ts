import Hashids from 'hashids'

const MAGIC_STRING = 'maple-pod-8964-taiwan-no-1';
const hashids = new Hashids(MAGIC_STRING, 8);

export default {
  async fetch(request, env) {
    if (request.headers.get("maple-pod-magic-string") !== MAGIC_STRING) {
      return new Response(null, { status: 403 });
    }

    // Handle CORS preflight request, only allowed 'maple-pod.deviltea.me
    if (request.method === "OPTIONS") {
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "https://maple-pod.deviltea.me");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }

    // Handle "GET /api/records/:recordId" request
    if (request.method === "GET") {
      const matched = request.url.match(/\/api\/records\/([a-zA-Z0-9]+)$/)
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
      ).bind([rowId]).first();

      if (result == null) {
        return new Response(null, { status: 404 });
      }

      return new Response(JSON.stringify(result), {
        headers: {
          "content-type": "application/json",
        },
      });
    }

    // Handle "POST /api/records" request
    if (request.method === "POST" && request.url.match(/\/api\/records$/)) {
      const body = await request.json();
      const { value } = body as { value: unknown };

      if (typeof value !== "string") {
        return new Response(null, { status: 400 });
      }

      // Only if the value is not exists, insert it into the database and return the recordId that is exists or the new inserted one
      const query = await env.DB.prepare(
        "SELECT id FROM mapping_records WHERE value = ?"
      ).bind(value).first();
      if (query) {
        const recordId = hashids.encode(query.id as number);
        return new Response(JSON.stringify({ recordId }), {
          headers: {
            "content-type": "application/json",
          },
        });
      }

      const inserted = await env.DB.prepare(
        "INSERT INTO mapping_records (value) VALUES (?)"
      ).bind(value).run();

      const recordId = hashids.encode(inserted.meta.last_row_id);

      return new Response(JSON.stringify({ recordId }), {
        headers: {
          "content-type": "application/json",
        },
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
  }
} satisfies ExportedHandler<Env>;
