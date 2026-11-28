import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server/app.mjs', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/quest-card-migration.sql', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/student.css', import.meta.url), 'utf8');

function extract(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from);
  assert.notEqual(from, -1, `Missing ${start}`);
  assert.notEqual(to, -1, `Missing ${end}`);
  return app.slice(from, to);
}

test('student Quest Card derives all submission states and reserves empty slots', () => {
  const context = vm.createContext({ Map });
  vm.runInContext(extract('function questSlotStatus', 'function questLegend'), context);
  assert.equal(vm.runInContext('questSlotStatus(null)', context), 'empty');
  assert.equal(vm.runInContext("questSlotStatus({submission:null})", context), 'pending');
  assert.equal(vm.runInContext("questSlotStatus({submission:{status:'submitted'}})", context), 'submitted');
  assert.equal(vm.runInContext("questSlotStatus({submission:{status:'rejected'}})", context), 'rejected');
  assert.equal(vm.runInContext("questSlotStatus({submission:{status:'verified'}})", context), 'verified');
  assert.match(app, /\$\{quest\?`onclick=.*:'disabled'\}/s);
  assert.match(app, /Array\.from\(\{length:24\}/);
});

test('teacher Quest Card creates from empty slots and edits filled slots', () => {
  assert.match(app, /openTaskForm\(null,\$\{slot\}\)/);
  assert.match(app, /openTaskForm\(\$\{quest\.id\}\)/);
  assert.match(app, /id="task-slot" required/);
  assert.match(app, /questSlot:Number\(document\.querySelector\('#task-slot'\)\.value\)/);
  assert.match(app, /completed_count/);
});

test('quest slots are validated and unique per class in schema and migration', () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /quest_slot.*between 1 and 24/is);
    assert.match(sql, /quests_section_slot_unique_idx/is);
    assert.match(sql, /section_id,\s*quest_slot/is);
  }
  assert.match(server, /function assertQuestSlot/);
  assert.match(server, /error\?\.code==='23505'/);
  assert.match(server, /requireOwnedSection\(teacher\.id,body\.sectionId\)/);
});

test('Quest Card is responsive and exposes accessible status text', () => {
  assert.match(css, /grid-template-columns:repeat\(6/);
  assert.match(css, /@media\(max-width:820px\).*repeat\(4/s);
  assert.match(css, /@media\(max-width:480px\).*repeat\(3/s);
  assert.match(app, /aria-label="Quest \$\{number\}/);
  assert.match(app, /quest-card-legend/);
});

test('student queries return only active quests from enrolled classes with stable slots', () => {
  assert.match(server, /select\('id,title,description,requirement,section_id,quest_slot'\)/);
  assert.match(server, /\.in\('section_id',sectionIds\)\.eq\('active', true\)/);
  assert.match(server, /section_students.*student_id/s);
});
