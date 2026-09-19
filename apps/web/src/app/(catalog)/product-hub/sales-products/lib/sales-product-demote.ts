import type { SalesProduct } from '@kiditem/shared/sales-product';

/**
 * 수집상품으로 되돌리기를 보일지 · 누를 수 있는지. 서버(`demoteToCandidate`)와 같은 조건이다 — 수집상품에서 만든
 * 판매상품만, 몰에 올라간 상품과 이어져 있지 않을 때.
 */
export type SalesProductDemoteState =
  | { kind: 'hidden' }
  | { kind: 'demoted' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'ready' };

export function salesProductDemoteState(
  product: Pick<SalesProduct, 'sourceCandidateId' | 'status' | 'channelListings' | 'options'>,
): SalesProductDemoteState {
  if (!product.sourceCandidateId) return { kind: 'hidden' };
  if (product.status === 'archived') return { kind: 'demoted' };
  const listings = product.channelListings.filter((listing) => listing.isActive).length;
  const options = product.options.reduce((sum, option) => sum + option.linkedChannelOptionCount, 0);
  if (listings > 0 || options > 0) {
    return { kind: 'blocked', reason: '몰에 올라간 상품과 이어져 있어 되돌릴 수 없습니다. 몰에서 내리고 연결을 끊은 뒤 되돌리세요.' };
  }
  return { kind: 'ready' };
}
