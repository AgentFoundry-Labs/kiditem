export const SOURCING_SOURCE_FILTERS = [
  { key: 'all', label: '전체 후보', platform: undefined },
  { key: '1688', label: '1688 수집', platform: '1688' },
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
      title: '상품 생성 후보가 없습니다.',
      description: '상품 생성에서 이미지와 정보를 입력하면 후보 카드가 여기에 만들어집니다.',
    };
  }
  if (filter === '1688') {
    return {
      title: '1688 수집 상품이 없습니다.',
      description: '1688 URL 수집이나 엑셀 수집으로 첫 상품을 등록해 보세요.',
    };
  }
  return {
    title: '수집된 상품이 없습니다.',
    description: '1688 수집 또는 상품 생성으로 첫 후보를 등록해 보세요.',
  };
}
