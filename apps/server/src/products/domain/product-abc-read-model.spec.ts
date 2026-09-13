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

  it("publishes each source's owner readiness from its own cutoff, not the other source's", () => {
    // Finance reports the Sellpia generation complete through the cutoff while
    // advertising has no complete generation, so no pair exists. Sellpia is
    // still ready and advertising is the source to refresh.
    const abc = buildProductAbcReadModel(input({
      sellpia: sourceEvidence(),
      advertising: { actualCutoff: null, latestAttemptState: null },
    }));

    expect(abc.sources.sellpia).toEqual({
      ready: true,
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { actualCutoff: '2026-08-31' },
    });
    expect(abc.sources.advertising).toMatchObject({
      ready: false,
      actualCutoff: null,
      latestComplete: null,
    });
    expect(productAbcDisplayStatus(abc)).toBe('AD_SOURCE_STALE');
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
  advertising: ProductAbcSourceEvidence;
}> = {}) {
  return {
    evaluation: null,
    mappingValid: true,
    saleStartDate: null,
    evidence: {
      requiredCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      mappingGeneration: '7',
      sellpia: sources.sellpia ?? sourceEvidence(),
      advertising: sources.advertising ?? sourceEvidence(),
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
    actualCutoff: '2026-08-31',
    latestAttemptState: 'COMPLETE',
  };
}
