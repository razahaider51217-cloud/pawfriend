// Minimal production-ready replica of the original payload server.
//
// Routes:
//   GET /data?platform=win|mac  -> { "cipher": "U2FsdGVkX1..." }  (from data_*.json)
//   GET /                       -> index.html
//   GET /data_win.json          -> static fallback (for static hosts that serve this file too)
//   GET /data_mac.json          -> static fallback
//
// Binds 0.0.0.0 so DigitalOcean / Docker / VM deployments can reach it,
// and listens on process.env.PORT (DigitalOcean injects this automatically).

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ---- The exact route the front-end calls ----
  if (url.pathname === '/data') {
    const platform = url.searchParams.get('platform');
    if (platform !== 'win' && platform !== 'mac') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'platform must be win or mac' }));
    }
    const file = path.join(__dirname, 'data_' + platform + '.json');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return fs.createReadStream(file).pipe(res);
  }

  // ---- Serve static files (index.html at /, data_*.json for static fallback) ----
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  // Path traversal guard: never serve files outside this folder.
  if (!filePath.startsWith(path.resolve(__dirname) + path.sep) && filePath !== path.join(__dirname, 'index.html')) {
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

  res.writeHead(200, { 'Content-Type': MIME[ext] });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log('Popup payload server running at http://' + HOST + ':' + PORT);
  console.log('  GET /                  -> index.html');
  console.log('  GET /data?platform=win -> data_win.json');
  console.log('  GET /data?platform=mac -> data_mac.json');
});