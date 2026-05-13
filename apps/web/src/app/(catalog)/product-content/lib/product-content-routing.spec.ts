import { describe, expect, it } from 'vitest';
import {
  buildProductContentEditorHref,
  normalizeProductContentHref,
} from './product-content-routing';

describe('product content routing', () => {
  it('builds the canonical generation-bound editor href', () => {
    expect(buildProductContentEditorHref({
      productId: 'product-123',
      generationId: 'generation-456',
    })).toBe('/product-content/detail-pages/generation-456/editor');
  });

  it('normalizes legacy sourcing editor hrefs to the generation editor', () => {
    expect(
      normalizeProductContentHref('/sourcing/product-123/editor?boldId=generation-456'),
    ).toBe('/product-content/detail-pages/generation-456/editor');
  });

  it('normalizes legacy agentId editor hrefs to generationId', () => {
    expect(
      normalizeProductContentHref('/sourcing/product-123/editor?agentId=generation-456'),
    ).toBe('/product-content/detail-pages/generation-456/editor');
  });

  it('normalizes old product-content editor hrefs to the generation editor', () => {
    expect(
      normalizeProductContentHref('/product-content/product-123/editor?generationId=generation-456'),
    ).toBe('/product-content/detail-pages/generation-456/editor');
  });

  it('leaves unrelated hrefs unchanged', () => {
    expect(normalizeProductContentHref('/products/abc')).toBe('/products/abc');
  });
});
