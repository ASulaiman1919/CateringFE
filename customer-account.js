import { signup, login, logout, getUser, onAuthChange, handleAuthCallback, requestPasswordRecovery, updateUser } from '@netlify/identity';
import { orderLines, totalLabel, scheduleLabel, validateContact, customerContact } from './order-model.mjs';
import { downloadOrder } from './order-download.mjs';

const dialog = document.createElement('dialog');
dialog.className = 'order-dialog account-dialog';
dialog.setAttribute('aria-labelledby', 'account-title');
dialog.innerHTML = `
  <header class="dialog-header"><div><p class="eyebrow">Degi Kitchen</p><h2 id="account-title">Your account</h2></div><button type="button" class="icon-button" data-account-close aria-label="Close account" title="Close account"><span class="icon icon-x" aria-hidden="true"></span></button></header>
  <div class="account-body">
    <div data-account-auth>
      <div class="account-tabs" role="tablist" aria-label="Account access"><button role="tab" type="button" data-auth-mode="login" aria-selected="true">Sign in</button><button role="tab" type="button" data-auth-mode="signup" aria-selected="false">Create account</button></div>
      <form data-auth-form><div class="form-field" data-signup-name hidden><label for="account-name">Full name</label><input id="account-name" autocomplete="name" maxlength="120"></div><div class="form-field" data-signup-phone hidden><label for="account-phone">Phone</label><input id="account-phone" type="tel" autocomplete="tel" maxlength="40"></div><div class="form-field"><label for="account-email">Email</label><input id="account-email" type="email" autocomplete="username" required maxlength="254"></div><div class="form-field" data-password-field><label for="account-password">Password</label><input id="account-password" type="password" autocomplete="current-password" required maxlength="128"></div><button class="button button-green" type="submit" data-auth-submit>Sign in</button></form>
      <button class="text-link" type="button" data-account-forgot>Forgot password?</button>
      <button class="text-link" type="button" data-continue-guest>Continue as guest</button>
      <p class="form-note" data-account-privacy>Accounts use Netlify Identity. Your password is never sent to the kitchen. You can also order as a guest.</p>
    </div>
    <div data-account-member hidden><p data-member-email></p><div class="account-tabs" role="tablist" aria-label="Your account"><button type="button" role="tab" aria-selected="true" data-member-view="requests">My requests</button></div>
      <section data-member-requests><div data-order-history></div><button type="button" class="text-link" data-refresh-history>Refresh requests</button></section>
      <section data-member-profile hidden><form data-profile-form><div class="form-field"><label for="profile-name">Full name</label><input id="profile-name" autocomplete="name" maxlength="120" required></div><div class="form-field"><label for="profile-phone">Phone</label><input id="profile-phone" type="tel" autocomplete="tel" maxlength="40" required></div><button class="button button-green" type="submit">Save profile</button></form><button class="text-link" data-change-password type="button">Change password</button><details class="account-delete"><summary>Delete account</summary><p class="form-note">Deletes your login, photo, and account history. Requests already sent to the kitchen remain in its business records.</p><button class="text-link" type="button" data-delete-account>Delete my account</button></details></section>
      <button class="text-link" type="button" data-account-logout>Sign out</button>
    </div>
    <form data-reset-form hidden><div class="form-field"><label for="account-new-password">New password</label><input id="account-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div><p class="form-note">At least 12 characters.</p><button type="submit" class="button button-green">Save new password</button></form>
    <p class="form-status" role="status" data-account-status></p>
  </div>`;
document.body.append(dialog);
const popover = document.createElement('section');
popover.id = 'customer-menu'; popover.className = 'customer-menu'; popover.setAttribute('popover', 'auto'); popover.setAttribute('aria-label', 'Your profile');
popover.innerHTML = `<div class="profile-menu-heading"><div class="profile-avatar"><span class="icon icon-user" aria-hidden="true"></span><img alt="Your profile photo" data-profile-photo hidden></div><div><h2 data-profile-display-name></h2><p data-profile-display-email></p><p data-profile-display-phone></p></div></div><div class="profile-menu-actions"><button type="button" data-profile-edit><span class="icon icon-edit" aria-hidden="true"></span>Edit profile</button><button type="button" data-open-requests><span class="icon icon-bag" aria-hidden="true"></span>My requests</button></div><div data-popover-editor hidden><div class="profile-photo-actions"><label class="text-link" for="profile-photo-input"><span class="icon icon-camera" aria-hidden="true"></span>Change photo</label><input id="profile-photo-input" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp"><button type="button" class="icon-button" data-remove-photo title="Remove photo" aria-label="Remove profile photo" hidden><span class="icon icon-trash" aria-hidden="true"></span></button></div><p class="form-note">Email stays linked to this account.</p></div><p class="form-status" role="status" data-profile-status></p><button type="button" class="profile-signout" data-menu-logout>Sign out</button>`;
document.body.append(popover);
const find = selector => dialog.querySelector(selector) || popover.querySelector(selector);
find('[data-popover-editor]').append(find('[data-member-profile]'));
find('[data-member-profile]').hidden = false;
let currentUser = null;
let mode = 'login';
let busy = false;
let lastOpener;
let historyVersion = 0;
const status = find('[data-account-status]');
const profileStatus = find('[data-profile-status]');
let avatarURL = null;
let avatarVersion = 0;

