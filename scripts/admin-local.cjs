'use strict';

const { fork, spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { Agent, get } = require('node:http');
const { createServer } = require('node:net');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const BACKEND = resolve(ROOT, 'backend');
const FRONTEND = resolve(ROOT, 'frontend');
const LOCAL_HOST = '127.0.0.1';

const ADMIN_READ_ROUTES = [
  '/admin/payments',
  '/admin/inventory/reservations',
  '/admin/inventory/audit-logs',
  '/admin/ai/chats',
  '/admin/ai/knowledge',
  '/admin/ai/knowledge/stats',
  '/admin/customers',
];

const children = new Set();
const localHttpAgent = new Agent();
let stopping = false;

function httpStatus(url) {
  return new Promise((resolveStatus) => {
    // Dùng kết nối loopback trực tiếp, kể cả khi máy chủ có cấu hình proxy.
    const request = get(
      url,
      { agent: localHttpAgent, signal: AbortSignal.timeout(3_500) },
      (response) => {
        response.resume();
        resolveStatus(response.statusCode ?? null);
      },
    );
    request.on('error', () => resolveStatus(null));
  });
}

async function checkAdminApi(origin) {
  const endpoints = [
    ['/health', 200],
    ...ADMIN_READ_ROUTES.map((path) => [path, 401]),
  ];
  const results = await Promise.all(
    endpoints.map(async ([path, expected]) => {
      const actual = await httpStatus(origin + path);
      return { path, expected, actual };
    }),
  );

  console.log('[Admin] Kiểm tra API ' + origin);
  for (const { path, actual, expected } of results) {
    const status = actual ?? 'Mất kết nối';
    const suffix = actual === expected ? '' : ' (cần ' + expected + ')';
    console.log('  ' + path + ' → ' + status + suffix);
  }
  if (results.some(({ actual }) => actual === 404)) {
    throw new Error(
      'Tiến trình tại ' +
        origin +
        ' thiếu tuyến Admin. Kiểm tra mã nguồn dùng để chạy backend.',
    );
  }
  if (results.some(({ actual, expected }) => actual !== expected)) {
    throw new Error(
      'API chưa sẵn sàng. Kiểm tra địa chỉ backend và kết nối PostgreSQL, Redis.',
    );
  }
}

function listenForFrontend(port) {
  return new Promise((resolveServer, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen(port, LOCAL_HOST, () => resolveServer(server));
  });
}

async function reserveFrontendPort() {
  try {
    return await listenForFrontend(3000);
  } catch (error) {
    if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
    return listenForFrontend(0);
  }
}

function startNode(args, cwd, env) {
  return trackNode(
    spawn(process.execPath, args, { cwd, env, stdio: 'inherit' }),
  );
}

function trackNode(child) {
  children.add(child);
  return new Promise((resolveExit) => {
    function stopped(result) {
      children.delete(child);
      resolveExit(result);
    }
    child.once('error', (error) =>
      stopped({ ok: false, reason: error.message }),
    );
    child.once('exit', (code, signal) =>
      stopped({ ok: code === 0, reason: signal ?? 'mã thoát ' + code }),
    );
  });
}

function startBackend(webOrigin) {
  const child = fork('dist/main.js', {
    cwd: BACKEND,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      PORT: '0',
      FRONTEND_ORIGIN: webOrigin,
      MWH_ADMIN_LOCAL: '1',
    },
  });
  const exited = trackNode(child);
  const listening = new Promise((resolvePort, reject) => {
    function cleanup() {
      clearTimeout(timeout);
      child.off('message', onMessage);
    }
    function onMessage(message) {
      if (message?.type !== 'mwh-admin-backend-listening') return;
      cleanup();
      const port = message.port;
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        reject(new Error('Backend báo một cổng HTTP không hợp lệ.'));
        return;
      }
      resolvePort(port);
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Không nhận được tín hiệu khởi động từ backend (PID ' +
            child.pid +
            '). Kiểm tra log NestJS và tệp backend/src/main.ts trong gói sửa.',
        ),
      );
    }, 45_000);
    child.on('message', onMessage);
    void exited.then(({ reason }) => {
      cleanup();
      reject(new Error('Backend đã dừng (' + reason + ').'));
    });
  });
  return { pid: child.pid, listening, exited };
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') {
      // Next.js mở thêm tiến trình con. Chỉ dừng cây tiến trình của phiên này.
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  }
}

function localApiOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    ![LOCAL_HOST, 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Dùng địa chỉ HTTP cục bộ, ví dụ http://127.0.0.1:3001.');
  }
  return url.origin;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--check' && args.length <= 2) {
    await checkAdminApi(localApiOrigin(args[1] ?? 'http://127.0.0.1:3001'));
    return;
  }
  if (args.length) {
    throw new Error(
      'Dùng node scripts/admin-local.cjs [--check http://127.0.0.1:3001].',
    );
  }

  const nestCli = resolve(BACKEND, 'node_modules/@nestjs/cli/bin/nest.js');
  const nextCli = resolve(FRONTEND, 'node_modules/next/dist/bin/next');
  if (!existsSync(nestCli) || !existsSync(nextCli)) {
    throw new Error(
      'Cài dependencies trong backend và frontend trước khi chạy.',
    );
  }

  console.log('[Admin] Biên dịch backend từ ' + BACKEND);
  const build = await startNode([nestCli, 'build'], BACKEND, process.env);
  if (stopping) return;
  if (!build.ok) throw new Error('Build backend lỗi (' + build.reason + ').');

  const reservation = await reserveFrontendPort();
  const webPort = reservation.address().port;
  const webOrigin = 'http://' + LOCAL_HOST + ':' + webPort;
  let apiOrigin;
  let backendExit;
  try {
    if (stopping) return;
    const backend = startBackend(webOrigin);
    const apiPort = await backend.listening;
    apiOrigin = 'http://' + LOCAL_HOST + ':' + apiPort;
    backendExit = backend.exited.then(({ reason }) => {
      if (!stopping) throw new Error('Backend đã dừng (' + reason + ').');
    });
    console.log(
      '[Admin] Backend PID ' + backend.pid + ' đang lắng nghe tại ' + apiOrigin,
    );
    await Promise.race([checkAdminApi(apiOrigin), backendExit]);
  } finally {
    await new Promise((close) => reservation.close(close));
  }
  if (stopping) return;

  console.log('[Admin] Mở ' + webOrigin + '/login sau khi Next.js sẵn sàng.');
  console.log('[Admin] Backend và frontend dừng cùng nhau khi nhấn Ctrl+C.');
  const frontendExit = startNode(
    [
      nextCli,
      'dev',
      '--webpack',
      '--hostname',
      LOCAL_HOST,
      '--port',
      String(webPort),
    ],
    FRONTEND,
    { ...process.env, NEXT_PUBLIC_API_URL: apiOrigin },
  ).then(({ reason }) => {
    if (!stopping)
      throw new Error(
        'Frontend đã dừng (' + reason + '). Kiểm tra terminal frontend cũ.',
      );
  });
  await Promise.race([frontendExit, backendExit]);
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    process.exitCode = code;
    stopChildren();
  });
}

main()
  .catch((error) => {
    if (stopping) return;
    console.error('[Admin] ' + error.message);
    process.exitCode = 1;
  })
  .finally(stopChildren);
