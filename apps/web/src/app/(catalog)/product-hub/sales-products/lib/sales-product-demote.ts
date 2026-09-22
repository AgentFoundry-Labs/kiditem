import type { SalesProduct } from '@kiditem/shared/sales-product';
import { SALES_PRODUCT_STATUS_LABEL } from './sales-product-labels';

/**
 * 수집상품으로 되돌리기를 보일지 · 누를 수 있는지. 서버(`demoteToCandidate`)와 같은 조건이다 — 수집상품에서 만든
 * 판매상품만, 몰에 올라간 상품과 이어져 있지 않을 때.
 */
export type SalesProductDemoteState =
  | { kind: 'hidden' }
  | { kind: 'demoted' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'ready' };

/** 되돌린 판매상품인가. 지운 것이 아니라 수집상품 쪽으로 내려 둔 것이고 다시 올리면 되살아난다. */
export function isDemotedSalesProduct(
  product: Pick<SalesProduct, 'sourceCandidateId' | 'status'>,
): boolean {
  return product.status === 'archived' && product.sourceCandidateId !== null;
}

/**
 * 목록 칸과 상세 머리글이 함께 쓰는 상태 이름. 되돌린 상품은 원시 status 대신 그 사실을 읽는다 —
 * `archived` 는 되돌리기 표식이지 '보관' 과 같은 말이 아니다.
 */
export function salesProductStatusText(
  product: Pick<SalesProduct, 'sourceCandidateId' | 'status'>,
): string {
  return isDemotedSalesProduct(product)
    ? '수집상품으로 되돌림'
    : SALES_PRODUCT_STATUS_LABEL[product.status];
}

export function salesProductDemoteState(
  product: Pick<SalesProduct, 'sourceCandidateId' | 'status' | 'channelListings' | 'options'>,
): SalesProductDemoteState {
  if (!product.sourceCandidateId) return { kind: 'hidden' };
  if (isDemotedSalesProduct(product)) return { kind: 'demoted' };
  const listings = product.channelListings.filter((listing) => listing.isActive).length;
  const options = product.options.reduce((sum, option) => sum + option.linkedChannelOptionCount, 0);
  if (listings > 0 || options > 0) {
    return { kind: 'blocked', reason: '몰에 올라간 상품과 이어져 있어 되돌릴 수 없습니다. 몰에서 내리고 연결을 끊은 뒤 되돌리세요.' };
  }
  return { kind: 'ready' };
}
