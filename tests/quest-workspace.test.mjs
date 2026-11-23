import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, student] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/student.css', import.meta.url), 'utf8'),
]);

test('quest list uses compact assignment rows instead of oversized task cards', () => {
  assert.match(app, /function studentQuestRow\(q\)/);
  assert.match(app, /class="quest-assignment-row \$\{status\}"/);
  assert.doesNotMatch(app, /function studentTaskCard\(q\)/);
  assert.match(student, /\.quest-assignment-list\{/);
});

test('quest controls use real state for filters, search, counts, and sorting', () => {
  assert.match(app, /questSearch:''/);
  assert.match(app, /questSort:'number'/);
  assert.match(app, /function questFilters\(quests\)/);
  assert.match(app, /function searchQuests\(input,event\)/);
  assert.match(app, /function sortQuests\(value\)/);
  assert.match(app, /shown\.length} of \$\{quests\.length}/);
});

test('quest detail is a dedicated page and preserves existing submission workflow', () => {
  assert.match(app, /function studentQuestDetail\(id\)/);
  assert.match(app, /class="quest-detail-page" tabindex="-1"/);
  assert.match(app, /function questSubmissionForm\(q\)/);
  assert.match(app, /onsubmit="submitQuest\(event,\$\{q\.id\}\)"/);
  assert.doesNotMatch(app, /openModal\(`\$\{dialogHeader\('Task details'/);
});

test('quest details expose complete instructions, evidence, and teacher feedback', () => {
  assert.match(app, /questInstructions\(q\.description\)/);
  assert.match(app, /Evidence requirement/);
  assert.match(app, /evidenceDisplay\(s\)/);
  assert.match(app, /Teacher feedback/);
  assert.match(app, /s\.reviewed_at/);
});

test('quest workspace adapts to tablet and mobile widths', () => {
  assert.match(student, /@media\(max-width:900px\)\{\.quest-detail-layout\{grid-template-columns:1fr\}/);
  assert.match(student, /@media\(max-width:620px\)\{\.quest-search-row/);
});

test('student dashboard previews four quests and uses completed language', () => {
  assert.match(app, /previewQuests=quests\.slice\(0,4\)/);
  assert.match(app, /previewQuests\.map\(\(q,i\)=>journeyItem\(q,i,next\?\.id\)\)/);
  assert.match(app, /<a href="#quests">View all quests<\/a>/);
  assert.match(app, /\['verified','Completed'\]/);
  assert.match(app, /role==='teacher'\?'Verified':'Completed'/);
});
