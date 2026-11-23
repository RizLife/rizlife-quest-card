import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('Ask Rizal is rendered with role-specific guidance for teachers and students', () => {
  assert.match(app, /\$\{assistantWidget\(student\)\}/);
  assert.match(app, /api\('\/assistant'/);
  assert.match(app, /student\?\['Which tasks am I missing\?'/);
});
