import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_PROFIT_CHUNK_KIND,
  SELLPIA_SALES_KIND,
  type SellpiaProfitProduct,
} from '@kiditem/shared/sellpia-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../../test-helpers/orders-operations';
import { seedSourceProduct } from '../../../test-helpers/inventory-seeds';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from '../../../products/application/port/in/product-transactional-read.port';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { advanceProductMappingGeneration } from '../../../products/adapter/out/persistence/product-mapping-generation';
import { SellpiaProductProfitabilityOperationOwner } from '../../adapter/in/operation/sellpia-product-profitability-operation-owner';
import { SellpiaSalesOperationOwner } from '../../adapter/in/operation/sellpia-sales-operation-owner';
import { SellpiaSalesPublicationRepository } from '../../sellpia-sales/sellpia-sales-publication.repository';
import { SellpiaProfitabilityPublicationRepository } from '../sellpia-profitability-publication.repository';
import { SellpiaProfitabilitySourceService } from '../sellpia-profitability-source.service';

// 확장 수집기(analytics.sellpia_product_profitability)가 밟는 길을 서버에서 그대로: begin → profit_months 청크 → finish.
// 월 사실(sellpia_product_monthly_sales.operation_id)은 finish 트랜잭션에서만 한 벌(불변 세대)로 쓰이고, ABC 근거는
// 성공한 실행을 세대로 읽는다(KID-361 J3, ADR-0025).
const DEDUPE_KEY = 'source:sellpia-product-profitability';
const NOW = new Date('2026-09-03T01:00:00.000Z');
const COVERED = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09',
];

function product(productCode: string, months: Array<{ yearMonth: string; orderQty: number; orderAmount: number; inQty: number; inAmount: number }>, overrides: Partial<SellpiaProfitProduct> = {}): SellpiaProfitProduct {
  const sum = (key: 'orderQty' | 'orderAmount' | 'inQty' | 'inAmount') => months.reduce((total, month) => total + month[key], 0);
  return {
    productCode,
    optionCode: '',
    productName: `상품 ${productCode}`,
    salePrice: 2_000,
    buyPrice: 1_000,
    totalOrderAmount: sum('orderAmount'),
    totalOrderQty: sum('orderQty'),
    totalInAmount: sum('inAmount'),
    totalInQty: sum('inQty'),
    months,
    ...overrides,
  };
}
const month = (yearMonth: string, orderQty = 2) => ({ yearMonth, orderQty, orderAmount: orderQty * 2_000, inQty: orderQty, inAmount: orderQty * 1_000 });

