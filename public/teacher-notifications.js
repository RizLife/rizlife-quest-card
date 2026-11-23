function unreadNotifications() {
  const read = new Set(state.teacher?.notificationReadIds || []);
  return (state.teacher?.notifications || []).filter(item => !read.has(Number(item.id)));
}

function notificationBell() {
  const unread = unreadNotifications().length;
  return `<button type="button" class="teacher-notification-button" onclick="openNotificationPanel()" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">${icons.bell || icons.review}${unread ? `<span class="teacher-notification-badge">${unread > 99 ? '99+' : unread}</span>` : ''}</button>`;
}

function openNotificationPanel() {
  if (state.user?.role !== 'teacher') return;
  openModal('');
  renderNotificationPanel();
}

function renderNotificationPanel() {
  const dialog = document.querySelector('#modal .dialog');
  if (!dialog) return;
  const notifications = state.teacher?.notifications || [];
  const read = new Set(state.teacher?.notificationReadIds || []);
  const unread = unreadNotifications().length;
  dialog.innerHTML = `${dialogHeader('Review alerts', 'Notifications')}<div class="notification-panel-head"><p>${unread} unread · ${notifications.length} recent submissions</p>${unread ? '<button type="button" class="text-button" onclick="markAllNotificationsRead()">Mark all read</button>' : ''}</div>${notifications.length ? `<div class="teacher-notification-list">${notifications.map(item => `<button type="button" class="teacher-notification-item ${read.has(Number(item.id)) ? '' : 'unread'}" onclick="openNotificationReview(${Number(item.id)})"><span class="notification-status-dot" aria-hidden="true"></span><span><b>${escapeHtml(item.student_name)}</b><span>submitted ${escapeHtml(item.title)}</span><small>${escapeHtml(item.section_name || '')}${item.section_name ? ' · ' : ''}${formatDate(item.submitted_at)}${item.status === 'submitted' ? ' · Awaiting review' : ''}</small></span></button>`).join('')}</div>` : '<p class="notification-empty">New student submissions will appear here.</p>'}<div class="dialog-actions"><button type="button" class="button secondary" onclick="closeModal()">Close</button></div>`;
}

async function markNotificationsRead(ids) {
  if (!ids.length) return;
  try {
    const { readIds } = await api('/teacher/notifications/read', { method:'POST', body:JSON.stringify({ ids }) });
    state.teacher.notificationReadIds = readIds;
    renderNotificationPanel();
    if (state.page === 'overview') route();
  } catch (error) { showToast(error.message, 'error'); }
}

function markAllNotificationsRead() {
  void markNotificationsRead(unreadNotifications().map(item => Number(item.id)));
}

async function openNotificationReview(id) {
  if (!(state.teacher?.notificationReadIds || []).includes(id)) await markNotificationsRead([id]);
  closeModal();
  const review = (state.teacher?.notifications || []).find(item => Number(item.id) === Number(id));
  if (!review) return showToast('This submission is no longer available.', 'error');
  state.reviewStatus = review.status === 'submitted' ? 'pending' : review.status === 'rejected' ? 'returned' : 'verified';
  state.reviewSearch = '';
  state.reviewPage = 1;
  location.hash = 'reviews';
  route();
  openReview(id);
}
