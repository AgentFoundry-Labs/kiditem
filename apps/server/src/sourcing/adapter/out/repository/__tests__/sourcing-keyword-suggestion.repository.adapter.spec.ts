import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordSuggestionRepositoryAdapter } from '../sourcing-keyword-suggestion.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000020';

describe('SourcingKeywordSuggestionRepositoryAdapter', () => {
  it('reads only exact terminal tenant evidence and returns a typed latest snapshot', async () => {
    const prisma = {
      sourcingEvidenceIngestionRun: {
        findMany: vi.fn(async () => [{
          id: RUN_ID,
          completedAt: new Date('2026-08-14T00:01:00.000Z'),
        }]),
      },
      sourcingEvidenceObservation: {
        findMany: vi.fn(async () => [{
          ingestionRunId: RUN_ID,
          payload: {
            keyword: 'A Pencil',
            capturedAt: '2026-08-14T00:00:30.000Z',
            items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
            productNameTokens: [{ keyword: '연필', count: 4 }],
          },
        }]),
      },
    };
    const repository = new SourcingKeywordSuggestionRepositoryAdapter(prisma as never);

    await expect(repository.findLatest({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: 'a pencil',
    })).resolves.toEqual({
      capturedAt: new Date('2026-08-14T00:00:30.000Z'),
      items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
      productNameTokens: [{ keyword: '연필', count: 4 }],
    });
    expect(prisma.sourcingEvidenceIngestionRun.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        sourceKey: 'coupang.keyword_suggestion',
        scopeKey: 'default',
        targetKey: 'keyword:a pencil',
        collectorKey: 'coupang-keyword-suggestion-operation',
        collectorVersion: 'coupang-keyword-suggestion/v1',
        status: { in: ['complete', 'partial'] },
        completedAt: { not: null },
      },
      select: { id: true, completedAt: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 24,
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        ingestionRunId: { in: [RUN_ID] },
        sourceKey: 'coupang.keyword_suggestion',
        platform: 'coupang',
        evidenceFamily: 'keyword_suggestion',
        schemaVersion: 'coupang-keyword-suggestion/v1',
        conceptKey: 'a pencil',
        supersededByObservation: null,
      },
      select: { ingestionRunId: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: 24,
    });
  });

  it('preserves a valid empty latest snapshot and rejects arbitrary payload shape', async () => {
    const prisma = {
      sourcingEvidenceIngestionRun: {
        findMany: vi.fn(async () => [
          { id: 'new', completedAt: new Date('2026-08-14T00:02:00.000Z') },
          { id: 'old', completedAt: new Date('2026-08-14T00:01:00.000Z') },
        ]),
      },
      sourcingEvidenceObservation: {
        findMany: vi.fn(async () => [
          { ingestionRunId: 'new', payload: {
            keyword: 'A Pencil', capturedAt: '2026-08-14T00:01:30.000Z',
            items: [], productNameTokens: [], raw: { secret: true },
          } },
          { ingestionRunId: 'old', payload: {
            keyword: 'A Pencil', capturedAt: '2026-08-14T00:00:30.000Z',
            items: [], productNameTokens: [],
          } },
        ]),
      },
    };
    const repository = new SourcingKeywordSuggestionRepositoryAdapter(prisma as never);

    await expect(repository.findLatest({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: 'a pencil',
    })).resolves.toEqual({
      capturedAt: new Date('2026-08-14T00:00:30.000Z'),
      items: [],
      productNameTokens: [],
    });
  });
});
