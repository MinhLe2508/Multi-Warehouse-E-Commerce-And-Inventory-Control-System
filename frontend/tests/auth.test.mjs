import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(path, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => deps[id] ?? require(id), loaded, loaded.exports);
  return loaded.exports;
}
const { actionRequest, passwordError, apiErrorMessage } = load('../shared/lib/authContract.ts');
const token = 'a'.repeat(64);
test('account action payloads match backend DTOs and omit confirmPassword', () => {
  assert.deepEqual(actionRequest('staff-invitation', token, 'Password1'), { path: '/auth/activate-staff', body: { token, password: 'Password1' } });
  assert.deepEqual(actionRequest('verify-email', token, 'Password1'), { path: '/auth/verify-email', body: { token, password: 'Password1' } });
  assert.deepEqual(actionRequest('reset-password', token, 'Password1'), { path: '/auth/reset-password', body: { token, newPassword: 'Password1' } });
  assert.throws(() => actionRequest('verify-email', '', 'Password1'));
});
test('passwords validate UTF8 bytes and confirmation; login is not subject to new-password policy', () => {
  assert.equal(passwordError('Password1', 'Password1'), null);
  assert.ok(passwordError('short', 'short'));
  assert.ok(passwordError('Password1', 'different'));
  assert.ok(passwordError('ế'.repeat(25), 'ế'.repeat(25)));
});
test('validation arrays and server errors are displayed safely', () => {
  assert.equal(apiErrorMessage({ message: ['Email sai', 'Tên thiếu'] }, 400), 'Email sai Tên thiếu');
  assert.ok(!apiErrorMessage({ message: 'database password=secret' }, 500).includes('secret'));
});
const session = { tokens: { accessToken: 'access', refreshToken: 'refresh', accessTokenExpiresAt: 9999999999 }, user: { id: '1', role: 'ADMIN', fullName: 'Admin' } };
function setup() {
  const disk = new Map();
  globalThis.sessionStorage = { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v), removeItem: k => disk.delete(k) };
  let handler = async () => session;
  class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const exports = load('../store/useAuthStore.ts', { '@/shared/lib/authApi': { AuthError, authRequest: (...args) => handler(...args) } });
  return { ...exports, disk, setHandler: fn => { handler = fn; } };
}
test('nested login tokens persist and concurrent refresh is single-flight', async () => {
  const { useAuthStore: store, disk, setHandler } = setup();
  await store.getState().login('admin', 'admin');
  assert.equal(store.getState().session.tokens.accessToken, 'access');
  assert.ok(disk.get('mwh-auth-session'));
  let calls = 0; let finish;
  setHandler(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = store.getState().refresh(); const second = store.getState().refresh();
  assert.equal(calls, 1); finish(session); await Promise.all([first, second]);
});
test('logout while refresh is in flight cannot resurrect session', async () => {
  const { useAuthStore: store, setHandler } = setup();
  await store.getState().login('admin', 'admin');
  let finish;
  setHandler(path => path === '/auth/refresh' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve());
  const refresh = store.getState().refresh();
  await store.getState().logout(); finish(session);
  await assert.rejects(refresh); assert.equal(store.getState().session, null);
});
test('broken stored session cannot crash initialization', async () => {
  const { useAuthStore: store, disk } = setup();
  disk.set('mwh-auth-session', '{bad'); await store.getState().initialize();
  assert.equal(store.getState().ready, true); assert.equal(store.getState().session, null);
});
