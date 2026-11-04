import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
    return dependencies[id];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const model = load('../shared/lib/chatSession.ts');
function setup(request = async () => ({ answer: 'Trả lời', conversationId: 'conv-1' }), disk = new Map()) {
  const storage = { getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value), removeItem: key => disk.delete(key) };
  const chat = model.createChatSession(request, () => storage);
  chat.activate('guest');
  return { chat, disk, storage };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('send serializes requests, rejects blank/oversized input, and continues the conversation', async () => {
  const wait = deferred(); const calls = [];
  const { chat } = setup((...args) => { calls.push(args); return calls.length === 1 ? wait.promise : Promise.resolve({ answer: 'Tiếp tục' }); });
  assert.equal(await chat.send('  '), false);
  assert.equal(await chat.send('x'.repeat(1001)), false);
  const pending = chat.send('  Chính sách đổi trả?  ');
  assert.equal(await chat.send('double-click'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'Chính sách đổi trả?');
  wait.resolve({ answer: 'Trong chính sách', conversationId: 'conv-123' }); await pending;
  await chat.send('Còn phí giao hàng?');
  assert.equal(calls[1][1], 'conv-123');
  assert.deepEqual(chat.getSnapshot().messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
});
test('failure preserves the question; explicit retry does not duplicate it and escalation survives reload', async () => {
  let count = 0;
  const { chat, disk } = setup(async () => {
    if (++count === 1) throw new Error('Mất kết nối');
    return { answer: 'Cần hỗ trợ', conversationId: 'c1', escalateToSupport: true, escalationMessage: 'Liên hệ nhân viên' };
  });
  await chat.send('Cần CSKH');
  assert.equal(count, 1);
  assert.equal(chat.getSnapshot().messages[0].delivery, 'failed');
  await chat.retry();
  assert.equal(chat.getSnapshot().messages.length, 2);
  assert.equal(chat.getSnapshot().error, null);
  const { chat: restored } = setup(undefined, disk);
  assert.equal(restored.getSnapshot().messages[1].escalateToSupport, true);
  assert.equal(restored.getSnapshot().conversationId, 'c1');
});
test('clear aborts in-flight requests; late success cannot resurrect a conversation', async () => {
  const wait = deferred(); let signal;
  const { chat } = setup((a, b, s) => { signal = s; return wait.promise; });
  const pending = chat.send('Hỏi trước khi xóa'); chat.clear();
  assert.equal(signal.aborted, true);
  wait.resolve({ answer: 'Phản hồi trễ', conversationId: 'old' }); await pending;
  assert.deepEqual(chat.getSnapshot().messages, []);
  assert.equal(chat.getSnapshot().conversationId, undefined);
});
test('account switch and unmount discard stale responses and never expose another account history', async () => {
  const wait = deferred();
  const { chat } = setup(() => wait.promise);
  chat.activate('user:A'); const pending = chat.send('Thông tin riêng A');
  chat.activate('user:B');
  assert.equal(chat.getSnapshot().messages.length, 0);
  wait.reject(new Error('A failed late')); await pending;
  assert.equal(chat.getSnapshot().scope, 'user:B');
  assert.equal(chat.getSnapshot().error, null);
  chat.activate('guest'); assert.equal(chat.getSnapshot().messages.length, 0);
  const later = deferred(); const { chat: another } = setup(() => later.promise);
  const request = another.send('Leaving'); another.deactivate(); later.resolve({ answer: 'late' }); await request;
  assert.equal(another.getSnapshot().scope, null);
});
test('broken persistence recovers; interrupted requests become retryable and history is bounded', async () => {
  const { chat, disk } = setup();
  disk.set('mwh-chat-v1:guest', '{broken'); chat.activate('guest');
  assert.ok(chat.getSnapshot().storageWarning);
  disk.set('mwh-chat-v1:guest', JSON.stringify({ messages: [{ id: 'p', role: 'user', text: 'Interrupted', delivery: 'pending' }] }));
  chat.activate('guest'); assert.equal(chat.getSnapshot().messages[0].delivery, 'failed');
  for (let i = 0; i < 30; i++) await chat.send(`Question ${i}`);
  assert.equal(chat.getSnapshot().messages.length, 50);
});
test('storage quota failure leaves in-memory conversation usable', async () => {
  const chat = model.createChatSession(async () => ({ answer: 'Still works' }), () => ({ getItem: () => null, setItem: () => { throw new Error('Quota'); } }));
  chat.activate('guest'); await chat.send('Hello');
  assert.equal(chat.getSnapshot().messages.length, 2);
  assert.ok(chat.getSnapshot().storageWarning);
});

function apiSetup(session = null, refresh) {
  return load('../shared/lib/chatbotApi.ts', {
    './chatSession': model,
    '@/store/useAuthStore': { useAuthStore: { getState: () => ({ session, refresh }) } },
  });
}
const realSession = { tokens: { accessToken: 'jwt-example', accessTokenExpiresAt: 9999999999 }, user: { id: 'private-user-id' } };
test('API sends exact payload and JWT; guest sends no invented user ID or token', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, ...options }); return Response.json({ reply: '<b>plain text</b>', sessionToken: 'c1', role: 'ASSISTANT', isFallback: true, escalatedToHuman: true, retrievedDocuments: [{ content: 'private context' }], latencyMs: 100, privateData: 'discard' }); });
  const { sendChatMessage } = apiSetup(realSession);
  const result = await sendChatMessage(' Hello ', 'existing', new AbortController().signal);
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt-example');
  assert.deepEqual(JSON.parse(calls[0].body), { message: 'Hello', sessionToken: 'existing' });
  assert.equal(result.privateData, undefined);
  assert.equal(result.answer, '<b>plain text</b>');
  assert.equal(result.conversationId, 'c1');
  assert.equal(result.escalateToSupport, true);
  assert.equal(result.isFallback, true);
  assert.equal(result.retrievedDocuments, undefined);
  await apiSetup().sendChatMessage('FAQ', undefined, new AbortController().signal);
  assert.deepEqual(JSON.parse(calls[1].body), { message: 'FAQ' });
  assert.equal(calls[1].headers.Authorization, undefined);
});
test('API fails safely without leaking server errors, fabricating replies or auto-retrying POST', async t => {
  let status = 500, count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json({ message: 'DB password=secret' }, { status }); });
  const api = apiSetup();
  await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), error => !error.message.includes('secret'));
  assert.equal(count, 1);
  status = 404; await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), /chưa sẵn sàng/);
  status = 429; await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), /quá nhanh/);
  status = 401; await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), /đăng nhập lại/);
  assert.equal(count, 4);
});
test('API validates response shape, rejects preview tokens and respects cancellation', async t => {
  let reply = { reply: '', sessionToken: 's1', isFallback: false, escalatedToHuman: false }; let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json(reply); });
  const api = apiSetup();
  await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), /định dạng/);
  reply = { reply: 'OK', sessionToken: 's1', isFallback: false, escalatedToHuman: 'false' };
  await assert.rejects(api.sendChatMessage('Hi', undefined, new AbortController().signal), /hỗ trợ/);
  const preview = apiSetup({ tokens: { accessToken: 'mock-offline' } });
  await assert.rejects(preview.sendChatMessage('Hi', undefined, new AbortController().signal), /xem trước/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(api.sendChatMessage('Hi', undefined, abort.signal));
  assert.equal(count, 2);
});
test('API refreshes expired JWT before sending, once, and passes request cancellation', async t => {
  let refreshed = 0;
  const api = apiSetup({ tokens: { accessToken: 'expired', accessTokenExpiresAt: 0 } }, async () => { refreshed++; return realSession; });
  const wait = deferred(); let fetchSignal;
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer jwt-example'); fetchSignal = options.signal;
    fetchSignal.addEventListener('abort', () => wait.reject(new Error('Aborted')));
    return wait.promise;
  });
  const abort = new AbortController(); const pending = api.sendChatMessage('Hi', undefined, abort.signal);
  await new Promise(resolve => setImmediate(resolve)); abort.abort();
  await assert.rejects(pending, /kết nối/);
  assert.equal(refreshed, 1); assert.equal(fetchSignal.aborted, true);
});
