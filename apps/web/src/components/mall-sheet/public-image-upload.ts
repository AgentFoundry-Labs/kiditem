import {
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import type { SalesProductPublicImageSaveRequest } from '@kiditem/shared/sales-product';

/**
 * 사진 올리기 — 몰 서버는 우리 사진 저장소(로컬 · 사무실 MinIO)를 못 연다. 확장이 그 사진을 우리 상점 첨부 저장소
 * (키즈노트)에 올려 몰이 읽는 공개 주소를 받고, 웹이 그 주소를 서버에 복사본으로 저장한다. 판매상품의 사진 주소는
 * 바꾸지 않는다 — 몰 엑셀을 만들 때만 복사본으로 바꿔 넣는다.
 */

/** 확장 `PUBLIC_IMAGE_SOURCE_ORIGINS` 와 같아야 한다 — 확장은 이 두 곳 사진만 받아 올린다. */
export const PUBLIC_IMAGE_SOURCE_ORIGINS = ['http://localhost:9000', 'http://kiditem-office:9000'] as const;
/** 확장 `PUBLIC_IMAGE_BATCH` 와 같다. 한 번에 이만큼 보내고 진행을 보인다. */
export const PUBLIC_IMAGE_BATCH = 20;
export const PUBLIC_IMAGE_HOST = 'kidsnote';
const PUBLIC_IMAGE_CAPABILITY = 'publicImageHostV1';
const BATCH_TIMEOUT_MS = 180_000;

export interface PublicImageUploadProgress {
  done: number;
  total: number;
  failed: number;
}

export interface PublicImageUploadResult {
  saved: number;
  failed: { url: string; error: string }[];
  /** 키즈노트 관리자에서 로그아웃이라 멈췄다. */
  needsLogin: boolean;
}

interface HostResponse {
  success?: boolean;
  needsLogin?: boolean;
  error?: string;
  images?: { sourceUrl: string; publicUrl?: string; error?: string }[];
}

export function isUploadableImageSource(url: string): boolean {
  try {
    return (PUBLIC_IMAGE_SOURCE_ORIGINS as readonly string[]).includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export async function uploadPublicImages(
  urls: readonly string[],
  options: {
    save: (body: SalesProductPublicImageSaveRequest) => Promise<{ saved: number }>;
    onProgress?: (progress: PublicImageUploadProgress) => void;
    signal?: AbortSignal;
  },
): Promise<PublicImageUploadResult> {
  const uploadable = [...new Set(urls)].filter(isUploadableImageSource);
  const failed = [...new Set(urls)]
    .filter((url) => !isUploadableImageSource(url))
    .map((url) => ({ url, error: '우리 사진 저장소 주소가 아니라 올릴 수 없습니다.' }));
  if (uploadable.length === 0) return { saved: 0, failed, needsLogin: false };

  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) throw new Error('확장프로그램이 필요합니다. KidItem 확장을 켜고 키즈노트 관리자에 로그인한 뒤 다시 누르세요.');
  const runtime = await detectOrderCollectionExtensionRuntime(1200, [PUBLIC_IMAGE_CAPABILITY]);
  if (runtime.status !== 'ready') {
    throw new Error(
      `설치된 KidItem 확장${runtime.status === 'incompatible' ? `(${runtime.version})` : ''}이 사진 올리기를 모릅니다. `
      + 'chrome://extensions 에서 확장을 새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 누르세요.',
    );
  }

  let saved = 0;
  let done = 0;
  const report = () => options.onProgress?.({ done, total: uploadable.length, failed: failed.length });
  report();
  for (let start = 0; start < uploadable.length; start += PUBLIC_IMAGE_BATCH) {
    if (options.signal?.aborted) break;
    const batch = uploadable.slice(start, start + PUBLIC_IMAGE_BATCH);
    const response = await sendToExtension<HostResponse>(
      extensionId,
      { action: 'hostPublicImages', urls: batch },
      BATCH_TIMEOUT_MS,
    );
    const images = response?.images ?? [];
    if (images.length === 0 && response?.success !== true) {
      throw new Error(response?.error ?? '사진을 올리지 못했습니다.');
    }
    const hosted = images.filter((image): image is { sourceUrl: string; publicUrl: string } => Boolean(image.publicUrl));
    if (hosted.length > 0) {
      // 올린 만큼은 곧바로 남긴다 — 중간에 멈춰도 다음에 다시 올리지 않게.
      const result = await options.save({
        images: hosted.map((image) => ({ sourceUrl: image.sourceUrl, publicUrl: image.publicUrl, host: PUBLIC_IMAGE_HOST })),
      });
      saved += result.saved;
    }
    for (const image of images) {
      if (!image.publicUrl) failed.push({ url: image.sourceUrl, error: image.error ?? '올리지 못했습니다.' });
    }
    done += images.length;
    report();
    if (response?.needsLogin) return { saved, failed, needsLogin: true };
  }
  return { saved, failed, needsLogin: false };
}
