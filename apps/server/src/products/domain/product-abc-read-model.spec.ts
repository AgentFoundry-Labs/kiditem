import { describe, expect, it } from 'vitest';
import { productAbcDisplayStatus } from '@kiditem/shared/product-abc';
import {
  buildProductAbcReadModel,
  type ProductAbcSourceEvidence,
} from './product-abc-read-model';

describe('buildProductAbcReadModel', () => {
  it('publishes mapping facts instead of a derived mapping word', () => {
    const abc = buildProductAbcReadModel(input());

    expect(abc.sources.mapping).toEqual({
      valid: true,
      currentMappingGeneration: '8',
      evidenceMappingGeneration: '7',
    });
    expect(abc.sources.mapping).not.toHaveProperty('status');
  });

  it('carries no display word beside the facts the word is derived from', () => {
    const abc = buildProductAbcReadModel(input());

    expect(abc).not.toHaveProperty('displayStatus');
    expect(productAbcDisplayStatus(abc)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it("publishes the Sellpia owner's readiness from its own cutoff, and no advertising source (KID-373)", () => {
    const abc = buildProductAbcReadModel(input({ sellpia: sourceEvidence() }));

    expect(abc.sources.sellpia).toEqual({
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { actualCutoff: '2026-08-31' },
    });
    expect(abc.sources).not.toHaveProperty('advertising');
    expect(productAbcDisplayStatus(abc)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('keeps a complete source that lags the cutoff visible as stale, not missing', () => {
    const abc = buildProductAbcReadModel(input({
      sellpia: { ...sourceEvidence(), actualCutoff: '2026-08-30' },
    }));

    expect(abc.sources.sellpia).toMatchObject({
      ready: false,
      actualCutoff: '2026-08-30',
      latestComplete: { actualCutoff: '2026-08-30' },
    });
    expect(productAbcDisplayStatus(abc)).toBe('SELLPIA_SOURCE_STALE');
  });
});

function input(sources: Partial<{
  sellpia: ProductAbcSourceEvidence;
}> = {}) {
  return {
    evaluation: null,
    mappingValid: true,
    saleStartDate: null,
    evidence: {
      actualCutoff: '2026-08-31',
      mappingGeneration: '7',
      sellpia: sources.sellpia ?? sourceEvidence(),
    },
    formulaState: {
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: null,
      publishedAt: null,
      mappingGeneration: '8',
    },
  };
}

function sourceEvidence(): ProductAbcSourceEvidence {
  return {
    requiredCutoff: '2026-08-31',
    actualCutoff: '2026-08-31',
    latestAttemptState: 'COMPLETE',
  };
}
