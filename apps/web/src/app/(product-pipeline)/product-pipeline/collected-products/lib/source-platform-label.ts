export function sourcePlatformLabel(sourcePlatform: string | null | undefined): string {
  if (sourcePlatform === 'KIDITEM_PRODUCT_REGISTRATION') return '상품 생성';
  if (sourcePlatform === 'kiditem-detail-page') return '상세 생성(레거시)';
  if (sourcePlatform === 'kiditem-thumbnail') return '썸네일 후보';
  if (sourcePlatform === 'detail-page-generator') return '자체제작';
  return sourcePlatform || '미지정';
}
