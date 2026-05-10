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

export async function downloadImageFile(
  imageUrl: string,
  filename?: string | null,
): Promise<void> {
  const response = await fetch(imageUrl, getImageDownloadFetchInit(imageUrl));
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const blob = await response.blob();
  downloadBlob(blob, normalizeDownloadFilename(filename, imageUrl, blob.type));
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
): string {
  const urlName = (() => {
    try {
      const pathname = new URL(imageUrl, 'http://download.local').pathname;
      return decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return '';
    }
  })();
  const inferredExt = mimeType.includes('png')
    ? 'png'
    : mimeType.includes('webp')
      ? 'webp'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : 'png';
  const baseName = (filename?.trim() || urlName || `thumbnail-${Date.now()}.${inferredExt}`)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');
  return /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.${inferredExt}`;
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost';
  return window.location.origin;
}
