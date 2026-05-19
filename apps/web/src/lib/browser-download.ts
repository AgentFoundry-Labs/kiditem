export function getImageDownloadFetchInit(
  imageUrl: string,
  currentOrigin = getCurrentOrigin(),
): RequestInit | undefined {
  const trimmed = imageUrl.trim();
  if (!trimmed || /^(data|blob):/i.test(trimmed)) return undefined;

  try {
    const origin = new URL(currentOrigin).origin;
    const parsed = new URL(trimmed, origin);
    if (parsed.origin === origin && parsed.pathname.startsWith('/api/')) {
      return { credentials: 'include' };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export type ImageDownloadFormat = 'original' | 'png' | 'jpeg' | 'webp';

export interface ImageDownloadOptions {
  format?: ImageDownloadFormat;
  quality?: number;
  backgroundColor?: string;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
}

export async function downloadImageFile(
  imageUrl: string,
  filename?: string | null,
  options: ImageDownloadOptions = {},
): Promise<void> {
  const response = await fetch(imageUrl, getImageDownloadFetchInit(imageUrl));
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const format = options.format ?? 'original';
  const shouldResize = Boolean(options.width && options.height);
  if (format === 'original' && !shouldResize) {
    downloadBlob(blob, normalizeDownloadFilename(filename, imageUrl, blob.type));
    return;
  }

  const outputFormat = format === 'original' ? imageFormatFromMimeType(blob.type) : format;
  const converted = await convertImageBlob(blob, outputFormat, options);
  downloadBlob(
    converted,
    normalizeDownloadFilename(filename, imageUrl, converted.type, outputFormat),
  );
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function normalizeDownloadFilename(
  filename: string | null | undefined,
  imageUrl: string,
  mimeType: string,
  forcedExt?: Exclude<ImageDownloadFormat, 'original'>,
): string {
  const urlName = (() => {
    try {
      const pathname = new URL(imageUrl, 'http://download.local').pathname;
      return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return '';
    }
  })();
  const inferredExt = forcedExt ?? (mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : 'png');
  const baseName = (filename?.trim() || urlName || `thumbnail-${Date.now()}.${inferredExt}`)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');
  if (forcedExt) {
    return `${baseName.replace(/\.[a-z0-9]{2,5}$/i, '')}.${forcedExt}`;
  }
  return /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.${inferredExt}`;
}

async function convertImageBlob(
  sourceBlob: Blob,
  format: Exclude<ImageDownloadFormat, 'original'>,
  options: ImageDownloadOptions,
): Promise<Blob> {
  const image = await loadImageFromBlob(sourceBlob);
  const canvas = document.createElement('canvas');
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  canvas.width = options.width ?? sourceWidth;
  canvas.height = options.height ?? sourceHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context is unavailable');

  if (format === 'jpeg' || options.fit === 'contain') {
    context.fillStyle = options.backgroundColor ?? '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const drawRect = getDrawRect({
    sourceWidth,
    sourceHeight,
    targetWidth: canvas.width,
    targetHeight: canvas.height,
    fit: options.fit ?? 'cover',
  });
  context.drawImage(image, drawRect.x, drawRect.y, drawRect.width, drawRect.height);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  const quality = format === 'png' ? undefined : options.quality ?? 0.92;
  const converted = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
  URL.revokeObjectURL(image.src);
  if (!converted) throw new Error('Image conversion failed');
  return converted;
}

function imageFormatFromMimeType(mimeType: string): Exclude<ImageDownloadFormat, 'original'> {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg';
  return 'png';
}

function getDrawRect(input: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  fit: 'cover' | 'contain';
}): { x: number; y: number; width: number; height: number } {
  const scale = input.fit === 'contain'
    ? Math.min(input.targetWidth / input.sourceWidth, input.targetHeight / input.sourceHeight)
    : Math.max(input.targetWidth / input.sourceWidth, input.targetHeight / input.sourceHeight);
  const width = input.sourceWidth * scale;
  const height = input.sourceHeight * scale;
  return {
    x: (input.targetWidth - width) / 2,
    y: (input.targetHeight - height) / 2,
    width,
    height,
  };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error('Image load failed'));
    };
    image.src = URL.createObjectURL(blob);
  });
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost';
  return window.location.origin;
}
