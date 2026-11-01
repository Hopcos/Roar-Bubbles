#!/usr/bin/env node
/**
 * Tiny static file server (no dependencies). The microphone requires a secure context:
 * http://localhost counts as secure, so open http://localhost:5173/ in the browser.
 *   node scripts/serve.js [port] [dir]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2]) || Number(process.env.PORT) || 5173;
const root = path.resolve(__dirname, '..', process.argv[3] || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log('RoarBubbles serving ' + path.relative(process.cwd(), root) + ' at http://localhost:' + port + '/'));
