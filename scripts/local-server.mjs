/**
 * 로컬 개발 서버: 정적 파일 + Netlify 함수를 프로덕션으로 프록시
 * (npx serve 에는 /.netlify/functions 가 없어 지점명 매칭이 실패함)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.AUVIA_PROD_ORIGIN || 'https://auvia.netlify.app';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function send(res, status, body, headers) {
  res.writeHead(status, headers || {});
  res.end(body);
}

async function proxyNetlify(req, res, url) {
  const target = PROD + url.pathname + (url.search || '');
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { Accept: 'application/json' }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const headers = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    res.writeHead(upstream.status, headers);
    res.end(buf);
  } catch (e) {
    send(res, 502, JSON.stringify({ error: 'proxy_failed', message: String(e && e.message || e) }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  }
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, cleaned);
  if (!full.startsWith(root)) return null;
  return full;
}

function serveStatic(req, res, url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  let filePath = safeJoin(ROOT, rel);
  if (!filePath) return send(res, 403, 'Forbidden');

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  // JS는 캐시 막아서 수정이 바로 보이게
  const cache = ext === '.js' || ext === '.html' || ext === '.css' ? 'no-store' : 'public, max-age=3600';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url || '/', 'http://localhost:' + PORT);
  if (url.pathname.indexOf('/.netlify/functions/') === 0) {
    return proxyNetlify(req, res, url);
  }
  return serveStatic(req, res, url);
});

server.listen(PORT, function () {
  console.log('Auvia local: http://localhost:' + PORT);
  console.log('Netlify functions → ' + PROD);
});
