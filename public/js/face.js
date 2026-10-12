// Localiza el rostro con MediaPipe (BlazeFace) para colocar el polo de molde justo debajo.
// Es un detector muy pequeño (menos de 1 MB) y rápido, apto para vídeo en vivo en el móvil.
// Se descarga de internet solo cuando hace falta; la imagen se procesa en el dispositivo y
// nunca se envía a ningún sitio.
const VERSION = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const MAX_SIDE = 320; // al detector se le pasa una copia reducida, no el vídeo entero
const MIN_FACE = 0.06; // un rostro más pequeño que esto (sobre el ancho) no sirve para colocar el polo

let loading = null;
let detector = null;
const scratch = document.createElement('canvas');

/** Carga la librería y el modelo una sola vez. Rechaza si no hay conexión o el navegador no lo admite. */
export function load() {
  if (!loading) {
    loading = (async () => {
      const { FaceDetector, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      // CPU en todos los dispositivos: el modelo es tan pequeño que no necesita GPU, y así se
      // evitan los fallos de la vía GPU en iPhone.
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
      });
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/**
 * Busca el rostro más grande en un vídeo o un canvas. Devuelve su posición en proporciones de la
 * imagen ({ cx, chin, fw, fh }: centro, barbilla, ancho y alto), o null si no hay ninguno.
 */
export async function detect(source, sw, sh) {
  await load();
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  scratch.getContext('2d').drawImage(source, 0, 0, w, h);
  const { detections } = detector.detectForVideo(scratch, performance.now());
  let best = null;
  for (const { boundingBox: box } of detections ?? []) {
    if (box && (!best || box.width * box.height > best.width * best.height)) best = box;
  }
  if (!best || best.width < w * MIN_FACE) return null;
  return {
    cx: (best.originX + best.width / 2) / w,
    chin: (best.originY + best.height) / h,
    fw: best.width / w,
    fh: best.height / h,
  };
}
