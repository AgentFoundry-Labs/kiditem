export interface ActionTaskSeed {
  taskKey: string;
  type: 'human' | 'ai';
  label: string;
  detail?: string;
  where?: string;
  href?: string;
  priority: 'urgent' | 'high' | 'medium';
  role?: string;
  apiCall?: Record<string, unknown>;
}

export interface ActionTaskSeedMetrics {
  minusProducts: number;
  lowProfitProducts: number;
  highAdProducts: number;
  needReorder: number;
  adRate: number;
  lowCtrProducts: number;
  lowReviewProducts: number;
}

export function generateActionTaskSeeds(metrics: ActionTaskSeedMetrics): ActionTaskSeed[] {
  const seeds: ActionTaskSeed[] = [];

  if (metrics.highAdProducts > 0) {
    seeds.push({
      taskKey: 'h-ad-bid', type: 'human',
      label: `광고비 초과 ${metrics.highAdProducts}개 — 입찰가 하향 조정`,
      detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
      where: '쿠팡 광고센터', priority: 'urgent', role: 'ad', href: '/ad-ops',
    });
  }
  if (metrics.minusProducts > 0) {
    seeds.push({
      taskKey: 'h-minus-ad-stop', type: 'human',
      label: `적자 상품 ${metrics.minusProducts}개 — 광고 중단 처리`,
      detail: '쿠팡 광고센터에서 적자 상품 캠페인 OFF 처리',
      where: '쿠팡 광고센터', priority: 'urgent', role: 'ad', href: '/product-hub?tab=cleanup',
    });
    seeds.push({
      taskKey: 'h-minus-price', type: 'human',
      label: `적자 상품 ${metrics.minusProducts}개 — 판매가 인상 검토`,
      detail: '경쟁사 가격 확인 후 마진 확보 가능한 상품 가격 조정',
      where: '쿠팡 윙', priority: 'high', role: 'finance', href: '/product-hub?tab=cleanup',
    });
  }
  if (metrics.needReorder > 0) {
    seeds.push({
      taskKey: 'h-reorder', type: 'human',
      label: `${metrics.needReorder}개 상품 — 매입처에 발주`,
      detail: '안전재고 이하 상품을 매입처에 발주서 전송',
      where: '매입처/1688', priority: 'high', role: 'inventory', href: '/purchase-orders',
    });
  }
  if (metrics.adRate > 12) {
    seeds.push({
      taskKey: 'h-ad-rate', type: 'human',
      label: `전체 광고비율 ${Math.round(metrics.adRate * 10) / 10}% — 비효율 캠페인 정리`,
      detail: 'ROAS 200% 미만 캠페인을 쿠팡 광고센터에서 OFF 또는 입찰가 50% 하향',
      where: '쿠팡 광고센터', priority: 'high', role: 'ad',
    });
  }
  if (metrics.lowProfitProducts > 0) {
    seeds.push({
      taskKey: 'h-low-profit', type: 'human',
      label: `저이익 ${metrics.lowProfitProducts}개 — 소싱처/수수료 재검토`,
      detail: '원가 절감 가능한 소싱처 확인, 카테고리 수수료율 점검',
      where: '소싱처/쿠팡 윙', priority: 'medium', role: 'finance', href: '/product-hub?tab=cleanup',
    });
  }
  if (metrics.lowCtrProducts > 0) {
    seeds.push({
      taskKey: 'h-thumbnail', type: 'human',
      label: `썸네일 개선 필요 ${metrics.lowCtrProducts}개 — CTR 1.5% 미만`,
      detail: '메인 이미지 교체, 텍스트 삽입, 배경 정리로 클릭률 개선',
      where: '포토샵/쿠팡 윙', priority: 'high', role: 'data', href: '/product-pipeline/thumbnail-generation',
    });
  }
  if (metrics.lowReviewProducts > 0) {
    seeds.push({
      taskKey: 'h-review', type: 'human',
      label: `A등급 리뷰 부족 ${metrics.lowReviewProducts}개 — 리뷰 확보 필요`,
      detail: '리뷰 이벤트 진행, 구매 후 리뷰 요청 문자 발송',
      where: '쿠팡 윙/CS', priority: 'medium', role: 'data', href: '/reviews',
    });
  }
  if (metrics.minusProducts > 0) {
    seeds.push({
      taskKey: 'h-price-reset', type: 'human',
      label: `적자 ${metrics.minusProducts}개 — 가격 구성 전략 재검토`,
      detail: '원가+수수료+광고비 합산 후 최소 마진 확보 가격으로 재설정',
      where: '쿠팡 윙', priority: 'high', role: 'finance', href: '/profit-loss',
    });
  }
  seeds.push({
    taskKey: 'h-ad-csv', type: 'human',
    label: '쿠팡 광고센터 리포트 다운로드 & 업로드',
    detail: '광고센터 → 리포트 다운로드(CSV) → 여기에 업로드해서 데이터 갱신',
    where: '쿠팡 광고센터 → 업로드', priority: 'medium', role: 'ad',
  });

  seeds.push({
    taskKey: 'recalc-grade', type: 'ai',
    label: 'ABC 등급 재계산', detail: '14일 매출 기반 등급 재산정 + 변동 리포트',
    priority: 'high', role: 'data',
    apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
  });
  if (metrics.minusProducts > 0) {
    seeds.push({
      taskKey: 'analyze-deficit', type: 'ai',
      label: `적자 상품 ${metrics.minusProducts}개 분석`,
      detail: '적자 원인 분석: 광고비 과다 / 원가 문제 / 가격 오류',
      priority: 'urgent', role: 'finance',
      apiCall: { url: '/api/products?status=active&sortBy=profitRate&sortDir=asc&period=14', method: 'GET' },
    });
  }
  seeds.push({
    taskKey: 'analyze-ad-rules', type: 'ai',
    label: '광고 자동규칙 전략 분석',
    detail: 'A/B/C 등급별 광고 규칙 평가 → 수정 요청 생성',
    priority: 'urgent', role: 'ad',
    apiCall: { url: '/api/ad-rules', method: 'GET' },
  });
  if (metrics.highAdProducts > 0) {
    seeds.push({
      taskKey: 'analyze-ad', type: 'ai',
      label: `광고비 초과 ${metrics.highAdProducts}개 분석`,
      detail: 'ROAS/CTR 분석 → 중단/축소/유지 판단',
      priority: 'high', role: 'ad',
      apiCall: { url: '/api/products?sortBy=revenue&sortDir=desc&period=14', method: 'GET' },
    });
  }
  if (metrics.needReorder > 0) {
    seeds.push({
      taskKey: 'analyze-stock', type: 'ai',
      label: `재고 부족 ${metrics.needReorder}개 분석`,
      detail: '판매속도 대비 재고일수 계산 → 발주 추천량',
      priority: 'high', role: 'inventory',
      apiCall: { url: '/api/inventory', method: 'GET' },
    });
  }
  if (metrics.lowCtrProducts > 0) {
    seeds.push({
      taskKey: 'analyze-ctr', type: 'ai',
      label: `썸네일 CTR 분석 (${metrics.lowCtrProducts}개)`,
      detail: 'CTR 1.5% 미만 상품 → 개선 우선순위',
      priority: 'medium', role: 'data',
      apiCall: { url: '/api/products?sortBy=revenue&sortDir=desc&period=14', method: 'GET' },
    });
  }
  seeds.push({
    taskKey: 'analyze-category', type: 'ai',
    label: '카테고리별 성과 분석',
    detail: '카테고리별 매출/이익률/ROAS 비교',
    priority: 'medium', role: 'finance',
    apiCall: { url: '/api/coupang/category', method: 'GET' },
  });

  return seeds;
}
