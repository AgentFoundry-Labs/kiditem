import { describe, expect, it } from 'vitest';
import {
  collectedProductDetailHref,
  collectedProductWorkspaceTabHref,
  collectedProductEditorHref,
  detailTemplateGenerationHref,
  detailPageEditorHref,
  normalizeProductPipelineReturnTo,
  productBoundThumbnailWorkspaceHref,
  productGenerationHref,
  registeredProductDetailHref,
  registeredProductWorkspaceTabHref,
  registeredProductEditorHref,
  thumbnailGenerationEditHref,
  thumbnailGenerationHubHref,
} from './product-pipeline-routes';

describe('product-pipeline route construction', () => {
  it('keeps collected and registered workspace routes distinct', () => {
    expect(collectedProductDetailHref('candidate 1')).toBe(
      '/product-pipeline/collected-products/candidate%201',
    );
    expect(registeredProductDetailHref('workspace 1')).toBe(
      '/product-pipeline/registered-products/workspace%201',
    );
  });

  it('builds detail-page editor routes from owner identity', () => {
    expect(registeredProductEditorHref('generation-1')).toBe(
      '/product-pipeline/detail-pages/generation-1/editor',
    );

    expect(detailPageEditorHref({
      candidateId: 'candidate-1',
      generationId: 'generation-1',
      returnTo: '/product-pipeline/collected-products/candidate-1',
    })).toBe(
      '/product-pipeline/detail-pages/generation-1/editor?sourceCandidateId=candidate-1&returnTo=%2Fproduct-pipeline%2Fcollected-products%2Fcandidate-1',
    );

    expect(detailPageEditorHref({
      generationId: 'generation-1',
      returnTo: '/product-pipeline/registered-products/workspace-1',
    })).toBe(
      '/product-pipeline/detail-pages/generation-1/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2Fworkspace-1',
    );

    expect(collectedProductEditorHref({
      candidateId: 'candidate-1',
    })).toBe('/product-pipeline/collected-products/candidate-1/editor');
  });

  it('normalizes returnTo to product-pipeline workspace routes only', () => {
    expect(normalizeProductPipelineReturnTo('/product-pipeline/registered-products/workspace-1')).toBe(
      '/product-pipeline/registered-products/workspace-1',
    );
    expect(normalizeProductPipelineReturnTo('/product-pipeline/thumbnail-generation')).toBeNull();
    expect(normalizeProductPipelineReturnTo('/sourcing/candidate-1')).toBeNull();
    expect(normalizeProductPipelineReturnTo('https://example.com')).toBeNull();
  });

  it('preserves workspace state when entering thumbnail generation hub routes', () => {
    expect(thumbnailGenerationHubHref({
      returnTo: '/product-pipeline/registered-products/workspace-1',
    })).toBe(
      '/product-pipeline/thumbnail-generation?returnTo=%2Fproduct-pipeline%2Fregistered-products%2Fworkspace-1',
    );

    const hubHref = thumbnailGenerationHubHref({
      imageUrl: 'https://cdn.example.com/source.jpg',
      productName: '쭉쭉붙이는터치등',
      returnTo: '/product-pipeline/registered-products/workspace-1',
      subjectParams: { contentWorkspaceId: 'workspace-1' },
    });
    expect(hubHref).toContain('/product-pipeline/thumbnail-generation?');
    expect(hubHref).not.toContain('/product-pipeline/thumbnail-generation/edit');
    expect(hubHref).toContain('contentWorkspaceId=workspace-1');
    expect(hubHref).toContain('imageUrl=https%3A%2F%2Fcdn.example.com%2Fsource.jpg');
    expect(hubHref).toContain('productName=%EC%AD%89%EC%AD%89%EB%B6%99%EC%9D%B4%EB%8A%94%ED%84%B0%EC%B9%98%EB%93%B1');

    expect(thumbnailGenerationEditHref({
      productName: '쭉쭉붙이는터치등',
      imageUrl: 'https://cdn.example.com/source.jpg',
      returnTo: '/product-pipeline/collected-products/candidate-1',
      subjectParams: { sourceCandidateId: 'candidate-1' },
    })).toContain('/product-pipeline/thumbnail-generation/edit?');

    const registeredHref = thumbnailGenerationEditHref({
      productName: '쭉쭉붙이는터치등',
      imageUrl: 'https://cdn.example.com/source.jpg',
      returnTo: '/product-pipeline/registered-products/workspace-1',
      subjectParams: { contentWorkspaceId: 'workspace-1' },
    });
    expect(registeredHref).toContain('contentWorkspaceId=workspace-1');
    expect(registeredHref).toContain('returnTo=%2Fproduct-pipeline%2Fregistered-products%2Fworkspace-1');
  });

  it('builds detail template generation links from an existing content workspace', () => {
    expect(detailTemplateGenerationHref({
      contentWorkspaceId: 'workspace-1',
      title: '키즈 컵',
      returnTo: '/product-pipeline/registered-products/workspace-1',
    })).toBe(
      '/product-pipeline/detail-template-generation?contentWorkspaceId=workspace-1&title=%ED%82%A4%EC%A6%88+%EC%BB%B5&returnTo=%2Fproduct-pipeline%2Fregistered-products%2Fworkspace-1',
    );
  });

  it('builds product workspace tab links for thumbnail and detail work', () => {
    expect(collectedProductWorkspaceTabHref({
      candidateId: 'candidate 1',
      tab: 'thumbnail',
    })).toBe('/product-pipeline/collected-products/candidate%201?tab=thumbnail');

    expect(registeredProductWorkspaceTabHref({
      workspaceId: 'workspace 1',
      tab: 'detail',
      generationId: 'generation-1',
    })).toBe('/product-pipeline/registered-products/workspace%201?tab=detail&generationId=generation-1');
  });

  it('converges product-bound thumbnail entry to product workspace tab when resolvable', () => {
    const collectedHref = productBoundThumbnailWorkspaceHref({
      sourceCandidateId: 'candidate-1',
      imageUrl: 'https://cdn.example.com/source.jpg',
      mode: 'edit',
    });
    expect(collectedHref).toContain('/product-pipeline/collected-products/candidate-1?');
    expect(collectedHref).toContain('tab=thumbnail');
    expect(collectedHref).toContain('thumbnailMode=edit');
    expect(collectedHref).toContain('imageUrl=https%3A%2F%2Fcdn.example.com%2Fsource.jpg');
    expect(collectedHref).toContain('sourceCandidateId=candidate-1');

    const registeredHref = productBoundThumbnailWorkspaceHref({
      contentWorkspaceId: 'workspace-1',
      generationId: 'generation-1',
      mode: 'creative',
    });
    expect(registeredHref).toContain('/product-pipeline/registered-products/workspace-1?');
    expect(registeredHref).toContain('tab=thumbnail');
    expect(registeredHref).toContain('generationId=generation-1');
    expect(registeredHref).toContain('thumbnailMode=creative');
    expect(registeredHref).toContain('contentWorkspaceId=workspace-1');

    expect(productBoundThumbnailWorkspaceHref({
      productId: 'master-only',
    })).toBeNull();
  });

  it('builds the product generation route', () => {
    expect(productGenerationHref()).toBe('/product-pipeline/productgenerate');
  });
});
