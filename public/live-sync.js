// Vercel requests are short lived, so active workspaces check their authenticated
// API data while visible. Local tabs receive a change signal immediately.
const liveChannel = 'BroadcastChannel' in window ? new BroadcastChannel('rizlife-changes') : null;
let liveInFlight = false;
let livePendingRender = false;
let liveMutationEpoch = 0;
let liveLastRender = Date.now();
let liveMessageTimer = null;

function liveFingerprint(value) {
  return JSON.stringify(value, (key, item) => {
    if (typeof item === 'string' && ['avatarUrl', 'evidence_url'].includes(key)) return item.split('?')[0];
    return item;
  });
}

function publishLiveChange(kind = 'change') {
  liveMutationEpoch++;
  livePendingRender = false;
  const message = { kind, userId: state.user?.id, at: Date.now() };
  liveChannel?.postMessage(message);
  try { localStorage.setItem('rizlife-live-change', JSON.stringify(message)); } catch {}
}

function canRenderLive() {
  if (document.querySelector('#modal, #profile-crop-layer')) return false;
  const active = document.activeElement;
  return !active?.matches('input, textarea, select, [contenteditable="true"]');
}

function flushLiveRender() {
  if (!livePendingRender || !state.user || !canRenderLive()) return;
  livePendingRender = false;
  liveLastRender = Date.now();
  const scroll = window.scrollY;
  route();
  window.scrollTo(0, scroll);
}

async function refreshLiveData() {
  if (liveInFlight || !state.user || document.hidden || document.querySelector('#modal, #profile-crop-layer')) return;
  liveInFlight = true;
  const epoch = liveMutationEpoch;
  const userId = state.user.id;
  try {
    let nextUser, nextStudent, nextClasses, nextSections, nextTeacher, nextTasks;
    if (state.user.role === 'student') {
      const results = await Promise.all([api('/me'), api('/student/card'), api('/student/classes')]);
      nextUser = results[0].user;
      nextStudent = results[1];
      nextClasses = results[2];
    } else {
      const results = await Promise.all([api('/me'), api('/teacher/sections')]);
      nextUser = results[0].user;
      nextSections = results[1].sections;
      let sectionId = state.sectionId;
      if (sectionId !== 'all' && !nextSections.some(section => Number(section.id) === Number(sectionId))) {
        sectionId = nextSections.length > 1 ? 'all' : nextSections[0]?.id || null;
      }
      nextTeacher = sectionId ? await api(`/teacher/dashboard?sectionId=${sectionId}`) : { students:[], queue:[], recent:[], taskCount:0, section:null, sections:[] };
      if (state.page === 'tasks' && sectionId && sectionId !== 'all') nextTasks = await api(`/teacher/quests?sectionId=${sectionId}`);
      nextSections = { sections:nextSections, sectionId };
    }
    if (epoch !== liveMutationEpoch || !state.user || state.user.id !== userId) return;
    const oldData = state.user.role === 'student'
      ? [state.user, state.student, state.studentClasses]
      : [state.user, state.sections, state.sectionId, state.teacher, state.page === 'tasks' ? state.tasks : null];
    const newData = nextUser.role === 'student'
      ? [nextUser, nextStudent, nextClasses]
      : [nextUser, nextSections.sections, nextSections.sectionId, nextTeacher, state.page === 'tasks' ? nextTasks : null];
    const changed = liveFingerprint(oldData) !== liveFingerprint(newData);
    state.user = nextUser;
    if (nextUser.role === 'student') {
      state.student = nextStudent;
      state.studentClasses = nextClasses;
    } else {
      state.sections = nextSections.sections;
      state.sectionId = nextSections.sectionId;
      state.teacher = nextTeacher;
      if (nextTasks) state.tasks = nextTasks;
      else state.tasks = null;
    }
    if (changed || Date.now() - liveLastRender > 30 * 60 * 1000) {
      livePendingRender = true;
      flushLiveRender();
    }
  } catch (error) {
    // Keep the last working view during transient network failures. The next
    // interval or focus event retries; auth failures are handled by api().
    if (navigator.onLine && state.user) console.warn('Live update retry:', error.message);
  } finally {
    liveInFlight = false;
  }
}

function onLiveMessage(message) {
  if (!message || !state.user || message.userId !== state.user.id) return;
  if (message.kind === 'logout') { signOut(false); return; }
  clearTimeout(liveMessageTimer);
  liveMessageTimer = setTimeout(refreshLiveData, 300);
}

liveChannel?.addEventListener('message', event => onLiveMessage(event.data));
window.addEventListener('storage', event => {
  if (!liveChannel && event.key === 'rizlife-live-change' && event.newValue) {
    try { onLiveMessage(JSON.parse(event.newValue)); } catch {}
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveData(); });
window.addEventListener('focus', refreshLiveData);
document.addEventListener('focusout', () => setTimeout(flushLiveRender, 0));
window.addEventListener('online', refreshLiveData);
setInterval(refreshLiveData, 30000);
