import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('teacher assistant uses a server-only OpenRouter integration', () => {
  assert.match(server, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(server, /deepseek\/deepseek-v4-flash/);
  assert.match(server, /path === '\/api\/teacher\/assistant'/);
  assert.doesNotMatch(client, /OPENROUTER_API_KEY|openrouter\.ai/);
});

test('assistant sends bounded history and aggregate workspace context', () => {
  assert.match(server, /body\.history\.slice\(-6\)/);
  assert.match(server, /pendingReviewCount/);
  assert.match(server, /max_tokens: 350/);
  assert.match(client, /api\('\/teacher\/assistant'/);
});
