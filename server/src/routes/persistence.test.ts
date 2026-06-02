import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeTempDbPath(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "copilot-otel-db-"));
  return { dir, dbPath: join(dir, "data.db") };
}

async function loadServerModules(dbPath: string): Promise<{
  db: DatabaseSync;
  registerOtlpRoutes: (app: ReturnType<typeof Fastify>) => void;
  registerCopilotRoutes: (app: ReturnType<typeof Fastify>) => void;
}> {
  vi.resetModules();
  process.env.DB_PATH = dbPath;

  const dbMod = await import("../core/db.js");
  const otlpMod = await import("./otlp.js");
  const copilotMod = await import("./copilot.js");

  return {
    db: dbMod.db,
    registerOtlpRoutes: otlpMod.registerOtlpRoutes,
    registerCopilotRoutes: copilotMod.registerCopilotRoutes,
  };
}

describe.sequential("db migrations and LLM persistence", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    process.env.DB_PATH = undefined;
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("migrates existing spans table by adding LLM columns and indexes", async () => {
    const { dir, dbPath } = makeTempDbPath();
    tempDirs.push(dir);

    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec(`
      CREATE TABLE spans (
        span_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        parent_span_id TEXT,
        name TEXT NOT NULL,
        kind INTEGER,
        start_ns INTEGER NOT NULL,
        end_ns INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        status_code INTEGER,
        attributes TEXT
      );
      CREATE TABLE metric_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT,
        type TEXT NOT NULL,
        timestamp_ns INTEGER NOT NULL,
        value REAL NOT NULL,
        attributes TEXT
      );
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp_ns INTEGER NOT NULL,
        severity TEXT,
        body TEXT,
        attributes TEXT,
        trace_id TEXT,
        span_id TEXT
      );
    `);
    oldDb.close();

    const { db } = await loadServerModules(dbPath);

    const cols = db.prepare("PRAGMA table_info(spans)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));

    expect(names.has("llm_model")).toBe(true);
    expect(names.has("llm_agent")).toBe(true);
    expect(names.has("input_tokens")).toBe(true);
    expect(names.has("output_tokens")).toBe(true);
    expect(names.has("cache_read_tokens")).toBe(true);
    expect(names.has("cache_creation_tokens")).toBe(true);
    expect(names.has("is_llm_call")).toBe(true);

    const indexes = db.prepare("PRAGMA index_list(spans)").all() as Array<{ name: string }>;
    const idxNames = new Set(indexes.map((i) => i.name));
    expect(idxNames.has("idx_spans_llm_call_start")).toBe(true);
    expect(idxNames.has("idx_spans_llm_agent_start")).toBe(true);
    expect(idxNames.has("idx_spans_llm_model_start")).toBe(true);

    db.close();
  });

  it("stores precomputed LLM fields during OTLP ingest", async () => {
    const { dir, dbPath } = makeTempDbPath();
    tempDirs.push(dir);

    const { db, registerOtlpRoutes } = await loadServerModules(dbPath);
    const app = Fastify();
    registerOtlpRoutes(app);

    const res = await app.inject({
      method: "POST",
      url: "/v1/traces",
      headers: { "content-type": "application/json" },
      payload: {
        resourceSpans: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                scope: { name: "test-scope" },
                spans: [
                  {
                    spanId: "span-1",
                    traceId: "trace-1",
                    name: "chat",
                    startTimeUnixNano: "1000000000",
                    endTimeUnixNano: "2000000000",
                    attributes: [
                      { key: "gen_ai.response.model", value: { stringValue: "gpt-5-mini" } },
                      { key: "copilot.chat.agent", value: { stringValue: "workspace" } },
                      { key: "gen_ai.usage.input_tokens", value: { intValue: "1234" } },
                      { key: "gen_ai.usage.output_tokens", value: { intValue: "4321" } },
                      {
                        key: "gen_ai.usage.cache_read_input_tokens",
                        value: { intValue: "100" },
                      },
                      {
                        key: "gen_ai.usage.cache_creation_input_tokens",
                        value: { intValue: "50" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const row = db
      .prepare(
        `SELECT llm_model, llm_agent, input_tokens, output_tokens,
                cache_read_tokens, cache_creation_tokens, is_llm_call
         FROM spans WHERE span_id = ?`,
      )
      .get("span-1") as {
      llm_model: string;
      llm_agent: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
      is_llm_call: number;
    };

    expect(row.llm_model).toBe("gpt-5-mini");
    expect(row.llm_agent).toBe("workspace");
    expect(row.input_tokens).toBe(1234);
    expect(row.output_tokens).toBe(4321);
    expect(row.cache_read_tokens).toBe(100);
    expect(row.cache_creation_tokens).toBe(50);
    expect(row.is_llm_call).toBe(1);

    await app.close();
    db.close();
  });

  it("keeps copilot calls working for both precomputed and JSON fallback rows", async () => {
    const { dir, dbPath } = makeTempDbPath();
    tempDirs.push(dir);

    const { db, registerCopilotRoutes } = await loadServerModules(dbPath);
    const app = Fastify();
    registerCopilotRoutes(app);

    const nowNs = BigInt(Date.now()) * 1_000_000n;

    db.prepare(
      `INSERT INTO spans (
         span_id, trace_id, parent_span_id, name, kind, start_ns, end_ns, duration_ms, status_code,
         attributes, llm_model, llm_agent, input_tokens, output_tokens, cache_read_tokens,
         cache_creation_tokens, is_llm_call
       ) VALUES (?, ?, NULL, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "precomputed-1",
      "trace-pre",
      "assistant_call",
      (nowNs - 1_000_000n).toString(),
      nowNs.toString(),
      1,
      "{}",
      "gpt-5-mini",
      "workspace",
      200,
      100,
      20,
      10,
      1,
    );

    db.prepare(
      `INSERT INTO spans (
         span_id, trace_id, parent_span_id, name, kind, start_ns, end_ns, duration_ms, status_code,
         attributes, llm_model, llm_agent, input_tokens, output_tokens, cache_read_tokens,
         cache_creation_tokens, is_llm_call
       ) VALUES (?, ?, NULL, ?, 0, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
    ).run(
      "fallback-1",
      "trace-fallback",
      "assistant_call",
      (nowNs - 2_000_000n).toString(),
      nowNs.toString(),
      2,
      JSON.stringify({
        "gen_ai.response.model": "gpt-5-mini",
        "copilot.chat.agent": "terminal",
        "gen_ai.usage.input_tokens": 300,
        "gen_ai.usage.output_tokens": 120,
        "gen_ai.usage.cache_read_input_tokens": 40,
        "gen_ai.usage.cache_creation_input_tokens": 10,
      }),
    );

    const from = new Date(Number((nowNs - 5_000_000_000n) / 1_000_000n)).toISOString();
    const to = new Date(Number((nowNs + 5_000_000_000n) / 1_000_000n)).toISOString();

    const res = await app.inject({
      method: "GET",
      url: `/api/copilot/calls?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=10`,
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{
      span_id: string;
      model: string;
      agent: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
    }>;

    const precomputed = rows.find((r) => r.span_id === "precomputed-1");
    const fallback = rows.find((r) => r.span_id === "fallback-1");

    expect(precomputed).toBeDefined();
    expect(precomputed?.model).toBe("gpt-5-mini");
    expect(precomputed?.agent).toBe("workspace");
    expect(precomputed?.input_tokens).toBe(200);
    expect(precomputed?.output_tokens).toBe(100);
    expect(precomputed?.cache_read_tokens).toBe(20);
    expect(precomputed?.cache_creation_tokens).toBe(10);

    expect(fallback).toBeDefined();
    expect(fallback?.model).toBe("gpt-5-mini");
    expect(fallback?.agent).toBe("terminal");
    expect(fallback?.input_tokens).toBe(300);
    expect(fallback?.output_tokens).toBe(120);
    expect(fallback?.cache_read_tokens).toBe(40);
    expect(fallback?.cache_creation_tokens).toBe(10);

    await app.close();
    db.close();
  });

  it("aggregates github.copilot signals by repo, tool and hook", async () => {
    const { dir, dbPath } = makeTempDbPath();
    tempDirs.push(dir);

    const { db, registerCopilotRoutes } = await loadServerModules(dbPath);
    const app = Fastify();
    registerCopilotRoutes(app);

    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const insert = db.prepare(
      `INSERT INTO spans (
         span_id, trace_id, parent_span_id, name, kind, start_ns, end_ns, duration_ms, status_code,
         attributes, llm_model, llm_agent, input_tokens, output_tokens, cache_read_tokens,
         cache_creation_tokens, is_llm_call
       ) VALUES (?, ?, NULL, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insert.run(
      "sig-1",
      "trace-sig-1",
      "assistant_call",
      (nowNs - 1_000_000n).toString(),
      nowNs.toString(),
      10,
      JSON.stringify({
        "github.copilot.git.repository": "acme/shop",
        "github.copilot.tool.parameters.mcp_tool_name": "run_in_terminal",
        "github.copilot.hook.name": "pre-commit",
        "github.copilot.hook.outcome": "success",
      }),
      "gpt-5-mini",
      "workspace",
      1000,
      500,
      50,
      0,
      1,
    );

    insert.run(
      "sig-2",
      "trace-sig-2",
      "assistant_call",
      (nowNs - 2_000_000n).toString(),
      nowNs.toString(),
      20,
      JSON.stringify({
        "github.copilot.git.repository": "acme/shop",
        "github.copilot.tool.parameters.mcp_tool_name": "run_in_terminal",
        "github.copilot.hook.name": "pre-commit",
        "github.copilot.hook.outcome": "failed",
      }),
      "gpt-5-mini",
      "workspace",
      500,
      200,
      0,
      0,
      1,
    );

    insert.run(
      "sig-3",
      "trace-sig-3",
      "assistant_call",
      (nowNs - 3_000_000n).toString(),
      nowNs.toString(),
      30,
      JSON.stringify({
        "github.copilot.repo.full_name": "acme/docs",
        "gen_ai.tool.name": "edit_file",
        "github.copilot.hook.name": "pre-push",
        "github.copilot.hook.outcome": "ok",
      }),
      "gpt-5-mini",
      "workspace",
      300,
      120,
      0,
      0,
      1,
    );

    const from = new Date(Number((nowNs - 5_000_000_000n) / 1_000_000n)).toISOString();
    const to = new Date(Number((nowNs + 5_000_000_000n) / 1_000_000n)).toISOString();
    const res = await app.inject({
      method: "GET",
      url: `/api/copilot/signals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=10`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      total_calls: number;
      calls_with_signals: number;
      repos: Array<{ repo: string; calls: number }>;
      tools: Array<{ tool: string; calls: number; avg_duration_ms: number }>;
      hooks: Array<{ hook: string; total: number; success: number; failed: number }>;
    };

    expect(body.total_calls).toBe(3);
    expect(body.calls_with_signals).toBe(3);

    expect(body.repos[0]?.repo).toBe("acme/shop");
    expect(body.repos[0]?.calls).toBe(2);
    expect(body.repos[1]?.repo).toBe("acme/docs");
    expect(body.repos[1]?.calls).toBe(1);

    expect(body.tools[0]?.tool).toBe("run_in_terminal");
    expect(body.tools[0]?.calls).toBe(2);
    expect(body.tools[0]?.avg_duration_ms).toBe(15);

    const preCommit = body.hooks.find((h) => h.hook === "pre-commit");
    expect(preCommit).toBeDefined();
    expect(preCommit?.total).toBe(2);
    expect(preCommit?.success).toBe(1);
    expect(preCommit?.failed).toBe(1);

    await app.close();
    db.close();
  });
});
