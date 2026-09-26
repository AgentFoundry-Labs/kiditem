import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import {
  WING_ITEMWINNER_CHUNK_KIND,
  WING_ITEMWINNER_KIND,
  WING_ITEMWINNER_PAGE_CHUNK_KIND,
  type WingItemwinnerRow,
} from '@kiditem/shared/advertising-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { operationFailureAlerts } from '../../test-helpers/operation-failure-alerts';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { AdvertisingIngestController } from '../adapter/in/http/advertising-ingest.controller';
import { WingItemwinnerOperationOwner } from '../adapter/in/operation/wing-daily-operation-owners';
import { ChannelScrapeRepositoryAdapter } from '../adapter/out/repository/channel-scrape.repository.adapter';
import { WingItemwinnerOperationRepository } from '../adapter/out/repository/wing-itemwinner-operation.repository';
import { AdvertisingExtensionService } from '../application/service/advertising-extension.service';

// 확장 수집기(advertising.wing_itemwinner)가 밟는 길을 서버에서 그대로: begin → itemwinner_rows 청크 →
// itemwinner_page 표식 → finish. 원장 쓰기는 finish 트랜잭션 안에서만(ADR-0025, KID-362).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

function row(vendorItemId: string, values: Partial<WingItemwinnerRow> = {}): WingItemwinnerRow {
  return { vendorItemId, productName: 'Winner Toy', isWinner: true, myPrice: 12000, winnerPrice: 11500, salesQty: 3, suppressed: false, providerWinnerStatus: true, ...values };
}

