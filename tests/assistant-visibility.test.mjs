import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('Ask Rizal is rendered for teachers but not students', () => {
  assert.match(app, /\$\{student\?'':assistantWidget\(false\)\}/);
  assert.doesNotMatch(app, /\$\{assistantWidget\(student\)\}/);
});
