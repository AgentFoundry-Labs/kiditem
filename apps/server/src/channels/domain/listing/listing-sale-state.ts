import { resolveChannelListingSaleState, type ChannelListingSaleState } from '@kiditem/shared/channel-listing';

/** 몰 원본 판매상태를 싣는 rawJson 평면 키(윙 엑셀 적재가 `saleStatus`로 쓴다). 판매중 판정이 읽는 유일한 파서다. */
const RAW_SALE_STATUS_KEYS = ['saleStatus', 'salesStatus', 'sale_status', '판매상태'] as const;

export function listingRawSaleStatus(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) return null;
  const record = rawJson as Record<string, unknown>;
  for (const key of RAW_SALE_STATUS_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/**
 * 리스팅 한 줄의 판매중 정본 판정(KID-333 ②, shared `resolveChannelListingSaleState`). 옵션은 켜진 것만 본다 —
 * 지운 옵션의 글자가 남은 옵션의 품절을 가리지 않게.
 */
export function listingSaleState(listing: Readonly<{
  isActive: boolean;
  status: string | null;
  rawJson: unknown;
  options: ReadonlyArray<Readonly<{ status: string | null; isActive: boolean }>>;
}>): ChannelListingSaleState {
  return resolveChannelListingSaleState({
    isActive: listing.isActive,
    listingStatus: listing.status,
    rawStatus: listingRawSaleStatus(listing.rawJson),
    optionStatuses: listing.options.filter((option) => option.isActive).map((option) => option.status),
  });
}
