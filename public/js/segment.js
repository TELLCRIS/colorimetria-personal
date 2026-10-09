// Detección de la ropa con MediaPipe (segmentación de personas): localiza los píxeles de la
// prenda para teñirla con el color de prueba, como un croma sin necesidad de vestir de verde.
// El modelo se descarga de internet solo cuando hace falta; la imagen se procesa en el
// dispositivo y nunca se envía a ningún sitio.
const VERSION = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

const CLOTHES = 4; // categorías del modelo: 0 fondo, 1 cabello, 2 piel del cuerpo, 3 piel de la cara, 4 ropa, 5 otros
const MAX_SIDE = 320; // resolución de trabajo de la máscara
const MIN_SHARE = 0.02; // por debajo de esto no se considera que haya prenda visible
const SHADE_MIN = 0.45;
const SHADE_MAX = 1.45;

let loading = null;
let segmenter = null;
const scratch = document.createElement('canvas');

/** Carga la librería y el modelo una sola vez. Rechaza si no hay conexión o el navegador no lo admite. */
export function loadSegmenter() {
  if (!loading) {
    loading = (async () => {
      const { ImageSegmenter, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      const create = (delegate) => ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      try {
        segmenter = await create('GPU');
      } catch {
        segmenter = await create('CPU');
      }
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/**
 * Localiza la prenda en un vídeo o un canvas. Devuelve { w, h, mask, shade } a baja resolución
 * (mask: 1 donde hay ropa; shade: luz relativa de cada píxel de ropa, para conservar pliegues y
 * sombras al teñir), o null si no se ve ropa suficiente.
 */
export async function detectGarment(source) {
  await loadSegmenter();
  const result = segmenter.segmentForVideo(source, performance.now());
  const categories = result.categoryMask;
  try {
    const labels = categories.getAsUint8Array();
    const mw = categories.width;
    const mh = categories.height;
    const step = Math.max(1, Math.ceil(Math.max(mw, mh) / MAX_SIDE));
    const w = Math.ceil(mw / step);
    const h = Math.ceil(mh / step);

    scratch.width = w;
    scratch.height = h;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;

    const mask = new Uint8Array(w * h);
    const shade = new Float32Array(w * h);
    let count = 0;
    let sum = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * step * mw + x * step] !== CLOTHES) continue;
        const i = y * w + x;
        const light = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255;
        mask[i] = 1;
        shade[i] = light;
        sum += light;
        count++;
      }
    }
    if (count < w * h * MIN_SHARE) return null;
    const average = sum / count || 1;
    for (let i = 0; i < shade.length; i++) {
      if (mask[i]) shade[i] = Math.min(SHADE_MAX, Math.max(SHADE_MIN, shade[i] / average));
    }
    return { w, h, mask, shade };
  } finally {
    if (typeof result.close === 'function') result.close();
    else categories.close();
  }
}
