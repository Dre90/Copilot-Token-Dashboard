import type { FastifyInstance } from "fastify";
import { db } from "../core/index.js";

// USD per 1M tokens. Rates aligned with GitHub Copilot usage-based billing
// (docs.github.com/copilot/reference/copilot-billing/models-and-pricing) where
// listed, falling back to underlying provider list price for older variants
// Copilot still uses (e.g. gpt-4o-mini for title generation).
type Price = {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
};
const PRICING: Array<{ match: RegExp; price: Price }> = [
  // OpenAI — older variants Copilot still routes to
  {
    match: /gpt-4o-mini/i,
    price: { input: 0.15, output: 0.6, cache_read: 0.075, cache_creation: 0 },
  },
  {
    match: /gpt-4o/i,
    price: { input: 2.5, output: 10.0, cache_read: 1.25, cache_creation: 0 },
  },
  {
    match: /o4-mini/i,
    price: { input: 1.1, output: 4.4, cache_read: 0.275, cache_creation: 0 },
  },
  {
    match: /gpt-4\.1-mini/i,
    price: { input: 0.4, output: 1.6, cache_read: 0.1, cache_creation: 0 },
  },

  // OpenAI — Copilot billing table
  {
    match: /gpt-4\.1/i,
    price: { input: 2.0, output: 8.0, cache_read: 0.5, cache_creation: 0 },
  },
  {
    match: /gpt-5-mini/i,
    price: { input: 0.25, output: 2.0, cache_read: 0.025, cache_creation: 0 },
  },
  {
    match: /gpt-5\.2-codex/i,
    price: { input: 1.75, output: 14.0, cache_read: 0.175, cache_creation: 0 },
  },
  {
    match: /gpt-5\.2/i,
    price: { input: 1.75, output: 14.0, cache_read: 0.175, cache_creation: 0 },
  },
  {
    match: /gpt-5\.3-codex/i,
    price: { input: 1.75, output: 14.0, cache_read: 0.175, cache_creation: 0 },
  },
  {
    match: /gpt-5\.4-mini/i,
    price: { input: 0.75, output: 4.5, cache_read: 0.075, cache_creation: 0 },
  },
  {
    match: /gpt-5\.4-nano/i,
    price: { input: 0.2, output: 1.25, cache_read: 0.02, cache_creation: 0 },
  },
  {
    match: /gpt-5\.4/i,
    price: { input: 2.5, output: 15.0, cache_read: 0.25, cache_creation: 0 },
  },
  {
    match: /gpt-5\.5/i,
    price: { input: 5.0, output: 30.0, cache_read: 0.5, cache_creation: 0 },
  },
  {
    match: /gpt-5/i,
    price: { input: 1.75, output: 14.0, cache_read: 0.175, cache_creation: 0 },
  },

  // Anthropic
  {
    match: /claude-haiku/i,
    price: { input: 1.0, output: 5.0, cache_read: 0.1, cache_creation: 1.25 },
  },
  {
    match: /claude-opus/i,
    price: { input: 5.0, output: 25.0, cache_read: 0.5, cache_creation: 6.25 },
  },
  {
    match: /claude-sonnet/i,
    price: { input: 3.0, output: 15.0, cache_read: 0.3, cache_creation: 3.75 },
  },

  // Google
  {
    match: /gemini-3\.5-flash/i,
    price: { input: 1.5, output: 9.0, cache_read: 0.15, cache_creation: 0 },
  },
  {
    match: /gemini-3\.1-pro/i,
    price: { input: 2.0, output: 12.0, cache_read: 0.2, cache_creation: 0 },
  },
  {
    match: /gemini-3.*flash/i,
    price: { input: 0.5, output: 3.0, cache_read: 0.05, cache_creation: 0 },
  },
  {
    match: /gemini-2\.5-pro/i,
    price: { input: 1.25, output: 10.0, cache_read: 0.125, cache_creation: 0 },
  },
  {
    match: /gemini.*pro/i,
    price: { input: 2.0, output: 12.0, cache_read: 0.2, cache_creation: 0 },
  },
  {
    match: /gemini.*flash/i,
    price: { input: 0.5, output: 3.0, cache_read: 0.05, cache_creation: 0 },
  },
];
const FALLBACK: Price = {
  input: 0,
  output: 0,
  cache_read: 0,
  cache_creation: 0,
};

