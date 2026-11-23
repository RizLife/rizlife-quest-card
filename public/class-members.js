function classmateCard(classmate) {
  return `<article class="classmate-card ${classmate.isCurrentUser ? 'current-student' : ''}">${avatarMarkup(classmate, 'classmate', `${classmate.name}'s profile picture`)}<div><b>${escapeHtml(classmate.name)}</b><span>${classmate.isCurrentUser ? 'You' : 'Classmate'}</span></div></article>`;
}

function previewClassmates(classroom) {
  const classmates = classroom.classmates || [];
  const shown = classmates.slice(0, 3);
  const self = classmates.find(classmate => classmate.isCurrentUser);
  if (self && !shown.includes(self)) shown[2] = self;
  return shown;
}

let memberListSectionId = null;
let memberListSearch = '';
let memberListPage = 1;

function openClassMembers(sectionId) {
  const classroom = state.studentClasses?.classes?.find(item => Number(item.id) === Number(sectionId));
  if (!classroom) return showToast('This class is no longer available.', 'error');
  memberListSectionId = Number(sectionId);
  memberListSearch = '';
  memberListPage = 1;
  openModal(`${dialogHeader('Learning community', `${classroom.name} members`)}<p class="dialog-description">Teacher: <strong>${escapeHtml(classroom.teacherName)}</strong> · ${classroom.classmateCount} students</p><label class="form-field class-member-search"><span>Find a classmate</span><input id="class-member-search" type="search" placeholder="Search by name" autocomplete="off" oninput="searchClassMembers(this.value)"></label><p class="class-member-count" id="class-member-count" aria-live="polite"></p><div id="class-member-results" class="class-member-results"></div><div class="dialog-actions"><button type="button" class="button secondary" onclick="closeModal()">Close</button></div>`, true);
  renderClassMembers();
  document.querySelector('#class-member-search')?.focus();
}

function searchClassMembers(value) {
  memberListSearch = value.trim().toLocaleLowerCase();
  memberListPage = 1;
  renderClassMembers();
}

function showMoreClassMembers() {
  memberListPage++;
  renderClassMembers();
}

function renderClassMembers() {
  const classroom = state.studentClasses?.classes?.find(item => Number(item.id) === memberListSectionId);
  const results = document.querySelector('#class-member-results');
  if (!classroom || !results) return;
  const matches = classroom.classmates.filter(classmate => classmate.name.toLocaleLowerCase().includes(memberListSearch));
  const visible = matches.slice(0, memberListPage * 24);
  document.querySelector('#class-member-count').textContent = `${matches.length} of ${classroom.classmateCount} students`;
  results.innerHTML = matches.length
    ? `<div class="class-member-grid">${visible.map(classmateCard).join('')}</div>${visible.length < matches.length ? '<button type="button" class="button secondary class-member-more" onclick="showMoreClassMembers()">Show more members</button>' : ''}`
    : '<p class="class-member-empty">No classmates match that name.</p>';
}