describe('advertising.wing_itemwinner owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let listingId: string;
  let listingOptionId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const ports = channelFactTestPorts(prisma as never);
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController, AdvertisingIngestController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        {
          provide: WingItemwinnerOperationOwner,
          useValue: new WingItemwinnerOperationOwner(new WingItemwinnerOperationRepository(ports.accounts, ports.listings, prisma as never)),
        },
        {
          provide: AdvertisingExtensionService,
          inject: [OPERATION_PORT],
          useFactory: (operations: never) =>
            new AdvertisingExtensionService(new ChannelScrapeRepositoryAdapter(ports.accounts, ports.listings, prisma as never, operations)),
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
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
      data: { organizationId: ORG, channel: 'coupang', name: 'Primary Wing', isPrimary: true, vendorId: 'VENDOR-A' },
    });
    accountId = account.id;
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account.id, externalId: 'PRODUCT-A', displayName: 'Winner Toy', isActive: true },
    });
    listingId = listing.id;
    const option = await prisma.channelListingOption.create({
      data: { organizationId: ORG, listingId: listing.id, externalOptionId: '1001', isActive: true },
    });
    listingOptionId = option.id;
  });

  const begin = (scope: Record<string, unknown>) => request(httpUrl).post('/api/operations').send({ kind: WING_ITEMWINNER_KIND, scope });
  async function beginRun(channelAccountId = accountId): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin({ channelAccountId }).expect(201)).body);
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
  /** 확장 수집기의 순서: 행 청크(있으면) → 응답 표식. */
  async function collect(run: OperationBeginResponse, rows: WingItemwinnerRow[], observedAt = new Date().toISOString(), totalSize = rows.length, vendorId = 'VENDOR-A') {
    if (rows.length > 0) await put(run, WING_ITEMWINNER_CHUNK_KIND, 1, rows);
    await put(run, WING_ITEMWINNER_PAGE_CHUNK_KIND, 1, [{ totalSize, observedAt, vendorId }]);
  }
  const extensionStatus = () => request(httpUrl).get('/api/ads/extension/status').expect(200);

  it('plan locks the account and the Wing daily resource, freezes the KST business date and refuses a bad scope', async () => {
    const run = await beginRun();
    expect(run.operation.lockKeys).toEqual([`account:${accountId}`, `resource:wing-daily:${accountId}`]);
    expect(run.operation.plan).toEqual({ channelAccountId: accountId, vendorId: 'VENDOR-A', businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(run.operation.window).toEqual({ start: run.operation.plan?.businessDate, end: run.operation.plan?.businessDate });

    await begin({}).expect(400);
    await begin({ channelAccountId: accountId, targetUrl: 'https://wing.coupang.com/x' }).expect(400);
    const missing = await begin({ channelAccountId: randomUUID() }).expect(404);
    expect(missing.body.code).toBe('CHANNELS_ACCOUNT_NOT_FOUND');
    await finish(run, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: null } });
    expect((await begin({ channelAccountId: accountId }).expect(400)).body.details.reason).toBe('vendor_identity_missing');
  });

  it('refuses a list read under another Wing vendor (old VENDOR_IDENTITY_MISMATCH) and writes nothing', async () => {
    const run = await beginRun();
    await collect(run, [row('1001')], new Date().toISOString(), 1, 'VENDOR-B');
    const refused = await finish(run).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'vendor_identity_mismatch' } });
    await expect(prisma.channelListingDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('a second run on the same account is refused with OPERATION_IN_PROGRESS while the first holds the daily lock', async () => {
    const first = await beginRun();
    const refused = await begin({ channelAccountId: accountId }).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });

  it('finish publishes listing and option winner facts stamped with the operation, not a scrape snapshot', async () => {
    const run = await beginRun();
    const observedAt = new Date().toISOString();
    await collect(run, [row('1001'), row('9999', { isWinner: false, providerWinnerStatus: false })], observedAt);
    const finished = await finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      result: {
        channelAccountId: accountId,
        businessDate: run.operation.plan?.businessDate,
        observedAt,
        rowCount: 2,
        matchedCount: 1,
        unmatchedCount: 1,
        kpis: { winners: 1, suppressed: 0, losers: 1 },
        listingObservations: [{ listingId, isOfferWinner: true, lastObservedAt: observedAt }],
      },
    });

    const listingRows = await prisma.channelListingDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(listingRows).toHaveLength(1);
    expect(listingRows[0]).toMatchObject({
      listingId,
      externalId: 'PRODUCT-A',
      isOfferWinner: true,
      myPrice: 12000,
      winnerPrice: 11500,
      winnerGapPrice: -500,
      operationId: run.operation.id,
      rawSnapshotId: null,
      sampleCount: 1,
    });
    const optionRows = await prisma.channelListingOptionDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(optionRows).toHaveLength(1);
    expect(optionRows[0]).toMatchObject({ listingOptionId, externalOptionId: '1001', isOfferWinner: true, operationId: run.operation.id, rawSnapshotId: null });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.channelScrapeSnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('a later run the same day updates the one listing-day row in place and restamps it', async () => {
    const first = await beginRun();
    await collect(first, [row('1001')]);
    await finish(first).expect(200);
    const second = await beginRun();
    await collect(second, [row('1001', { isWinner: false, providerWinnerStatus: false, myPrice: 13000 })]);
    await finish(second).expect(200);

    const rows = await prisma.channelListingDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isOfferWinner: false, myPrice: 13000, sampleCount: 2, operationId: second.operation.id });
    const options = await prisma.channelListingOptionDailySnapshot.findMany({ where: { organizationId: ORG } });
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ isOfferWinner: false, sampleCount: 2, operationId: second.operation.id });
  });

  it('an incomplete capture is refused inside finalize and a failed run writes nothing', async () => {
    const run = await beginRun();
    await collect(run, [row('1001')], new Date().toISOString(), 2);
    const refused = await finish(run).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'itemwinner_incomplete' } });
    const failed = await finish(run, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    await expect(prisma.channelListingDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.channelListingOptionDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('refuses a capture when the account stopped being an active Coupang account during the run', async () => {
    const run = await beginRun();
    await collect(run, [row('1001')]);
    await prisma.channelAccount.update({ where: { id: accountId }, data: { status: 'inactive' } });
    const refused = await finish(run).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'account_changed' } });
    await expect(prisma.channelListingDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('a final failure stays on the operation row (no alert row) and the alert reader shows it per account until the next success resolves it — a cancel changes nothing', async () => {
    const failed = await beginRun();
    await finish(failed, { outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '쿠팡 윙 로그인이 필요합니다.' }).expect(200);
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({
      rows: 0,
      items: [{
        type: 'operation_failure',
        status: 'OPEN',
        sourceType: WING_ITEMWINNER_KIND,
        attemptId: failed.operation.id,
        href: '/ad-ops',
        message: '사이트에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도해 주세요.',
      }],
    });

    const cancelled = await beginRun();
    await request(httpUrl).post(`/api/operations/${cancelled.operation.id}/cancel`).expect(200);
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({ rows: 0, items: [{ status: 'OPEN', attemptId: failed.operation.id }] });

    const succeeded = await beginRun();
    await collect(succeeded, [row('1001')]);
    await finish(succeeded).expect(200);
    await expect(operationFailureAlerts(prisma, ORG)).resolves.toMatchObject({ rows: 0, items: [{ status: 'RESOLVED', attemptId: failed.operation.id }] });
  });

  it('extension status reads the newest succeeded run, keeps a confirmed-empty publication after a later failure, and stays in its organization', async () => {
    const idle = await extensionStatus();
    expect(idle.body).toMatchObject({ listingCount: 1, currentWinnerObservedListings: 0, rawSnapshotCount: 0, latestScrapeAt: null, wing: { kpis: {}, lastSync: null } });

    const first = await beginRun();
    const firstAt = new Date().toISOString();
    await collect(first, [row('1001'), row('1002', { suppressed: true, isWinner: false })], firstAt);
    await finish(first).expect(200);
    const afterFirst = await extensionStatus();
    expect(afterFirst.body).toMatchObject({
      listingCount: 1,
      currentWinnerCount: 1,
      currentWinnerObservedListings: 1,
      rawSnapshotCount: 2,
      latestScrapePageType: 'itemwinner',
      wing: { kpis: { '아이템위너 상품': '1', '노출제한 상품': '1', '아이템위너 아닌 상품': '0' }, lastSync: firstAt },
    });

    const empty = await beginRun();
    const emptyAt = new Date().toISOString();
    await collect(empty, [], emptyAt);
    await finish(empty).expect(200);
    const failed = await beginRun();
    await finish(failed, { outcome: 'failed', errorCode: 'SITE_REQUEST_FAILED' }).expect(200);

    const afterFailure = await extensionStatus();
    expect(afterFailure.body).toMatchObject({
      currentWinnerCount: 0,
      currentNonWinnerCount: 0,
      currentUnknownWinnerCount: 0,
      currentWinnerObservedListings: 0,
      rawSnapshotCount: 0,
      wing: { kpis: { '아이템위너 상품': '0' }, lastSync: emptyAt },
    });

    const other = await request(httpUrl).get('/api/ads/extension/status').set('x-test-org', OTHER_ORGANIZATION_ID).expect(200);
    expect(other.body).toMatchObject({ currentWinnerObservedListings: 0, wing: { lastSync: null } });
  });
});
