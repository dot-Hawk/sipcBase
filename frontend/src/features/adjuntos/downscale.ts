import { MAX_UPLOAD_BYTES, START_QUALITY, computeTargetSize, nextQuality } from './imageSizing';

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality);
  });
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resizes to max 1600px on the long side and re-encodes as JPEG, guaranteeing < 5 MB. */
export async function prepareImage(file: Blob): Promise<Blob> {
  const decoded = await decode(file);
  try {
    let { width, height } = computeTargetSize(decoded.width, decoded.height);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(decoded.source, 0, 0, width, height);
      let quality: number | null = START_QUALITY;
      while (quality !== null) {
        const blob = await toBlob(canvas, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) return blob;
        quality = nextQuality(quality);
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error('Image could not be reduced below the upload limit');
  } finally {
    decoded.close();
  }
}
