const DEFAULT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

async function fileToImageData(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return data;
}

function inferAngle(name, fallback) {
  const lower = name.toLowerCase();
  const named = [
    ['front', 0], ['frente', 0], ['right', 90], ['derecha', 90],
    ['back', 180], ['trasera', 180], ['atras', 180], ['left', 270], ['izquierda', 270]
  ];
  for (const [token, angle] of named) if (lower.includes(token)) return angle;
  const match = lower.match(/(?:^|[_\-\s])(\d{1,3})(?:deg|°)?(?:[_\-\s.]|$)/);
  return match ? Number(match[1]) % 360 : fallback;
}

export class ReferenceViews {
  constructor() {
    this.views = [];
  }

  clear() { this.views.length = 0; }

  async loadDepthFiles(files, options = {}) {
    this.clear();
    const list = [...files];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const image = await fileToImageData(file);
      const fallback = DEFAULT_ANGLES[i] ?? (360 * i / Math.max(1, list.length));
      this.views.push({
        id: `view-${i}`,
        name: file.name,
        angleDeg: inferAngle(file.name, fallback),
        image,
        invert: options.invert ?? false,
        alphaIsMask: options.alphaIsMask ?? true,
        confidence: options.confidence ?? 1
      });
    }
    return this.getSummary();
  }

  addImageData({ id, name = id, angleDeg = 0, image, invert = false, alphaIsMask = true, confidence = 1 }) {
    this.views.push({ id, name, angleDeg, image, invert, alphaIsMask, confidence });
  }

  sample(view, u, v) {
    if (u < 0 || v < 0 || u > 1 || v > 1) return { valid: false, masked: true, depth: 0, confidence: 0 };
    const { width, height, data } = view.image;
    const x = Math.min(width - 1, Math.max(0, Math.round(u * (width - 1))));
    const y = Math.min(height - 1, Math.max(0, Math.round((1 - v) * (height - 1))));
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3] / 255;
    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / (3 * 255);
    const depth = view.invert ? 1 - gray : gray;
    const masked = view.alphaIsMask && alpha < 0.1;
    return { valid: !masked, masked, depth, confidence: view.confidence * alpha };
  }

  getSummary() {
    return this.views.map(v => ({ id: v.id, name: v.name, angleDeg: v.angleDeg, width: v.image.width, height: v.image.height }));
  }
}
