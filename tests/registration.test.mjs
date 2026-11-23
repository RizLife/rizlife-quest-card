import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const server = readFileSync(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function registrationName(body) {
  const start = server.indexOf('function studentRegistrationName(');
  const end = server.indexOf('async function createStoredJoinCode(', start);
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const requiredText = (value, label, max) => {
    const text = String(value || '').trim();
    if (!text) throw new HttpError(400, `${label} is required.`);
    if (text.length > max) throw new HttpError(400, `${label} is too long.`);
    return text;
  };
  const context = vm.createContext({ HttpError, assertText:requiredText, body });
  vm.runInContext(server.slice(start, end), context);
  return vm.runInContext('studentRegistrationName(body)', context);
}

test('student registration creates the official display name from separate fields', () => {
  assert.equal(registrationName({firstName:'  Dominik  ',middleInitial:'c',lastName:' Carreon '}),'Dominik C. Carreon');
  assert.equal(registrationName({firstName:'Jared Christian',middleInitial:'',lastName:'Gatchalian'}),'Jared Christian Gatchalian');
});

test('student registration rejects an invalid middle initial', () => {
  assert.throws(() => registrationName({firstName:'Juan',middleInitial:'MM',lastName:'Rizal'}), /Middle initial must be one letter/);
});

test('create account keeps teacher approval and all required enrollment fields', () => {
  for (const id of ['register-first-name','register-middle-initial','register-last-name','register-email','register-student-number','register-code','register-password','register-confirm']) {
    assert.match(client, new RegExp(`id="${id}"`));
  }
  assert.match(client, /Teacher approval required/);
  assert.match(client, /Waiting for teacher approval/);
});
