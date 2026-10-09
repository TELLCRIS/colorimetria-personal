// Detección automática de hombros con MediaPipe Pose.
// El modelo se descarga de internet solo cuando hace falta; la imagen se procesa en el
// dispositivo y nunca se envía a ningún sitio.
const VERSION = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const MIN_VISIBILITY = 0.5;

let loading = null;
let landmarker = null;

/** Carga la librería y el modelo una sola vez. Rechaza si no hay conexión o el navegador no lo admite. */
export function loadPose() {
  if (!loading) {
    loading = (async () => {
      const { PoseLandmarker, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      const create = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        landmarker = await create('GPU');
      } catch {
        landmarker = await create('CPU');
      }
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Convierte los puntos del cuerpo en la geometría de la tela, en proporciones de la imagen
 * (x sobre el ancho, y sobre el alto): hombros, centro, base del cuello y medio ancho del cuello.
 */
export function poseFromLandmarks(points, mirrored, aspect) {
  const a = points?.[LEFT_SHOULDER];
  const b = points?.[RIGHT_SHOULDER];
  if (!a || !b) return null;
  if ((a.visibility ?? 1) < MIN_VISIBILITY || (b.visibility ?? 1) < MIN_VISIBILITY) return null;
  const x = (p) => (mirrored ? 1 - p.x : p.x);
  const [lx, rx] = [x(a), x(b)].sort((p, q) => p - q);
  const width = rx - lx;
  if (width < 0.15) return null; // demasiado lejos o de perfil
  const sy = (a.y + b.y) / 2;
  const earL = points[LEFT_EAR];
  const earR = points[RIGHT_EAR];
  const ears = earL && earR ? Math.abs(earL.x - earR.x) : width * 0.45;
  return {
    lx,
    rx,
    sy,
    cx: (lx + rx) / 2,
    // La base del cuello queda algo por encima de la línea que une los hombros.
    top: sy - width * 0.1 * aspect,
    neckHalf: clamp(ears * 0.36, width * 0.12, width * 0.24),
  };
}

/** Detecta los hombros en un vídeo o un canvas. Devuelve la geometría normalizada o null. */
export async function detectPose(source, sw, sh, mirrored = false) {
  await loadPose();
  const result = landmarker.detectForVideo(source, performance.now());
  return poseFromLandmarks(result.landmarks?.[0], mirrored, sw / sh);
}
