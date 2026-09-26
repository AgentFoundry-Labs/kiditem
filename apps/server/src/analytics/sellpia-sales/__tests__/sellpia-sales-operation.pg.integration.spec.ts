import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { operationFailureAlerts } from '../../../test-helpers/operation-failure-alerts';
import type { PrismaClient } from '@prisma/client';
import {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_SALES_CHUNK_KIND,
  SELLPIA_SALES_KIND,
} from '@kiditem/shared/sellpia-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../../test-helpers/orders-operations';
import { FactInputError } from '../../../common/errors/fact-errors';
import { sellpiaInventoryOperationProviders } from '../../../products/product-source.module';
import { SellpiaInventoryOperationOwner } from '../../../products/adapter/in/operation/sellpia-inventory-operation-owner';
import { SellpiaSalesOperationOwner } from '../../adapter/in/operation/sellpia-sales-operation-owner';
import type { CoupangAdsDailyRow } from '../../application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';
import { readSellpiaSalesDailyFacts } from '../read/sellpia-sales-daily-facts';
import { SellpiaSalesController } from '../sellpia-sales.controller';
import { SellpiaSalesPublicationRepository } from '../sellpia-sales-publication.repository';
import { SellpiaSalesService } from '../sellpia-sales.service';

// 확장 수집기(analytics.sellpia_sales)가 밟는 길을 서버에서 그대로: begin → sales_rows 청크 → finish.
// 원장(SellpiaSalesDailySnapshot.operationId)은 finish 트랜잭션에서만 창 바꿔 쓰기로 쓰이고, 읽기는 성공한 실행의 창을
// 덮은 날만 본다(KID-361 J2, ADR-0025).
const base = '/api/sellpia-sales';

type Row = { sellerId: string; sellerName: string; date: string; price: number; amount: number; buyPrice: number };
const row = (date: string, price: number, overrides: Partial<Row> = {}): Row => ({
  sellerId: '118',
  sellerName: '스마트스토어',
  date,
  price,
  amount: price / 600,
  buyPrice: (price * 7) / 12,
  ...overrides,
});

