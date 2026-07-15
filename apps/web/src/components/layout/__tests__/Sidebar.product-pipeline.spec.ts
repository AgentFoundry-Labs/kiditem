import { describe, expect, it } from 'vitest';
import { menuSections } from '../sidebar-menu';

describe('Sidebar product pipeline navigation', () => {
  it('promotes sourcing into its own agent section', () => {
    const sourcingAgent = menuSections.find((section) => section.label === '소싱 에이전트');

    expect(sourcingAgent?.items.map((item) => [item.href, item.label])).toEqual([
      ['/sourcing-ai', '소싱 홈'],
      ['/sourcing-ai/market', '시장 분석'],
      ['/sourcing-ai/keywords', '키워드 분석'],
      ['/sourcing-ai/category-sourcing', '카테고리 소싱'],
      ['/sourcing-ai/competitor-analysis', '경쟁업체 분석'],
      ['/sourcing-ai/wing-catalog', '쿠팡 상품 분석'],
      ['/sourcing-ai/product-tracking', '상품 추적'],
      ['/sourcing-ai/recommendations', '오늘의 추천'],
      ['/sourcing-ai/wholesale-search', '도매 상품 검색'],
      ['/sourcing-ai/validation', '상품 검증'],
      ['/sourcing-ai/final-selection', '최종 선택'],
      ['/sourcing-ai/settings', '소싱 설정'],
    ]);
  });

  it('uses product-pipeline routes and exposes standalone thumbnail generation in the sidebar', () => {
    const productAgent = menuSections.find((section) => section.label === '상품 에이전트');

    expect(productAgent?.items.map((item) => [item.href, item.label])).toEqual([
      ['/product-pipeline/productgenerate', '상품 생성'],
      ['/product-pipeline/collected-products', '수집 상품'],
      ['/product-pipeline/registered-products', '등록 상품'],
      ['/product-pipeline/detail-template-generation', '상세 템플릿 생성'],
      ['/product-pipeline/thumbnail-ai', '썸네일 AI'],
      ['/product-pipeline/thumbnail-generation', '썸네일 생성'],
    ]);
  });

  it('places ad strategy under the marketing agent after product agent', () => {
    const productAgentIndex = menuSections.findIndex((section) => section.label === '상품 에이전트');
    const marketingAgentIndex = menuSections.findIndex((section) => section.label === '마케팅 에이전트');
    const marketingAgent = menuSections[marketingAgentIndex];
    const topSection = menuSections[0];

    expect(marketingAgentIndex).toBe(productAgentIndex + 1);
    expect(marketingAgent?.items.map((item) => [item.href, item.label])).toEqual([
      ['/ad-ops', '광고전략 AI'],
      ['/rank-tracking', '쿠팡 순위추적'],
    ]);
    expect(topSection.items.some((item) => item.href === '/ad-ops')).toBe(false);
  });

  it('keeps one compact operations group with exactly the five canonical workspaces', () => {
    const operations = menuSections.find((section) => section.label === '운영');

    expect(operations?.items.map((item) => [item.href, item.label])).toEqual([
      ['/product-hub', '상품 관리'],
      ['/product-hub/matching', '상품 매칭'],
      ['/order-hub', '주문 처리'],
      ['/purchase-orders', '발주 관리'],
      ['/inventory-hub', '재고 관리'],
    ]);
  });

  it('does not expose obsolete operations hrefs from any sidebar section', () => {
    const hrefs = menuSections.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).not.toEqual(expect.arrayContaining([
      '/inventory',
      '/stock-ops',
      '/order-collection',
      '/orders',
      '/unshipped-items',
      '/outbound',
      '/order-status-hub',
      '/rocket-orders',
      '/product-hub/options',
    ]));
  });
});
