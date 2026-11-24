import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const server = readFileSync(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/server/auth.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

function extract(start, end) {
  return server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));
}

test('server applies browser security headers and same-origin mutation checks', () => {
  assert.match(server, /content-security-policy/);
  assert.match(server, /strict-transport-security/);
  assert.match(server, /frame-ancestors 'none'/);
  assert.match(server, /function enforceSameOrigin/);
  assert.match(server, /enforceSameOrigin\(req\)/);
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /Strict-Transport-Security/);
});

test('APC branding uses a bundled asset instead of an external hotlink', () => {
  assert.match(client, /assets\/apc-seal\.webp/);
  assert.doesNotMatch(client, /apc\.edu\.ph\/wp-content\/uploads\/2023\/03\/cropped-APC_Seal/);
});

test('same-origin guard permits the app and rejects cross-site writes', () => {
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const context = vm.createContext({ HttpError, URL, process:{env:{NODE_ENV:'production'}} });
  vm.runInContext(extract('function enforceSameOrigin(', 'function limitAuthentication('), context);
  const request = (origin) => ({ method:'POST', headers:{origin, host:'rizlife.example', 'x-forwarded-proto':'https'} });
  assert.doesNotThrow(() => vm.runInContext('enforceSameOrigin(request)', vm.createContext({...context, request:request('https://rizlife.example')})));
  assert.throws(() => vm.runInContext('enforceSameOrigin(request)', vm.createContext({...context, request:request('https://attacker.example')})), /origin is not allowed/);
});

test('sessions stay in HttpOnly cookies instead of browser storage', () => {
  assert.match(server, /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*(access|refresh|token)/i);
  assert.doesNotMatch(client, /sessionStorage\.setItem\([^\n]*(access|refresh|token)/i);
});

test('authorization resolves the trusted database role for every protected request', () => {
  assert.match(auth, /auth\.getUser\(token\)/);
  assert.match(auth, /from\('profiles'\)/);
  assert.match(auth, /profile\.role !== requiredRole/);
  assert.doesNotMatch(auth, /user_metadata[^\n]*role/);
});

test('student evidence is ownership-scoped and image uploads are signature checked', () => {
  assert.match(server, /requireUser\(req, 'student'\)/);
  assert.match(server, /eq\('student_id',user\.id\)/);
  assert.match(server, /matchesImageSignature\(buffer, mimeType\)/);
  assert.match(server, /buffer\.length > 5 \* 1024 \* 1024/);
  assert.match(server, /upsert:false/);
});

test('database RLS requires an active teacher and enrolled active quest', () => {
  assert.match(schema, /select \(select public\.is_teacher\(\)\) and exists/);
  assert.match(schema, /join public\.section_students enrollment/);
  assert.match(schema, /quest\.active = true/);
  assert.match(schema, /enrollment\.student_id = \(select auth\.uid\(\)\)/);
});
