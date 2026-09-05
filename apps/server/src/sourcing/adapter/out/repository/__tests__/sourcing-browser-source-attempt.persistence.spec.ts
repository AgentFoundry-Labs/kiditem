import { describe, expect, it, vi } from 'vitest';
import {
  map1688HotProductsToAuthorizedOutput,
  mapTrendTypedRecordsToAuthorizedOutput,
} from '../../../../application/service/sourcing-collection-mappers';
import { persistBrowserSourceAttemptFacts } from '../sourcing-browser-source-attempt.persistence';

const PERMIT = {
  runId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  sourceKey: '1688.hot_product',
  scopeKey: 'default',
  targetKey: 'all',
  leaseToken: '00000000-0000-4000-8000-000000000003',
  generation: 1,
  leaseExpiresAt: new Date('2026-09-04T01:30:00.000Z'),
};

const TIKTOK_PERMIT = {
  ...PERMIT,
  sourceKey: 'tiktok.creative',
};

describe('persistBrowserSourceAttemptFacts', () => {
  it('persists a maximum 400-row 1688 one-shot payload with bounded database statements', async () => {
    const evidenceRows: Array<Record<string, unknown>> = [];
    const observations = {
      findMany: vi.fn(async () => evidenceRows),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> | Record<string, unknown> }) => {
        const rows = Array.isArray(data) ? data : [data];
        rows.forEach((row, index) => {
          evidenceRows.push({
            id: `evidence-${index + 1}`,
            organizationId: row.organizationId,
            observationKey: row.observationKey,
            revision: row.revision,
            envelopeHash: row.envelopeHash,
          });
        });
        return { count: rows.length };
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (
        evidenceRows.find((row) => (
          row.organizationId === where.organizationId
          && row.observationKey === where.observationKey
          && row.revision === where.revision
        )) ?? null
      )),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `evidence-${evidenceRows.length + 1}`,
          organizationId: data.organizationId,
          observationKey: data.observationKey,
          revision: data.revision,
          envelopeHash: data.envelopeHash,
        };
        evidenceRows.push(row);
        return row;
      }),
    };
    const typed = {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> | Record<string, unknown> }) => ({
        count: Array.isArray(data) ? data.length : 1,
      })),
    };
    const tx = {
      $queryRaw: vi.fn(async () => []),
      sourcingEvidenceObservation: observations,
      sourcing1688OfferKeywordObservation: typed,
    };
    const output = map1688HotProductsToAuthorizedOutput({
      permit: PERMIT,
      rows: Array.from({ length: 20 }, (_, keywordIndex) =>
        Array.from({ length: 20 }, (_, itemIndex) => ({
          organizationId: PERMIT.organizationId,
          businessDate: new Date('2026-09-04T00:00:00.000Z'),
          sourceKeyword: `keyword-${keywordIndex + 1}`,
          offerId: `offer-${keywordIndex + 1}-${itemIndex + 1}`,
          rank: itemIndex + 1,
          title: `offer ${keywordIndex + 1}-${itemIndex + 1}`,
          priceCny: 10,
          monthlySales: 1,
          repurchaseRate: null,
          tradeScore: null,
          supplierName: null,
          imageUrl: null,
          sourceUrl: null,
          capturedAt: new Date('2026-09-04T00:00:00.000Z'),
        })),
      ).flat(),
    });

    await expect(persistBrowserSourceAttemptFacts(
      tx as never,
      PERMIT,
      output,
      new Date('2026-09-04T00:00:00.000Z'),
    )).resolves.toEqual({ duplicateCount: 0, staleDiscardedCount: 0 });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(observations.findMany).toHaveBeenCalledTimes(2);
    expect(observations.createMany).toHaveBeenCalledTimes(1);
    expect(typed.createMany).toHaveBeenCalledTimes(1);
    expect(observations.createMany.mock.calls[0][0].data).toHaveLength(400);
    expect(typed.createMany.mock.calls[0][0].data).toHaveLength(400);
  });

  it('persists TikTok typed rows with the direct owner attempt as immutable publication provenance', async () => {
    const evidenceRows: Array<Record<string, unknown>> = [];
    const observations = {
      findMany: vi.fn(async () => evidenceRows),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        data.forEach((row, index) => {
          evidenceRows.push({
            id: `evidence-${index + 1}`,
            organizationId: row.organizationId,
            observationKey: row.observationKey,
            revision: row.revision,
            envelopeHash: row.envelopeHash,
          });
        });
        return { count: data.length };
      }),
    };
    const tiktokCreative = {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => ({
        count: data.length,
      })),
    };
    const tx = {
      sourcingEvidenceObservation: observations,
      tiktokCreativeTrendDailySnapshot: tiktokCreative,
    };
    const capturedAt = new Date('2026-09-04T00:00:00.000Z');
    const output = mapTrendTypedRecordsToAuthorizedOutput({
      permit: TIKTOK_PERMIT,
      typedRecords: [{
        kind: 'tiktok_creative',
        row: {
          organizationId: TIKTOK_PERMIT.organizationId,
          ingestionRunId: TIKTOK_PERMIT.runId,
          businessDate: capturedAt,
          region: 'US',
          trendType: 'hashtag',
          entityKey: 'school-supplies',
          rank: 1,
          label: 'School supplies',
          industry: null,
          sourceKeyword: null,
          postCount: null,
          viewCount: null,
          growthPct: null,
          thumbnailUrl: null,
          sourceUrl: null,
          capturedAt,
        },
      }],
    });

    await expect(persistBrowserSourceAttemptFacts(
      tx as never,
      TIKTOK_PERMIT,
      output,
      capturedAt,
    )).resolves.toEqual({ duplicateCount: 0, staleDiscardedCount: 0 });

    expect(tiktokCreative.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organizationId: TIKTOK_PERMIT.organizationId,
        ingestionRunId: TIKTOK_PERMIT.runId,
        trendType: 'hashtag',
        entityKey: 'school-supplies',
      })],
      skipDuplicates: true,
    });
  });

});
