import type { FastifyInstance } from "fastify";
import {
  ProtobufTraceSerializer,
  ProtobufMetricsSerializer,
  ProtobufLogsSerializer,
  JsonTraceSerializer,
  JsonMetricsSerializer,
  JsonLogsSerializer,
} from "@opentelemetry/otlp-transformer";
import { broadcast, insertEvent, insertMetric, insertSpan } from "../core/index.js";

// ---------- helpers ----------

function toHex(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array || Buffer.isBuffer(v as Buffer)) {
    return Buffer.from(v as Uint8Array).toString("hex");
  }
  return String(v);
}

function toBigInt(v: unknown): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string") return BigInt(v);
  return 0n;
}

function flattenAnyValue(v: any): unknown {
  if (v == null) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map(flattenAnyValue);
  if (v.kvlistValue?.values) return flattenAttributes(v.kvlistValue.values);
  return null;
}

function flattenAttributes(attrs: any[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!attrs) return out;
  for (const kv of attrs) {
    out[kv.key] = flattenAnyValue(kv.value);
  }
  return out;
}

function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n) + Number(ns % 1_000_000n) / 1_000_000;
}

// ---------- parsers ----------

function parseTraces(req: any): void {
  for (const rs of req.resourceSpans ?? []) {
    const resourceAttrs = flattenAttributes(rs.resource?.attributes);
    for (const ss of rs.scopeSpans ?? []) {
      const scopeName = ss.scope?.name ?? "";
      for (const s of ss.spans ?? []) {
        const startNs = toBigInt(s.startTimeUnixNano);
        const endNs = toBigInt(s.endTimeUnixNano);
        const row = {
          span_id: toHex(s.spanId),
          trace_id: toHex(s.traceId),
          parent_span_id: s.parentSpanId ? toHex(s.parentSpanId) : null,
          name: s.name ?? "",
          kind: s.kind ?? 0,
          start_ns: startNs.toString(),
          end_ns: endNs.toString(),
          duration_ms: nsToMs(endNs - startNs),
          status_code: s.status?.code ?? 0,
          attributes: JSON.stringify({
            ...resourceAttrs,
            scope: scopeName,
            ...flattenAttributes(s.attributes),
          }),
        };
        insertSpan.run(row);
        broadcast("span", {
          spanId: row.span_id,
          traceId: row.trace_id,
          name: row.name,
          startNs: row.start_ns,
          durationMs: row.duration_ms,
          statusCode: row.status_code,
        });

        // span events become log-like events
        for (const ev of s.events ?? []) {
          const evRow = {
            timestamp_ns: toBigInt(ev.timeUnixNano).toString(),
            severity: "EVENT",
            body: ev.name ?? "",
            attributes: JSON.stringify(flattenAttributes(ev.attributes)),
            trace_id: row.trace_id,
            span_id: row.span_id,
          };
          insertEvent.run(evRow);
          broadcast("event", evRow);
        }
      }
    }
  }
}

function pointValue(p: any): number {
  if (p.asInt !== undefined) return Number(p.asInt);
  if (p.asDouble !== undefined) return p.asDouble;
  if (p.sum !== undefined) return p.sum;
  if (p.count !== undefined) return Number(p.count);
  return 0;
}

function parseMetrics(req: any): void {
  for (const rm of req.resourceMetrics ?? []) {
    const resourceAttrs = flattenAttributes(rm.resource?.attributes);
    for (const sm of rm.scopeMetrics ?? []) {
      for (const m of sm.metrics ?? []) {
        const name = m.name ?? "";
        const unit = m.unit ?? "";
        let type = "unknown";
        let points: any[] = [];
        if (m.sum) {
          type = "sum";
          points = m.sum.dataPoints ?? [];
        } else if (m.gauge) {
          type = "gauge";
          points = m.gauge.dataPoints ?? [];
        } else if (m.histogram) {
          type = "histogram";
          points = m.histogram.dataPoints ?? [];
        } else if (m.summary) {
          type = "summary";
          points = m.summary.dataPoints ?? [];
        }
        for (const p of points) {
          const row = {
            name,
            unit,
            type,
            timestamp_ns: toBigInt(p.timeUnixNano).toString(),
            value: pointValue(p),
            attributes: JSON.stringify({
              ...resourceAttrs,
              ...flattenAttributes(p.attributes),
            }),
          };
          insertMetric.run(row);
          broadcast("metric", {
            name: row.name,
            type: row.type,
            value: row.value,
            timestampNs: row.timestamp_ns,
          });
        }
      }
    }
  }
}

function parseLogs(req: any): void {
  for (const rl of req.resourceLogs ?? []) {
    const resourceAttrs = flattenAttributes(rl.resource?.attributes);
    for (const sl of rl.scopeLogs ?? []) {
      for (const lr of sl.logRecords ?? []) {
        const body = flattenAnyValue(lr.body);
        const row = {
          timestamp_ns: toBigInt(lr.timeUnixNano || lr.observedTimeUnixNano).toString(),
          severity: lr.severityText ?? String(lr.severityNumber ?? ""),
          body: typeof body === "string" ? body : JSON.stringify(body),
          attributes: JSON.stringify({
            ...resourceAttrs,
            ...flattenAttributes(lr.attributes),
          }),
          trace_id: lr.traceId ? toHex(lr.traceId) : null,
          span_id: lr.spanId ? toHex(lr.spanId) : null,
        };
        insertEvent.run(row);
        broadcast("event", row);
      }
    }
  }
}

// ---------- routes ----------

export function registerOtlpRoutes(app: FastifyInstance): void {
  // Accept raw protobuf bytes
  app.addContentTypeParser("application/x-protobuf", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );

  const handle = (kind: "traces" | "metrics" | "logs") => async (req: any, reply: any) => {
    const ct = String(req.headers["content-type"] ?? "").toLowerCase();
    const isProto = ct.includes("protobuf");
    let parsed: any;
    try {
      if (isProto) {
        const buf = req.body as Buffer;
        if (kind === "traces") parsed = (ProtobufTraceSerializer as any).deserializeRequest(buf);
        else if (kind === "metrics")
          parsed = (ProtobufMetricsSerializer as any).deserializeRequest(buf);
        else parsed = (ProtobufLogsSerializer as any).deserializeRequest(buf);
      } else {
        // OTLP/JSON — body already parsed by Fastify
        const obj = req.body;
        if (kind === "traces")
          parsed = (JsonTraceSerializer as any).deserializeRequest?.(obj) ?? obj;
        else if (kind === "metrics")
          parsed = (JsonMetricsSerializer as any).deserializeRequest?.(obj) ?? obj;
        else parsed = (JsonLogsSerializer as any).deserializeRequest?.(obj) ?? obj;
      }
    } catch (err) {
      req.log.error({ err }, "OTLP decode failed");
      reply.code(400);
      return { error: "decode_failed" };
    }

    try {
      if (kind === "traces") parseTraces(parsed);
      else if (kind === "metrics") parseMetrics(parsed);
      else parseLogs(parsed);
    } catch (err) {
      req.log.error({ err }, "OTLP persist failed");
      reply.code(500);
      return { error: "persist_failed" };
    }

    // Empty success response per OTLP spec
    reply.header("content-type", isProto ? "application/x-protobuf" : "application/json");
    return isProto ? Buffer.alloc(0) : {};
  };

  app.post("/v1/traces", handle("traces"));
  app.post("/v1/metrics", handle("metrics"));
  app.post("/v1/logs", handle("logs"));
}
