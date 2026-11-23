import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/class-members.js', import.meta.url), 'utf8');

function membersWorkspace(total = 120) {
  const classmates = Array.from({ length:total }, (_, index) => ({
    name:`Student ${String(index + 1).padStart(3, '0')}`,
    avatarUrl:null,
    isCurrentUser:index === total - 1
  }));
  const classroom = { id:7, name:'IT242', teacherName:'Teacher', classmateCount:total, classmates };
  const results = { innerHTML:'' };
  const count = { textContent:'' };
  const search = { focus:() => {} };
  const document = { querySelector:selector => ({
    '#class-member-results':results,
    '#class-member-count':count,
    '#class-member-search':search
  })[selector] || null };
  const context = vm.createContext({
    state:{ studentClasses:{ classes:[classroom] } },
    document,
    avatarMarkup:user => `<span>${user.name}</span>`,
    escapeHtml:value => value,
    dialogHeader:() => '',
    openModal:() => {},
    showToast:() => {}
  });
  vm.runInContext(source, context);
  return { context, classroom, results, count };
}

test('class preview stays compact and includes the signed-in student', () => {
  const app = membersWorkspace();
  const preview = vm.runInContext('previewClassmates(state.studentClasses.classes[0])', app.context);
  assert.equal(preview.length, 3);
  assert.equal(preview.at(-1).isCurrentUser, true);
});

test('member dialog pages and searches a large class list', () => {
  const app = membersWorkspace();
  vm.runInContext('openClassMembers(7)', app.context);
  assert.equal((app.results.innerHTML.match(/classmate-card/g) || []).length, 24);
  assert.match(app.results.innerHTML, /Show more members/);
  vm.runInContext('showMoreClassMembers()', app.context);
  assert.equal((app.results.innerHTML.match(/classmate-card/g) || []).length, 48);
  vm.runInContext("searchClassMembers('Student 120')", app.context);
  assert.equal((app.results.innerHTML.match(/classmate-card/g) || []).length, 1);
  assert.equal(app.count.textContent, '1 of 120 students');
});
