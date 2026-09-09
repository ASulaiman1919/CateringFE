import { signup, login, logout, getUser, onAuthChange, handleAuthCallback, requestPasswordRecovery, updateUser } from '@netlify/identity';
import { orderLines, totalLabel, scheduleLabel } from './order-model.mjs';

const dialog = document.createElement('dialog');
dialog.className = 'order-dialog account-dialog';
dialog.setAttribute('aria-labelledby', 'account-title');
dialog.innerHTML = `
  <header class="dialog-header"><div><p class="eyebrow">Degi Kitchen</p><h2 id="account-title">Your account</h2></div><button type="button" class="icon-button" data-account-close aria-label="Close account" title="Close account"><span class="icon icon-x" aria-hidden="true"></span></button></header>
  <div class="account-body">
    <div data-account-auth>
      <div class="account-tabs" role="tablist" aria-label="Account access"><button role="tab" type="button" data-auth-mode="login" aria-selected="true">Sign in</button><button role="tab" type="button" data-auth-mode="signup" aria-selected="false">Create account</button></div>
      <form data-auth-form><div class="form-field" data-signup-name hidden><label for="account-name">Full name</label><input id="account-name" autocomplete="name" maxlength="120"></div><div class="form-field"><label for="account-email">Email</label><input id="account-email" type="email" autocomplete="username" required maxlength="254"></div><div class="form-field" data-password-field><label for="account-password">Password</label><input id="account-password" type="password" autocomplete="current-password" required maxlength="128"></div><button class="button button-green" type="submit" data-auth-submit>Sign in</button></form>
      <button class="text-link" type="button" data-account-forgot>Forgot password?</button>
      <p class="form-note" data-account-privacy>Accounts use Netlify Identity. Your password is never sent to the kitchen. You can also order as a guest.</p>
    </div>
    <div data-account-member hidden><p data-member-email></p><div class="account-tabs" role="tablist" aria-label="Your account"><button type="button" role="tab" aria-selected="true" data-member-view="requests">My requests</button><button type="button" role="tab" aria-selected="false" data-member-view="profile">Contact details</button></div>
      <section data-member-requests><div data-order-history></div><button type="button" class="text-link" data-refresh-history>Refresh requests</button></section>
      <section data-member-profile hidden><form data-profile-form><div class="form-field"><label for="profile-name">Full name</label><input id="profile-name" autocomplete="name" maxlength="120" required></div><div class="form-field"><label for="profile-phone">Phone (optional)</label><input id="profile-phone" type="tel" autocomplete="tel" maxlength="40"></div><div class="form-field"><label for="profile-city">City (optional)</label><input id="profile-city" autocomplete="address-level2" maxlength="160"></div><button class="button button-green" type="submit">Save contact details</button></form><button class="text-link" data-change-password type="button">Change password</button><details class="account-delete"><summary>Delete account</summary><p class="form-note">Deletes your login and account history. Requests already sent to the kitchen remain in its business records.</p><button class="text-link" type="button" data-delete-account>Delete my account</button></details></section>
      <button class="text-link" type="button" data-account-logout>Sign out</button>
    </div>
    <form data-reset-form hidden><div class="form-field"><label for="account-new-password">New password</label><input id="account-new-password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div><p class="form-note">At least 12 characters.</p><button type="submit" class="button button-green">Save new password</button></form>
    <p class="form-status" role="status" data-account-status></p>
  </div>`;
document.body.append(dialog);
const find = selector => dialog.querySelector(selector);
let currentUser = null;
let mode = 'login';
let busy = false;
let lastOpener;
let historyVersion = 0;
const status = find('[data-account-status]');

