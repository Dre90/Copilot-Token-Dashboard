import type { FastifyInstance } from "fastify";
import { addClient, clientCount, db, removeClient } from "../core/index.js";

type Bucket = "hour" | "day" | "month" | "year";

const BUCKET_FORMAT: Record<Bucket, string> = {
  hour: "%Y-%m-%dT%H:00:00Z",
  day: "%Y-%m-%d",
  month: "%Y-%m",
  year: "%Y",
};

function parseTimeRange(q: { from?: string; to?: string }): { fromNs: string; toNs: string } {
  const toMs = q.to ? Date.parse(q.to) : Date.now();
  const fromMs = q.from ? Date.parse(q.from) : toMs - 24 * 60 * 60 * 1000;
  return {
    fromNs: (BigInt(fromMs) * 1_000_000n).toString(),
    toNs: (BigInt(toMs) * 1_000_000n).toString(),
  };
}

function aggFor(type: string): "SUM" | "AVG" {
  return type === "gauge" ? "AVG" : "SUM";
}

const SPAN_COLS = `
  span_id, trace_id, parent_span_id, name, kind,
  CAST(start_ns AS TEXT) AS start_ns,
  CAST(end_ns AS TEXT) AS end_ns,
  duration_ms, status_code, attributes
`;

const EVENT_COLS = `
  id, CAST(timestamp_ns AS TEXT) AS timestamp_ns,
  severity, body, attributes, trace_id, span_id
`;

export function registerApiRoutes(app: FastifyInstance): void {
  app.get("/api/health", async () => ({ ok: true, sseClients: clientCount() }));

  app.get("/api/metrics/list", async () => {
    return db
      .prepare(
        "SELECT name, type, unit, COUNT(*) as count FROM metric_points GROUP BY name, type, unit ORDER BY name",
      )
      .all();
  });

  app.get("/api/metrics", async (req) => {
    const q = req.query as { name?: string; bucket?: Bucket; from?: string; to?: string };
    if (!q.name) return { error: "name required" };
    const bucket = (q.bucket ?? "hour") as Bucket;
    const fmt = BUCKET_FORMAT[bucket] ?? BUCKET_FORMAT.hour;
    const { fromNs, toNs } = parseTimeRange(q);

    const typeRow = db
      .prepare("SELECT type FROM metric_points WHERE name = ? LIMIT 1")
      .get(q.name) as { type: string } | undefined;
    const agg = aggFor(typeRow?.type ?? "sum");

    const sql = `
      SELECT
        strftime('${fmt}', timestamp_ns/1000000000, 'unixepoch') AS bucket,
        ${agg}(value) AS value,
        COUNT(*) AS samples
      FROM metric_points
      WHERE name = ? AND timestamp_ns BETWEEN ? AND ?
      GROUP BY bucket
      ORDER BY bucket
    `;
    const rows = db.prepare(sql).all(q.name, fromNs, toNs);
    return { name: q.name, bucket, agg, points: rows };
  });

  app.get("/api/traces", async (req) => {
    const q = req.query as { from?: string; to?: string; limit?: string; name?: string };
    const { fromNs, toNs } = parseTimeRange(q);
    const limit = Math.min(parseInt(q.limit ?? "200", 10) || 200, 2000);
    const where: string[] = ["start_ns BETWEEN ? AND ?"];
    const args: unknown[] = [fromNs, toNs];
    if (q.name) {
      where.push("name = ?");
      args.push(q.name);
    }
    const sql = `
      SELECT ${SPAN_COLS}
      FROM spans
      WHERE ${where.join(" AND ")}
      ORDER BY start_ns DESC
      LIMIT ?
    `;
    args.push(limit);
    return db.prepare(sql).all(...(args as any[]));
  });

  app.get("/api/traces/:traceId", async (req) => {
    const { traceId } = req.params as { traceId: string };
    return db
      .prepare(`SELECT ${SPAN_COLS} FROM spans WHERE trace_id = ? ORDER BY start_ns`)
      .all(traceId);
  });

  app.get("/api/events", async (req) => {
    const q = req.query as { from?: string; to?: string; limit?: string };
    const { fromNs, toNs } = parseTimeRange(q);
    const limit = Math.min(parseInt(q.limit ?? "200", 10) || 200, 2000);
    return db
      .prepare(
        `SELECT ${EVENT_COLS} FROM events WHERE timestamp_ns BETWEEN ? AND ? ORDER BY timestamp_ns DESC LIMIT ?`,
      )
      .all(fromNs, toNs, limit);
  });

  app.get("/api/summary", async () => {
    const fromNs = ((BigInt(Date.now()) - 5n * 60n * 1000n) * 1_000_000n).toString();
    const spans = db
      .prepare("SELECT COUNT(*) AS c, AVG(duration_ms) AS avg_ms FROM spans WHERE start_ns >= ?")
      .get(fromNs) as { c: number; avg_ms: number | null };
    const events = db
      .prepare("SELECT COUNT(*) AS c FROM events WHERE timestamp_ns >= ?")
      .get(fromNs) as { c: number };
    const tokens = db
      .prepare(
        `SELECT COALESCE(SUM(value), 0) AS total
         FROM metric_points
         WHERE timestamp_ns >= ? AND name LIKE '%token%'`,
      )
      .get(fromNs) as { total: number };
    return {
      windowMinutes: 5,
      spans: spans.c,
      avgSpanMs: spans.avg_ms ?? 0,
      events: events.c,
      tokens: tokens.total,
    };
  });

  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    const client = addClient(
      (data) => reply.raw.write(data),
      () => reply.raw.end(),
    );
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: ping\n\n`);
      } catch {
        /* ignore */
      }
    }, 15_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      removeClient(client);
    });
  });
}