export function priceFor(model: string): Price {
  if (!model) return FALLBACK;
  for (const p of PRICING) if (p.match.test(model)) return p.price;
  return FALLBACK;
}

type Attrs = Record<string, unknown>;
export function pick(a: Attrs, ...keys: string[]): unknown {
  for (const k of keys) if (a[k] !== undefined && a[k] !== null) return a[k];
  return undefined;
}
// Scan ALL attribute keys against regex patterns. Sums numeric matches so that
// e.g. both `cached_tokens` and `cache_read_input_tokens` would count toward cache_read.
export function findByKey(a: Attrs, ...patterns: RegExp[]): unknown {
  for (const k of Object.keys(a)) {
    for (const p of patterns) {
      if (p.test(k) && a[k] !== undefined && a[k] !== null) return a[k];
    }
  }
  return undefined;
}
export function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export type Call = {
  span_id: string;
  trace_id: string;
  start_ns: string;
  duration_ms: number;
  model: string;
  agent: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_creation_cost: number;
  total_cost: number;
};

export function rowToCall(row: any): Call {
  let attrs: Attrs = {};
  try {
    attrs = JSON.parse(row.attributes ?? "{}");
  } catch {
    /* */
  }

  const model = String(
    pick(attrs, "gen_ai.response.model", "gen_ai.request.model", "llm.model", "model") ?? "",
  );
  const agent = String(
    pick(
      attrs,
      "copilot.chat.agent",
      "copilot.chat.command",
      "gen_ai.agent.name",
      "copilot.chat.location",
      "copilot.chat.intent",
    ) ?? "",
  );

  const input = num(findByKey(attrs, /(^|\.)(input|prompt).?tokens$/i));
  const output = num(findByKey(attrs, /(^|\.)(output|completion).?tokens$/i));
  const cacheR = num(findByKey(attrs, /cache.?read.*tokens?$/i, /cached.?(input.?)?tokens?$/i));
  const cacheC = num(findByKey(attrs, /cache.?(creation|write).*tokens?$/i));

  const p = priceFor(model);
  const input_cost = (input / 1_000_000) * p.input;
  const output_cost = (output / 1_000_000) * p.output;
  const cache_read_cost = (cacheR / 1_000_000) * p.cache_read;
  const cache_creation_cost = (cacheC / 1_000_000) * p.cache_creation;

  return {
    span_id: row.span_id,
    trace_id: row.trace_id,
    start_ns: String(row.start_ns),
    duration_ms: row.duration_ms,
    model,
    agent,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheR,
    cache_creation_tokens: cacheC,
    input_cost,
    output_cost,
    cache_read_cost,
    cache_creation_cost,
    total_cost: input_cost + output_cost + cache_read_cost + cache_creation_cost,
  };
}

const SPAN_COLS = `
  span_id, trace_id, parent_span_id, name, kind,
  CAST(start_ns AS TEXT) AS start_ns,
  CAST(end_ns AS TEXT) AS end_ns,
  duration_ms, status_code, attributes
`;

// We treat any LLM span as a "call". Copilot's chat span is named 'chat',
// but be liberal and match any span that has gen_ai usage attributes.
function fetchCalls(fromNs: string, toNs: string, agent?: string, limit = 500): Call[] {
  const rows = db
    .prepare(
      `SELECT ${SPAN_COLS} FROM spans
       WHERE start_ns BETWEEN ? AND ?
         AND (name = 'chat' OR attributes LIKE '%gen_ai.usage%' OR attributes LIKE '%llm.usage%')
       ORDER BY start_ns DESC
       LIMIT ?`,
    )
    .all(fromNs, toNs, limit) as any[];

  const calls = rows.map(rowToCall);
  if (agent && agent !== "all") {
    return calls.filter((c) => c.agent === agent);
  }
  return calls;
}

