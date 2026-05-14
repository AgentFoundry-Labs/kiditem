import { describe, expect, it } from 'vitest';
import {
  buildSourcingEditorHref,
  normalizeSourcingHref,
} from './sourcing-routing';

describe('sourcing routing', () => {
  it('builds generation editor links under sourcing when a candidate context exists', () => {
    expect(buildSourcingEditorHref({
      candidateId: 'candidate-123',
      generationId: 'generation-456',
    })).toBe('/sourcing/candidate-123/editor?generationId=generation-456');
  });

  it('builds generation editor links under sourcing without candidate context', () => {
    expect(buildSourcingEditorHref({
      generationId: 'generation-456',
    })).toBe('/sourcing/detail-pages/generation-456/editor');
  });

  it('normalizes product-content generation editor links to sourcing', () => {
    expect(
      normalizeSourcingHref('/product-content/detail-pages/generation-456/editor'),
    ).toBe('/sourcing/detail-pages/generation-456/editor');
  });

  it('normalizes old product-content product editor query links to sourcing', () => {
    expect(
      normalizeSourcingHref('/product-content/product-123/editor?generationId=generation-456'),
    ).toBe('/sourcing/detail-pages/generation-456/editor');
  });

  it('leaves existing sourcing links unchanged', () => {
    expect(
      normalizeSourcingHref('/sourcing/candidate-123/editor?boldId=generation-456'),
    ).toBe('/sourcing/candidate-123/editor?boldId=generation-456');
  });
});
