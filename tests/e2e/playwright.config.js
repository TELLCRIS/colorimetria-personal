// Configuración de Playwright. El servidor de pruebas lo arranca global-setup.js en un puerto
// propio (3210) con una BD temporal fuera del proyecto; nunca se usa el 3000 ni data/ del usuario.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PORT = Number(process.env.E2E_PORT) || 3210;
export const FAKE_VIDEO = path.join(here, '.artifacts', 'fake-camera.y4m');

const fakeCamera = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
];
const phone = (width, height) => ({
  viewport: { width, height },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  launchOptions: { args: fakeCamera },
});

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.js$/,
  outputDir: path.join(here, '.artifacts', 'test-results'),
  globalSetup: path.join(here, 'global-setup.js'),
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['json', { outputFile: path.join(here, '.artifacts', 'results.json') }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    locale: 'es-ES',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'escritorio',
      testIgnore: [/movil\.spec\.js$/, /camara-denegada\.spec\.js$/],
      use: { viewport: { width: 1280, height: 900 }, launchOptions: { args: fakeCamera } },
    },
    { name: 'movil-360x740', testMatch: /movil\.spec\.js$/, use: phone(360, 740) },
    { name: 'movil-390x844', testMatch: /movil\.spec\.js$/, use: phone(390, 844) },
    {
      // Sin --use-fake-ui-for-media-stream: el navegador rechaza el permiso de cámara de verdad.
      name: 'camara-denegada',
      testMatch: /camara-denegada\.spec\.js$/,
      use: { viewport: { width: 1280, height: 900 }, launchOptions: { args: ['--use-fake-device-for-media-stream'] } },
    },
  ],
});
