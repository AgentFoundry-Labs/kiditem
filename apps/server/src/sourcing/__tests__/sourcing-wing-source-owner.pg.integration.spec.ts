import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { Sourcing1688SearchResultRepositoryAdapter } from '../adapter/out/repository/sourcing-1688-search-result.repository.adapter';
import { SourcingWingCatalogIngestService } from '../application/service/sourcing-wing-catalog-ingest.service';
import { SourcingWorkspaceController } from '../adapter/in/http/sourcing-workspace.controller';
import type { PrismaClient } from '@prisma/client';
import type { SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';

const organizationId = TEST_ORGANIZATION_ID;
const user = { id: TEST_USER_ID };
const input = { keywords: [' Ａ   Pencil '], maxPages: 2, purpose: 'catalog_search' };
const item: SourcingWingCatalogObservation = { productId: '123', itemId: null, vendorItemId: null, productName: '연필',
  itemName: null, brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null,
  salePriceKrw: 1000, ratingAverage: null, ratingCount: null, viewsLast28d: null,
  salesLast28d: null, estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
  sourceKeyword: 'A Pencil', capturedAt: '2026-09-05T00:00:00.000Z' };

describe('Wing source owner HTTP with disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let controller: SourcingWorkspaceController;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const service = new SourcingWingCatalogIngestService(
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never,
        new SourceFailureAlerts(prisma as never), unusedSalesProductDraftPort),
      new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    );
    controller = new SourcingWorkspaceController(undefined as never, service,
      undefined as never, undefined as never);
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('freezes normalized caller intent, hides staged evidence, and publishes its confirmed snapshot only after receipt finalization', async () => {
    const attempt = await controller.beginWingCatalog(organizationId, user as never, 'first', input);
    expect(attempt).toMatchObject({ state: 'RUNNING', plan: {
      source: 'coupang.wing_catalog', keywords: ['A Pencil'], maxPages: 2, purpose: 'catalog_search',
    } });
    const receipt = await controller.uploadWingCatalog(attempt.attemptId, attempt.attemptToken,
      { keyword: 'A Pencil', maxPages: 2, purpose: 'catalog_search', items: [item] }, organizationId);
    expect(receipt).toMatchObject({ sequence: 0, count: 1 });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({ generatedAt: null, items: [] });
    const terminal = await controller.completeWingCatalog(attempt.attemptId, attempt.attemptToken,
      { purpose: 'catalog_search', keywords: [{ keyword: 'A Pencil', outcome: 'complete',
        discovered: 1, accepted: 1, duplicate: 0, failed: 0 }], receipts: [receipt] }, organizationId);
    expect(terminal).toMatchObject({ state: 'COMPLETE' });
    expect(terminal).not.toHaveProperty('attemptToken');
    await expect(controller.getWingCatalogSnapshot('a pencil', organizationId)).resolves.toMatchObject({ items: [item] });
    expect((await prisma.$queryRaw<Array<{ absent: boolean }>>`
      SELECT to_regclass('public.operation_runs') IS NULL AS absent
    `)[0]?.absent).toBe(true);
    expect(await prisma.masterProductAbcEvaluation.count()).toBe(0);
  });

  it('keeps prior complete coverage after a mixed failure, then lets an overlapping empty keyword replace only that keyword', async () => {
    const first = await begin('prior');
    await publish(first, [item]);
    const partial = await begin('partial', ['A Pencil', '클레이']);
    const receipt = await upload(partial, [item]);
    await controller.completeWingCatalog(partial.attemptId, partial.attemptToken, {
      purpose: 'catalog_search', receipts: [receipt], keywords: [result('A Pencil', 1), {
        keyword: '클레이', outcome: 'failed', discovered: 0, accepted: 0, duplicate: 0, failed: 1,
      }],
    }, organizationId);
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({ items: [item] });
    expect(await prisma.alert.count({ where: { organizationId, type: 'source_failure', status: 'OPEN' } })).toBe(1);
    const empty = await begin('empty', ['A Pencil', '고무']);
    const receipts = [await upload(empty, []), await upload(empty, [], '고무')];
    await controller.completeWingCatalog(empty.attemptId, empty.attemptToken, { purpose: 'catalog_search', receipts,
      keywords: [result('A Pencil', 0), result('고무', 0)] }, organizationId);
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({
      generatedAt: expect.any(String),
      items: [],
      rejectedCount: 0,
    });
    expect(await prisma.alert.count({ where: { organizationId, type: 'source_failure', status: 'OPEN' } })).toBe(0);
  });

  it('rejects drift, active conflicts, cross-organization reads, immutable chunk conflicts and forged receipts', async () => {
    const first = await begin('fenced');
    expect(await begin('fenced')).toEqual(first);
    await expect(begin('fenced', ['different'])).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');
    await expect(begin('another')).rejects.toThrow();
    await expect(controller.readWingCatalog(first.attemptId, '00000000-0000-4000-8000-000000000099')).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    const receipt = await upload(first, [item]);
    expect(await upload(first, [item])).toEqual(receipt);
    await expect(upload(first, [{ ...item, productName: 'changed' }])).rejects.toThrow('SOURCE_CHUNK_REPLAY_CONFLICT');
    await expect(controller.completeWingCatalog(first.attemptId, first.attemptToken, {
      purpose: 'catalog_search', keywords: [result('A Pencil', 1)], receipts: [{ ...receipt, checksum: 'f'.repeat(64) }],
    }, organizationId)).rejects.toThrow('SOURCE_RECEIPTS_MISMATCH');
    await expect(controller.completeWingCatalog(first.attemptId, first.attemptToken, {
      purpose: 'catalog_search', keywords: [result('A Pencil', 0)], receipts: [],
    }, organizationId)).rejects.toThrow('SOURCE_RECEIPTS_MISMATCH');
    const terminal = await publish(first, [item]);
    expect(await publish(first, [item], receipt)).toEqual(terminal);
    await expect(upload(first, [item])).rejects.toThrow('SOURCE_ATTEMPT_TERMINAL');
  });

  it('allows sequence gaps and exact earlier replay but rejects new out-of-order uploads', async () => {
    const attempt = await begin('receipt-order', ['A Pencil', '클레이', '고무']);
    const first = await upload(attempt, [item]);
    const later = await upload(attempt, [], '고무');
    expect(later.sequence).toBe(2);
    expect(await upload(attempt, [item])).toEqual(first);
    expect(await upload(attempt, [], '고무')).toEqual(later);
    await expect(upload(attempt, [], '클레이')).rejects.toThrow('SOURCE_CHUNK_OUT_OF_ORDER');
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
    const stored = await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } });
    expect(stored.qualityReport).toMatchObject({ wingReceipts: [first, later] });
  });

  it('keeps expiry fixed and rejects late upload without replacing current data', async () => {
    const first = await begin('expiry');
    const stored = await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: first.attemptId } });
    expect(stored.leaseExpiresAt.getTime() - stored.startedAt.getTime()).toBe(900000);
    await upload(first, [item]);
    expect((await begin('expiry')).expiresAt).toEqual(first.expiresAt);
    await prisma.sourcingEvidenceIngestionRun.update({ where: { id: first.attemptId }, data: { leaseExpiresAt: new Date(0) } });
    await expect(upload(first, [item])).rejects.toThrow('SOURCE_ATTEMPT_TERMINAL');
    expect(await controller.readWingCatalog(first.attemptId, organizationId)).toMatchObject({ state: 'FAILED' });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({ items: [] });
  });

  it('stops a running attempt for an operator without its token or an Alert, then admits the next begin at once', async () => {
    const attempt = await begin('operator-stop');
    await expect(controller.cancelWingCatalog(attempt.attemptId, '00000000-0000-4000-8000-000000000099'))
      .rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    const stopped = await controller.cancelWingCatalog(attempt.attemptId, organizationId);
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(stopped).not.toHaveProperty('attemptToken');
    expect(await prisma.alert.count({ where: { organizationId } })).toBe(0);
    await expect(upload(attempt, [item])).rejects.toThrow('SOURCE_ATTEMPT_TERMINAL');
    await expect(controller.cancelWingCatalog(attempt.attemptId, organizationId)).resolves.toEqual(stopped);
    const next = await begin('after-operator-stop');
    expect(next).toMatchObject({ state: 'RUNNING' });
    expect(next.attemptId).not.toBe(attempt.attemptId);
  });

  it('settles an operator stop after the lease passed as expiry with its Alert and leaves a COMPLETE attempt unchanged', async () => {
    const expired = await begin('operator-expired');
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: expired.attemptId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(controller.cancelWingCatalog(expired.attemptId, organizationId))
      .resolves.toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: expired.attemptId } }))
      .resolves.toMatchObject({ status: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.count({ where: { organizationId, type: 'source_failure', status: 'OPEN' } })).toBe(1);

    const completed = await begin('operator-complete');
    const terminal = await publish(completed, [item]);
    expect(terminal).toMatchObject({ state: 'COMPLETE' });
    await expect(controller.cancelWingCatalog(completed.attemptId, organizationId)).resolves.toEqual(terminal);
  });

  it('selects latest complete coverage per keyword, including confirmed empty replacement', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const read = async () => sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 });
    const first = await begin('reader-first');
    await publish(first, [item]);
    await expect(read()).resolves.toMatchObject({ items: [{ productId: '123' }] });

    const clayItem = { ...item, productId: '456', sourceKeyword: '클레이' };
    const clay = await begin('reader-clay', ['클레이']);
    const clayReceipt = await upload(clay, [clayItem], '클레이');
    await controller.completeWingCatalog(clay.attemptId, clay.attemptToken, {
      purpose: 'catalog_search',
      keywords: [result('클레이', 1)],
      receipts: [clayReceipt],
    }, organizationId);
    await expect(read()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: '123' }),
        expect.objectContaining({ productId: '456' }),
      ]),
    });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId))
      .resolves.toMatchObject({ items: [{ productId: '123' }] });

    const partial = await begin('reader-partial');
    await upload(partial, [{ ...item, productId: 'staged' }]);
    await expect(read()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: '123' }),
        expect.objectContaining({ productId: '456' }),
      ]),
    });
    await controller.failWingCatalog(partial.attemptId, partial.attemptToken, { code: 'FAILED', message: 'failed' }, organizationId);
    const empty = await begin('reader-empty');
    await publish(empty, []);
    await expect(read()).resolves.toMatchObject({ items: [{ productId: '456' }] });
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(3);
  });

  it('excludes v1 evidence from both current Wing readers', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish(await begin('v1-read'), [item]);
    await prisma.sourcingEvidenceObservation.updateMany({ data: { schemaVersion: 'coupang-wing-catalog/v1' } });
    await expect(controller.getWingCatalogSnapshot('A Pencil', organizationId)).resolves.toMatchObject({ items: [] });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toEqual({ items: [], rejectedCount: 1 });
  });

  it('keeps typed Wing facts authoritative when the retained raw evidence payload changes', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish(await begin('legacy-payload'), [item]);
    await prisma.sourcingEvidenceObservation.updateMany({ data: { payload: {
      productId: item.productId, productName: item.productName,
      itemId: null, vendorItemId: null, salePriceKrw: 1000, ratingAverage: null,
      ratingCount: null, viewsLast28d: null, salesLast28d: null,
      sourceKeyword: item.sourceKeyword, capturedAt: item.capturedAt,
    } } });
    await expect(sources.listWingCatalogSnapshot({ organizationId, normalizedKeyword: 'a pencil', limit: 50 }))
      .resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
  });

  it('treats legacy positive COMPLETE Wing evidence without receipts or typed publication as unavailable', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    await publish(await begin('prior-typed-publication'), [{ ...item, productId: 'prior' }]);
    const attempt = await begin('missing-typed-publication');
    await publish(attempt, [item]);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: { qualityReport: { snapshots: [{ keyword: 'a pencil' }] } },
    });
    await prisma.sourcingWingCatalogProductSnapshot.deleteMany({
      where: { organizationId, operationId: attempt.attemptId },
    });

    await expect(sources.listWingCatalogSnapshot({ organizationId, normalizedKeyword: 'a pencil', limit: 50 }))
      .resolves.toEqual({ generatedAt: null, items: [], rejectedCount: 1 });
    await expect(sources.listLatestCoupangObservations({ organizationId, cutoffAt: await databaseNow(), lookbackDays: 30, limit: 50 }))
      .resolves.toEqual({ items: [], rejectedCount: 1 });
  });

  it('excludes an entire Wing publication when its typed fact count is partial', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const attempt = await begin('partial-typed-publication');
    await publish(attempt, [item]);
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: {
        acceptedCount: 2,
        qualityReport: {
          snapshots: [{ keyword: 'a pencil' }],
          wingReceipts: [{ count: 2, duplicateCount: 0 }],
        },
      },
    });

    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toEqual({ items: [], rejectedCount: 2 });

    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: {
        qualityReport: {
          snapshots: [{ keyword: 'a pencil' }],
          wingReceipts: [{ count: 2, duplicateCount: 1 }],
        },
      },
    });
    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
  });

  it('publishes one accepted fact for duplicate discoveries to both public readers', async () => {
    const recommendationSources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const imageTargets = new Sourcing1688SearchResultRepositoryAdapter(prisma as never);
    const attempt = await begin('duplicate-publication');
    const duplicateItem = { ...item, imagePath: 'catalog/duplicate.jpg' };
    const receipt = await upload(attempt, [duplicateItem, duplicateItem]);
    expect(receipt).toMatchObject({ count: 2, acceptedCount: 1, duplicateCount: 1 });

    await controller.completeWingCatalog(attempt.attemptId, attempt.attemptToken, {
      purpose: 'catalog_search',
      keywords: [{
        keyword: 'A Pencil',
        outcome: 'complete',
        discovered: 2,
        accepted: 1,
        duplicate: 1,
        failed: 0,
      }],
      receipts: [receipt],
    }, organizationId);

    await expect(recommendationSources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({ items: [{ productId: '123' }], rejectedCount: 0 });
    await expect(imageTargets.resolveImageTargets({
      organizationId,
      targetIds: ['123::'],
    })).resolves.toMatchObject({
      targets: [{ targetId: '123::' }],
      missingTargetIds: [],
    });
  });

  it('preserves a legacy owner-confirmed zero-count Wing publication as measured empty', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const attempt = await begin('legacy-empty-publication');
    await publish(attempt, []);
    await prisma.sourcingSourcePublication.updateMany({
      where: { operationId: attempt.attemptId },
      data: { qualityReport: { snapshots: [{ keyword: 'a pencil' }] } },
    });

    await expect(sources.listWingCatalogSnapshot({
      organizationId,
      normalizedKeyword: 'a pencil',
      limit: 50,
    })).resolves.toEqual({ generatedAt: expect.any(Date), items: [], rejectedCount: 0 });
  });

  it('preserves the separate bounded manual-ingestion contract on the same owner path without implicit recommendation work', async () => {
    const command = { idempotencyKey: randomUUID(), items: Array.from({ length: 13 }, (_, index) => ({
      productId: String(index), productName: '연필', sourceKeyword: `manual ${index}`,
      capturedAt: '2026-09-05T00:00:00.000Z',
    })) };
    const first = await controller.ingestCoupangObservations(command as never, organizationId, user as never);
    expect(first.state).toBe('COMPLETE');
    expect(first).not.toHaveProperty('attemptToken');
    expect(await controller.ingestCoupangObservations(command as never, organizationId, user as never)).toEqual(first);
    await expect(controller.getWingCatalogSnapshot('manual 12', organizationId)).resolves.toMatchObject({
      items: [{ productId: '12', productName: '연필', itemName: null }],
    });
    expect(await prisma.sourcingEvidenceIngestionRun.count()).toBe(1);
    expect(await prisma.sourcingRecommendationRun.count()).toBe(0);
  });

  it('deduplicates identical manual observations before publishing exact reader coverage', async () => {
    const sources = new SourcingRecommendationSourceRepositoryAdapter(prisma as never);
    const manualItem = {
      productId: 'manual-duplicate',
      productName: '중복 수동 관측',
      sourceKeyword: '수동 중복',
      capturedAt: '2026-09-05T00:00:00.000Z',
    };
    const terminal = await controller.ingestCoupangObservations({
      idempotencyKey: randomUUID(),
      items: [manualItem, manualItem],
    } as never, organizationId, user as never);

    expect(terminal).toMatchObject({
      state: 'COMPLETE',
      acceptedCount: 1,
    });
    await expect(controller.getWingCatalogSnapshot('수동 중복', organizationId))
      .resolves.toMatchObject({ items: [{ productId: 'manual-duplicate' }], rejectedCount: 0 });
    await expect(sources.listLatestCoupangObservations({
      organizationId,
      cutoffAt: await databaseNow(),
      lookbackDays: 30,
      limit: 50,
    })).resolves.toMatchObject({
      items: [{ productId: 'manual-duplicate' }],
      rejectedCount: 0,
    });
    const run = await prisma.sourcingEvidenceIngestionRun.findFirstOrThrow({
      where: { organizationId, sourceKey: 'coupang.wing_catalog' },
    });
    expect(run).toMatchObject({ discoveredCount: 1, acceptedCount: 1, duplicateCount: 0 });
    expect(run.qualityReport).toMatchObject({
      wingReceipts: [{ count: 1, acceptedCount: 1, duplicateCount: 0 }],
    });
  });

  /**
   * 발행 시각은 DB 시계로 찍힌다. 호스트 시계(`new Date()`)는 컨테이너보다 늦을 수 있어 방금 발행한 것을
   * 잘라 버린다(전체 실행에서 간헐 실패). 읽기의 기준 시각도 같은 DB 시계에서 읽는다.
   */
  async function databaseNow(): Promise<Date> {
    const [row] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    return row!.now;
  }
  function begin(key: string, keywords = ['A Pencil']) {
    return controller.beginWingCatalog(organizationId, user as never, key, { ...input, keywords });
  }
  function upload(attempt: { attemptId: string; attemptToken: string }, items: typeof item[], keyword = 'A Pencil') {
    return controller.uploadWingCatalog(attempt.attemptId, attempt.attemptToken,
      { keyword, maxPages: 2, purpose: 'catalog_search', items }, organizationId);
  }
  function result(keyword: string, count: number) {
    return { keyword, outcome: count ? 'complete' : 'no_change', discovered: count, accepted: count, duplicate: 0, failed: 0 };
  }
  async function publish(attempt: { attemptId: string; attemptToken: string }, items: typeof item[],
    existingReceipt?: Awaited<ReturnType<typeof upload>>) {
    const receipt = existingReceipt ?? await upload(attempt, items);
    return controller.completeWingCatalog(attempt.attemptId, attempt.attemptToken,
      { purpose: 'catalog_search', keywords: [result('A Pencil', items.length)], receipts: [receipt] }, organizationId);
  }
});
