import { createHash } from 'node:crypto';

/**
 * 판매상품 사진 옮기기(ADR-0013) — 순수 함수.
 *
 * 사방넷을 해지하면 사방넷 서버(pic.sabangnet.co.kr)의 대표 사진이 사라진다. 그 사진만 우리 저장소로 복사하고
 * 판매상품의 사진 주소를 바꾼다. 저장 위치는 원래 주소에서 정해지므로(같은 주소 → 같은 위치) 몇 번을 돌려도
 * 결과가 같고, 사방넷 엑셀을 다시 가져와도 이미 옮긴 사진을 알아본다.
 */

const MIRRORED_IMAGE_HOSTS = new Set(['pic.sabangnet.co.kr']);

/** 저장 위치 이름에 붙일 수 있는 확장자. 실제 형식은 받은 내용으로 가린다. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

/** 옮겨야 하는 사진(사방넷 서버의 https 주소)인가. */
export function isMirrorableImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && MIRRORED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** 원래 주소 → 우리 저장소 위치. 옮길 사진이 아니거나 확장자를 모르면 null. */
export function mirroredImageKey(organizationId: string, sourceUrl: string): string | null {
  if (!isMirrorableImageUrl(sourceUrl)) return null;
  const extension = new URL(sourceUrl).pathname.split('.').pop()?.toLowerCase() ?? '';
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 40);
  return `sales-products/${organizationId}/images/${hash}.${extension === 'jpeg' ? 'jpg' : extension}`;
}

/**
 * 사방넷 엑셀을 다시 가져올 때: 들어온 사진 주소 가운데 이미 옮긴 것(지금 판매상품에 옮긴 주소가 있는 것)은
 * 옮긴 주소로 바꾼다. 그래야 다시 가져와도 사진이 사방넷 주소로 돌아가지 않는다.
 */
export function preferMirroredImageUrls(input: {
  incoming: readonly string[];
  current: readonly string[];
  mirroredUrl: (sourceUrl: string) => string | null;
}): string[] {
  const current = new Set(input.current);
  return input.incoming.map((url) => {
    const mirrored = input.mirroredUrl(url);
    return mirrored && current.has(mirrored) ? mirrored : url;
  });
}

/**
 * 아직 옮기지 않은 사진 — 판매상품 코드 순, 사진 순서대로, 같은 주소는 한 번. 순서가 늘 같아서 못 옮긴 사진을
 * 건너뛰는 자리(`skip`)로 다음 묶음을 고를 수 있다.
 */
export function pendingMirrorImages(
  organizationId: string,
  products: readonly { code: string; imageUrls: readonly string[] }[],
): { url: string; key: string }[] {
  const seen = new Set<string>();
  const pending: { url: string; key: string }[] = [];
  for (const product of [...products].sort((left, right) => left.code.localeCompare(right.code))) {
    for (const url of product.imageUrls) {
      if (seen.has(url)) continue;
      const key = mirroredImageKey(organizationId, url);
      if (!key) continue;
      seen.add(url);
      pending.push({ url, key });
    }
  }
  return pending;
}
