import { getImageDownloadFetchInit } from '@/lib/browser-download';

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageWhitespaceCropResult {
  blob: Blob;
  bounds: PixelBounds;
  didCrop: boolean;
}

interface FindContentBoundsInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  threshold?: number;
  alphaThreshold?: number;
  padding?: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const DEFAULT_THRESHOLD = 26;
const DEFAULT_ALPHA_THRESHOLD = 10;
const DEFAULT_UPLOAD_MAX_BYTES = 4.5 * 1024 * 1024;
const DEFAULT_UPLOAD_MAX_DIMENSION = 1800;
const UPLOAD_MAX_DIMENSION_STEPS = [1800, 1400, 1100, 900, 700];
const JPEG_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66];

export function findImageContentBounds({
  data,
  width,
  height,
  threshold = DEFAULT_THRESHOLD,
  alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
  padding = 0,
}: FindContentBoundsInput): PixelBounds | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;

  const background = estimateEdgeBackground(data, width, height, alphaThreshold);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let contentPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isContentPixel(data, width, x, y, background, threshold, alphaThreshold)) continue;
      contentPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (contentPixels < 16 || maxX < minX || maxY < minY) return null;

  const paddedMinX = Math.max(0, minX - padding);
  const paddedMinY = Math.max(0, minY - padding);
  const paddedMaxX = Math.min(width - 1, maxX + padding);
  const paddedMaxY = Math.min(height - 1, maxY + padding);

  return {
    x: paddedMinX,
    y: paddedMinY,
    width: paddedMaxX - paddedMinX + 1,
    height: paddedMaxY - paddedMinY + 1,
  };
}

export async function cropImageWhitespaceFile(file: File): Promise<File> {
  const result = await cropImageWhitespaceBlob(file);
  if (!result.didCrop) return file;

  return new File([result.blob], makeCroppedFilename(file.name), {
    type: result.blob.type || 'image/png',
    lastModified: file.lastModified,
  });
}

export async function prepareImageUploadFile(file: File): Promise<File> {
  const cropped = await cropImageWhitespaceFile(file);
  if (cropped.size <= DEFAULT_UPLOAD_MAX_BYTES) return cropped;

  const source = await loadCanvasImageSource(cropped);
  let bestBlob: Blob | null = null;
  for (const maxDimension of UPLOAD_MAX_DIMENSION_STEPS) {
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    for (const quality of JPEG_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= DEFAULT_UPLOAD_MAX_BYTES) {
        closeImageSource(source);
        return new File([blob], makeCompressedFilename(file.name), {
          type: 'image/jpeg',
          lastModified: file.lastModified,
        });
      }
    }
  }
  closeImageSource(source);

  if (!bestBlob || bestBlob.size >= cropped.size) return cropped;
  return new File([bestBlob], makeCompressedFilename(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

export async function cropImageWhitespaceUrlToFile(
  imageUrl: string,
  filename = 'detail-page-image.png',
): Promise<File | null> {
  const response = await fetch(imageUrl, getImageDownloadFetchInit(imageUrl));
  if (!response.ok) throw new Error(`Image crop fetch failed: ${response.status}`);

  const result = await cropImageWhitespaceBlob(await response.blob());
  if (!result.didCrop) return null;

  return new File([result.blob], makeCroppedFilename(filename), {
    type: result.blob.type || 'image/png',
  });
}

export async function cropImageWhitespaceBlob(blob: Blob): Promise<ImageWhitespaceCropResult> {
  const source = await loadCanvasImageSource(blob);
  const width = source.width;
  const height = source.height;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('Canvas is not available');

  sourceContext.drawImage(source, 0, 0);
  closeImageSource(source);

  const imageData = sourceContext.getImageData(0, 0, width, height);
  const padding = Math.min(32, Math.max(8, Math.round(Math.max(width, height) * 0.012)));
  const bounds = findImageContentBounds({
    data: imageData.data,
    width,
    height,
    padding,
  });

  if (!bounds || isAlmostFullImage(bounds, width, height)) {
    return {
      blob,
      bounds: { x: 0, y: 0, width, height },
      didCrop: false,
    };
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = bounds.width;
  cropCanvas.height = bounds.height;
  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) throw new Error('Canvas is not available');

  cropContext.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );

  return {
    blob: await canvasToBlob(cropCanvas),
    bounds,
    didCrop: true,
  };
}

function estimateEdgeBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
): Rgba {
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 160));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] <= alphaThreshold) return;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    a += data[index + 3];
    count += 1;
  };

  for (let x = 0; x < width; x += stride) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stride) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (count === 0) return { r: 255, g: 255, b: 255, a: 0 };
  return { r: r / count, g: g / count, b: b / count, a: a / count };
}

function isContentPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  background: Rgba,
  threshold: number,
  alphaThreshold: number,
): boolean {
  const index = (y * width + x) * 4;
  const alpha = data[index + 3];
  if (alpha <= alphaThreshold) return false;
  if (background.a <= alphaThreshold) return true;

  const dr = Math.abs(data[index] - background.r);
  const dg = Math.abs(data[index + 1] - background.g);
  const db = Math.abs(data[index + 2] - background.b);
  return Math.max(dr, dg, db) >= threshold;
}

function isAlmostFullImage(bounds: PixelBounds, width: number, height: number): boolean {
  const removedX = width - bounds.width;
  const removedY = height - bounds.height;
  return removedX < Math.max(6, width * 0.02) && removedY < Math.max(6, height * 0.02);
}

async function loadCanvasImageSource(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return window.createImageBitmap(blob);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function closeImageSource(source: ImageBitmap | HTMLImageElement): void {
  if ('close' in source && typeof source.close === 'function') source.close();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function makeCroppedFilename(filename: string): string {
  const safeName = filename.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!safeName) return 'detail-page-image-cropped.png';
  return /\.[a-z0-9]{2,5}$/i.test(safeName)
    ? safeName.replace(/\.[a-z0-9]{2,5}$/i, '-cropped.png')
    : `${safeName}-cropped.png`;
}

function makeCompressedFilename(filename: string): string {
  const safeName = filename.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!safeName) return 'detail-page-image-upload.jpg';
  return /\.[a-z0-9]{2,5}$/i.test(safeName)
    ? safeName.replace(/\.[a-z0-9]{2,5}$/i, '-upload.jpg')
    : `${safeName}-upload.jpg`;
}
