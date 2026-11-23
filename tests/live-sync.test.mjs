import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/live-sync.js', import.meta.url), 'utf8');

function workspace(role) {
  let renders = 0;
  let requests = 0;
  let modal = false;
  let hidden = false;
  let editing = false;
  let response = {};
  const state = {
    user:{ id:'u1', role, name:'Alex', avatarUrl:'https://storage/avatar.jpg?token=old' },
    student:{ quests:[] }, studentClasses:{ classes:[] },
    sections:[{ id:1, name:'Class A' }], sectionId:1,
    teacher:{ students:[], queue:[], taskCount:0 },
    tasks:{ quests:[] }, page:'overview'
  };
  const listeners = {};
  const document = {
    get hidden() { return hidden; },
    querySelector: () => modal ? {} : null,
    activeElement:{ matches:() => editing },
    addEventListener:(name, callback) => { listeners[name] = callback; }
  };
  const window = {
    scrollY:0, scrollTo:() => {},
    addEventListener:(name, callback) => { listeners[name] = callback; }
  };
  const context = vm.createContext({
    state, document, window, navigator:{ onLine:true },
    localStorage:{ setItem:() => {} },
    api:async path => { requests++; return response[path]; },
    route:() => { renders++; },
    signOut:() => {},
    setInterval:() => 1, setTimeout:callback => callback(),
    console
  });
  vm.runInContext(source, context);
  return {
    state, context, listeners,
    setResponse:value => { response = value; },
    setModal:value => { modal = value; },
    setHidden:value => { hidden = value; },
    setEditing:value => { editing = value; },
    get renders() { return renders; },
    get requests() { return requests; },
    refresh:() => vm.runInContext('refreshLiveData()', context)
  };
}

test('student data updates once, without redrawing for a renewed signed URL', async () => {
  const app = workspace('student');
  app.setResponse({
    '/me':{ user:{ id:'u1', role:'student', name:'Alex', avatarUrl:'https://storage/avatar.jpg?token=new' } },
    '/student/card':{ quests:[{ id:1, submission:{ status:'verified' } }] },
    '/student/classes':{ classes:[{ id:1, classmates:[] }] }
  });
  await app.refresh();
  assert.equal(app.state.student.quests[0].submission.status, 'verified');
  assert.equal(app.renders, 1);
  await app.refresh();
  assert.equal(app.renders, 1);
});

test('teacher roster and review queue update while edits remain undisturbed', async () => {
  const app = workspace('teacher');
  app.setResponse({
    '/me':{ user:{ id:'u1', role:'teacher', name:'Alex', avatarUrl:'https://storage/avatar.jpg?token=new' } },
    '/teacher/sections':{ sections:[{ id:1, name:'Class A' }] },
    '/teacher/dashboard?sectionId=1':{ students:[{ id:'s1' }], queue:[{ id:10 }], taskCount:1 }
  });
  app.setModal(true);
  await app.refresh();
  assert.equal(app.requests, 0);
  app.setModal(false);
  await app.refresh();
  assert.equal(app.state.teacher.queue.length, 1);
  assert.equal(app.renders, 1);
  assert.equal(app.state.tasks, null);
});

test('hidden workspaces do not poll', async () => {
  const app = workspace('student');
  app.setHidden(true);
  await app.refresh();
  assert.equal(app.requests, 0);
});

test('new profile data waits for typing to finish before updating the view', async () => {
  const app = workspace('student');
  app.setEditing(true);
  app.setResponse({
    '/me':{ user:{ id:'u1', role:'student', name:'Updated Name', avatarUrl:'https://storage/new.jpg?token=one' } },
    '/student/card':{ quests:[] },
    '/student/classes':{ classes:[] }
  });
  await app.refresh();
  assert.equal(app.state.user.name, 'Updated Name');
  assert.equal(app.renders, 0);
  app.setEditing(false);
  vm.runInContext('flushLiveRender()', app.context);
  assert.equal(app.renders, 1);
});
