export const SOURCING_SOURCE_FILTERS = [
  { key: 'all', label: '전체 후보', platform: undefined },
  { key: '1688', label: '1688 수집', platform: '1688' },
  { key: 'self-collected', label: '자체 수집', platform: 'kiditem-detail-page' },
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
  if (filter === 'self-collected') {
    return {
      title: '자체 수집 상품이 없습니다.',
      description: '상세 템플릿 생성에서 상품 이미지와 정보를 넣으면 자체 수집 카드가 여기에 만들어집니다.',
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
    description: '1688 수집 또는 자체 수집 상세 생성으로 첫 상품을 등록해 보세요.',
  };
}
