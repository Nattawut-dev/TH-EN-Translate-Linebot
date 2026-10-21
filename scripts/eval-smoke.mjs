import { createRequire } from 'node:module';
import { loadModule } from '../tests/helpers.mjs';
import { cases } from '../tests/translation-cases.mjs';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { translateMessage, TranslationError } = loadModule('translate');
const limit = Math.min(Number(process.env.TRANSLATION_EVAL_LIMIT ?? 8), cases.length);
let passed = 0; let attempted = 0;
for (const fixture of cases.slice(0, limit)) {
  const now = Date.now();
  const context = { conversation: 'synthetic-eval', speaker: 'speaker2', timestamp: now,
    recentTurns: (fixture.prior ?? []).map((text, index) => ({ conversation: 'synthetic-eval', speaker: 'speaker1', timestamp: now - 1000 + index, messageId: String(index), text })) };
  const started = Date.now(); attempted++;
  try {
    const output = await translateMessage(fixture.text, context);
    const failures = [...(fixture.required ?? []).filter(pattern => !pattern.test(output)), ...(fixture.forbidden ?? []).filter(pattern => pattern.test(output))];
    if (!failures.length) passed++;
    console.log(JSON.stringify({ id: fixture.id, passed: !failures.length, latencyMs: Date.now() - started, output }));
  } catch (error) {
    const code = error instanceof TranslationError ? error.code : 'eval_failed';
    console.log(JSON.stringify({ id: fixture.id, passed: false, latencyMs: Date.now() - started, code }));
    if (/missing_api_key|http_400|http_401|http_403/u.test(code)) break;
  }
}
console.log(JSON.stringify({ attempted, passed, model: 'gemini-2.5-flash', syntheticOnly: true }));
if (passed !== attempted) process.exitCode = 1;
