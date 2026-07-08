import {
  safeStorageGet,
  safeStorageKey,
  safeStorageLength,
  safeStorageSet,
} from '@/lib/browser-storage';

const UPLOAD_KEY_PREFIX = 'thumbnail-editor-upload:';
const UPLOAD_RESULT_PREFIX = 'thumbnail-editor-upload-result:';
const RECENT_UPLOADS_KEY = 'thumbnail-editor-recent-uploads';

export interface ThumbnailEditorRecentUpload {
  uploadKey: string;
  productName: string;
  mode: 'edit' | 'creative';
  createdAt: string;
  latestResultUrl?: string | null;
  resultCount?: number;
  lastGeneratedAt?: string | null;
}

export interface ThumbnailEditorUploadResult {
  candidates: Array<{ url: string; filename: string }>;
  mode: 'edit' | 'creative';
  productName: string;
  createdAt: string;
}

export function writeThumbnailEditorUpload(
  imageUrl: string,
  meta?: { productName?: string | null; mode?: 'edit' | 'creative' | null },
): string {
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  safeStorageSet('session', `${UPLOAD_KEY_PREFIX}${key}`, imageUrl);
  rememberThumbnailEditorUpload(key, meta);
  return key;
}

export function readThumbnailEditorUpload(key: string): string | null {
  return safeStorageGet('session', `${UPLOAD_KEY_PREFIX}${key}`);
}

export function writeThumbnailEditorUploadResult(
  uploadKey: string,
  candidates: Array<{ url: string; filename: string }>,
  meta?: { productName?: string | null; mode?: 'edit' | 'creative' | null },
): void {
  const productName = meta?.productName?.trim();
  const payload: ThumbnailEditorUploadResult = {
    candidates,
    productName: productName || '직접 업로드 이미지',
    mode: meta?.mode ?? 'edit',
    createdAt: new Date().toISOString(),
  };
  safeStorageSet('session', `${UPLOAD_RESULT_PREFIX}${uploadKey}`, JSON.stringify(payload));
  rememberThumbnailEditorUpload(uploadKey, meta);
}

export function readThumbnailEditorUploadResult(uploadKey: string): ThumbnailEditorUploadResult | null {
  const raw = safeStorageGet('session', `${UPLOAD_RESULT_PREFIX}${uploadKey}`);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!isUploadResult(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function rememberThumbnailEditorUpload(
  uploadKey: string,
  meta?: { productName?: string | null; mode?: 'edit' | 'creative' | null },
): void {
  const productName = meta?.productName?.trim();
  const existing = listRecentThumbnailEditorUploads();
  const nextItem: ThumbnailEditorRecentUpload = {
    uploadKey,
    productName: productName || '직접 업로드 이미지',
    mode: meta?.mode ?? 'edit',
    createdAt: new Date().toISOString(),
  };
  const next = [
    nextItem,
    ...existing.filter((item) => item.uploadKey !== uploadKey),
  ].slice(0, 12);
  safeStorageSet('session', RECENT_UPLOADS_KEY, JSON.stringify(next));
}

export function listRecentThumbnailEditorUploads(): ThumbnailEditorRecentUpload[] {
  const raw = safeStorageGet('session', RECENT_UPLOADS_KEY);
  const parsed = parseRecentUploads(raw);
  const byKey = new Map(parsed.map((item) => [item.uploadKey, item]));

  const storageLength = safeStorageLength('session');
  for (let i = 0; i < storageLength; i += 1) {
    const key = safeStorageKey('session', i);
    if (!key?.startsWith(UPLOAD_KEY_PREFIX)) continue;
    const uploadKey = key.slice(UPLOAD_KEY_PREFIX.length);
    if (byKey.has(uploadKey)) continue;
    byKey.set(uploadKey, {
      uploadKey,
      productName: '직접 업로드 이미지',
      mode: 'edit',
      createdAt: '',
    });
  }

  return Array.from(byKey.values())
    .filter((item) => Boolean(readThumbnailEditorUpload(item.uploadKey)))
    .map((item) => {
      const result = readThumbnailEditorUploadResult(item.uploadKey);
      return {
        ...item,
        latestResultUrl: result?.candidates[0]?.url ?? null,
        resultCount: result?.candidates.length ?? 0,
        lastGeneratedAt: result?.createdAt ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseRecentUploads(raw: string | null): ThumbnailEditorRecentUpload[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isRecentUpload);
  } catch {
    return [];
  }
}

function isRecentUpload(value: unknown): value is ThumbnailEditorRecentUpload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ThumbnailEditorRecentUpload>;
  return (
    typeof item.uploadKey === 'string' &&
    typeof item.productName === 'string' &&
    (item.mode === 'edit' || item.mode === 'creative') &&
    typeof item.createdAt === 'string'
  );
}

function isUploadResult(value: unknown): value is ThumbnailEditorUploadResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ThumbnailEditorUploadResult>;
  return (
    Array.isArray(item.candidates) &&
    item.candidates.every(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { url?: unknown }).url === 'string' &&
        typeof (candidate as { filename?: unknown }).filename === 'string',
    ) &&
    (item.mode === 'edit' || item.mode === 'creative') &&
    typeof item.productName === 'string' &&
    typeof item.createdAt === 'string'
  );
}
