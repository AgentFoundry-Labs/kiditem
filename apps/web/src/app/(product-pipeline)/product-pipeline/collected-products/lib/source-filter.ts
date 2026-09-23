/**
 * 수집상품 탭 — 판매상품 초안의 원천 장터(`SalesProduct.sourcePlatform`)로 거른다.
 *
 * 값은 초안을 만들 때 원천 기록에서 복사한 것이다(`createFromSource`). 원천 기록은 1688 · 알리바바
 * 수집(`sourcing-extension-ingest`), 쿠팡 추천(`sourcing-recommendation`), 상품 생성
 * (`KIDITEM_PRODUCT_REGISTRATION`)이 만든다. 원천이 없는 초안은 전체에만 보인다.
 */
export const SOURCING_SOURCE_FILTERS = [
  { key: 'all', label: '전체', platform: undefined },
  { key: '1688', label: '1688', platform: '1688' },
  { key: 'alibaba', label: '알리바바', platform: 'alibaba' },
  { key: 'coupang', label: '쿠팡', platform: 'coupang' },
  { key: 'manual-registration', label: '상품 생성', platform: 'KIDITEM_PRODUCT_REGISTRATION' },
] as const;

export type SourcingSourceFilter = (typeof SOURCING_SOURCE_FILTERS)[number]['key'];

export function platformForSourceFilter(
  filter: SourcingSourceFilter,
): string | undefined {
  return SOURCING_SOURCE_FILTERS.find((item) => item.key === filter)?.platform;
}

export function emptyStateCopyForSourceFilter(filter: SourcingSourceFilter): {
  title: string;
  description: string;
} {
  if (filter === 'manual-registration') {
    return {
      title: '상품 생성으로 만든 초안이 없습니다.',
      description: '상품 생성에서 이미지와 정보를 입력하면 판매상품 초안이 여기에 만들어집니다.',
    };
  }
  if (filter === 'all') {
    return {
      title: '판매상품 초안이 없습니다.',
      description: '1688 수집 또는 상품 생성으로 첫 상품을 담아 보세요.',
    };
  }
  const label = SOURCING_SOURCE_FILTERS.find((item) => item.key === filter)?.label ?? filter;
  return {
    title: `${label}에서 온 초안이 없습니다.`,
    description: '수집한 상품은 판매상품 초안으로 여기에 모입니다.',
  };
}
