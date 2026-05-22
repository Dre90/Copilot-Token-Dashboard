// Send fake Copilot chat spans to the local OTLP receiver to populate the dashboard.
// Usage: node scripts/send-test.mjs [count]

import { randomBytes } from 'node:crypto';

const ENDPOINT = process.env.OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';
const COUNT = Number(process.argv[2] ?? 6);

const MODELS = [
  'claude-sonnet-4.6',
  'claude-haiku-4.5',
  'claude-opus-4.6',
  'gpt-5.4',
  'gpt-5-mini',
  'gpt-4.1',
  'gemini-2.5-pro',
];
const AGENTS = ['panel/editAgent', 'panel/askAgent', 'copilotLanguageServer', 'title', 'inline'];

const hex = (n) => randomBytes(n).toString('hex');
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

function buildSpan() {
  const model = pick(MODELS);
  const agent = pick(AGENTS);
  const start = Date.now() - rand(0, 5 * 60 * 1000);
  const dur   = rand(200, 4500);
  const input  = rand(50, 8000);
  const output = rand(20, 600);
  const cacheR = Math.random() < 0.7 ? rand(500, 15000) : 0;
  const cacheC = /claude/i.test(model) && Math.random() < 0.4 ? rand(1000, 12000) : 0;

  const attr = (k, v) => {
    if (typeof v === 'number') return { key: k, value: { intValue: String(v) } };
    return { key: k, value: { stringValue: String(v) } };
  };

  return {
    traceId: hex(16),
    spanId: hex(8),
    name: 'chat',
    kind: 3,
    startTimeUnixNano: String(BigInt(start) * 1_000_000n),
    endTimeUnixNano:   String(BigInt(start + dur) * 1_000_000n),
    attributes: [
      attr('gen_ai.system', /gpt/i.test(model) ? 'openai' : /claude/i.test(model) ? 'anthropic' : 'google'),
      attr('gen_ai.request.model',  model),
      attr('gen_ai.response.model', model),
      attr('gen_ai.usage.input_tokens',  input),
      attr('gen_ai.usage.output_tokens', output),
      attr('gen_ai.usage.cache_read_input_tokens',     cacheR),
      attr('gen_ai.usage.cache_creation_input_tokens', cacheC),
      attr('copilot.chat.agent', agent),
    ],
    status: { code: 1 },
  };
}

const body = {
  resourceSpans: [{
    resource: {
      attributes: [
        { key: 'service.name', value: { stringValue: 'copilot-test' } },
      ],
    },
    scopeSpans: [{
      scope: { name: 'copilot.test', version: '0.0.0' },
      spans: Array.from({ length: COUNT }, buildSpan),
    }],
  }],
};

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(`${res.status} ${res.statusText} → ${COUNT} chat spans sent to ${ENDPOINT}`);
