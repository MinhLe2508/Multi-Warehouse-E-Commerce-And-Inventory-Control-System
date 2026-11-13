// Local UI fixture only. This is NOT the P5 chatbot backend and never accesses a database.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    let allowed = false;
    try { const url = new URL(origin); allowed = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname); } catch {}
    if (!allowed) { res.writeHead(403).end(); return; }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, data) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || req.url !== '/chatbot') { reply(404, { message: 'Local chatbot UI fixture only' }); return; }
  let text = '';
  try {
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 10000) { reply(413, {}); return; }
    }
    const body = JSON.parse(text);
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1000 || Object.keys(body).some(key => !['message', 'sessionToken'].includes(key))) { reply(400, {}); return; }
    const message = body.message.trim().toLowerCase();
    await new Promise(resolve => setTimeout(resolve, message === 'cham' ? 4000 : 500));
    if (message === 'loi') { reply(503, { message: 'Simulated failure' }); return; }
    reply(200, {
      reply: '[KIỂM THỬ GIAO DIỆN] Đây là phản hồi mẫu, không phải câu trả lời từ AI hoặc dữ liệu cửa hàng.',
      sessionToken: body.sessionToken || `sess_${randomUUID()}`,
      role: 'ASSISTANT',
      escalatedToHuman: message === 'cskh',
      isFallback: message === 'fallback',
      retrievedDocuments: [],
      latencyMs: 500,
    });
  } catch { reply(400, {}); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Cổng 3001 đang được dùng. Không chạy fixture cùng backend thật; không tự dừng dịch vụ khác.' : error.message);
  process.exitCode = 1;
});
server.listen(3001, '127.0.0.1', () => console.log('FIXTURE kiểm thử UI tại http://localhost:3001/chatbot. Không AI, không DB. Ctrl+C để dừng.'));
