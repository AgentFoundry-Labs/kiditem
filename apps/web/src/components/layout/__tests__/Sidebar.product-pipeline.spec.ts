import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { menuSections } from '../sidebar-menu';

describe('Sidebar product pipeline navigation', () => {
  it('keeps the exact top, section, and footer navigation set', () => {
    expect(menuSections.map((section) => [
      section.label,
      section.items.map((item) => [item.href, item.label]),
    ])).toEqual([
      ['', [
        ['/dashboard', '대시보드'],
        ['/action-board', '액션 보드'],
      ]],
      ['소싱 에이전트', [
        ['/sourcing-ai', '소싱 홈'],
        ['/sourcing-ai/market', '시장 분석'],
        ['/sourcing-ai/keywords', '키워드 분석'],
        ['/sourcing-ai/category-sourcing', '카테고리 소싱'],
        ['/sourcing-ai/competitor-analysis', '경쟁업체 분석'],
        ['/sourcing-ai/wing-catalog', '쿠팡 상품 분석'],
        ['/sourcing-ai/product-tracking', '상품 추적'],
        ['/sourcing-ai/rising-products', '급상승 탐지'],
        ['/sourcing-ai/recommendations', '오늘의 추천'],
        ['/sourcing-ai/wholesale-search', '도매 상품 검색'],
        ['/sourcing-ai/decision-center', '의사결정 센터'],
        ['/sourcing-ai/validation', '상품 검증'],
        ['/sourcing-ai/final-selection', '최종 선택'],
        ['/sourcing-ai/settings', '소싱 설정'],
      ]],
      ['상품 에이전트', [
        ['/product-pipeline/productgenerate', '상품 생성'],
        ['/product-pipeline/collected-products', '수집 상품'],
        ['/product-pipeline/registered-products', '등록 상품'],
        ['/product-pipeline/detail-template-generation', '상세 템플릿 생성'],
        ['/product-pipeline/thumbnail-ai', '썸네일 AI'],
        ['/product-pipeline/thumbnail-generation', '썸네일 생성'],
      ]],
      ['마케팅 에이전트', [
        ['/ad-ops', '광고전략 AI'],
        ['/rank-tracking', '쿠팡 순위추적'],
      ]],
      ['상품 관리', [
        ['/product-hub', '상품 관리'],
        ['/product-hub/matching', '상품 매칭'],
        ['/reviews', '리뷰 관리'],
      ]],
      ['쇼핑몰 에이전트', [
        ['/mall-home', '쇼핑몰 홈'],
        ['/mall-channels', '쇼핑몰 현황'],
        ['/mall-settings', '쇼핑몰 계정'],
        ['/mall-listings', '상품 등록'],
        ['/mall-availability', '품절 관리'],
        ['/mall-tasks', '송신 내역'],
      ]],
      ['주문관리', [
        ['/order-collection', '주문수집'],
        ['/rocket-orders', '쿠팡 로켓'],
      ]],
      ['재고관리', [
        ['/inventory-hub', '재고 관리'],
        ['/stock-ops', '재고 분석'],
      ]],
      ['출고반품', [
        ['/coupang-shipments', '쿠팡 쉽먼트'],
      ]],
      ['재무분석', [
        ['/profit-loss', '손익 분석'],
        ['/sales-analysis', '매출 분석'],
      ]],
      ['', [
        ['/agent-org', 'Agent Org'],
        ['/agent-os', 'Agent OS'],
        ['/settings', '설정'],
      ]],
    ]);
  });

  it('keeps Dashboard navigation composition in Sidebar while delegating only its frame to the shared shell', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/layout/Sidebar.tsx'),
      'utf8',
    );

    expect(source).toContain('CollapsibleSidebarShell');
    expect(source).toContain('<CollapsibleSidebarShell');
    expect(source).toContain('menuSections.slice(0, -1).map');
    expect(source).toContain('menuSections[menuSections.length - 1].items.map');
  });
});
