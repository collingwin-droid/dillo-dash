// Dillo Dash: Austin — game server
// Serves the game and relays phone-controller taps to the big screen over WebSockets.
// No accounts, no app: phones just scan the QR code on the screen.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
// Optional: the address phones should use, e.g. https://dillo.example.com
// (set this when running behind a custom domain or proxy). Otherwise it is detected.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
// the game page lives in public/ — but also works if index.html was uploaded next to server.js
const PUB = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const ONLY_INDEX = PUB === __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function lanIP() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (ONLY_INDEX && rel !== 'index.html') { res.writeHead(404); res.end('Not found'); return; }
  const file = path.resolve(PUB, rel);
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const rooms = new Map(); // code -> { code, host, pads: [ws|null x4], lastState, timer }

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
function newCode() {
  let c;
  do { c = Array.from(crypto.randomBytes(5), b => ALPHA[b % ALPHA.length]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

// Address phones should open: PUBLIC_URL, else the address the big screen used —
// swapping "localhost" for this computer's Wi-Fi address so phones can reach it.
function baseURL(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http');
  let host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const [name, port] = host.split(':');
  if (/^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(name)) {
    const ip = lanIP();
    if (ip) host = ip + (port ? ':' + port : '');
  }
  return `${proto}://${host}`;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', buf => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'host') {
      // big screen: reclaim its room after a reconnect, or open a new one
      let r = typeof m.code === 'string' && rooms.get(m.code);
      if (r && !(r.host && r.host.readyState === 1)) clearTimeout(r.timer);
      else { r = { code: newCode(), host: null, pads: [null, null, null, null], lastState: null, timer: null }; rooms.set(r.code, r); }
      r.host = ws; ws.role = 'host'; ws.room = r;
      send(ws, { t: 'room', code: r.code, base: baseURL(req) });
      r.pads.forEach((p, i) => { if (p) send(ws, { t: 'pad', slot: i + 1, on: true }); });
      return;
    }

    if (m.t === 'join') {
      // phone: claim one of the four armadillos
      const r = rooms.get(String(m.code));
      const s = m.slot | 0, id = String(m.id || '').slice(0, 40);
      if (!r || s < 1 || s > 4) { send(ws, { t: 'noroom' }); return; }
      const cur = r.pads[s - 1];
      if (cur && cur !== ws && cur.readyState === 1 && cur.padId !== id) { send(ws, { t: 'taken' }); return; }
      if (cur && cur !== ws) { cur.replaced = true; cur.close(); }
      r.pads[s - 1] = ws; ws.role = 'pad'; ws.room = r; ws.slot = s; ws.padId = id;
      send(ws, { t: 'joined', slot: s });
      send(r.host, { t: 'pad', slot: s, on: true });
      if (r.lastState) send(ws, r.lastState);
      if (!(r.host && r.host.readyState === 1)) send(ws, { t: 'hostgone' });
      return;
    }

    if (m.t === 'in' && ws.role === 'pad' && ws.room.pads[ws.slot - 1] === ws) {
      send(ws.room.host, { t: 'in', slot: ws.slot, n: Math.max(0, m.n | 0), held: !!m.held, readyFor: m.readyFor | 0 });
      return;
    }

    if (m.t === 'state' && ws.role === 'host' && ws.room.host === ws) {
      const st = { t: 'state', st: String(m.st).slice(0, 12), round: m.round | 0, places: Array.isArray(m.places) ? m.places.slice(0, 4).map(x => x | 0) : [] };
      ws.room.lastState = st;
      ws.room.pads.forEach(p => send(p, st));
    }
  });

  ws.on('close', () => {
    const r = ws.room; if (!r) return;
    if (ws.role === 'host' && r.host === ws) {
      r.host = null;
      r.pads.forEach(p => send(p, { t: 'hostgone' }));
      r.timer = setTimeout(() => { r.pads.forEach(p => p && p.close()); rooms.delete(r.code); }, 120000);
    }
    if (ws.role === 'pad' && r.pads[ws.slot - 1] === ws) {
      r.pads[ws.slot - 1] = null;
      if (!ws.replaced) send(r.host, { t: 'pad', slot: ws.slot, on: false });
    }
  });
});

// Render's free plan sleeps after 15 idle minutes. While a big screen is open,
// ping our own public address now and then so the game stays awake.
const SELF_URL = process.env.RENDER_EXTERNAL_URL || PUBLIC_URL;
if (SELF_URL && typeof fetch === 'function') {
  setInterval(() => {
    const screenOpen = [...rooms.values()].some(r => r.host && r.host.readyState === 1);
    if (screenOpen) fetch(SELF_URL + '/healthz').catch(() => {});
  }, 10 * 60 * 1000);
}

// drop dead connections (phones that locked their screen, etc.)
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 20000);

server.listen(PORT, () => {
  const ip = lanIP();
  console.log('\n  Dillo Dash: Austin is running!\n');
  console.log(`  Big screen (this computer):  http://localhost:${PORT}`);
  if (ip) console.log(`  Big screen (other device):   http://${ip}:${PORT}`);
  if (PUBLIC_URL) console.log(`  Phones will be sent to:      ${PUBLIC_URL}`);
  else console.log('  Phones must be on the same Wi-Fi as this computer (or deploy it online — see README).');
  console.log('');
});
