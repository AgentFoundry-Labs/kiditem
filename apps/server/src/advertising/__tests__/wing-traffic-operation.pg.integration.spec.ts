import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { businessDateKey, evidenceCutoffDate, shiftBusinessDateKey } from '@kiditem/shared/common';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import {
  WING_ITEMWINNER_KIND,
  WING_TRAFFIC_DAY_CHUNK_KIND,
  WING_TRAFFIC_KIND,
  WING_TRAFFIC_PERIOD_CHUNK_KIND,
  WING_TRAFFIC_ROWS_CHUNK_KIND,
  type WingTrafficRow,
} from '@kiditem/shared/advertising-operations';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { readListingTrafficWindowFacts } from '../../channels/adapter/out/persistence/channel-listing-daily-facts';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { WingItemwinnerOperationOwner, WingTrafficOperationOwner } from '../adapter/in/operation/wing-daily-operation-owners';
import { WingItemwinnerOperationRepository } from '../adapter/out/repository/wing-itemwinner-operation.repository';
import { WingTrafficOperationRepository } from '../adapter/out/repository/wing-traffic-operation.repository';
import { WingTrafficReadRepository } from '../adapter/out/repository/wing-traffic-read.repository';

// 확장 수집기(advertising.wing_traffic)가 밟는 길을 서버에서 그대로: begin → traffic_rows(옵션-일) → traffic_days(날 표식)
// → traffic_period(확정 창) → finish. 원장 쓰기는 finish 트랜잭션 안에서만(ADR-0025, KID-362).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const REGISTERED = '2026-01-02 09:00:00';
const SUMMARY = { visitors: 30, views: 60, cartAdds: 6, orders: 3, salesQty: 4, revenue: 30_000, providerConversionRate: 5 };
const closed = () => businessDateKey(evidenceCutoffDate());

function row(businessDate: string, vendorItemId: string, views = 10, productId: string | null = null): WingTrafficRow {
  return { businessDate, vendorItemId, productId, visitors: views, views, cartAdds: 1, orders: 1, salesQty: 1, revenue: views * 100 };
}

