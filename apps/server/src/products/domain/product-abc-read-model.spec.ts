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

  it('publishes the owner readiness of a complete source that no compatible pair selected', () => {
    // Finance reports the current-mapping Sellpia generation complete through
    // the cutoff, but with no advertising generation to pair it with the
    // selected manifest is empty. The published readiness is still the
    // owner's: Sellpia is ready and advertising is the source to refresh.
    const abc = buildProductAbcReadModel(input({
      sellpia: { ...sourceEvidence(), ...noManifest() },
      advertising: {
        ...sourceEvidence(),
        ...noManifest(),
        ready: false,
        actualCutoff: null,
        latestAttemptState: null,
      },
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
      sellpia: { ...sourceEvidence(), ready: false, actualCutoff: '2026-08-30' },
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
    ready: true,
    actualCutoff: '2026-08-31',
    latestAttemptState: 'COMPLETE',
    errorCode: null,
    sourceImportRunId: '00000000-0000-4000-8000-000000000001',
    generation: '1',
    coverageStartDate: '2026-08-01',
    coverageEndDate: '2026-08-31',
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
}

function noManifest() {
  return {
    sourceImportRunId: null,
    generation: null,
    coverageStartDate: null,
    coverageEndDate: null,
  };
}
