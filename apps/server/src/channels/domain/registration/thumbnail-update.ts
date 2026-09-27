import type { ThumbnailAccountResolutionReason } from '@kiditem/shared/thumbnail-execution';

/**
 * 몰 관리자에서 상품을 찾는 이름. listing 이름이 있으면 그 이름(URL 인코딩은 두 번까지 푼다),
 * 없으면 판매 상품 이름이다. 둘 다 비면 빈 문자열이고 호출자가 거절한다.
 */
export function thumbnailProductName(listingChannelName: string | null, salesProductName: string | null): string {
  const listingName = listingChannelName?.trim();
  return decodeProductName(listingName || salesProductName || '');
}

function decodeProductName(value: string): string {
  let current = value.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(current)) return current;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current).trim();
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * 어느 계정의 실행인지(KID-321, 몰 중립). listing 이 있으면 그 계정이다. 판매상품에 대표이미지 반영을
 * 지원하는 채널의 listing 이 여럿이면 고르지 않고 거절한다(운영자가 listing 을 고른다). listing 이
 * 하나도 없을 때만 조직의 활성 계정 중 그 능력(registry `representativeImage`)이 있는 계정이 하나인지
 * 본다 — 둘 이상이면 역시 listing 을 골라야 한다. 채널 키는 여기 들어오지 않는다.
 */
export type ThumbnailAccountResolution =
  | Readonly<{ ok: true; channelAccountId: string }>
  | Readonly<{ ok: false; reason: ThumbnailAccountResolutionReason }>;

export function resolveThumbnailAccount(input: {
  listingAccountId: string | null;
  /** 고르지 않았을 때 판매상품의 살아 있는 listing 수(대표이미지 반영을 지원하는 채널만 셈). 모르면 0 으로 본다. */
  productListingCount?: number;
  /** 대표이미지 반영을 지원하는 채널의 활성 계정 id 들. */
  activeAccountIds: readonly string[];
}): ThumbnailAccountResolution {
  if (input.listingAccountId) return { ok: true, channelAccountId: input.listingAccountId };
  if ((input.productListingCount ?? 0) > 1) return { ok: false, reason: 'ambiguous_listing' };
  const accounts = [...new Set(input.activeAccountIds)];
  if (accounts.length === 0) return { ok: false, reason: 'no_account' };
  if (accounts.length > 1) return { ok: false, reason: 'ambiguous_account' };
  return { ok: true, channelAccountId: accounts[0]! };
}