describe('advertising.wing_traffic owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let reader: WingTrafficReadRepository;
  let accountId: string;
  let listingA: { id: string };
  let listingB: { id: string };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const ports = channelFactTestPorts(prisma as never);
    const alerts = new SourceFailureAlerts(prisma as never);
    reader = new WingTrafficReadRepository(ports.accounts, prisma as never);
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        { provide: WingTrafficOperationOwner, useValue: new WingTrafficOperationOwner(new WingTrafficOperationRepository(ports.accounts, ports.listings, prisma as never, alerts)) },
        { provide: WingItemwinnerOperationOwner, useValue: new WingItemwinnerOperationOwner(new WingItemwinnerOperationRepository(ports.accounts, ports.listings, prisma as never, alerts)) },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Primary Wing', isPrimary: true, vendorId: 'A0001' },
    });
    accountId = account.id;
    listingA = await catalogListing('5001', ['1001', '1002']);
    listingB = await catalogListing('5002', ['2001']);
  });

  async function catalogListing(externalId: string, optionIds: string[], data: Record<string, unknown> = {}) {
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        externalId,
        displayName: `Listing ${externalId}`,
        isActive: true,
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        rawJson: { createdOn: REGISTERED },
        ...data,
      },
    });
    for (const externalOptionId of optionIds) {
      await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId, isActive: true } });
    }
    return listing;
  }

  const begin = (scope: Record<string, unknown>) => request(httpUrl).post('/api/operations').send({ kind: WING_TRAFFIC_KIND, scope });
  async function beginRun(scope: Record<string, unknown> = {}): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin({ channelAccountId: accountId, ...scope }).expect(201)).body);
  }
  async function put(run: OperationBeginResponse, chunkKind: string, sequence: number, payload: unknown[]) {
    await request(httpUrl)
      .put(`/api/operations/${run.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send({ checksum: checksum(payload), payload })
      .expect(200);
  }
  function finish(run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) {
    return request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);
  }
  /** 수집기의 순서: 날마다 행 청크 → 날 표식, 끝에 확정 창 기간 표식. `days`의 키 순서가 확정 창이다. */
  async function collect(run: OperationBeginResponse, days: Record<string, WingTrafficRow[]>, vendorId = 'A0001') {
    const dates = Object.keys(days);
    let rowSequence = 0;
    for (const [index, date] of dates.entries()) {
      const rows = days[date]!;
      if (rows.length > 0) await put(run, WING_TRAFFIC_ROWS_CHUNK_KIND, ++rowSequence, rows);
      await put(run, WING_TRAFFIC_DAY_CHUNK_KIND, index + 1, [{
        businessDate: date, pages: 1, rows: rows.length, explicitEmpty: rows.length === 0,
        capturedAt: `${date}T20:00:00.000Z`, accountSummary: SUMMARY,
      }]);
    }
    await put(run, WING_TRAFFIC_PERIOD_CHUNK_KIND, 1, [{
      startDate: dates[0], endDate: dates[dates.length - 1], capturedAt: new Date().toISOString(), vendorId,
      accountSummary: { ...SUMMARY, views: SUMMARY.views * dates.length },
    }]);
  }
  const listingDays = (listingId: string) =>
    prisma.channelListingDailySnapshot.findMany({ where: { organizationId: ORG, listingId }, orderBy: { businessDate: 'asc' } });
  const dateAt = (date: string) => new Date(`${date}T00:00:00.000Z`);

  it('plan locks the account and the Wing daily resource, keeps the old seven-closed-days default and refuses a bad range', async () => {
    const run = await beginRun();
    const end = closed();
    expect(run.operation.lockKeys).toEqual([`account:${accountId}`, `resource:wing-daily:${accountId}`]);
    expect(run.operation.plan).toMatchObject({
      channelAccountId: accountId,
      vendorId: 'A0001',
      startDate: shiftBusinessDateKey(end, -6),
      endDate: end,
      maxPagesPerDay: 100,
    });
    expect(run.operation.plan?.expectedDates).toHaveLength(7);
    expect(run.operation.window).toEqual({ start: shiftBusinessDateKey(end, -6), end });
    await finish(run, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);

    const tooLong = await begin({ channelAccountId: accountId, startDate: shiftBusinessDateKey(end, -92), endDate: end }).expect(400);
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'traffic_range_too_long' } });
    const future = await begin({ channelAccountId: accountId, startDate: end, endDate: shiftBusinessDateKey(end, 1) }).expect(400);
    expect(future.body.details.reason).toBe('traffic_range_in_future');
    expect((await begin({ channelAccountId: randomUUID() }).expect(404)).body.code).toBe('CHANNELS_ACCOUNT_NOT_FOUND');
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: null } });
    expect((await begin({ channelAccountId: accountId }).expect(400)).body.details.reason).toBe('vendor_identity_missing');
  });

  it('traffic and itemwinner of one account refuse each other with OPERATION_IN_PROGRESS (the old lockListingTraffic)', async () => {
    const traffic = await beginRun();
    const itemwinner = await request(httpUrl).post('/api/operations').send({ kind: WING_ITEMWINNER_KIND, scope: { channelAccountId: accountId } }).expect(409);
    expect(itemwinner.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: traffic.operation.id } });
    await finish(traffic, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);
    const second = await request(httpUrl).post('/api/operations').send({ kind: WING_ITEMWINNER_KIND, scope: { channelAccountId: accountId } }).expect(201);
    const refused = await begin({ channelAccountId: accountId }).expect(409);
    expect(refused.body.details.operationId).toBe(second.body.operation.id);
  });

  it('finish sums options into one row per listing-day, zero-fills the catalog listing Wing left out, and stamps the operation', async () => {
    const day = closed();
    const run = await beginRun({ startDate: day, endDate: day });
    await collect(run, { [day]: [row(day, '1001', 10), row(day, '1002', 5), row(day, '9999', 7)] });
    const finished = await finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      result: {
        confirmedDates: [day],
        providerBackedEmptyDates: [],
        rowCount: 3,
        matchedCount: 2,
        unmatchedCount: 1,
        unmatchedOptionIdsByDate: { [day]: ['9999'] },
        accountDaily: [{ businessDate: day, operationId: run.operation.id, views: SUMMARY.views }],
      },
    });
    const [a] = await listingDays(listingA.id);
    expect(a).toMatchObject({
      businessDate: dateAt(day), trafficViews: 15, trafficRevenue: 1500, trafficOrders: 2,
      operationId: run.operation.id, rawSnapshotId: null,
      metaJson: { 'traffic.currentSource': 'wing.traffic', 'wing.traffic': { sourceAttemptId: run.operation.id, businessDate: day } },
    });
    const [b] = await listingDays(listingB.id);
    expect(b).toMatchObject({ trafficViews: 0, trafficRevenue: 0, trafficObservedAt: new Date(`${day}T20:00:00.000Z`), operationId: run.operation.id });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.channelScrapeSnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('a re-run of the same day replaces the values in place, and the confirmed window can stop before an unpublished last day', async () => {
    const end = closed();
    const start = shiftBusinessDateKey(end, -1);
    const first = await beginRun({ startDate: start, endDate: start });
    await collect(first, { [start]: [row(start, '1001', 10), row(start, '2001', 3)] });
    await finish(first).expect(200);

    const second = await beginRun({ startDate: start, endDate: end });
    await collect(second, { [start]: [row(start, '1001', 40)] });
    const finished = await finish(second).expect(200);
    expect(finished.body.operation.result.confirmedDates).toEqual([start]);

    const rowsA = await listingDays(listingA.id);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({ trafficViews: 40, metaJson: { 'wing.traffic': { sourceAttemptId: second.operation.id } } });
    const rowsB = await listingDays(listingB.id);
    expect(rowsB).toHaveLength(1);
    // Wing이 앞서 쓴 날을 이번 보고서가 빠뜨렸으면 0으로 초기화한다.
    expect(rowsB[0]).toMatchObject({ trafficViews: 0, metaJson: { 'wing.traffic': { sourceAttemptId: second.operation.id } } });
  });

  it('an explicit-empty day is measured zero, a zero day Wing did not call empty is refused, and a failed run writes nothing', async () => {
    const day = closed();
    const refused = await beginRun({ startDate: day, endDate: day });
    await put(refused, WING_TRAFFIC_DAY_CHUNK_KIND, 1, [{ businessDate: day, pages: 1, rows: 0, explicitEmpty: false, capturedAt: `${day}T20:00:00.000Z`, accountSummary: SUMMARY }]);
    await put(refused, WING_TRAFFIC_PERIOD_CHUNK_KIND, 1, [{ startDate: day, endDate: day, capturedAt: `${day}T21:00:00.000Z`, vendorId: 'A0001', accountSummary: SUMMARY }]);
    expect((await finish(refused).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'traffic_empty_proof_required' } });
    await finish(refused, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    await expect(prisma.channelListingDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const empty = await beginRun({ startDate: day, endDate: day });
    await collect(empty, { [day]: [] });
    const finished = await finish(empty).expect(200);
    expect(finished.body.operation.result.providerBackedEmptyDates).toEqual([day]);
    expect((await listingDays(listingA.id))[0]).toMatchObject({ trafficViews: 0 });
  });

  it('an all-empty window read under another Wing vendor is refused and zero-fills nothing (M1)', async () => {
    const day = closed();
    const run = await beginRun({ startDate: day, endDate: day });
    await collect(run, { [day]: [] }, 'B0002');
    expect((await finish(run).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'vendor_identity_mismatch' } });
    await finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    await expect(prisma.channelListingDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(reader.readPublished({ organizationId: ORG, from: day, to: day })).resolves.toMatchObject({ accountDaily: [] });
  });

  it('keeps an item-winner row\'s observation count and operation, and changes only the traffic columns', async () => {
    const day = closed();
    const itemwinnerOp = randomUUID();
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: ORG, listingId: listingA.id, channel: 'coupang', externalId: '5001', businessDate: dateAt(day),
        isOfferWinner: true, sampleCount: 3, operationId: itemwinnerOp,
      },
    });
    const run = await beginRun({ startDate: day, endDate: day });
    await collect(run, { [day]: [row(day, '1001', 9)] });
    await finish(run).expect(200);
    expect((await listingDays(listingA.id))[0]).toMatchObject({ isOfferWinner: true, sampleCount: 3, operationId: itemwinnerOp, trafficViews: 9 });
  });

  it('refuses when the account changed its Wing identity during the run, and keeps one failure alert per account', async () => {
    const day = closed();
    const run = await beginRun({ startDate: day, endDate: day });
    await collect(run, { [day]: [row(day, '1001')] });
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: 'B0002' } });
    expect((await finish(run).expect(400)).body.details.reason).toBe('account_changed');
    await finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED', errorMessage: '계정이 바뀌었습니다.' }).expect(200);
    await expect(prisma.alert.findMany({ where: { organizationId: ORG } })).resolves.toMatchObject([
      { status: 'OPEN', sourceType: 'coupang_wing_traffic', dedupeKey: `source:coupang_wing_traffic:${accountId}`, attemptId: run.operation.id },
    ]);
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: 'A0001' } });
    const next = await beginRun({ startDate: day, endDate: day });
    await collect(next, { [day]: [row(day, '1001')] });
    await finish(next).expect(200);
    await expect(prisma.alert.findMany({ where: { organizationId: ORG } })).resolves.toMatchObject([{ status: 'RESOLVED', attemptId: next.operation.id }]);
  });

  it('AD_TRAFFIC_READ_PORT reads each date from the newest run that confirmed it and reconciles an exact period', async () => {
    const end = closed();
    const start = shiftBusinessDateKey(end, -1);
    await expect(reader.readPublished({ organizationId: ORG, from: start, to: end })).resolves.toMatchObject({
      accountDaily: [], coverage: { targetDays: 2, completedDays: 0, missingDates: [start, end] },
    });
    const first = await beginRun({ startDate: start, endDate: end });
    await collect(first, { [start]: [row(start, '1001')], [end]: [row(end, '1001')] });
    await finish(first).expect(200);
    const published = await reader.readPublished({ organizationId: ORG, from: start, to: end });
    expect(published.accountDaily.map((entry) => [entry.businessDate, entry.operationId])).toEqual([[start, first.operation.id], [end, first.operation.id]]);
    expect(published.coverage).toMatchObject({ targetDays: 2, completedDays: 2, missingDates: [] });
    expect(published.reconciliation.views).toEqual({ dailySum: SUMMARY.views * 2, periodValue: SUMMARY.views * 2 });

    const second = await beginRun({ startDate: end, endDate: end });
    await collect(second, { [end]: [row(end, '1001')] });
    await finish(second).expect(200);
    const refreshed = await reader.readPublished({ organizationId: ORG, from: start, to: end });
    expect(refreshed.accountDaily.map((entry) => entry.operationId)).toEqual([first.operation.id, second.operation.id]);
    // 창의 날을 더 새 실행이 바꿨으니 옛 기간 요약은 대조 근거가 아니다.
    expect(refreshed.reconciliation.views.periodValue).toBeNull();
    await expect(reader.readPublished({ organizationId: ORG, channelAccountId: randomUUID() })).rejects.toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
  });

  describe('Channels traffic window over operation-published rows', () => {
    const window = (day: string) => prisma.$transaction((tx) => readListingTrafficWindowFacts(tx, {
      organizationId: ORG, from: dateAt(day), to: dateAt(shiftBusinessDateKey(day, 1)),
    }));

    it('includes a date the newest run confirmed for every listing and drops a row an older run left', async () => {
      const day = closed();
      const run = await beginRun({ startDate: day, endDate: day });
      await collect(run, { [day]: [row(day, '1001', 10)] });
      await finish(run).expect(200);
      const facts = await window(day);
      expect(facts.coverage.includedDates).toEqual([day]);
      expect(facts.totals.views).toBe(10);
    });

    // KID-217 (b): 수집과 겹친 카탈로그 쓰기가 finish 뒤에 커밋해 그 날 Wing 행이 맞지 않았다.
    it('does not count a date as collected when a listing whose Wing row went unmatched is catalogued after the run', async () => {
      const day = closed();
      const run = await beginRun({ startDate: day, endDate: day });
      await collect(run, { [day]: [row(day, '1001', 10), row(day, '3001', 50)] });
      await finish(run).expect(200);
      expect((await window(day)).coverage.includedDates).toEqual([day]);
      await catalogListing('5003', ['3001'], { createdAt: new Date(Date.now() - 20 * 86_400_000) });
      const facts = await window(day);
      expect(facts.coverage.includedDates).toEqual([]);
      expect(facts.coverage.invalidDates).toEqual([day]);
    });

    // KID-217 (c): 매칭 때 비활성이던 리스팅이 다시 활성화됐다.
    it('does not count a date as collected when an inactive listing whose Wing row went unmatched becomes active again', async () => {
      const day = closed();
      const inactive = await catalogListing('5004', ['4001'], { isActive: false });
      const run = await beginRun({ startDate: day, endDate: day });
      await collect(run, { [day]: [row(day, '1001', 10), row(day, '4001', 50)] });
      await finish(run).expect(200);
      expect((await listingDays(inactive.id))).toEqual([]);
      await prisma.channelListing.update({ where: { id: inactive.id }, data: { isActive: true } });
      const facts = await window(day);
      expect(facts.coverage.includedDates).toEqual([]);
      expect(facts.coverage.invalidDates).toEqual([day]);
    });
  });
});
