export interface BrowserOperationProducerInput {
  type: string;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface BrowserOperationProducerDefinition {
  title: string;
  href: string;
}

const BROWSER_OPERATION_PRODUCERS = new Set([
  'dashboard_data_collect:readiness_check',
  'ad_sync:ad_extension_run',
  'thumbnail_analysis:browser_batch',
]);

const READINESS_OPERATION_DEFINITIONS = new Map<
  string,
  BrowserOperationProducerDefinition
>([
  ['wing_sales', { title: '쿠팡 Wing 데이터 수집', href: '/dashboard' }],
  ['rocket_sales', { title: '쿠팡 로켓 매출 수집', href: '/sales-analysis?tab=rocket-daily' }],
  ['coupang_ads', { title: '쿠팡 광고 데이터 수집', href: '/ad-ops' }],
  ['coupang_products', { title: '쿠팡 상품 데이터 수집', href: '/dashboard' }],
  ['wing_kpi', { title: 'Wing 아이템위너 KPI', href: '/dashboard' }],
  ['keyword_rank', { title: '쿠팡 키워드 순위 수집', href: '/rank-tracking' }],
]);

export function isBrowserOperationProducer(
  type: string,
  sourceType: string | null | undefined,
): boolean {
  return BROWSER_OPERATION_PRODUCERS.has(`${type}:${sourceType ?? ''}`);
}

export function resolveBrowserOperationProducer(
  input: BrowserOperationProducerInput,
): BrowserOperationProducerDefinition | null {
  if (input.type === 'dashboard_data_collect' && input.sourceType === 'readiness_check') {
    if (!input.sourceId) return null;
    return READINESS_OPERATION_DEFINITIONS.get(input.sourceId) ?? null;
  }
  if (input.type === 'ad_sync' && input.sourceType === 'ad_extension_run') {
    return { title: '광고 동기화', href: '/ad-ops' };
  }
  if (input.type === 'thumbnail_analysis' && input.sourceType === 'browser_batch') {
    return { title: '썸네일 AI 분류', href: '/product-pipeline/thumbnail-generation' };
  }
  return null;
}
