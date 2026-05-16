import { describe, expect, it } from 'vitest';
import { menuSections } from '../Sidebar';

describe('Sidebar product pipeline navigation', () => {
  it('uses product-pipeline routes and keeps standalone thumbnail generation out of the sidebar', () => {
    const productPipeline = menuSections.find((section) => section.label === '상품 파이프라인');

    expect(productPipeline?.items.map((item) => [item.href, item.label])).toEqual([
      ['/product-pipeline/productgenerate', '상품 등록'],
      ['/product-pipeline/collected-products', '수집 상품'],
      ['/product-pipeline/registered-products', '등록 상품'],
      ['/product-pipeline/detailgenerate', '상세 템플릿 생성'],
      ['/product-pipeline/thumbnail-ai', '썸네일 AI'],
    ]);
  });
});
