import { describe, expect, it } from 'vitest';
import {
  buildProductContentEditorHref,
  normalizeProductContentHref,
} from './product-content-routing';

describe('product content routing', () => {
  it('builds the canonical master-bound editor href', () => {
    expect(buildProductContentEditorHref({
      productId: 'product-123',
      generationId: 'generation-456',
    })).toBe('/product-content/product-123/editor?generationId=generation-456');
  });

  it('normalizes legacy sourcing editor hrefs to product-content', () => {
    expect(
      normalizeProductContentHref('/sourcing/product-123/editor?boldId=generation-456'),
    ).toBe('/product-content/product-123/editor?generationId=generation-456');
  });

  it('leaves unrelated hrefs unchanged', () => {
    expect(normalizeProductContentHref('/products/abc')).toBe('/products/abc');
  });
});