function setAvatar(blob) {
  if (avatarURL) URL.revokeObjectURL(avatarURL);
  avatarURL = blob ? URL.createObjectURL(blob) : null;
  const photo = find('[data-profile-photo]'); photo.hidden = !avatarURL;
  if (avatarURL) photo.src = avatarURL; else photo.removeAttribute('src');
  find('[data-remove-photo]').hidden = !avatarURL;
  const button = document.querySelector('.header-tools [data-account-open]');
  let thumbnail = button?.querySelector('img');
  if (avatarURL && button) {
    if (!thumbnail) { thumbnail = document.createElement('img'); thumbnail.alt = ''; thumbnail.className = 'account-thumbnail'; button.append(thumbnail); }
    thumbnail.src = avatarURL;
  } else thumbnail?.remove();
  if (button) button.classList.toggle('has-avatar', !!avatarURL);
}
async function loadAvatar() {
  const version = ++avatarVersion;
  try {
    const response = await fetch('/api/customer-avatar', { cache: 'no-store' });
    if (!response.ok) return;
    const blob = await response.blob();
    if (version === avatarVersion && currentUser) setAvatar(blob);
  } catch { /* The account remains usable without a photo. */ }
}
find('#profile-photo-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file || busy || !currentUser) return;
  setBusy(true); profileStatus.textContent = 'Saving photo...';
  let bitmap;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP photo under 12 MB.');
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 60000000) throw new Error('Please choose a smaller photo.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const size = Math.min(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .85));
    if (!blob || blob.type !== 'image/webp') throw new Error('This browser could not prepare your photo.');
    const response = await fetch('/api/customer-avatar', { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob });
    if (!response.ok) throw new Error('Your photo could not be saved. Please try again.');
    avatarVersion++; setAvatar(blob); profileStatus.textContent = 'Photo saved.';
  } catch (error) { profileStatus.textContent = error.message || 'That photo could not be read.'; }
  finally { bitmap?.close(); event.target.value = ''; setBusy(false); }
});
find('[data-remove-photo]').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    const response = await fetch('/api/customer-avatar', { method: 'DELETE' });
    if (!response.ok) throw new Error();
    avatarVersion++; setAvatar(null); profileStatus.textContent = 'Photo removed.';
  } catch { profileStatus.textContent = 'Your photo could not be removed. Please try again.'; }
  finally { setBusy(false); }
});

