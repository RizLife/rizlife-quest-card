let profileCropData = null;
let profileCropSession = null;

function resetProfileCropSelection() {
  profileCropData = null;
  const input = document.querySelector('#profile-avatar-file');
  if (input) input.value = '';
  const summary = document.querySelector('.profile-summary .avatar');
  if (summary && typeof avatarContent === 'function') summary.innerHTML = avatarContent(state.user);
  const status = document.querySelector('#profile-crop-status');
  if (status) status.textContent = '';
}

function closeProfileCrop(accepted = false) {
  document.querySelector('#profile-crop-layer')?.remove();
  document.removeEventListener('keydown', profileCropEscape, true);
  if (profileCropSession?.url) URL.revokeObjectURL(profileCropSession.url);
  profileCropSession = null;
  if (!accepted) resetProfileCropSelection();
}

function profileCropEscape(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeProfileCrop();
}

async function openProfileCrop(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    resetProfileCropSelection();
    showToast('Choose a JPG, PNG, or WebP image.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    resetProfileCropSelection();
    showToast('Choose an image smaller than 10 MB.', 'error');
    return;
  }
  closeProfileCrop(true);
  profileCropData = null;
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    resetProfileCropSelection();
    showToast('The image could not be opened.', 'error');
    return;
  }
  if (image.width < 64 || image.height < 64) {
    URL.revokeObjectURL(url);
    resetProfileCropSelection();
    showToast('Choose an image at least 64 × 64 pixels.', 'error');
    return;
  }
  if (!input.isConnected) {
    URL.revokeObjectURL(url);
    return;
  }
  const layer = document.createElement('div');
  layer.id = 'profile-crop-layer';
  layer.className = 'profile-crop-layer';
  layer.innerHTML = `<section class="profile-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title" tabindex="-1"><div class="profile-crop-head"><div><span class="kicker">Profile picture</span><h2 id="profile-crop-title">Position your photo</h2></div><button class="icon-btn" type="button" onclick="closeProfileCrop()" aria-label="Close crop editor">×</button></div><p>Drag to position your photo within the circle, then adjust the zoom.</p><div class="profile-crop-stage"><canvas id="profile-crop-canvas" width="512" height="512" aria-label="Profile photo crop preview"></canvas><div class="profile-crop-mask" aria-hidden="true"></div></div><label class="profile-crop-zoom" for="profile-crop-range"><span>Zoom</span><input id="profile-crop-range" type="range" min="1" max="3" step="0.01" value="1"><span aria-hidden="true">＋</span></label><div class="dialog-actions"><button class="button secondary" type="button" onclick="closeProfileCrop()">Cancel</button><button class="button primary" type="button" onclick="applyProfileCrop()">Use this photo</button></div></section>`;
  layer.addEventListener('click', event => { if (event.target === layer) closeProfileCrop(); });
  document.body.appendChild(layer);
  document.addEventListener('keydown', profileCropEscape, true);
  profileCropSession = { image, url, zoom:1, x:0, y:0, pointer:null, lastX:0, lastY:0 };
  const canvas = layer.querySelector('canvas');
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    profileCropSession.pointer = event.pointerId;
    profileCropSession.lastX = event.clientX;
    profileCropSession.lastY = event.clientY;
  });
  canvas.addEventListener('pointermove', event => {
    const crop = profileCropSession;
    if (!crop || crop.pointer !== event.pointerId) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    crop.x += (event.clientX - crop.lastX) * ratio;
    crop.y += (event.clientY - crop.lastY) * ratio;
    crop.lastX = event.clientX;
    crop.lastY = event.clientY;
    drawProfileCrop();
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { if (profileCropSession) profileCropSession.pointer = null; });
  layer.querySelector('#profile-crop-range').addEventListener('input', event => {
    profileCropSession.zoom = Number(event.target.value);
    drawProfileCrop();
  });
  drawProfileCrop();
  layer.querySelector('.profile-crop-dialog').focus();
}

function drawProfileCrop() {
  const crop = profileCropSession;
  if (!crop) return;
  const canvas = document.querySelector('#profile-crop-canvas');
  const size = canvas.width;
  const scale = Math.max(size / crop.image.width, size / crop.image.height) * crop.zoom;
  const width = crop.image.width * scale, height = crop.image.height * scale;
  crop.x = Math.max((size - width) / 2, Math.min((width - size) / 2, crop.x));
  crop.y = Math.max((size - height) / 2, Math.min((height - size) / 2, crop.y));
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(crop.image, (size-width)/2+crop.x, (size-height)/2+crop.y, width, height);
}

function applyProfileCrop() {
  const canvas = document.querySelector('#profile-crop-canvas');
  if (!canvas) return;
  profileCropData = canvas.toDataURL('image/jpeg', .88);
  if (Math.floor(profileCropData.split(',')[1].length * 3 / 4) > 2 * 1024 * 1024) {
    showToast('This crop is too large. Choose a different photo.', 'error');
    return;
  }
  const summary = document.querySelector('.profile-summary .avatar');
  if (summary) summary.innerHTML = `<img src="${profileCropData}" alt="">`;
  const status = document.querySelector('#profile-crop-status');
  if (status) status.textContent = 'Photo cropped and ready to save.';
  closeProfileCrop(true);
}
