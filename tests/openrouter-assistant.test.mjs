import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const client = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('role-aware assistant uses a server-only OpenRouter integration', () => {
  assert.match(server, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(server, /deepseek\/deepseek-v4-flash/);
  assert.match(server, /path === '\/api\/assistant'/);
  assert.match(server, /teacherAssistantContext/);
  assert.match(server, /studentAssistantContext/);
  assert.doesNotMatch(client, /OPENROUTER_API_KEY|openrouter\.ai/);
});

test('assistant sends bounded history and authorized academic context', () => {
  assert.match(server, /body\.history\.slice\(-6\)/);
  assert.match(server, /Carefully count records instead of estimating/);
  assert.match(server, /max_tokens: 350/);
  assert.match(client, /api\('\/assistant'/);
});
