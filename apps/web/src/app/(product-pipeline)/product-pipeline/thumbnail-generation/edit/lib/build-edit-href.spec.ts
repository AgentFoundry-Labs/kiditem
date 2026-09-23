import { describe, expect, it } from 'vitest';
import { buildEditHref } from './build-edit-href';

describe('buildEditHref', () => {
  it('builds product workspace thumbnail links for product-owned work with returnTo', () => {
    expect(
      buildEditHref({
        contentWorkspaceId: 'product-123',
        imageUrl: 'https://cdn.example.com/source.jpg',
        generationId: 'generation-456',
        productName: 'LED 산타트리',
        returnTo: '/product-pipeline/registered-products/workspace-123',
      }),
    ).toContain('/product-pipeline/registered-products/workspace-123?');
  });

  it('routes collected-product thumbnail creation back into the draft’s workspace tab', () => {
    const href = buildEditHref({
      contentWorkspaceId: 'workspace-123',
      imageUrl: 'https://cdn.example.com/source.jpg',
      productName: '쭉쭉붙이는터치등',
      returnTo: '/product-pipeline/collected-products/sales-product-123',
    });

    expect(href).toContain('/product-pipeline/collected-products/sales-product-123?');
    expect(href).toContain('tab=thumbnail');
    expect(href).toContain('thumbnailMode=edit');
    expect(href).toContain('imageUrl=https%3A%2F%2Fcdn.example.com%2Fsource.jpg');
    expect(href).toContain('contentWorkspaceId=workspace-123');
    expect(href).not.toContain('sourceCandidateId=');
  });

  it('keeps direct upload work on the standalone editor route', () => {
    expect(
      buildEditHref({
        imageUrl: 'https://cdn.example.com/source.jpg',
        productName: 'direct upload',
      }),
    ).toContain('/product-pipeline/thumbnail-generation/edit?');
  });
});
