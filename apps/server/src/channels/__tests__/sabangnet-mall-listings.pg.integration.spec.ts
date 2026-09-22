import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type {
  SabangnetMallListingRow,
  SabangnetMallListingsSubmission,
} from '@kiditem/shared/sabangnet-mall-listings';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { configureAgentRuntimeBodyParsers } from '../../common/http/agent-runtime-body-parser';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SabangnetMallListingsController } from '../adapter/in/web/sabangnet-mall-listings.controller';
import { SabangnetMallListingsRepositoryAdapter } from '../adapter/out/repository/sabangnet-mall-listings.repository.adapter';
import { SABANGNET_MALL_LISTINGS_PORT } from '../application/port/in/sabangnet-mall-listings.port';
import { SabangnetMallListingsService } from '../application/service/collection/sabangnet-mall-listings.service';
import { completedCatalogRunWhere } from '../read/completed-catalog-run';

const KIDSNOTE = '11111111-1111-4111-8111-111111111111';
const KIDSNOTE_LATER = '11111111-1111-4111-8111-111111111112';
const ELEVENST = '22222222-2222-4222-8222-222222222222';
const COUPANG = '33333333-3333-4333-8333-333333333333';
const base = '/api/channels/sabangnet-listings';

type Attempt = { attemptId: string; attemptToken: string; plan: { dateTo: string } };

function row(overrides: Partial<SabangnetMallListingRow> = {}): SabangnetMallListingRow {
  return {
    sendSerial: '5010000001',
    sabangnetShopId: 'shop0472',
    mallProductCode: 'KN-1',
    sabangnetProductNo: '103177',
    modelName: '10162-1',
    ownProductCode: '8806381806625',
    productName: '할로윈 아트 네일팁',
    salePrice: 1950,
    supplyStatus: '공급중',
    firstSentAt: '20260914 13:47',
    ...overrides,
  };
}

function submission(
  attempt: Attempt,
  rows: SabangnetMallListingRow[],
  overrides: Partial<SabangnetMallListingsSubmission['collection']> = {},
  skippedByShop: Record<string, number> = {},
): SabangnetMallListingsSubmission {
  const skipped = Object.values(skippedByShop).reduce((sum, count) => sum + count, 0);
  const total = rows.length + skipped;
  return {
    collection: {
      collectionRunId: attempt.attemptId,
      totalRecords: total,
      recordsRead: total,
      pagesRead: 1,
      totalPages: 1,
      truncated: false,
      skippedByShop,
      missingMallCode: 0,
      ...overrides,
    },
    rows,
    proof: {
      dateFrom: '20000101',
      dateTo: attempt.plan.dateTo,
      pageSize: 500,
      validatedList: true,
    },
  };
}

