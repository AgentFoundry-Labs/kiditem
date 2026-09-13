import { describe, expect, it } from 'vitest';
import { buildProductAbcReadModel } from './product-abc-read-model';

describe('buildProductAbcReadModel', () => {
  it('publishes mapping facts instead of a derived mapping word', () => {
    const abc = buildProductAbcReadModel({
      evaluation: null,
      mappingValid: true,
      saleStartDate: null,
      evidence: {
        requiredCutoff: '2026-08-31',
        actualCutoff: '2026-08-31',
        mappingGeneration: '7',
        sellpia: sourceEvidence(),
        advertising: sourceEvidence(),
      },
      formulaState: {
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoffDate: null,
        publishedAt: null,
        mappingGeneration: '8',
      },
    });

    expect(abc.sources.mapping).toEqual({
      valid: true,
      currentMappingGeneration: '8',
      evidenceMappingGeneration: '7',
    });
    expect(abc.sources.mapping).not.toHaveProperty('status');
  });
});

function sourceEvidence() {
  return {
    ready: true,
    actualCutoff: '2026-08-31',
    latestAttemptState: 'COMPLETE' as const,
    errorCode: null,
    sourceImportRunId: '00000000-0000-4000-8000-000000000001',
    generation: '1',
    coverageStartDate: '2026-08-01',
    coverageEndDate: '2026-08-31',
    capturedAt: '2026-09-01T00:00:00.000Z',
  };
}
