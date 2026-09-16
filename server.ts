import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import market from './api/market.ts';
const files: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'],
  '/mascots.svg': ['mascots.svg', 'image/svg+xml'], '/share.svg': ['share.svg', 'image/svg+xml'],
  '/fonts/Family-Medium.woff2': ['fonts/Family-Medium.woff2', 'font/woff2'],
  '/fonts/Inter-Regular.ttf': ['fonts/Inter-Regular.ttf', 'font/ttf'],
  '/fonts/Inter-Medium.ttf': ['fonts/Inter-Medium.ttf', 'font/ttf'],
  '/fonts/Inter-SemiBold.ttf': ['fonts/Inter-SemiBold.ttf', 'font/ttf'],
};
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (path === '/api/market') return market(req, res);
  const asset = files[path];
  if (req.method !== 'GET' || !asset) { res.writeHead(404); res.end('Not found'); return; }
  try { const data = await readFile(new URL(`./public/${asset[0]}`, import.meta.url)); res.writeHead(200, { 'Content-Type': asset[1] }); res.end(data); }
  catch { res.writeHead(500); res.end('Could not load page'); }
}).listen(port, '127.0.0.1', () => console.log(`Probably is ready at http://localhost:${port}`));
