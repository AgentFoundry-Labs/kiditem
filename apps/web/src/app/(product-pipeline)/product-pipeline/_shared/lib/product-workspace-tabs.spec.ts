import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_WORKSPACE_TAB,
  PRODUCT_WORKSPACE_TABS,
  buildProductWorkspaceTabUrl,
  parseProductWorkspaceTab,
} from './product-workspace-tabs';

describe('product workspace tabs', () => {
  it('exposes the approved tab order without generation history', () => {
    expect(PRODUCT_WORKSPACE_TABS.map((tab) => tab.key)).toEqual([
      'basic',
      'options',
      'thumbnail',
      'detail',
      'raw',
    ]);
    expect(PRODUCT_WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      '기본정보',
      '옵션·판매가',
      '썸네일',
      '상세페이지',
      '원본 데이터',
    ]);
    expect(PRODUCT_WORKSPACE_TABS.some((tab) => tab.label === '생성 이력')).toBe(false);
  });

  it('parses invalid tab input as the default tab', () => {
    expect(DEFAULT_PRODUCT_WORKSPACE_TAB).toBe('basic');
    expect(parseProductWorkspaceTab('thumbnail')).toBe('thumbnail');
    expect(parseProductWorkspaceTab('history')).toBe('basic');
    expect(parseProductWorkspaceTab(null)).toBe('basic');
  });

  it('builds stable tab urls and clears generationId when leaving detail or thumbnail work', () => {
    expect(buildProductWorkspaceTabUrl({
      pathname: '/product-pipeline/collected-products/candidate-1',
      currentSearch: 'tab=detail&generationId=gen-1&foo=bar',
      tab: 'thumbnail',
    })).toBe('/product-pipeline/collected-products/candidate-1?foo=bar&tab=thumbnail');

    expect(buildProductWorkspaceTabUrl({
      pathname: '/product-pipeline/collected-products/candidate-1',
      currentSearch: 'tab=thumbnail&generationId=gen-1',
      tab: 'basic',
    })).toBe('/product-pipeline/collected-products/candidate-1');
  });
});