describe('Sabangnet mall listings owner — public HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let httpUrl: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const repository = new SabangnetMallListingsRepositoryAdapter(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const module = await Test.createTestingModule({
      controllers: [SabangnetMallListingsController],
      providers: [
        {
          provide: SABANGNET_MALL_LISTINGS_PORT,
          useValue: new SabangnetMallListingsService(repository),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
    configureAgentRuntimeBodyParsers(app);
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers['x-test-org']) {
          req.authUser = { id: USER, organizationId: req.headers['x-test-org'] };
        }
        next();
      },
    );
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
    await prisma.channelAccount.createMany({
      data: [
        {
          id: KIDSNOTE,
          organizationId: ORG,
          channel: 'kidsnote',
          externalAccountId: 'kidsnote',
          name: '키즈노트',
          status: 'configured',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: ELEVENST,
          organizationId: ORG,
          channel: '11st',
          externalAccountId: '11st',
          name: '11번가',
          status: 'paused',
        },
        {
          id: COUPANG,
          organizationId: ORG,
          channel: 'coupang',
          name: 'Coupang Wing',
          status: 'active',
          vendorId: 'V1',
        },
      ],
    });
  });

  const start = (key = randomUUID(), org = ORG) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set('x-test-org', org)
      .set('Idempotency-Key', key)
      .send({});
  const readSource = (org = ORG) =>
    request(httpUrl).get(`${base}/source`).set('x-test-org', org).expect(200);
  const finish = (attempt: Attempt, body: SabangnetMallListingsSubmission, token = attempt.attemptToken) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', token)
      .send(body);
  async function begin(): Promise<Attempt> {
    return (await start().expect(201)).body;
  }
  async function complete(rows: SabangnetMallListingRow[], skippedByShop: Record<string, number> = {}) {
    const attempt = await begin();
    return { attempt, response: await finish(attempt, submission(attempt, rows, {}, skippedByShop)) };
  }

  it('freezes the mall account rows it will write, replays a begin, and refuses a second run', async () => {
    const key = randomUUID();
    const first = await start(key).expect(201);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        sourceType: 'sabangnet_mall_listings',
        dateFrom: '20000101',
        // 쿠팡 행은 받지 않고, 계정 행이 없는 몰도 계획에 없다. 상태(configured · paused)는 가리지 않는다.
        malls: [
          { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, sabangnetShopIds: ['shop0472'] },
          { mallKey: '11st', channelAccountId: ELEVENST, sabangnetShopIds: ['shop0464', 'shop0003'] },
        ],
      },
    });
    expect((await start(key).expect(201)).body).toEqual(first.body);
    const second = await start().expect(409);
    expect(second.body).toMatchObject({ code: 'ATTEMPT_IN_PROGRESS', attemptId: first.body.attemptId });

    const source = (await readSource()).body;
    expect(source).toMatchObject({
      ready: true,
      latestAttempt: { attemptId: first.body.attemptId, state: 'RUNNING' },
      latestComplete: null,
      latestPublication: [],
    });
    expect(source.latestAttempt).not.toHaveProperty('attemptToken');
    expect(source.malls).toContainEqual({
      mallKey: 'ssg',
      channelAccountId: null,
      sabangnetShopIds: ['shop0100'],
    });
  });

  it('refuses to begin when no mall has an account row, and hides attempts across organizations', async () => {
    await start(randomUUID(), OTHER_ORG).expect(404);
    const mine = await begin();
    await request(httpUrl)
      .get(`${base}/attempts/${mine.attemptId}`)
      .set('x-test-org', OTHER_ORG)
      .expect(404);
  });

  it('publishes one listing per mall product code under the mall row, with the Sabangnet model as seller SKU', async () => {
    const { attempt, response } = await complete(
      [
        row(),
        row({
          sendSerial: '5010000002',
          sabangnetShopId: 'shop0464',
          mallProductCode: '8123',
          supplyStatus: '일시중지',
          firstSentAt: '20260101 09:00',
        }),
        // 11번가(구)에 같은 몰 상품코드로 먼저 보낸 기록 — 최근 기록이 남는다.
        row({
          sendSerial: '5010000003',
          sabangnetShopId: 'shop0003',
          mallProductCode: '8123',
          supplyStatus: '공급중',
          firstSentAt: '20210306 10:00',
        }),
        row({
          sendSerial: '5010000004',
          sabangnetShopId: 'shop0464',
          mallProductCode: '8124',
          ownProductCode: '8806384825817XE2001',
          modelName: null,
        }),
      ],
      { shop0075: 2 },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'COMPLETE', attemptId: attempt.attemptId });

    const listings = await prisma.channelListing.findMany({
      where: { organizationId: ORG },
      orderBy: { externalId: 'asc' },
      select: {
        channelAccountId: true,
        externalId: true,
        status: true,
        isActive: true,
        rawJson: true,
        options: {
          select: {
            externalOptionId: true,
            sellerSku: true,
            barcode: true,
            salePrice: true,
            status: true,
            rawJson: true,
          },
        },
      },
    });
    expect(listings.map((listing) => [listing.channelAccountId, listing.externalId, listing.status]))
      .toEqual([
        [ELEVENST, '8123', '사방넷 일시중지'],
        [ELEVENST, '8124', '사방넷 공급중'],
        [KIDSNOTE, 'KN-1', '사방넷 공급중'],
      ]);
    expect(listings[2]!.options).toEqual([
      expect.objectContaining({
        externalOptionId: 'KN-1',
        sellerSku: '10162-1',
        barcode: '8806381806625',
        salePrice: 1950,
        status: '사방넷 공급중',
        rawJson: expect.objectContaining({ source: 'sabangnet_mall_listings', sendSerial: '5010000001' }),
      }),
    ]);
    expect(listings[2]!.rawJson).toMatchObject({ source: 'sabangnet_mall_listings' });
    // 바코드 뒤에 글자가 붙은 자체코드는 바코드로 쓰지 않는다.
    expect(listings[1]!.options[0]).toMatchObject({ sellerSku: null, barcode: null });

    const source = (await readSource()).body;
    expect(source.latestComplete).toMatchObject({ attemptId: attempt.attemptId, state: 'COMPLETE' });
    expect(source.latestPublication).toEqual(expect.arrayContaining([
      { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 1, deactivated: 0 },
      { mallKey: '11st', channelAccountId: ELEVENST, listings: 2, deactivated: 0 },
    ]));

    // 매칭 가용성 규칙이 이 원천의 완료를 카탈로그로 본다.
    await expect(prisma.sourceImportRun.count({
      where: completedCatalogRunWhere(ORG),
    })).resolves.toBe(1);
  });

  it('turns off only its own listings that left the list, and keeps other listings on the same row', async () => {
    await complete([row(), row({ sendSerial: '5010000002', mallProductCode: 'KN-2' })]);
    const foreign = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: KIDSNOTE,
        externalId: 'KIDITEM-REGISTERED',
        status: 'active',
        rawJson: { source: 'kiditem_registration' },
      },
    });

    const { response } = await complete([row()]);
    expect(response.status).toBe(200);
    const byId = new Map(
      (await prisma.channelListing.findMany({
        where: { organizationId: ORG, channelAccountId: KIDSNOTE },
        select: { externalId: true, isActive: true, options: { select: { isActive: true } } },
      })).map((listing) => [listing.externalId, listing]),
    );
    expect(byId.get('KN-1')).toMatchObject({ isActive: true, options: [{ isActive: true }] });
    expect(byId.get('KN-2')).toMatchObject({ isActive: false, options: [{ isActive: false }] });
    expect(byId.get(foreign.externalId)).toMatchObject({ isActive: true });
    expect((await readSource()).body.latestPublication).toEqual(expect.arrayContaining([
      { mallKey: 'kidsnote', channelAccountId: KIDSNOTE, listings: 1, deactivated: 1 },
    ]));
  });

  it('replays the same completion, and rejects a different body after the attempt ended', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()]);
    const first = await finish(attempt, body).expect(200);
    expect((await finish(attempt, body).expect(200)).body).toEqual(first.body);
    await finish(attempt, submission(attempt, [row({ salePrice: 2000 })])).expect(409);
  });

  it('fails an attempt whose list was not read to the end, and publishes nothing', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()], { totalRecords: 2, totalPages: 1, recordsRead: 1 });
    const response = await finish(attempt, body).expect(200);
    expect(response.body).toMatchObject({
      state: 'FAILED',
      errorCode: 'SABANGNET_COLLECTION_INCOMPLETE',
    });
    await expect(prisma.channelListing.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.alert.count({
      where: { organizationId: ORG, dedupeKey: `channels:sabangnet-mall-listings:${ORG}` },
    })).resolves.toBe(1);
  });

  it('refuses a row for a shop outside the plan', async () => {
    const attempt = await begin();
    const response = await finish(attempt, submission(attempt, [row({ sabangnetShopId: 'shop0100' })]))
      .expect(200);
    expect(response.body).toMatchObject({ state: 'FAILED', errorCode: 'SABANGNET_COLLECTION_INCOMPLETE' });
  });

  it('writes to the row the hub picks when a mall has two rows', async () => {
    await prisma.channelAccount.create({
      data: {
        id: KIDSNOTE_LATER,
        organizationId: ORG,
        channel: 'kidsnote',
        externalAccountId: 'kidsnote-2',
        name: '키즈노트 2',
        status: 'configured',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    await complete([row()]);
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, externalId: 'KN-1' },
    })).resolves.toMatchObject({ channelAccountId: KIDSNOTE });
  });

  it('rejects a stale token and lets the operator stop a running attempt without one', async () => {
    const attempt = await begin();
    await finish(attempt, submission(attempt, [row()]), randomUUID()).expect(409);
    const stopped = await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/cancel`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(stopped.body).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });
    await start().expect(201);
  });
});
