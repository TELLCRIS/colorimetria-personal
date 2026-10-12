// Arranque, vistas y navegación.
import { api } from './api.js';
import { $, formatDate, plural } from './dom.js';
import { state, on, setCatalog, setSession, clearSession, updateSessionMeta, setFilters } from './store.js';
import { openEditDialog, showError, toast } from './ui.js';
import { initHistory, loadHistory } from './history.js';
import { camera, initCamera } from './camera.js';
import { photo, initPhoto, deleteStoredPhoto } from './photo.js';
import { initBackup, requestPersistence } from './backup.js';
import { initDrape, redraw as redrawDrape } from './drape.js';
import { initGuide } from './guide.js';
import { initFeatures, closeAnalyze } from './features.js';
import { initPalette } from './palette.js';
import { initRating } from './rating.js';
import { initMyPalette } from './mypalette.js';
import { initResults } from './results.js';
import { initReport, refreshReport } from './report.js';

const STORAGE_KEY = 'colorimetria.sessionId';
const VIEWS = ['loading', 'history', 'session'];
const TABS = ['try', 'results', 'report'];

// localStorage guarda únicamente el id de la sesión abierta.
const remembered = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(id) { try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* sin almacenamiento */ } },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento */ } },
};

function showView(name) {
  for (const view of VIEWS) $(`view-${view}`).hidden = view !== name;
  document.body.dataset.view = name;
}

function showTab(name) {
  if (name !== 'try') { camera.stop(); closeAnalyze(); }
  for (const tab of TABS) $(`panel-${tab}`).hidden = tab !== name;
  if (name === 'try') redrawDrape();
  if (name === 'report') refreshReport();
  document.querySelectorAll('.tab').forEach((button) => {
    if (button.dataset.tab === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function renderSessionHeader() {
  const { session, analysis } = state;
  if (!session) return;
  $('session-title').textContent = session.name;
  $('session-meta').textContent =
    `${plural(analysis?.ratedCount ?? 0, 'color valorado', 'colores valorados')} · Creada el ${formatDate(session.createdAt)}`;
  $('session-notes-view').textContent = session.notes ?? '';
  $('session-notes-view').hidden = !session.notes;
  document.title = 'Colorimetría';
}

async function showHistory() {
  camera.reset();
  closeAnalyze();
  photo.unload();
  clearSession();
  remembered.clear();
  document.title = 'Colorimetría';
  showView('history');
  await loadHistory();
}

async function openSession(id) {
  try {
    const data = await api.getSession(id);
    setSession(data);
    remembered.set(data.session.id);
    photo.load(data.session.id); // la foto vive solo en este navegador (IndexedDB)
    showTab('try');
    showView('session');
    redrawDrape(); // el lienzo no puede medirse mientras la vista está oculta
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.status === 404) {
      deleteStoredPhoto(id); // sesión desaparecida: su foto local tampoco debe quedar
      toast('Esa sesión ya no existe. Te mostramos el historial.', 'error');
    } else {
      showError(err);
    }
    await showHistory();
  }
}

async function start() {
  showView('loading');
  const { colors, seasons } = await api.getColors();
  setCatalog(colors, seasons);
  const saved = remembered.get();
  if (saved && /^[1-9]\d*$/.test(saved)) await openSession(saved);
  else await showHistory();
}

function init() {
  initHistory({ onOpen: openSession, onCreated: requestPersistence });
  initBackup({ afterRestore: loadHistory });
  initCamera();
  initPhoto();
  initDrape();
  initGuide();
  initFeatures();
  initPalette();
  initRating();
  initMyPalette();
  initResults({
    onTrySuggested: () => {
      setFilters({ suggested: true });
      showTab('try');
      document.querySelector('.palette-card')?.scrollIntoView({ block: 'start' });
      $('filter-suggested').focus({ preventScroll: true });
    },
    onAnalyze: () => {
      showTab('try');
      document.querySelector('.source-card')?.scrollIntoView({ block: 'start' });
      (photo.canvas ? $('analyze-start') : $('photo-upload')).focus({ preventScroll: true });
    },
  });
  initReport();

  on('session', renderSessionHeader);
  on('sessionMeta', renderSessionHeader);
  on('ratings', renderSessionHeader);

  // Los ajustes secundarios de la tela quedan a un toque en el teléfono y abiertos en pantallas anchas.
  $('adjust-details').open = window.matchMedia('(min-width: 761px)').matches;

  $('back-to-history').addEventListener('click', showHistory);
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
  $('session-edit').addEventListener('click', () => {
    if (!state.session) return;
    openEditDialog(state.session, async (values) => {
      const { session } = await api.updateSession(state.session.id, values);
      updateSessionMeta(session);
      toast('Sesión actualizada.');
    });
  });

  start();
}

init();
