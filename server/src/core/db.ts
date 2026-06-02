import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "./data.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA synchronous = NORMAL;`);
// 64 MB page cache (negative = KiB), temp tables in memory, 256 MB mmap I/O
db.exec(`PRAGMA cache_size = -65536;`);
db.exec(`PRAGMA temp_store = MEMORY;`);
db.exec(`PRAGMA mmap_size = 268435456;`);

function ensureSpansLlmColumns(): void {
  const cols = db.prepare("PRAGMA table_info(spans)").all() as Array<{ name: string }>;
  const has = new Set(cols.map((c) => c.name));

  if (!has.has("llm_model")) db.exec("ALTER TABLE spans ADD COLUMN llm_model TEXT;");
  if (!has.has("llm_agent")) db.exec("ALTER TABLE spans ADD COLUMN llm_agent TEXT;");
  if (!has.has("input_tokens")) db.exec("ALTER TABLE spans ADD COLUMN input_tokens INTEGER;");
  if (!has.has("output_tokens")) db.exec("ALTER TABLE spans ADD COLUMN output_tokens INTEGER;");
  if (!has.has("cache_read_tokens"))
    db.exec("ALTER TABLE spans ADD COLUMN cache_read_tokens INTEGER;");
  if (!has.has("cache_creation_tokens"))
    db.exec("ALTER TABLE spans ADD COLUMN cache_creation_tokens INTEGER;");
  if (!has.has("is_llm_call")) db.exec("ALTER TABLE spans ADD COLUMN is_llm_call INTEGER;");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS spans (
    span_id        TEXT PRIMARY KEY,
    trace_id       TEXT NOT NULL,
    parent_span_id TEXT,
    name           TEXT NOT NULL,
    kind           INTEGER,
    start_ns       INTEGER NOT NULL,
    end_ns         INTEGER NOT NULL,
    duration_ms    REAL NOT NULL,
    status_code    INTEGER,
    attributes     TEXT,
    llm_model      TEXT,
    llm_agent      TEXT,
    input_tokens   INTEGER,
    output_tokens  INTEGER,
    cache_read_tokens INTEGER,
    cache_creation_tokens INTEGER,
    is_llm_call    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_spans_start ON spans(start_ns);
  CREATE INDEX IF NOT EXISTS idx_spans_start_name ON spans(start_ns, name);
  CREATE INDEX IF NOT EXISTS idx_spans_chat_start ON spans(start_ns) WHERE name = 'chat';
  CREATE INDEX IF NOT EXISTS idx_spans_name  ON spans(name);
  CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
  CREATE INDEX IF NOT EXISTS idx_spans_genai_start ON spans(start_ns) WHERE attributes LIKE '%gen_ai.usage%';
  CREATE INDEX IF NOT EXISTS idx_spans_llm_start ON spans(start_ns) WHERE attributes LIKE '%llm.usage%';

  CREATE TABLE IF NOT EXISTS metric_points (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    unit         TEXT,
    type         TEXT NOT NULL,
    timestamp_ns INTEGER NOT NULL,
    value        REAL NOT NULL,
    attributes   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_metric_ts   ON metric_points(timestamp_ns);
  CREATE INDEX IF NOT EXISTS idx_metric_name ON metric_points(name);

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_ns INTEGER NOT NULL,
    severity     TEXT,
    body         TEXT,
    attributes   TEXT,
    trace_id     TEXT,
    span_id      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(timestamp_ns);
`);

ensureSpansLlmColumns();
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_spans_llm_call_start ON spans(start_ns) WHERE is_llm_call = 1;
  CREATE INDEX IF NOT EXISTS idx_spans_llm_agent_start ON spans(llm_agent, start_ns) WHERE is_llm_call = 1;
  CREATE INDEX IF NOT EXISTS idx_spans_llm_model_start ON spans(llm_model, start_ns) WHERE is_llm_call = 1;
`);

// Backfill the last 365 days so existing dashboards can use indexed columns.
const backfillCutoffNs = ((BigInt(Date.now()) - 365n * 86_400_000n) * 1_000_000n).toString();
db.prepare(
  `UPDATE spans
   SET
     llm_model = COALESCE(
       llm_model,
       json_extract(attributes, '$."gen_ai.response.model"'),
       json_extract(attributes, '$."gen_ai.request.model"'),
       json_extract(attributes, '$."llm.model"'),
       json_extract(attributes, '$."model"')
     ),
     llm_agent = COALESCE(
       llm_agent,
       json_extract(attributes, '$."copilot.chat.agent"'),
       json_extract(attributes, '$."copilot.chat.command"'),
       json_extract(attributes, '$."gen_ai.agent.name"'),
       json_extract(attributes, '$."copilot.chat.location"'),
       json_extract(attributes, '$."copilot.chat.intent"')
     ),
     input_tokens = COALESCE(
       input_tokens,
       CAST(json_extract(attributes, '$."gen_ai.usage.input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."llm.usage.prompt_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."usage.prompt_tokens"') AS INTEGER),
       0
     ),
     output_tokens = COALESCE(
       output_tokens,
       CAST(json_extract(attributes, '$."gen_ai.usage.output_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."llm.usage.completion_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."usage.completion_tokens"') AS INTEGER),
       0
     ),
     cache_read_tokens = COALESCE(
       cache_read_tokens,
       CAST(json_extract(attributes, '$."gen_ai.usage.cache_read.input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."gen_ai.usage.cache_read_input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."gen_ai.usage.cached_input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."llm.usage.cached_tokens"') AS INTEGER),
       0
     ),
     cache_creation_tokens = COALESCE(
       cache_creation_tokens,
       CAST(json_extract(attributes, '$."gen_ai.usage.cache_creation.input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."gen_ai.usage.cache_creation_input_tokens"') AS INTEGER),
       CAST(json_extract(attributes, '$."llm.usage.cache_creation_tokens"') AS INTEGER),
       0
     ),
     is_llm_call = COALESCE(
       is_llm_call,
       CASE
         WHEN name = 'chat'
           OR attributes LIKE '%gen_ai.usage%'
           OR attributes LIKE '%llm.usage%'
         THEN 1
         ELSE 0
       END
     )
   WHERE start_ns >= ?
     AND (
       is_llm_call IS NULL
       OR llm_model IS NULL
       OR llm_agent IS NULL
       OR input_tokens IS NULL
       OR output_tokens IS NULL
       OR cache_read_tokens IS NULL
       OR cache_creation_tokens IS NULL
     )`,
).run(backfillCutoffNs);

// node:sqlite allows named params via $/:/@; setAllowBareNamedParameters lets us
// pass plain objects without the prefix.
const insertSpanStmt = db.prepare(`
  INSERT OR REPLACE INTO spans
  (span_id, trace_id, parent_span_id, name, kind, start_ns, end_ns, duration_ms, status_code, attributes,
   llm_model, llm_agent, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, is_llm_call)
  VALUES (:span_id, :trace_id, :parent_span_id, :name, :kind, :start_ns, :end_ns, :duration_ms, :status_code, :attributes,
   :llm_model, :llm_agent, :input_tokens, :output_tokens, :cache_read_tokens, :cache_creation_tokens, :is_llm_call)
`);
insertSpanStmt.setAllowBareNamedParameters(true);

const insertMetricStmt = db.prepare(`
  INSERT INTO metric_points (name, unit, type, timestamp_ns, value, attributes)
  VALUES (:name, :unit, :type, :timestamp_ns, :value, :attributes)
`);
insertMetricStmt.setAllowBareNamedParameters(true);

const insertEventStmt = db.prepare(`
  INSERT INTO events (timestamp_ns, severity, body, attributes, trace_id, span_id)
  VALUES (:timestamp_ns, :severity, :body, :attributes, :trace_id, :span_id)
`);
insertEventStmt.setAllowBareNamedParameters(true);

export const insertSpan = insertSpanStmt;
export const insertMetric = insertMetricStmt;
export const insertEvent = insertEventStmt;
