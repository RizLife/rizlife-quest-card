import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('a saved teacher task appears in the current task list before a dashboard refetch', async () => {
  const quest = { id:42, title:'New task', description:'Instructions', requirement:'A response', active:true };
  const state = { user:{ role:'teacher' }, sectionId:7, page:'tasks', tasks:{ quests:[] }, teacher:{} };
  let rendered = [];
  const fields = { '#task-title':'New task', '#task-description':'Instructions', '#task-requirement':'A response' };
  const context = vm.createContext({
    state, document:{ querySelector:selector => ({ value:fields[selector] }) },
    api:async path => path === '/teacher/quests' ? { quest } : { students:[] },
    closeModal:() => {}, showToast:() => {}, console,
    route:() => { rendered = [...state.tasks.quests]; }
  });
  vm.runInContext(extract('function applySavedTask', 'function teacherReviews'), context);
  await vm.runInContext('saveTask({preventDefault(){},submitter:{disabled:false}},null)', context);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].title, 'New task');
});

test('a student submission changes the visible quest status as soon as it is saved', async () => {
  const submission = { id:9, quest_id:42, status:'submitted', evidence_type:'text', evidence:'My work' };
  const state = { student:{ quests:[{ id:42, title:'Quest', submission:null }] } };
  let renderedStatus = null;
  const context = vm.createContext({
    state,
    document:{ querySelector:selector => selector.includes('evidence-type') ? { value:'text' } : { value:'My work' } },
    api:async () => ({ submission }),
    closeModal:() => {}, showToast:() => {},
    route:() => { renderedStatus=state.student.quests[0].submission?.status; }
  });
  vm.runInContext(extract('async function submitQuest', 'function renderTeacher'), context);
  await vm.runInContext('submitQuest({preventDefault(){},submitter:{disabled:false,textContent:""}},42)', context);
  assert.equal(renderedStatus, 'submitted');
});
