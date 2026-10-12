// Detección de la ropa con MediaPipe (segmentación de personas): localiza los píxeles de la
// prenda para teñirla con el color de prueba, como un croma sin necesidad de vestir de verde.
// El modelo se descarga de internet solo cuando hace falta; la imagen se procesa en el
// dispositivo y nunca se envía a ningún sitio.
const VERSION = '0.10.14';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

const CLOTHES = 4; // categorías del modelo: 0 fondo, 1 cabello, 2 piel del cuerpo, 3 piel de la cara, 4 ropa, 5 otros
const INPUT_SIDE = 256; // tamaño de entrada del modelo: se le pasa ya reducido, no el vídeo entero
const MAX_SIDE = 256; // resolución de trabajo de la máscara
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MIN_SHARE = 0.02; // por debajo de esto no se considera que haya prenda visible
const SHADE_MIN = 0.45;
const SHADE_MAX = 1.45;
const EDGE_RADIUS = 2; // píxeles de la máscara que se difuminan a cada lado del borde
// El borde se desplaza un poco hacia FUERA de la prenda para que no asome un filo del color
// original en el contorno; la piel y el cabello se protegen aparte (ver softEdge).
const EDGE_LOW = 0.08;
const EDGE_HIGH = 0.45;
const HAIR = 1;
const FACE_SKIN = 3;

let loading = null;
let segmenter = null;
let create = null; // crea un segmentador con el motor indicado ('GPU' o 'CPU')
let onGpu = false;
const scratch = document.createElement('canvas');

/** Carga la librería y el modelo una sola vez. Rechaza si no hay conexión o el navegador no lo admite. */
export function loadSegmenter() {
  if (!loading) {
    loading = (async () => {
      const { ImageSegmenter, FilesetResolver } = await import(`${LIB}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      create = (delegate) => ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      if (IS_IOS) {
        // En iPhone y iPad la vía GPU de MediaPipe da máscaras vacías o falla: se usa CPU.
        segmenter = await create('CPU');
        return;
      }
      try {
        segmenter = await create('GPU');
        onGpu = true;
      } catch {
        segmenter = await create('CPU');
      }
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

// Desenfoque de caja en una dirección (horizontal o vertical) con ventana deslizante.
function boxBlur(src, dst, w, h, radius, horizontal) {
  const lines = horizontal ? h : w;
  const length = horizontal ? w : h;
  const stride = horizontal ? 1 : w;
  const size = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * w : line;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[start + Math.min(length - 1, Math.max(0, k)) * stride];
    for (let p = 0; p < length; p++) {
      dst[start + p * stride] = sum / size;
      const leaving = Math.max(0, p - radius);
      const entering = Math.min(length - 1, p + radius + 1);
      sum += src[start + entering * stride] - src[start + leaving * stride];
    }
  }
}

/**
 * Convierte la máscara dura (0/1) en una opacidad con borde suave (0..255). El borde sale un
 * poco hacia fuera para tapar el filo del color original; donde hay piel o cabello (`keep`) la
 * opacidad se reduce para que el color no invada el cuello ni la cara.
 */
function softEdge(mask, keep, w, h) {
  const a = Float32Array.from(mask);
  const b = new Float32Array(mask.length);
  for (let pass = 0; pass < 2; pass++) {
    boxBlur(a, b, w, h, EDGE_RADIUS, true);
    boxBlur(b, a, w, h, EDGE_RADIUS, false);
  }
  const skin = Float32Array.from(keep);
  boxBlur(skin, b, w, h, 1, true);
  boxBlur(b, skin, w, h, 1, false);
  const alpha = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < a.length; i++) {
    const t = Math.min(1, Math.max(0, (a[i] - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW)));
    alpha[i] = 255 * t * t * (3 - 2 * t) * (1 - skin[i]);
  }
  return alpha;
}

/**
 * Localiza la prenda en un vídeo o un canvas. Devuelve { w, h, mask, shade, alpha } a baja
 * resolución (mask: 1 donde hay ropa; shade: luz relativa de cada píxel, para conservar pliegues
 * y sombras al teñir; alpha: opacidad con el borde suavizado), o null si no se ve ropa suficiente.
 */
export async function detectGarment(source) {
  await loadSegmenter();
  // Una sola copia reducida de la imagen sirve para el modelo y para leer la luz de la prenda:
  // es mucho más rápido que pasarle el vídeo entero y evita problemas con vídeo en iPhone.
  if (scratch.width !== INPUT_SIDE) {
    scratch.width = INPUT_SIDE;
    scratch.height = INPUT_SIDE;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, INPUT_SIDE, INPUT_SIDE);
  const pixels = ctx.getImageData(0, 0, INPUT_SIDE, INPUT_SIDE).data;

  let result = segmenter.segmentForVideo(scratch, performance.now());
  if (onGpu && isUniform(result.categoryMask.getAsUint8Array())) {
    // Algunas GPU de móvil devuelven una máscara plana (todo igual): se cambia a CPU para siempre.
    release(result);
    segmenter.close();
    segmenter = await create('CPU');
    onGpu = false;
    result = segmenter.segmentForVideo(scratch, performance.now());
  }
  const categories = result.categoryMask;
  try {
    const labels = categories.getAsUint8Array();
    const mw = categories.width;
    const mh = categories.height;
    const step = Math.max(1, Math.ceil(Math.max(mw, mh) / MAX_SIDE));
    const w = Math.ceil(mw / step);
    const h = Math.ceil(mh / step);

    const mask = new Uint8Array(w * h);
    const keep = new Uint8Array(w * h);
    const shade = new Float32Array(w * h);
    let count = 0;
    let sum = 0;
    for (let y = 0; y < h; y++) {
      const py = Math.min(INPUT_SIDE - 1, Math.floor((y * INPUT_SIDE) / h));
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = (py * INPUT_SIDE + Math.min(INPUT_SIDE - 1, Math.floor((x * INPUT_SIDE) / w))) * 4;
        const light = (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) / 255;
        shade[i] = light;
        const label = labels[y * step * mw + x * step];
        if (label >= HAIR && label <= FACE_SKIN) keep[i] = 1; // cabello y piel: no se tiñen
        if (label !== CLOTHES) continue;
        mask[i] = 1;
        sum += light;
        count++;
      }
    }
    if (count < w * h * MIN_SHARE) return null;
    const average = sum / count || 1;
    for (let i = 0; i < shade.length; i++) {
      shade[i] = Math.min(SHADE_MAX, Math.max(SHADE_MIN, shade[i] / average));
    }
    return { w, h, mask, shade, alpha: softEdge(mask, keep, w, h) };
  } finally {
    release(result);
  }
}

// Misma interfaz que face.js, para que el drapeado use cualquiera de los dos detectores.
export { loadSegmenter as load, detectGarment as detect };

function release(result) {
  if (typeof result.close === 'function') result.close();
  else result.categoryMask.close();
}

function isUniform(labels) {
  const first = labels[0];
  for (let i = 1; i < labels.length; i++) if (labels[i] !== first) return false;
  return true;
}