function setBusy(value) {
  busy = value;
  dialog.querySelectorAll('button:not([data-account-close])').forEach(button => { button.disabled = value; });
  popover.querySelectorAll('button, input').forEach(control => { control.disabled = value; });
}
function setMode(next) {
  mode = next;
  status.textContent = '';
  find('[data-account-auth]').hidden = false;
  find('[data-account-member]').hidden = true;
  find('[data-reset-form]').hidden = true;
  find('[data-signup-name]').hidden = mode !== 'signup';
  find('#account-name').required = mode === 'signup';
  find('[data-signup-phone]').hidden = mode !== 'signup';
  find('#account-phone').required = mode === 'signup';
  find('[data-password-field]').hidden = mode === 'recovery';
  find('#account-password').required = mode !== 'recovery';
  find('#account-password').minLength = mode === 'signup' ? 12 : 1;
  find('#account-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  find('[data-auth-submit]').textContent = mode === 'signup' ? 'Create account' : mode === 'recovery' ? 'Send reset email' : 'Sign in';
  find('[data-account-forgot]').hidden = mode === 'recovery';
  dialog.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.authMode === mode)));
}
function memberView(view) {
  find('[data-member-requests]').hidden = view !== 'requests';
  dialog.querySelectorAll('[data-member-view]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.memberView === view)));
}
function resetPasswordView() {
  find('[data-account-auth]').hidden = true;
  find('[data-account-member]').hidden = true;
  find('[data-reset-form]').hidden = false;
  status.textContent = 'Choose a new password for your account.';
}
async function refreshHistory() {
  const version = ++historyVersion;
  const id = currentUser?.id;
  const container = find('[data-order-history]');
  container.textContent = 'Loading your requests...';
  try {
    const response = await fetch('/api/customer-account', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load requests.');
    if (version !== historyVersion || currentUser?.id !== id) return;
    container.replaceChildren();
    if (!result.orders.length) container.textContent = 'No requests yet.';
    for (const order of result.orders) {
      const article = document.createElement('article');
      article.className = 'account-order';
      const heading = document.createElement('h3');
      heading.textContent = order.reference;
      const meta = document.createElement('p');
      meta.className = 'form-note';
      meta.textContent = `${order.status}. Price and availability await kitchen confirmation.`;
      const schedule = document.createElement('p');
      schedule.textContent = scheduleLabel(order.details);
      const list = document.createElement('pre');
      list.className = 'order-text-summary';
      list.textContent = orderLines(order.items);
      const total = document.createElement('p');
      total.className = 'order-total';
      total.textContent = 'Total quantities: ' + totalLabel(order.items);
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'text-link';
      again.textContent = 'Order these again';
      again.addEventListener('click', () => {
        if (window.DegiOrder?.reorder(order.items)) dialog.close();
      });
      const download = document.createElement('button'); download.type = 'button'; download.className = 'text-link'; download.textContent = 'Download summary';
      download.addEventListener('click', () => downloadOrder(order));
      article.append(heading, meta, schedule, list, total, again, download);
      container.append(article);
    }
  } catch (error) { if (version === historyVersion) container.textContent = error.message; }
}
async function applyUser(user) {
  const changed = currentUser?.id !== user?.id;
  currentUser = user;
  if (changed) { historyVersion++; avatarVersion++; find('[data-order-history]').replaceChildren(); setAvatar(null); }
  document.querySelectorAll('[data-account-open]').forEach(button => {
    button.setAttribute('aria-label', user ? 'My account' : 'Sign in or create account');
    button.title = user ? 'My account' : 'Sign in or create account';
    button.setAttribute('aria-haspopup', user ? 'true' : 'dialog');
    button.setAttribute('aria-expanded', 'false');
  });
  find('[data-account-auth]').hidden = !!user;
  find('[data-account-member]').hidden = !user;
  find('[data-reset-form]').hidden = true;
  if (user) {
    find('[data-member-email]').textContent = user.email;
    find('#profile-name').value = customerContact(user).name;
    find('#profile-phone').value = user.userMetadata?.phone || '';
    find('[data-profile-display-name]').textContent = customerContact(user).name || 'Your account';
    find('[data-profile-display-email]').textContent = user.email;
    find('[data-profile-display-phone]').textContent = user.userMetadata?.phone || 'Phone not added';
    if (changed) loadAvatar();
    memberView('requests');
    if (dialog.open) await refreshHistory();
  } else { popover.hidePopover(); setMode('login'); }
  document.dispatchEvent(new CustomEvent('degi:account-change', { detail: { user } }));
}
function positionPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(350, innerWidth - 24);
  popover.style.width = width + 'px';
  popover.style.left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) + 'px';
  popover.style.top = Math.min(rect.bottom + 10, Math.max(12, innerHeight - 360)) + 'px';
  popover.style.maxHeight = `calc(100dvh - ${parseFloat(popover.style.top) + 12}px)`;
}
window.addEventListener('resize', () => {
  if (popover.matches(':popover-open')) positionPopover(lastOpener instanceof HTMLElement ? lastOpener : document.querySelector('[data-account-open]'));
});
function openAccount(forceDialog = false) {
  lastOpener = document.activeElement;
  if (currentUser && forceDialog !== true) {
    if (popover.matches(':popover-open')) { popover.hidePopover(); return; }
    find('[data-popover-editor]').hidden = true; profileStatus.textContent = '';
    positionPopover(lastOpener instanceof HTMLElement ? lastOpener : document.querySelector('[data-account-open]'));
    popover.showPopover(); return;
  }
  popover.hidePopover();
  if (!dialog.open) dialog.showModal();
  if (currentUser) {
    find('[data-account-auth]').hidden = true;
    find('[data-reset-form]').hidden = true;
    find('[data-account-member]').hidden = false;
    memberView('requests');
    status.textContent = '';
    refreshHistory();
  }
}
document.querySelectorAll('[data-account-open]').forEach(button => button.addEventListener('click', () => openAccount()));
popover.addEventListener('toggle', event => { document.querySelectorAll('[data-account-open]').forEach(button => button.setAttribute('aria-expanded', String(event.newState === 'open'))); });
function openProfile() {
  if (!currentUser) { openAccount(true); return; }
  if (!popover.matches(':popover-open')) openAccount();
  find('[data-popover-editor]').hidden = false;
  find('#profile-name').focus();
}
find('[data-profile-edit]').addEventListener('click', () => { find('[data-popover-editor]').hidden = !find('[data-popover-editor]').hidden; if (!find('[data-popover-editor]').hidden) find('#profile-name').focus(); });
find('[data-open-requests]').addEventListener('click', () => openAccount(true));
find('[data-continue-guest]').addEventListener('click', () => dialog.close());
find('[data-account-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { find('#account-password').value = ''; find('#account-new-password').value = ''; lastOpener?.focus(); });
dialog.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));
dialog.querySelectorAll('[data-member-view]').forEach(button => button.addEventListener('click', () => memberView(button.dataset.memberView)));
find('[data-account-forgot]').addEventListener('click', () => setMode('recovery'));
find('[data-change-password]').addEventListener('click', () => { openAccount(true); resetPasswordView(); });
find('[data-refresh-history]').addEventListener('click', refreshHistory);
find('[data-auth-form]').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !event.currentTarget.reportValidity()) return;
  setBusy(true);
  status.textContent = 'Please wait...';
  const email = find('#account-email').value.trim();
  try {
    if (mode === 'signup') {
      const contact = validateContact({ email, name: find('#account-name').value, phone: find('#account-phone').value });
      await signup(email, find('#account-password').value, { full_name: contact.name, phone: contact.phone });
      status.textContent = 'Check your email to verify your account, then return here to sign in.';
    } else if (mode === 'recovery') {
      await requestPasswordRecovery(email);
      status.textContent = 'If an account exists for that email, a reset link is on its way.';
    } else {
      await applyUser(await login(email, find('#account-password').value));
      status.textContent = 'Signed in.'; dialog.close();
    }
    find('#account-password').value = '';
  } catch {
    status.textContent = mode === 'login' ? 'Unable to sign in. Check your details and verify your email, or reset your password.' : mode === 'signup' ? 'Unable to create this account. Try signing in or resetting your password, or try again shortly.' : 'Unable to send the reset email. Please try again shortly.';
  } finally { setBusy(false); }
});
find('[data-profile-form]').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !event.currentTarget.reportValidity()) return;
  setBusy(true);
  try {
    const contact = validateContact({ email: currentUser.email, name: find('#profile-name').value, phone: find('#profile-phone').value });
    await applyUser(await updateUser({ data: { full_name: contact.name, phone: contact.phone } }));
    profileStatus.textContent = 'Profile saved.';
  } catch (error) { profileStatus.textContent = error.message?.startsWith('Please') ? error.message : 'Your details could not be saved. Please try again.'; }
  finally { setBusy(false); }
});
find('[data-reset-form]').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !event.currentTarget.reportValidity()) return;
  setBusy(true);
  try {
    await applyUser(await updateUser({ password: find('#account-new-password').value }));
    find('#account-new-password').value = '';
    status.textContent = 'Password updated.';
  } catch { status.textContent = 'Your password could not be updated. Please request a fresh reset link.'; }
  finally { setBusy(false); }
});
find('[data-account-logout]').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try { await logout(); await applyUser(null); status.textContent = 'Signed out.'; }
  catch { status.textContent = 'Please reload to finish signing out.'; }
  finally { setBusy(false); }
});
find('[data-menu-logout]').addEventListener('click', () => find('[data-account-logout]').click());
find('[data-delete-account]').addEventListener('click', async () => {
  if (busy || !window.confirm('Permanently delete your customer login and account history? Requests already sent to the kitchen remain in its business records.')) return;
  setBusy(true);
  try {
    const response = await fetch('/api/customer-account', { method: 'DELETE' });
    if (!response.ok) throw new Error();
    await logout();
    await applyUser(null);
    status.textContent = 'Your account has been deleted.';
  } catch { profileStatus.textContent = 'Account deletion could not be confirmed. Please try again or contact the kitchen.'; }
  finally { setBusy(false); }
});
onAuthChange((event, user) => {
  if (event === 'token_refresh') { currentUser = user; return; }
  applyUser(user).then(() => { if (event === 'recovery') { openAccount(true); resetPasswordView(); } });
});
window.DegiAccount = { get user() { return currentUser; }, open: openAccount, openProfile, refreshHistory };
let processingCallback = false;
async function processAccountLink() {
  if (processingCallback) return;
  processingCallback = true;
  try {
    const callback = await handleAuthCallback();
    await applyUser(await getUser());
    if (callback) {
      openAccount(true);
      if (callback.type === 'recovery') resetPasswordView();
      else status.textContent = callback.user ? 'Your email is verified and you are signed in.' : 'Please sign in to finish accessing your account.';
    }
  } catch { openAccount(); status.textContent = 'This account link is invalid or expired. Sign in or request a new password reset.'; }
  finally { processingCallback = false; }
}
window.DegiAccount.ready = processAccountLink();
window.addEventListener('hashchange', () => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (['confirmation_token', 'recovery_token', 'access_token', 'invite_token', 'email_change_token'].some(key => params.has(key))) processAccountLink();
});
