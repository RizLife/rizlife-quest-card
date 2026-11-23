import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const notifications = readFileSync(new URL('../public/teacher-notifications.js', import.meta.url), 'utf8');
const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

test('verification rate and completed-student count remain distinct', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function teacherOverviewStats(', 'function teacherOverview(){'), context);
  const result = vm.runInContext(`teacherOverviewStats({
    students:[{id:'a',taskCount:4,verified:4},{id:'b',taskCount:4,verified:2},{id:'c',taskCount:0,verified:0}],
    queue:[{id:1}],reviews:[{status:'rejected'},{status:'submitted'}]
  })`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    total:3,completed:1,returned:1,verified:6,possible:8,percent:75,pending:1
  });
});

test('a student enrolled in two sections is counted once', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function teacherOverviewStats(', 'function teacherOverview(){'), context);
  const result = vm.runInContext(`teacherOverviewStats({
    students:[{id:'a',taskCount:2,verified:2},{id:'a',taskCount:3,verified:2},{id:'b',taskCount:1,verified:1}],
    queue:[],reviews:[]
  })`, context);
  assert.equal(result.total, 2);
  assert.equal(result.completed, 1);
  assert.equal(result.percent, 83);
});

test('review filters keep pending, verified, and returned records separate', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function teacherReviewItems(', 'function teacherReviews(){'), context);
  const rows = [
    {id:1,status:'submitted',student_name:'Alex',title:'Quest A',submitted_at:'2026-01-01'},
    {id:2,status:'verified',student_name:'Bea',title:'Quest B',submitted_at:'2026-01-02'},
    {id:3,status:'rejected',student_name:'Alex',title:'Quest C',submitted_at:'2026-01-03'}
  ];
  context.rows = rows;
  const ids = expression => Array.from(vm.runInContext(expression, context), item => item.id);
  assert.deepEqual(ids("teacherReviewItems(rows,'pending','','oldest','all')"), [1]);
  assert.deepEqual(ids("teacherReviewItems(rows,'verified','','oldest','all')"), [2]);
  assert.deepEqual(ids("teacherReviewItems(rows,'returned','Alex','oldest','all')"), [3]);
  assert.deepEqual(ids("teacherReviewItems(rows,'all','','newest','all')"), [3,2,1]);
});

test('review section filter works with status, search, and sorting', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function teacherReviewItems(', 'function teacherReviews(){'), context);
  const rows = [
    {id:1,section_id:10,status:'submitted',student_name:'Alex',title:'Quest A',submitted_at:'2026-01-01'},
    {id:2,section_id:20,status:'submitted',student_name:'Bea',title:'Quest B',submitted_at:'2026-01-02'},
    {id:3,section_id:10,status:'verified',student_name:'Alex',title:'Quest C',submitted_at:'2026-01-03'}
  ];
  context.rows=rows;
  const ids = expression => Array.from(vm.runInContext(expression, context), item => item.id);
  assert.deepEqual(ids("teacherReviewItems(rows,'all','','oldest','10')"), [1,3]);
  assert.deepEqual(ids("teacherReviewItems(rows,'pending','Alex','newest','10')"), [1]);
});

test('Review Desk summary uses matching status filters', () => {
  assert.match(app, /\['all','Total submissions'\],\['pending','Pending reviews'\],\['returned','Returned'\],\['verified','Completed'\]/);
  assert.match(app, /onclick="setReviewStatus\('\$\{key\}'\)"/);
});

test('reading a notification changes unread count without changing the review queue', () => {
  const context = vm.createContext({state:{teacher:{
    queue:[{id:9}],notifications:[{id:9},{id:10}],notificationReadIds:[10]
  }}});
  vm.runInContext(notifications.slice(0, notifications.indexOf('function notificationBell()')), context);
  assert.equal(vm.runInContext('unreadNotifications().length', context), 1);
  vm.runInContext('state.teacher.notificationReadIds.push(9)', context);
  assert.equal(vm.runInContext('unreadNotifications().length', context), 0);
  assert.equal(context.state.teacher.queue.length, 1);
});

test('changing sections replaces the teacher dashboard scope', async () => {
  const state = { sectionId:1, studentPage:3, reviewPage:2, tasks:{quests:[]}, teacher:{ section:{id:1} } };
  let requested = '';
  let rendered = 0;
  const context = vm.createContext({
    state,
    localStorage:{ setItem:() => {} },
    contentSkeleton:() => '',
    shell:() => {},
    api:async path => { requested=path; return { section:{id:2}, queue:[], students:[] }; },
    route:() => { rendered++; },
    errorScreen:() => {}
  });
  vm.runInContext(extract('async function changeSection(', 'function teacherOverviewStats('), context);
  await vm.runInContext('changeSection(2)', context);
  assert.equal(requested, '/teacher/dashboard?sectionId=2');
  assert.equal(state.teacher.section.id, 2);
  assert.equal(state.tasks, null);
  assert.equal(state.reviewPage, 1);
  assert.equal(rendered, 1);
});

test('a review decision cannot be sent twice while saving', async () => {
  const source = extract('async function decideSubmission(button){', 'function teacherSections(){');
  let resolveRequest;
  const pendingRequest = new Promise(resolve => { resolveRequest=resolve; });
  let writes = 0;
  const button = { disabled:false, textContent:'' };
  const state = { sectionId:1, pendingReviewDecision:{id:9,status:'verified',feedback:'',sectionId:1}, teacher:{} };
  const context = vm.createContext({
    state, window:{},
    api:async path => {
      if (path.startsWith('/teacher/submissions/')) { writes++; await pendingRequest; return {ok:true}; }
      return {queue:[],reviews:[]};
    },
    closeModal:() => {}, showToast:() => {}, route:() => {}
  });
  vm.runInContext(source, context);
  context.button=button;
  const first=vm.runInContext('decideSubmission(button)', context);
  const second=vm.runInContext('decideSubmission(button)', context);
  assert.equal(writes, 1);
  resolveRequest();
  await Promise.all([first,second]);
});
