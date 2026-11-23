import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, student, teacher] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/student.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/teacher.css', import.meta.url), 'utf8'),
]);

test('student hero does not render the former greeting bubble', () => {
  assert.doesNotMatch(app, /rizal-greeting-card|Hello, \$\{firstName\}/);
  assert.doesNotMatch(student, /\.rizal-greeting-card/);
});

test('compact student navigation has one destination column per route', () => {
  assert.match(student, /@media\(max-width:900px\)/);
  assert.match(student, /\.student-shell \.sidebar,\.student-shell \.sidebar-scrim\{display:none!important\}/);
  assert.match(student, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(student, /\.student-shell \.workspace-menu\{display:none\}/);
});

test('teacher drawer and JavaScript use the same adaptive breakpoint', () => {
  assert.match(app, /matchMedia\('\(max-width: 900px\)'\)/);
  assert.match(teacher, /@media\(max-width:900px\)\{\.app-shell,\.sidebar-collapsed\{display:block\}/);
  assert.match(app, /compactNavigationQuery\.addEventListener\?\.\('change',closeMobileNav\)/);
});

test('compact navigation accounts for browser safe areas', () => {
  assert.match(student, /env\(safe-area-inset-bottom\)/);
  assert.match(teacher, /env\(safe-area-inset-left\)/);
  assert.match(teacher, /env\(safe-area-inset-right\)/);
});