describe('analytics.sellpia_sales owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;
  let dailyAdsRead: CoupangAdsDailyRow[] | Error = [];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const summary = new SellpiaSalesService(
      {
        fetchDailyAds: async () => {
          if (dailyAdsRead instanceof Error) throw dailyAdsRead;
          return dailyAdsRead;
        },
      } as never,
      prisma as never,
    );
    harness = await ordersOperationsApp(prisma, {
      owners: [SellpiaSalesOperationOwner, SellpiaInventoryOperationOwner],
      controllers: [SellpiaSalesController],
      providers: [
        { provide: SellpiaSalesService, useValue: summary },
        SellpiaSalesPublicationRepository,
        ...sellpiaInventoryOperationProviders,
      ],
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    dailyAdsRead = [];
    vi.useRealTimers();
  });

  async function collect(scope: { startDate: string; endDate: string }, rows: Row[], organizationId = ORG) {
    const run = await harness.beginRun(SELLPIA_SALES_KIND, scope, organizationId);
    if (rows.length > 0) await harness.put(run, [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: rows }], organizationId);
    const finished = await harness.finish(run, { outcome: 'succeeded' }, organizationId).expect(200);
    return { run, operation: finished.body.operation };
  }

  const facts = (from: string, to: string, organizationId = ORG) =>
    prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, { organizationId, from, to }));
  const summary = (from: string, to: string) => request(harness.httpUrl).get(`${base}?from=${from}&to=${to}`).expect(200);

  it('plan은 셀피아 로그인 잠금과 창을 정하고, finish가 창 안 줄을 실행 id로 한 번 쓴다', async () => {
    const { run, operation } = await collect({ startDate: '2026-07-16', endDate: '2026-07-17' }, [row('2026-07-16', 1_200), row('2026-07-17', 2_400)]);
    expect(run.operation).toMatchObject({
      lockKeys: ['resource:sellpia:login'],
      plan: { sourceOrigin: 'https://kiditem.sellpia.com', sourcePath: '/sale_summary.html?mode=main_link', range: { from: '2026-07-16', to: '2026-07-17' } },
      window: { start: '2026-07-16', end: '2026-07-17' },
    });
    expect(operation).toMatchObject({ status: 'succeeded', result: { days: 2, rows: 2 } });

    const stored = await prisma.sellpiaSalesDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { businessDate: 'asc' } });
    expect(stored).toEqual([
      expect.objectContaining({ operationId: run.operation.id, sourceImportRunId: null, sellerId: '118', channelGroup: 'others', revenueKrw: 1_200, qty: 2, costKrw: 700 }),
      expect.objectContaining({ operationId: run.operation.id, revenueKrw: 2_400, qty: 4, costKrw: 1_400 }),
    ]);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const published = await facts('2026-07-16', '2026-07-17');
    expect(published.coverage).toEqual({ includedDates: ['2026-07-16', '2026-07-17'], invalidDates: [] });
    expect(published.facts).toHaveLength(2);
    expect(published.latestCapturedAt).toEqual(stored[0]!.capturedAt);
  });

  it('범위를 비우면 오늘(KST)까지 93일이고, 100일을 넘거나 뒤집히거나 모르는 필드면 실행을 만들지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-17T15:00:00.000Z'));
    const run = await harness.beginRun(SELLPIA_SALES_KIND, {});
    expect(run.operation.window).toEqual({ start: '2026-04-17', end: '2026-07-18' });
    vi.useRealTimers();

    for (const bad of [
      { startDate: '2026-01-01', endDate: '2026-04-11' },
      { startDate: '2026-07-18', endDate: '2026-07-17' },
      { startDate: '2026-02-30', endDate: '2026-03-01' },
      { range: { from: '2026-07-16', to: '2026-07-17' } },
    ]) {
      const refused = await harness.begin(SELLPIA_SALES_KIND, bad).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-01-01', endDate: '2026-04-10' });
  });

  it('같은 창을 다시 모으면 창 안의 줄(옛 run 줄 포함)을 바꿔 쓰고 창 밖 줄은 그대로 둔다', async () => {
    await collect({ startDate: '2026-07-15', endDate: '2026-07-17' }, [
      row('2026-07-15', 600),
      row('2026-07-16', 1_200),
      row('2026-07-17', 2_400, { sellerId: '129', sellerName: '쿠팡-직배송' }),
    ]);
    await prisma.sellpiaSalesDailySnapshot.create({
      data: { organizationId: ORG, businessDate: new Date('2026-07-16T00:00:00.000Z'), sellerId: 'legacy', sellerName: '옛 줄', channelGroup: 'others', revenueKrw: 9_999 },
    });

    const second = await collect({ startDate: '2026-07-16', endDate: '2026-07-17' }, [row('2026-07-16', 1_800)]);
    expect(second.operation.result).toEqual({ days: 2, rows: 1 });

    const stored = await prisma.sellpiaSalesDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { businessDate: 'asc' } });
    expect(stored.map((value) => [value.businessDate.toISOString().slice(0, 10), value.sellerId, value.revenueKrw])).toEqual([
      ['2026-07-15', '118', 600],
      ['2026-07-16', '118', 1_800],
    ]);
    const published = await facts('2026-07-15', '2026-07-17');
    expect(published.coverage.includedDates).toEqual(['2026-07-15', '2026-07-16', '2026-07-17']);
    expect(published.facts.map((fact) => fact.revenueKrw)).toEqual([600, 1_800]);
  });

  it('빈 판매현황도 성공이다 — 창의 옛 줄을 지우고 그 날들을 매출 0으로 덮는다', async () => {
    await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, [row('2026-07-16', 1_200)]);
    const empty = await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, []);
    expect(empty.operation.result).toEqual({ days: 1, rows: 0 });
    await expect(prisma.sellpiaSalesDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    const published = await facts('2026-07-16', '2026-07-16');
    expect(published).toMatchObject({ facts: [], coverage: { includedDates: ['2026-07-16'] } });
  });

  it('실패·중단은 원장을 바꾸지 않는다 — 실패는 실행 표에만 남아 알림 reader가 보이고, 중단은 알림이 아니며, 다음 성공이 알림을 닫는다', async () => {
    await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, [row('2026-07-16', 1_200)]);

    const failed = await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-07-16', endDate: '2026-07-16' });
    await harness.put(failed, [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: [row('2026-07-16', 9_000)] }]);
    await harness.finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' }).expect(200);
    const cancelled = await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-07-16', endDate: '2026-07-16' });
    await request(harness.httpUrl).post(`/api/operations/${cancelled.operation.id}/cancel`).expect(200);

    await expect(facts('2026-07-16', '2026-07-16')).resolves.toMatchObject({ facts: [expect.objectContaining({ revenueKrw: 1_200 })] });
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({
      rows: 0,
      items: [{
        type: 'operation_failure',
        attemptId: failed.operation.id,
        status: 'OPEN',
        sourceType: SELLPIA_SALES_KIND,
        message: '사이트에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도해 주세요.',
      }],
    });

    await collect({ startDate: '2026-07-17', endDate: '2026-07-17' }, [row('2026-07-17', 600)]);
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({ rows: 0, items: [{ status: 'RESOLVED', attemptId: failed.operation.id }] });
  });

  it('형식이 틀린 줄·창 밖 일자·계획 밖 창·모르는 청크는 VALIDATION_FAILED이고 원장에 아무것도 없다', async () => {
    const cases: Array<{ chunks: Array<{ chunkKind: string; payload: unknown[] }>; window?: { start: string; end: string }; reason: string }> = [
      { chunks: [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: [{ ...row('2026-07-16', 1_200), price: 'NaN' }] }], reason: 'invalid_sales_rows' },
      { chunks: [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: [row('2026-07-18', 1_200)] }], reason: 'date_outside_window' },
      { chunks: [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: [row('2026-07-17', 1_200)] }], window: { start: '2026-07-16', end: '2026-07-16' }, reason: 'date_outside_window' },
      { chunks: [], window: { start: '2026-07-15', end: '2026-07-17' }, reason: 'window_outside_plan' },
      { chunks: [{ chunkKind: 'inventory_rows', payload: [row('2026-07-16', 1_200)] }], reason: 'unexpected_chunk_kind' },
    ];
    for (const { chunks, window, reason } of cases) {
      const run = await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-07-16', endDate: '2026-07-17' });
      await harness.put(run, chunks);
      const refused = await harness.finish(run, { outcome: 'succeeded', ...(window ? { window } : {}) }).expect(400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason } });
      await harness.finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    }
    await expect(prisma.sellpiaSalesDailySnapshot.count()).resolves.toBe(0);
  });

  it('셀피아 로그인 잠금은 하나다 — 재고 실행이 도는 동안 매출 begin은 OPERATION_IN_PROGRESS', async () => {
    await prisma.sellpiaInventoryState.create({
      data: { organizationId: ORG, sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem', freshnessFence: randomUUID() },
    });
    const inventory = await harness.beginRun(SELLPIA_INVENTORY_KIND, {});
    const refused = await harness.begin(SELLPIA_SALES_KIND, { startDate: '2026-07-16', endDate: '2026-07-16' }).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: inventory.operation.id } });
  });

  it('읽기는 조직을 넘지 않는다 — 다른 조직의 실행 창·줄은 보이지 않는다', async () => {
    await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, [row('2026-07-16', 1_200)], OTHER_ORG);
    await expect(facts('2026-07-16', '2026-07-16')).resolves.toMatchObject({ facts: [], coverage: { includedDates: [] } });
    await expect(facts('2026-07-16', '2026-07-16', OTHER_ORG)).resolves.toMatchObject({ coverage: { includedDates: ['2026-07-16'] } });
  });

  it('성공한 실행이 덮지 않은 날·옛 run 줄은 읽지 않고, 날짜가 없는 범위는 입력 오류다', async () => {
    await prisma.sellpiaSalesDailySnapshot.create({
      data: { organizationId: ORG, businessDate: new Date('2026-07-15T00:00:00.000Z'), sellerId: 'legacy', sellerName: '옛 줄', channelGroup: 'others', revenueKrw: 9_999 },
    });
    await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, [row('2026-07-16', 1_200)]);
    const published = await facts('2026-07-15', '2026-07-17');
    expect(published.coverage.includedDates).toEqual(['2026-07-16']);
    expect(published.facts.map((fact) => fact.sellerId)).toEqual(['118']);

    for (const range of [{ from: '2026-07-16', to: '2026-07-15' }, { from: '2026-07-32', to: '2026-08-01' }]) {
      await expect(facts(range.from, range.to)).rejects.toBeInstanceOf(FactInputError);
    }
  });

  it('요약은 매출·광고 날짜 교집합으로 이익을 내고 음수 이익을 지킨다', async () => {
    await collect({ startDate: '2026-07-14', endDate: '2026-07-16' }, [
      row('2026-07-14', 100, { amount: 1, buyPrice: 40 }),
      row('2026-07-15', 200, { amount: 2, buyPrice: 80 }),
      row('2026-07-16', 300, { amount: 3, buyPrice: 120 }),
    ]);
    dailyAdsRead = [{ date: '2026-07-14', ad_cost: 110 }, { date: '2026-07-16', ad_cost: 230 }];
    const response = await summary('2026-07-14', '2026-07-16');
    expect(response.body).toMatchObject({
      totalRevenue: 600,
      totalCost: 240,
      adCost: 340,
      netProfit: -100,
      profitRate: -25,
      profitInputs: { revenue: 400, cost: 160, adCost: 340, qty: 4, basis: { includedDates: ['2026-07-14', '2026-07-16'] } },
    });
  });

  it('요약은 덮은 날만 싣고, 도는·실패한 실행은 이전 성공분을 가리지 않는다', async () => {
    const empty = await summary('2026-07-16', '2026-07-17');
    expect(empty.body).toMatchObject({ totalRevenue: 0, hasData: false, rocket: { revenueShare: null }, others: { revenueShare: null } });

    await collect({ startDate: '2026-07-16', endDate: '2026-07-16' }, [row('2026-07-16', 1_200)]);
    const partial = await summary('2026-07-16', '2026-07-17');
    expect(partial.body).toMatchObject({ totalRevenue: 1_200, hasData: true, metricBasis: { totalRevenue: { includedDates: ['2026-07-16'] } } });

    const running = await harness.beginRun(SELLPIA_SALES_KIND, { startDate: '2026-07-16', endDate: '2026-07-17' });
    await harness.put(running, [{ chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: [row('2026-07-16', 9_000)] }]);
    await expect(summary('2026-07-16', '2026-07-17')).resolves.toMatchObject({ body: { totalRevenue: 1_200 } });
    await harness.finish(running, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);
    const after = await summary('2026-07-16', '2026-07-17');
    expect(after.body.others.malls).toEqual([expect.objectContaining({ sellerId: '118', revenue: 1_200 })]);
  });

  it('첫 KST 날에는 열린 달을 읽지 않고, 둘째 날에는 닫힌 첫날만 읽는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-31T15:00:00.000Z'));
    const open = await request(harness.httpUrl).get(base).expect(200);
    expect(open.body).toMatchObject({ knownThrough: '2026-08-31', range: null, hasData: false });

    vi.setSystemTime(new Date('2026-09-01T15:00:00.000Z'));
    await collect({ startDate: '2026-09-01', endDate: '2026-09-02' }, [row('2026-09-01', 1_200), row('2026-09-02', 2_400)]);
    const closed = await request(harness.httpUrl).get(base).expect(200);
    expect(closed.body).toMatchObject({ knownThrough: '2026-09-01', range: { from: '2026-09-01', to: '2026-09-01' }, hasData: true, totalRevenue: 1_200 });
  });
});
