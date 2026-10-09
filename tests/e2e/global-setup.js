// Arranca el servidor bajo prueba en un puerto propio con una BD temporal fuera del proyecto,
// y genera el vídeo de la cámara falsa. Devuelve la función que lo apaga y limpia todo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PORT, FAKE_VIDEO } from './playwright.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Vídeo Y4M de 640×480: mitad izquierda roja, mitad derecha azul. Permite comprobar el espejo. */
function writeFakeVideo(file) {
  const w = 640, h = 480, frames = 3;
  const y = Buffer.alloc(w * h), u = Buffer.alloc((w / 2) * (h / 2)), v = Buffer.alloc((w / 2) * (h / 2));
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) y[row * w + col] = col < w / 2 ? 81 : 41;
  for (let row = 0; row < h / 2; row++) for (let col = 0; col < w / 2; col++) {
    u[row * (w / 2) + col] = col < w / 4 ? 90 : 240;
    v[row * (w / 2) + col] = col < w / 4 ? 240 : 110;
  }
  const parts = [Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < frames; i++) parts.push(Buffer.from('FRAME\n'), y, u, v);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat(parts));
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

export default async function globalSetup() {
  if (PORT === 3000) throw new Error('El puerto 3000 pertenece al usuario: usa otro para las pruebas.');
  if (await portInUse(PORT)) throw new Error(`El puerto ${PORT} ya está en uso; libera ese puerto o define E2E_PORT.`);
  writeFakeVideo(FAKE_VIDEO);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colorimetria-e2e-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: path.join(dir, 'e2e.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const exited = new Promise((resolve) => child.once('exit', resolve));

  const teardown = async () => {
    if (child.exitCode === null) child.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    fs.rmSync(FAKE_VIDEO, { force: true });
    if (/\berror\b|TypeError|ReferenceError/i.test(log)) console.log(`\n[servidor de pruebas] salida con errores:\n${log}`);
  };

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) { await teardown(); throw new Error(`El servidor de pruebas terminó al arrancar:\n${log}`); }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/colors`);
      if (res.ok) break;
    } catch { /* aún no escucha */ }
    if (Date.now() > deadline) { await teardown(); throw new Error(`El servidor de pruebas no respondió a tiempo:\n${log}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  return teardown;
}