export function timeRange(q: { from?: string; to?: string; window?: string }): {
  fromNs: string;
  toNs: string;
} {
  const toMs = q.to ? Date.parse(q.to) : Date.now();
  let fromMs: number;
  if (q.from) fromMs = Date.parse(q.from);
  else {
    const w = q.window ?? "24h";
    if (w === "today") {
      const now = new Date(toMs);
      fromMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else {
      const m = /^(\d+)([smhdwy])$/.exec(w);
      const mult = {
        s: 1_000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
        w: 7 * 86_400_000,
        y: 365 * 86_400_000,
      }[(m?.[2] ?? "h") as "s" | "m" | "h" | "d" | "w" | "y"];
      const n = parseInt(m?.[1] ?? "24", 10);
      fromMs = toMs - n * mult;
    }
  }
  return {
    fromNs: (BigInt(fromMs) * 1_000_000n).toString(),
    toNs: (BigInt(toMs) * 1_000_000n).toString(),
  };
}

type Bucket = "day" | "week" | "month" | "year";

export function bucketStartMs(ms: number, bucket: Bucket): number {
  const d = new Date(ms);
  if (bucket === "year") return new Date(d.getFullYear(), 0, 1).getTime();
  if (bucket === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (bucket === "week") {
    const day = (d.getDay() + 6) % 7; // Monday = 0
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function nextBucketMs(ms: number, bucket: Bucket): number {
  const d = new Date(ms);
  if (bucket === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  if (bucket === "week") return ms + 7 * 86_400_000;
  if (bucket === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return new Date(d.getFullYear() + 1, 0, 1).getTime();
}

export function bucketKey(ms: number, bucket: Bucket): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  if (bucket === "year") return `${y}`;
  if (bucket === "month") return `${y}-${mo}`;
  return `${y}-${mo}-${da}`; // week label uses Monday's date
}

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.get("/api/copilot/calls", async (req) => {
    const q = req.query as {
      from?: string;
      to?: string;
      window?: string;
      agent?: string;
      limit?: string;
    };
    const { fromNs, toNs } = timeRange(q);
    const limit = Math.min(parseInt(q.limit ?? "500", 10) || 500, 5000);
    return fetchCalls(fromNs, toNs, q.agent, limit);
  });

  app.get("/api/copilot/summary", async (req) => {
    const q = req.query as {
      from?: string;
      to?: string;
      window?: string;
      agent?: string;
    };
    const { fromNs, toNs } = timeRange(q);
    const calls = fetchCalls(fromNs, toNs, q.agent, 5000);

    let input = 0,
      output = 0,
      cacheR = 0,
      cacheC = 0;
    let inputCost = 0,
      outputCost = 0,
      cacheRCost = 0,
      cacheCCost = 0;
    for (const c of calls) {
      input += c.input_tokens;
      output += c.output_tokens;
      cacheR += c.cache_read_tokens;
      cacheC += c.cache_creation_tokens;
      inputCost += c.input_cost;
      outputCost += c.output_cost;
      cacheRCost += c.cache_read_cost;
      cacheCCost += c.cache_creation_cost;
    }
    const total_cost = inputCost + outputCost + cacheRCost + cacheCCost;
    const total_input_with_cache = input + cacheR + cacheC;
    const telemetryRows = db
      .prepare(
        `SELECT
           EXISTS(SELECT 1 FROM spans LIMIT 1) AS has_spans,
           EXISTS(SELECT 1 FROM metric_points LIMIT 1) AS has_metrics,
           EXISTS(SELECT 1 FROM events LIMIT 1) AS has_events`,
      )
      .get() as { has_spans: number; has_metrics: number; has_events: number };
    const has_any_telemetry =
      telemetryRows.has_spans === 1 ||
      telemetryRows.has_metrics === 1 ||
      telemetryRows.has_events === 1;

    return {
      calls: calls.length,
      input_fresh_tokens: input,
      input_total_tokens: total_input_with_cache,
      cache_read_tokens: cacheR,
      cache_creation_tokens: cacheC,
      output_tokens: output,
      input_cost: inputCost,
      output_cost: outputCost,
      cache_read_cost: cacheRCost,
      cache_creation_cost: cacheCCost,
      total_cost,
      credits: total_cost * 100, // 1 credit = $0.01
      has_any_telemetry,
    };
  });

  app.get("/api/copilot/agents", async () => {
    const rows = db
      .prepare(
        `SELECT attributes FROM spans
       WHERE name = 'chat' OR attributes LIKE '%gen_ai.usage%'
       ORDER BY start_ns DESC LIMIT 2000`,
      )
      .all() as { attributes: string }[];
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const a = JSON.parse(r.attributes ?? "{}");
        const agent = pick(
          a,
          "copilot.chat.agent",
          "copilot.chat.command",
          "gen_ai.agent.name",
          "copilot.chat.location",
          "copilot.chat.intent",
        );
        if (agent) set.add(String(agent));
      } catch {
        /* */
      }
    }
    return Array.from(set).sort();
  });

  app.get("/api/copilot/timeseries", async (req) => {
    const q = req.query as {
      from?: string;
      to?: string;
      window?: string;
      agent?: string;
      bucket?: string;
    };
    const bucket = (q.bucket as Bucket) ?? "day";
    if (!["day", "week", "month", "year"].includes(bucket)) {
      return { error: "invalid bucket" };
    }
    const defaults: Record<Bucket, string> = {
      day: "30d",
      week: "12w",
      month: "12m",
      year: "5y",
    };
    const window = q.window ?? defaults[bucket];
    // Hack: timeRange's 'm' means minutes; remap '12m' (months) to days for the lookback.
    const remapped =
      window.endsWith("m") && bucket === "month" ? `${parseInt(window) * 31}d` : window;
    const { fromNs, toNs } = timeRange({
      from: q.from,
      to: q.to,
      window: remapped,
    });
    const calls = fetchCalls(fromNs, toNs, q.agent, 50_000);

    const fromMs = Number(BigInt(fromNs) / 1_000_000n);
    const toMs = Number(BigInt(toNs) / 1_000_000n);

    type Row = {
      bucket: string;
      ts: number;
      calls: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
      cost: number;
    };
    const map = new Map<string, Row>();
    for (let ms = bucketStartMs(fromMs, bucket); ms <= toMs; ms = nextBucketMs(ms, bucket)) {
      const k = bucketKey(ms, bucket);
      map.set(k, {
        bucket: k,
        ts: ms,
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost: 0,
      });
    }
    for (const c of calls) {
      const ms = Number(BigInt(c.start_ns) / 1_000_000n);
      const k = bucketKey(bucketStartMs(ms, bucket), bucket);
      const row = map.get(k);
      if (!row) continue;
      row.calls += 1;
      row.input_tokens += c.input_tokens;
      row.output_tokens += c.output_tokens;
      row.cache_read_tokens += c.cache_read_tokens;
      row.cache_creation_tokens += c.cache_creation_tokens;
      row.cost += c.total_cost;
    }
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  });

  app.delete("/api/copilot/clear", async () => {
    db.exec("DELETE FROM spans; DELETE FROM metric_points; DELETE FROM events;");
    return { ok: true };
  });

  // Debug: dump raw attributes for the most recent N chat spans so you can see
  // which attribute keys Copilot actually emits (cache tokens vary by vendor).
  app.get("/api/copilot/inspect", async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(parseInt(q.limit ?? "5", 10) || 5, 50);
    const rows = db
      .prepare(
        `SELECT span_id, name, attributes FROM spans
       WHERE name = 'chat' OR attributes LIKE '%gen_ai.usage%' OR attributes LIKE '%llm.usage%'
       ORDER BY start_ns DESC LIMIT ?`,
      )
      .all(limit) as { span_id: string; name: string; attributes: string }[];
    return rows.map((r) => {
      let attrs: Record<string, unknown> = {};
      try {
        attrs = JSON.parse(r.attributes ?? "{}");
      } catch {
        /* */
      }
      return {
        span_id: r.span_id,
        name: r.name,
        attribute_keys: Object.keys(attrs).sort(),
        attributes: attrs,
      };
    });
  });
}