function setBusy(value) {
  busy = value;
  dialog.querySelectorAll('button:not([data-account-close])').forEach(button => { button.disabled = value; });
}
function setMode(next) {
  mode = next;
  status.textContent = '';
  find('[data-account-auth]').hidden = false;
  find('[data-account-member]').hidden = true;
  find('[data-reset-form]').hidden = true;
  find('[data-signup-name]').hidden = mode !== 'signup';
  find('#account-name').required = mode === 'signup';
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
  find('[data-member-profile]').hidden = view !== 'profile';
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
      article.append(heading, meta, schedule, list, total, again);
      container.append(article);
    }
  } catch (error) { if (version === historyVersion) container.textContent = error.message; }
}
async function applyUser(user) {
  const changed = currentUser?.id !== user?.id;
  currentUser = user;
  if (changed) { historyVersion++; find('[data-order-history]').replaceChildren(); }
  document.querySelectorAll('[data-account-open]').forEach(button => {
    button.setAttribute('aria-label', user ? 'My account' : 'Sign in or create account');
    button.title = user ? 'My account' : 'Sign in or create account';
  });
  find('[data-account-auth]').hidden = !!user;
  find('[data-account-member]').hidden = !user;
  find('[data-reset-form]').hidden = true;
  if (user) {
    find('[data-member-email]').textContent = user.email;
    find('#profile-name').value = user.name || '';
    find('#profile-phone').value = user.userMetadata?.phone || '';
    find('#profile-city').value = user.userMetadata?.city || '';
    memberView('requests');
    if (dialog.open) await refreshHistory();
  } else setMode('login');
  document.dispatchEvent(new CustomEvent('degi:account-change', { detail: { user } }));
}
function openAccount() {
  lastOpener = document.activeElement;
  if (!dialog.open) dialog.showModal();
  if (currentUser) refreshHistory();
}
document.querySelectorAll('[data-account-open]').forEach(button => button.addEventListener('click', openAccount));
find('[data-account-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { find('#account-password').value = ''; find('#account-new-password').value = ''; lastOpener?.focus(); });
dialog.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));
dialog.querySelectorAll('[data-member-view]').forEach(button => button.addEventListener('click', () => memberView(button.dataset.memberView)));
find('[data-account-forgot]').addEventListener('click', () => setMode('recovery'));
find('[data-change-password]').addEventListener('click', resetPasswordView);
find('[data-refresh-history]').addEventListener('click', refreshHistory);
find('[data-auth-form]').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !event.currentTarget.reportValidity()) return;
  setBusy(true);
  status.textContent = 'Please wait...';
  const email = find('#account-email').value.trim();
  try {
    if (mode === 'signup') {
      await signup(email, find('#account-password').value, { full_name: find('#account-name').value.trim() });
      status.textContent = 'Check your email to verify your account, then return here to sign in.';
    } else if (mode === 'recovery') {
      await requestPasswordRecovery(email);
      status.textContent = 'If an account exists for that email, a reset link is on its way.';
    } else {
      await applyUser(await login(email, find('#account-password').value));
      status.textContent = 'Signed in.';
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
    await applyUser(await updateUser({ data: { full_name: find('#profile-name').value.trim(), phone: find('#profile-phone').value.trim(), city: find('#profile-city').value.trim() } }));
    memberView('profile');
    status.textContent = 'Contact details saved.';
  } catch { status.textContent = 'Your details could not be saved. Please try again.'; }
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
find('[data-delete-account]').addEventListener('click', async () => {
  if (busy || !window.confirm('Permanently delete your customer login and account history? Requests already sent to the kitchen remain in its business records.')) return;
  setBusy(true);
  try {
    const response = await fetch('/api/customer-account', { method: 'DELETE' });
    if (!response.ok) throw new Error();
    await logout();
    await applyUser(null);
    status.textContent = 'Your account has been deleted.';
  } catch { status.textContent = 'Account deletion could not be confirmed. Please try again or contact the kitchen.'; }
  finally { setBusy(false); }
});
onAuthChange((event, user) => {
  if (event === 'TOKEN_REFRESH') { currentUser = user; return; }
  applyUser(user).then(() => { if (event === 'recovery') { openAccount(); resetPasswordView(); } });
});
window.DegiAccount = { get user() { return currentUser; }, open: openAccount, refreshHistory };
window.DegiAccount.ready = (async () => {
  try {
    const callback = await handleAuthCallback();
    await applyUser(await getUser());
    if (callback) {
      openAccount();
      if (callback.type === 'recovery') resetPasswordView();
      else status.textContent = 'Your email is verified and you are signed in.';
    }
  } catch { openAccount(); status.textContent = 'This account link is invalid or expired. Sign in or request a new password reset.'; }
})();
