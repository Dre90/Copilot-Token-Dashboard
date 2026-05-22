import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "./data.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA synchronous = NORMAL;`);

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
    attributes     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_spans_start ON spans(start_ns);
  CREATE INDEX IF NOT EXISTS idx_spans_name  ON spans(name);
  CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);

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

// node:sqlite allows named params via $/:/@; setAllowBareNamedParameters lets us
// pass plain objects without the prefix.
const insertSpanStmt = db.prepare(`
  INSERT OR REPLACE INTO spans
  (span_id, trace_id, parent_span_id, name, kind, start_ns, end_ns, duration_ms, status_code, attributes)
  VALUES (:span_id, :trace_id, :parent_span_id, :name, :kind, :start_ns, :end_ns, :duration_ms, :status_code, :attributes)
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
