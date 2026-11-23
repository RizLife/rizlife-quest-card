import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const server = readFileSync(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('active join codes are validated by revocation rather than time', () => {
  const start = server.indexOf('async function validJoinCode(');
  const end = server.indexOf('async function inviteStudentAccount(', start);
  const source = server.slice(start, end);

  assert.match(source, /is\('revoked_at',null\)/);
  assert.doesNotMatch(source, /expires_at|new Date\(\)/);
  assert.match(source, /invalid or has been revoked/);
});

test('new join codes remain compatible with the original required expiry column', () => {
  const start = server.indexOf('async function createStoredJoinCode(');
  const end = server.indexOf('function validatePassword(', start);
  const source = server.slice(start, end);

  assert.match(source, /9999-12-31T23:59:59\.999Z/);
  assert.doesNotMatch(source, /10\*24\*60\*60\*1000/);
});

test('one unrevoked join code is enforced for each section', () => {
  assert.match(schema, /unique index if not exists section_join_codes_one_active_per_section_idx on public\.section_join_codes\(section_id\) where revoked_at is null/);
});

test('student and teacher screens describe permanent class codes', () => {
  assert.match(client, /one permanent join code managed by its teacher/);
  assert.match(client, /remains valid until you replace or revoke it/);
  assert.doesNotMatch(client, /Codes expire after 10 days|Create 10-day code|expire after 10 days/);
});
