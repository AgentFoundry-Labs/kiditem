export function sourcePlatformLabel(sourcePlatform: string | null | undefined): string {
  if (sourcePlatform === 'kiditem-detail-page') return '자체 수집';
  if (sourcePlatform === 'kiditem-thumbnail') return '썸네일 후보';
  if (sourcePlatform === 'detail-page-generator') return '자체제작';
  return sourcePlatform || '미지정';
}