describe('analytics.sellpia_product_profitability owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;
  let source: SellpiaProfitabilitySourceService;
  let mappedProductId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await ordersOperationsApp(prisma, {
      owners: [SellpiaProductProfitabilityOperationOwner, SellpiaSalesOperationOwner],
      providers: [
        SourceFailureAlerts,
        SellpiaProfitabilityPublicationRepository,
        SellpiaSalesPublicationRepository,
        { provide: PRODUCT_TRANSACTIONAL_READ_PORT, useClass: ProductTransactionalReadRepositoryAdapter },
      ],
    });
    source = new SellpiaProfitabilitySourceService(prisma as never);
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    mappedProductId = (await seedSourceProduct(prisma, { organizationId: ORG, code: 'P-1', name: '매핑 상품' })).id;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  async function collect(products: SellpiaProfitProduct[], chunkSize = 1) {
    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    const chunks = [];
    for (let index = 0; index < products.length; index += chunkSize) {
      chunks.push({ chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: products.slice(index, index + chunkSize) });
    }
    await harness.put(run, chunks);
    return { run, finished: await harness.finish(run) };
  }

  const facts = (operationId?: string) => prisma.sellpiaProductMonthlySales.findMany({
    where: { organizationId: ORG, ...(operationId ? { operationId } : {}) },
    orderBy: [{ productCode: 'asc' }, { yearMonth: 'asc' }],
  });

  it('plan은 어제(KST)까지 401일 창과 덮을 달·매핑 세대를 정하고 셀피아 로그인 잠금을 잡는다', async () => {
    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    expect(run.operation).toMatchObject({
      lockKeys: ['resource:sellpia:login'],
      plan: { parserVersion: 'sellpia-profitability-v2', from: '2025-07-29', to: '2026-09-02', coveredMonths: COVERED, mappingGeneration: '0' },
      window: { start: '2025-07-29', end: '2026-09-02' },
    });

    vi.setSystemTime(new Date('2026-09-02T14:59:59.999Z'));
    await harness.finish(run, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);
    const earlier = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    expect(earlier.operation.plan).toMatchObject({ from: '2025-07-28', to: '2026-09-01' });
  });

  it('원천 가용일은 창 안일 때만 시작을 늦추고, 창 밖·모르는 필드는 실행을 만들지 않는다', async () => {
    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, { normalizedSourceAvailabilityDate: '2026-03-15' });
    expect(run.operation.plan).toMatchObject({ from: '2026-03-15', to: '2026-09-02', coveredMonths: COVERED.slice(8) });
    await harness.finish(run, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED' }).expect(200);

    for (const bad of [{ normalizedSourceAvailabilityDate: '2026-09-03' }, { normalizedSourceAvailabilityDate: '2026-02-30' }, { from: '2026-01-01' }]) {
      const refused = await harness.begin(SELLPIA_PRODUCT_PROFITABILITY_KIND, bad).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const older = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, { normalizedSourceAvailabilityDate: '2024-01-01' });
    expect(older.operation.plan).toMatchObject({ from: '2025-07-29' });
  });

  it('finish가 월 사실 한 벌을 실행 id로 넣는다 — 매핑·경계 달 교집합·결과·세대 목록과 세대 사실 읽기', async () => {
    const { run, finished } = await collect([
      product('P-1', [month('2025-07'), month('2026-08', 3), month('2026-09', 1)]),
      product('UNKNOWN', [month('2026-08', 1)], { barcode: '8800000000001' }),
    ]);
    expect(finished.status).toBe(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      result: { months: 15, rows: 4, quality: { mappedRows: 3, unmappedRows: 1, contentChecksum: expect.stringMatching(/^[a-f0-9]{64}$/) } },
    });

    const stored = await facts(run.operation.id);
    expect(stored.map((fact) => [fact.productCode, fact.yearMonth, fact.masterProductId, fact.coverageStartDate?.toISOString().slice(0, 10), fact.coverageEndDate?.toISOString().slice(0, 10), fact.orderQty, fact.inAmount])).toEqual([
      ['P-1', '2025-07', mappedProductId, '2025-07-29', '2025-07-31', 2, 2_000],
      ['P-1', '2026-08', mappedProductId, '2026-08-01', '2026-08-31', 3, 3_000],
      ['P-1', '2026-09', mappedProductId, '2026-09-01', '2026-09-02', 1, 1_000],
      ['UNKNOWN', '2026-08', null, '2026-08-01', '2026-08-31', 1, 1_000],
    ]);
    expect(stored.every((fact) => fact.sourceImportRunId === null && fact.costBasis === 'ORDER_TIME_SUPPLY_COST' && fact.vatIncluded === true)).toBe(true);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const catalog = await source.readGenerationCatalog({ organizationId: ORG });
    expect(catalog.latestAttempt).toMatchObject({ attemptId: run.operation.id, state: 'COMPLETE', plan: { from: '2025-07-29', to: '2026-09-02' } });
    expect(catalog.completeGenerations).toEqual([expect.objectContaining({
      operationId: run.operation.id,
      mappingGeneration: '0',
      coverage: { from: '2025-07-29', to: '2026-09-02', coveredMonths: COVERED },
      quality: expect.objectContaining({ correctedCostEvidence: true, includedRowCount: 4, mappedRowCount: 3, unmappedRowCount: 1 }),
    })]);
    const generation = await source.readGenerationFacts({ organizationId: ORG, operationId: run.operation.id, yearMonths: ['2026-08'] });
    expect(generation.facts).toEqual([expect.objectContaining({ operationId: run.operation.id, masterProductId: mappedProductId, yearMonth: '2026-08', revenue: 6_000, orderTimeSupplyCost: 3_000 })]);
    expect(generation.unmappedFacts).toEqual([expect.objectContaining({ productCode: 'UNKNOWN', reason: 'SOURCE_UNMAPPED' })]);
  });

  it('두 번째 발행은 새 세대를 더하고 옛 세대 사실은 그대로 남는다(최신이 먼저)', async () => {
    const first = await collect([product('P-1', [month('2026-08', 1)])]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const second = await collect([product('P-1', [month('2026-08', 5)])]);
    const catalog = await source.readGenerationCatalog({ organizationId: ORG });
    expect(catalog.completeGenerations.map((generation) => generation.operationId)).toEqual([second.run.operation.id, first.run.operation.id]);
    expect(Number(catalog.completeGenerations[0]!.publicationSequence)).toBeGreaterThan(Number(catalog.completeGenerations[1]!.publicationSequence));
    await expect(facts(first.run.operation.id)).resolves.toEqual([expect.objectContaining({ orderQty: 1 })]);
    await expect(facts(second.run.operation.id)).resolves.toEqual([expect.objectContaining({ orderQty: 5 })]);
  });

  it('빈 목록은 빈 세대로 성공하고, 상품이 있는데 월 사실이 없으면 증명되지 않아 거절한다', async () => {
    const empty = await collect([]);
    expect(empty.finished.body.operation).toMatchObject({ status: 'succeeded', result: { rows: 0 } });

    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    await harness.put(run, [{ chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: [product('P-1', [])] }]);
    const refused = await harness.finish(run).expect(400);
    expect(refused.body).toMatchObject({ code: 'ANALYTICS_SELLPIA_PROFIT_EMPTY_UNPROVEN' });
  });

  it('합계 불일치·중복 상품·창 밖 달·틀린 항목·모르는 청크는 VALIDATION_FAILED이고 원장에 아무것도 없다', async () => {
    const cases: Array<{ chunkKind?: string; payload: unknown[]; reason: string }> = [
      { payload: [{ ...product('P-1', [month('2026-08')]), totalOrderQty: 99 }], reason: 'provider_totals_mismatch' },
      { payload: [product('P-1', [month('2026-08')]), product('P-1', [month('2026-07')])], reason: 'duplicate_product_identity' },
      { payload: [product('P-1', [month('2025-06')])], reason: 'month_outside_plan' },
      { payload: [{ ...product('P-1', [month('2026-08')]), extra: true }], reason: 'invalid_profit_products' },
      { chunkKind: 'sales_rows', payload: [product('P-1', [month('2026-08')])], reason: 'unexpected_chunk_kind' },
    ];
    for (const { chunkKind, payload, reason } of cases) {
      const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
      await harness.put(run, [{ chunkKind: chunkKind ?? SELLPIA_PROFIT_CHUNK_KIND, payload }]);
      const refused = await harness.finish(run).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason } });
      await harness.finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    }
    await expect(prisma.sellpiaProductMonthlySales.count()).resolves.toBe(0);
  });

  it('수집하는 동안 상품 매핑 세대가 바뀌면 발행하지 않는다(409)', async () => {
    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    await harness.put(run, [{ chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: [product('P-1', [month('2026-08')])] }]);
    await prisma.$transaction((tx) => advanceProductMappingGeneration(tx, ORG));
    const refused = await harness.finish(run).expect(409);
    expect(refused.body).toMatchObject({ code: 'ANALYTICS_SELLPIA_PROFIT_MAPPING_CHANGED' });
    await expect(prisma.sellpiaProductMonthlySales.count()).resolves.toBe(0);
  });

  it('실패는 원천 알림 하나(원장 그대로), 중단은 알림 없음, 다음 성공이 알림을 푼다', async () => {
    const failed = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    await harness.put(failed, [{ chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: [product('P-1', [month('2026-08')])] }]);
    await harness.finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' }).expect(200);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const cancelled = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    await request(harness.httpUrl).post(`/api/operations/${cancelled.operation.id}/cancel`).expect(200);

    await expect(prisma.sellpiaProductMonthlySales.count()).resolves.toBe(0);
    await expect(prisma.alert.findMany({ where: { organizationId: ORG, dedupeKey: DEDUPE_KEY } })).resolves.toEqual([
      expect.objectContaining({ attemptId: failed.operation.id, status: 'OPEN' }),
    ]);
    const catalog = await source.readGenerationCatalog({ organizationId: ORG });
    expect(catalog).toMatchObject({ latestAttempt: { attemptId: cancelled.operation.id, state: 'FAILED' }, completeGenerations: [] });

    await collect([product('P-1', [month('2026-08')])]);
    await expect(prisma.alert.findFirstOrThrow({ where: { organizationId: ORG, dedupeKey: DEDUPE_KEY } })).resolves.toMatchObject({ status: 'RESOLVED' });
  });

  it('임대가 끝난 도는 실행은 실행 계약의 만료 규칙대로 읽힌다 — 시도가 남으면 다시 도는 중, 다 썼으면 만료 실패', async () => {
    const run = await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {});
    await prisma.operation.update({ where: { id: run.operation.id }, data: { expiresAt: new Date(NOW.getTime() - 1), maxAttempts: 2 } });
    await expect(source.readGenerationCatalog({ organizationId: ORG })).resolves.toMatchObject({
      latestAttempt: { attemptId: run.operation.id, state: 'RUNNING', errorCode: 'OPERATION_FENCE_LOST' },
    });

    await prisma.operation.update({ where: { id: run.operation.id }, data: { maxAttempts: 1 } });
    await expect(source.readGenerationCatalog({ organizationId: ORG })).resolves.toMatchObject({
      latestAttempt: { attemptId: run.operation.id, state: 'FAILED', errorCode: 'OPERATION_FENCE_LOST' },
    });
  });

  it('셀피아 로그인 잠금은 하나다 — 매출이 도는 동안 상품 손익 begin은 OPERATION_IN_PROGRESS, 다른 조직은 막지 않는다', async () => {
    const sales = await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-09-01', endDate: '2026-09-02' });
    const refused = await harness.begin(SELLPIA_PRODUCT_PROFITABILITY_KIND, {}).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: sales.operation.id } });
    await harness.beginRun(SELLPIA_PRODUCT_PROFITABILITY_KIND, {}, OTHER_ORG);
  });
});
