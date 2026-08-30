import { describe, expect, it, vi } from 'vitest';
import { SourcingValidationService } from '../sourcing-validation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ITEM_ID = '00000000-0000-4000-8000-000000000011';
const ITEM_KEY = 'a'.repeat(64);

describe('SourcingValidationService', () => {
  it('persists missing economics as blocked instead of fixture score or margin', async () => {
    const recommendations = { findLatest: vi.fn(async () => run()), findById: vi.fn() };
    const validations = {
      replaceForRun: vi.fn(async () => [view()]),
      listForRun: vi.fn(async () => ({ items: [view()], nextCursor: null })),
    };
    const service = new SourcingValidationService(
      recommendations as never,
      validations as never,
    );

    const result = await service.refresh({ organizationId: ORGANIZATION_ID, limit: 50 });

    expect(result).toMatchObject({
      status: 'ready',
      data: { recommendationRunId: RUN_ID, items: [expect.objectContaining({ status: 'blocked' })] },
    });
    const command = validations.replaceForRun.mock.calls[0][0];
    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      episodes: [expect.objectContaining({
        recommendationItemId: ITEM_ID,
        status: 'blocked',
        summary: expect.objectContaining({ landedCostKrw: null, expectedMarginBps: null }),
      })],
    });
    expect(command.episodes[0].checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkKey: 'landed_cost', status: 'missing' }),
      expect.objectContaining({ checkKey: 'kc_safety', status: 'missing' }),
    ]));
  });

  it('keeps unavailable distinct from an empty completed recommendation run', async () => {
    const recommendations = { findLatest: vi.fn(async () => null), findById: vi.fn() };
    const validations = { replaceForRun: vi.fn(), listForRun: vi.fn() };
    const service = new SourcingValidationService(
      recommendations as never,
      validations as never,
    );

    await expect(service.latest({ organizationId: ORGANIZATION_ID, limit: 50 })).resolves.toMatchObject({
      status: 'unavailable',
      data: null,
      error: expect.objectContaining({ code: 'RECOMMENDATION_RUN_MISSING' }),
    });
  });

  it('validates 1688 supply candidates independently of higher-ranked Coupang demand', async () => {
    const supplyRun = run();
    const recommendations = {
      findLatest: vi.fn(async () => ({
        ...supplyRun,
        items: [
          {
            ...supplyRun.items[0],
            id: '00000000-0000-4000-8000-000000000030',
            itemKey: 'c'.repeat(64),
            sourcePlatform: 'coupang' as const,
            externalOfferId: '123456',
            displayName: '쿠팡 유아 우산',
            rank: 1,
            score: 100,
          },
          { ...supplyRun.items[0], rank: 2 },
        ],
      })),
      findById: vi.fn(),
    };
    const validations = {
      replaceForRun: vi.fn(async () => [view()]),
      listForRun: vi.fn(),
    };
    const service = new SourcingValidationService(
      recommendations as never,
      validations as never,
    );

    await service.refresh({ organizationId: ORGANIZATION_ID, limit: 1 });

    expect(validations.replaceForRun.mock.calls[0][0].episodes).toEqual([
      expect.objectContaining({ recommendationItemId: ITEM_ID }),
    ]);
  });

  it('persists truthful demand-only episodes when a Wing recommendation run has no 1688 supply candidates', async () => {
    const demandRun = run();
    const coupangItem = {
      ...demandRun.items[0],
      id: '00000000-0000-4000-8000-000000000030',
      itemKey: 'c'.repeat(64),
      sourcePlatform: 'coupang' as const,
      externalOfferId: '8835050121',
      matchedCoupangProductId: '8835050121',
      displayName: '쿠팡 유아 우산',
      sourceSnapshot: {
        productId: '8835050121',
        itemId: '25745879681',
        vendorItemId: '92734234062',
        productName: '쿠팡 유아 우산',
        salePriceKrw: 15_900,
      },
    };
    const recommendations = {
      findLatest: vi.fn(async () => ({ ...demandRun, items: [coupangItem] })),
      findById: vi.fn(),
    };
    const validations = {
      replaceForRun: vi.fn(async (_command) => [view()]),
      listForRun: vi.fn(),
    };
    const service = new SourcingValidationService(
      recommendations as never,
      validations as never,
    );

    await expect(service.refresh({ organizationId: ORGANIZATION_ID, limit: 50 }))
      .resolves.toMatchObject({ status: 'ready' });

    const [episode] = validations.replaceForRun.mock.calls[0][0].episodes;
    expect(episode).toMatchObject({
      recommendationItemId: coupangItem.id,
      status: 'blocked',
      summary: expect.objectContaining({ sourcePlatform: 'coupang' }),
    });
    expect(episode.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkKey: 'coupang_demand', status: 'pass' }),
      expect.objectContaining({ checkKey: 'offer_identity', status: 'not_applicable' }),
      expect.objectContaining({ checkKey: 'landed_cost', status: 'missing' }),
    ]));
  });

  it('refreshes one explicit recommendation run without resolving latest', async () => {
    const recommendations = {
      findLatest: vi.fn(),
      findById: vi.fn(async () => run()),
    };
    const validations = {
      replaceForRun: vi.fn(async () => [view()]),
      listForRun: vi.fn(),
    };
    const service = new SourcingValidationService(
      recommendations as never,
      validations as never,
    );

    await service.refreshForRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      idempotencyKey: 'validation-owner-key',
    });

    expect(recommendations.findById).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      id: RUN_ID,
    });
    expect(recommendations.findLatest).not.toHaveBeenCalled();
    expect(validations.replaceForRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      idempotencyKey: 'validation-owner-key',
    }));
  });
});

function run() {
  const now = new Date('2026-08-10T00:00:00.000Z');
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    inputManifestHash: 'b'.repeat(64),
    status: 'complete' as const,
    businessDate: now,
    generatedAt: now,
    completedAt: now,
    expiresAt: null,
    warningCodes: [],
    items: [{
      id: ITEM_ID,
      itemKey: ITEM_KEY,
      sourcePlatform: '1688' as const,
      externalOfferId: '607635921546',
      variantKeyNormalized: '',
      matchedCoupangProductId: null,
      displayName: '유아 우산',
      rank: 1,
      score: 84,
      grade: 'A' as const,
      baselineAction: 'order' as const,
      reasonCodes: ['margin_positive'],
      riskCodes: [],
      scoreComponents: { margin: 80, competition: 50 },
      sourceSnapshot: {
        imageUrl: 'https://example.test/umbrella.jpg',
        overseasPriceCny: 12.5,
        salePriceKrw: 15_900,
        minOrderQuantity: 2,
        offerObservationIds: ['00000000-0000-4000-8000-000000000012'],
      },
      evidenceObservationIds: ['00000000-0000-4000-8000-000000000013'],
    }],
  };
}

function view() {
  return {
    episodeId: '00000000-0000-4000-8000-000000000020',
    recommendationRunId: RUN_ID,
    itemKey: ITEM_KEY,
    displayName: '유아 우산',
    imageUrl: 'https://example.test/umbrella.jpg',
    status: 'blocked' as const,
    score: 84,
    landedCostKrw: null,
    expectedMarginBps: null,
    validUntil: null,
    checks: [{ checkKey: 'landed_cost', status: 'missing' as const, summary: 'exchange_rate' }],
  };
}
