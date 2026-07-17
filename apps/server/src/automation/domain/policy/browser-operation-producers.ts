import {
  BrowserCollectionRunIdSchema,
  type BrowserCollectionProducer,
} from '@kiditem/shared/browser-collection-session';

export interface BrowserOperationProducerInput {
  operationKey: string;
  type: string;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface BrowserOperationProducerDefinition {
  title: string;
  href: string;
}

type CollectionProducerDefinition = BrowserOperationProducerDefinition & {
  appendCollectionRun?: boolean;
};

const COLLECTION_PRODUCERS = new Map<
  BrowserCollectionProducer,
  CollectionProducerDefinition
>([
  ['dashboard.wing_sales', { title: '쿠팡 Wing 데이터 수집', href: '/dashboard' }],
  [
    'dashboard.rocket_sales',
    { title: '쿠팡 로켓 매출 수집', href: '/sales-analysis?tab=rocket-daily' },
  ],
  ['dashboard.coupang_ads', { title: '쿠팡 광고 데이터 수집', href: '/ad-ops' }],
  [
    'dashboard.coupang_products',
    { title: '쿠팡 상품 데이터 수집', href: '/dashboard' },
  ],
  ['dashboard.wing_kpi', { title: 'Wing 아이템위너 KPI', href: '/dashboard' }],
  ['advertising.ad_sync', { title: '광고 동기화', href: '/ad-ops' }],
  ['advertising.scrape_targets', { title: '광고 데이터 수집', href: '/ad-ops' }],
  [
    'advertising.wing_rank',
    { title: '쿠팡 Wing 판매순위 수집', href: '/rank-tracking' },
  ],
  [
    'advertising.keyword_rank',
    { title: '쿠팡 키워드 순위 수집', href: '/rank-tracking' },
  ],
  [
    'advertising.competitor_catalog',
    { title: '쿠팡 경쟁상품 수집', href: '/sourcing-ai/competitor-analysis' },
  ],
  [
    'channels.coupang_catalog',
    {
      title: '쿠팡 전체 상품 가져오기',
      href: '/product-pipeline/registered-products',
    },
  ],
  [
    'sourcing.wing_catalog',
    { title: '쿠팡 상품 분석', href: '/sourcing-ai/wing-catalog' },
  ],
  [
    'sourcing.1688_trend',
    { title: '1688 트렌드 수집', href: '/sourcing-ai/market' },
  ],
  [
    'sourcing.live_commerce',
    { title: '라이브커머스 수집', href: '/sourcing-ai/market' },
  ],
  ['orders.mall', { title: '주문 데이터 수집', href: '/order-collection' }],
  [
    'inventory.sellpia',
    {
      title: 'Sellpia 재고 갱신',
      href: '/inventory-hub?tab=sellpia-sync',
      appendCollectionRun: false,
    },
  ],
]);

const BROWSER_COLLECTION_OPERATION_KEY = /^browser-collection:(.+)$/;
const SELLPIA_QUALITY_OPERATION_KEY =
  /^sellpia-inventory-quality:[a-f0-9]{64}:[a-z0-9_.-]{1,100}$/;
const SELLPIA_QUALITY_PRODUCER: BrowserOperationProducerDefinition = {
  title: 'Sellpia 재고 품질 확인 필요',
  href: '/stock-ops?tab=freshness',
};

export function isBrowserOperationProducer(
  input: BrowserOperationProducerInput,
): boolean {
  return resolveBrowserOperationProducer(input) !== null;
}

export function resolveBrowserOperationProducer(
  input: BrowserOperationProducerInput,
): BrowserOperationProducerDefinition | null {
  if (
    input.type === 'sellpia_inventory_quality' &&
    input.sourceType === 'sellpia_inventory_import' &&
    typeof input.sourceId === 'string' &&
    BrowserCollectionRunIdSchema.safeParse(input.sourceId).success &&
    SELLPIA_QUALITY_OPERATION_KEY.test(input.operationKey)
  ) {
    return SELLPIA_QUALITY_PRODUCER;
  }

  if (
    input.type !== 'browser_collection' ||
    input.sourceType !== 'browser_collection_session' ||
    !input.sourceId
  ) {
    return null;
  }

  const operationKeyMatch = BROWSER_COLLECTION_OPERATION_KEY.exec(
    input.operationKey,
  );
  const producer = COLLECTION_PRODUCERS.get(
    input.sourceId as BrowserCollectionProducer,
  );
  if (
    !operationKeyMatch ||
    !BrowserCollectionRunIdSchema.safeParse(operationKeyMatch[1]).success ||
    !producer
  ) {
    return null;
  }

  const collectionRun = operationKeyMatch[1];
  if (producer.appendCollectionRun === false) {
    return { title: producer.title, href: producer.href };
  }
  const separator = producer.href.includes('?') ? '&' : '?';
  return {
    title: producer.title,
    href: `${producer.href}${separator}collectionRun=${collectionRun}`,
  };
}
