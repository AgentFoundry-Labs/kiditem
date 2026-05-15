import { describe, expect, it } from 'vitest';
import { buildEditHref } from './build-edit-href';

describe('buildEditHref', () => {
  it('builds product-pipeline thumbnail creation links for product-owned work', () => {
    expect(buildEditHref({
      productId: 'product-123',
      imageUrl: 'https://cdn.example.com/source.jpg',
      generationId: 'generation-456',
      productName: 'LED 산타트리',
      returnTo: '/product-pipeline/registered-products/workspace-123',
    })).toContain('/product-pipeline/thumbnail-generation/edit?');
  });

  it('preserves sourceCandidateId and return path for collected-product thumbnail creation', () => {
    const href = buildEditHref({
      sourceCandidateId: 'candidate-123',
      imageUrl: 'https://cdn.example.com/source.jpg',
      productName: '쭉쭉붙이는터치등',
      returnTo: '/product-pipeline/collected-products/candidate-123',
    });

    expect(href).toContain('/product-pipeline/thumbnail-generation/edit?');
    expect(href).toContain('sourceCandidateId=candidate-123');
    expect(href).toContain('returnTo=%2Fproduct-pipeline%2Fcollected-products%2Fcandidate-123');
    expect(href).toContain('%EC%AD%89%EC%AD%89%EB%B6%99%EC%9D%B4%EB%8A%94%ED%84%B0%EC%B9%98%EB%93%B1');
    expect(href).not.toContain('productId=');
  });
});
