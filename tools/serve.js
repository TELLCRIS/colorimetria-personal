// Servidor estático mínimo para probar la app en local. Sin dependencias.
//   npm start                      → http://127.0.0.1:3000/
//   PORT=3102 npm start            → otro puerto
//   BASE=/colorimetria/ npm start  → bajo una subruta, como en GitHub Pages
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const BASE = `/${(process.env.BASE || '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Método no permitido');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(400, 'Ruta no válida');
  }
  if (`${pathname}/` === BASE) return send(302, '', { Location: BASE });
  if (!pathname.startsWith(BASE)) return send(404, 'No encontrado');
  let file = path.join(ROOT, pathname.slice(BASE.length));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(404, 'No encontrado');
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) return send(404, 'No encontrado');
    send(200, data, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  });
});

server.on('error', (err) => {
  console.error(`No se pudo iniciar: ${err.code === 'EADDRINUSE' ? `el puerto ${PORT} ya está en uso` : err.message}.`);
  process.exit(1);
});
server.listen(PORT, HOST, () => console.log(`Colorimetría personal en http://${HOST}:${PORT}${BASE}`));
