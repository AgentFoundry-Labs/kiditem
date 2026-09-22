import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type {
  MallAdminListingMallKey,
  MallAdminListingRow,
  MallAdminListingsSubmission,
} from '@kiditem/shared/mall-admin-listings';
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
import { MallAdminListingsController } from '../adapter/in/web/mall-admin-listings.controller';
import { MallAdminListingsRepositoryAdapter } from '../adapter/out/repository/mall-admin-listings.repository.adapter';
import { MALL_ADMIN_LISTINGS_PORT } from '../application/port/in/mall-admin-listings.port';
import { MallAdminListingsService } from '../application/service/collection/mall-admin-listings.service';
import { completedCatalogRunWhere } from '../adapter/out/repository/completed-catalog-run';

const KIDKIDS = '11111111-1111-4111-8111-111111111111';
const KIDKIDS_LATER = '11111111-1111-4111-8111-111111111112';
const ICECREAM = '22222222-2222-4222-8222-222222222222';
const base = '/api/channels/mall-admin-listings';

type Attempt = {
  attemptId: string;
  attemptToken: string;
  plan: { mallKey: MallAdminListingMallKey; pageSize: number };
};

function row(overrides: Partial<MallAdminListingRow> = {}): MallAdminListingRow {
  return {
    mallProductCode: '1098464',
    productName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
    sellpiaName: '3000왁스팝 말랑이',
    sellerCode: null,
    salePrice: 1900,
    statusWords: ['정상'],
    registeredOn: null,
    ...overrides,
  };
}

function submission(
  attempt: Attempt,
  rows: MallAdminListingRow[],
  overrides: Partial<MallAdminListingsSubmission['collection']> = {},
): MallAdminListingsSubmission {
  const detailed = attempt.plan.mallKey === 'icecream-mall';
  return {
    collection: {
      collectionRunId: attempt.attemptId,
      totalRecords: rows.length,
      recordsRead: rows.length,
      pagesRead: 1,
      totalPages: 1,
      detailsRead: detailed ? rows.filter((item) => item.sellpiaName !== null).length : 0,
      detailsMissing: detailed ? rows.filter((item) => item.sellpiaName === null).length : 0,
      ...overrides,
    },
    rows,
    proof: {
      mallKey: attempt.plan.mallKey,
      pageSize: attempt.plan.pageSize,
      validatedList: true,
    },
  };
}

describe('Mall admin listings owner — public HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  let app: NestExpressApplication;
  let httpUrl: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const repository = new MallAdminListingsRepositoryAdapter(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const module = await Test.createTestingModule({
      controllers: [MallAdminListingsController],
      providers: [
        {
          provide: MALL_ADMIN_LISTINGS_PORT,
          useValue: new MallAdminListingsService(repository),
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
          id: KIDKIDS,
          organizationId: ORG,
          channel: 'kidkids',
          externalAccountId: 'kidkids',
          name: '키드키즈',
          status: 'configured',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: ICECREAM,
          organizationId: ORG,
          channel: 'icecream-mall',
          externalAccountId: 'icecream-mall',
          name: '아이스크림몰',
          status: 'paused',
        },
      ],
    });
  });

  const start = (mallKey: string, key = randomUUID(), org = ORG) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set('x-test-org', org)
      .set('Idempotency-Key', key)
      .send({ mallKey });
  const readSource = (org = ORG) =>
    request(httpUrl).get(`${base}/source`).set('x-test-org', org).expect(200);
  const finish = (attempt: Attempt, body: MallAdminListingsSubmission, token = attempt.attemptToken) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', token)
      .send(body);
  async function begin(mallKey: MallAdminListingMallKey = 'kidkids'): Promise<Attempt> {
    return (await start(mallKey).expect(201)).body;
  }
  async function complete(rows: MallAdminListingRow[], mallKey: MallAdminListingMallKey = 'kidkids') {
    const attempt = await begin(mallKey);
    return { attempt, response: await finish(attempt, submission(attempt, rows)) };
  }

  it('freezes the mall row it will write, replays a begin, and runs one import per mall at a time', async () => {
    const key = randomUUID();
    const first = await start('kidkids', key).expect(201);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        sourceType: 'mall_admin_listings',
        mallKey: 'kidkids',
        channelAccountId: KIDKIDS,
        sourceOrigin: 'https://partner.kidkids.net',
        pageSize: 20000,
      },
    });
    expect((await start('kidkids', key).expect(201)).body).toEqual(first.body);
    const second = await start('kidkids').expect(409);
    expect(second.body).toMatchObject({ code: 'ATTEMPT_IN_PROGRESS', attemptId: first.body.attemptId });
    // 다른 몰은 따로 돈다 — 한 몰의 로그인 실패가 다른 몰을 막지 않는다. 상태(paused)는 가리지 않는다.
    const icecream = await start('icecream-mall').expect(201);
    expect(icecream.body.plan).toMatchObject({
      mallKey: 'icecream-mall',
      channelAccountId: ICECREAM,
      sourceOrigin: 'https://po.i-screammall.co.kr',
      pageSize: 10000,
    });

    const source = (await readSource()).body;
    expect(source.malls).toEqual([
      {
        mallKey: 'kidkids',
        mallName: '키드키즈',
        channelAccountId: KIDKIDS,
        latestAttempt: expect.objectContaining({ attemptId: first.body.attemptId, state: 'RUNNING' }),
        latestComplete: null,
        latestPublication: null,
      },
      expect.objectContaining({
        mallKey: 'icecream-mall',
        latestAttempt: expect.objectContaining({ attemptId: icecream.body.attemptId }),
      }),
    ]);
    expect(source.malls[0].latestAttempt).not.toHaveProperty('attemptToken');
  });

  it('refuses a mall without an account row or a reader, and hides attempts across organizations', async () => {
    await start('kidkids', randomUUID(), OTHER_ORG).expect(404);
    await start('boribori').expect(400);
    const otherSource = (await readSource(OTHER_ORG)).body;
    expect(otherSource.malls.map((mall: { channelAccountId: string | null }) => mall.channelAccountId))
      .toEqual([null, null]);
    const mine = await begin();
    await request(httpUrl)
      .get(`${base}/attempts/${mine.attemptId}`)
      .set('x-test-org', OTHER_ORG)
      .expect(404);
  });

  it('publishes one listing per mall product code with the Sellpia name as the option name', async () => {
    const { attempt, response } = await complete([
      row(),
      row({
        mallProductCode: '176227',
        productName: '[키드아이템] 스크림 가면 [12개] 할로윈가면',
        sellpiaName: '스크림가면',
        salePrice: 7260,
        statusWords: ['일시품절'],
      }),
      row({
        mallProductCode: '1038722',
        productName: '5000방울(킬라)_16mm',
        sellpiaName: '5000방울(킬라)',
        statusWords: ['보류'],
      }),
    ]);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'COMPLETE', attemptId: attempt.attemptId });

    const listings = await prisma.channelListing.findMany({
      where: { organizationId: ORG },
      orderBy: { externalId: 'asc' },
      select: {
        channelAccountId: true,
        externalId: true,
        channelName: true,
        status: true,
        rawJson: true,
        options: {
          select: {
            externalOptionId: true,
            itemName: true,
            sellerSku: true,
            salePrice: true,
            status: true,
            rawJson: true,
          },
        },
      },
    });
    expect(listings.map((listing) => [listing.channelAccountId, listing.externalId, listing.status]))
      .toEqual([
        [KIDKIDS, '1038722', '보류'],
        [KIDKIDS, '1098464', '판매중'],
        [KIDKIDS, '176227', '품절'],
      ]);
    expect(listings[1]).toMatchObject({
      channelName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
      rawJson: { source: 'mall_admin_listings', mallKey: 'kidkids', statusWords: ['정상'] },
      options: [{
        externalOptionId: '1098464',
        itemName: '3000왁스팝 말랑이',
        sellerSku: null,
        salePrice: 1900,
        status: '판매중',
        rawJson: expect.objectContaining({ source: 'mall_admin_listings', sellpiaName: '3000왁스팝 말랑이' }),
      }],
    });

    const kidkids = (await readSource()).body.malls[0];
    expect(kidkids.latestComplete).toMatchObject({ attemptId: attempt.attemptId, state: 'COMPLETE' });
    expect(kidkids.latestPublication).toEqual({
      listings: 3,
      deactivated: 0,
      missingNames: 0,
      codedListings: 0,
      statuses: { 판매중: 1, 품절: 1, 보류: 1 },
    });
    // 매칭 가용성 규칙이 이 원천의 완료를 카탈로그로 본다.
    await expect(prisma.sourceImportRun.count({
      where: completedCatalogRunWhere(ORG, KIDKIDS),
    })).resolves.toBe(1);
  });

  it('keeps a product whose detail name could not be read, and counts it', async () => {
    const { response } = await complete([
      row({
        mallProductCode: '11218365',
        productName: '피규어 슈팅 낙하산 1p 낙하산 놀이 야외놀이',
        sellpiaName: '3000피규어슈팅낙하산',
        statusWords: ['판매중', '전시'],
      }),
      row({
        mallProductCode: '889504',
        productName: '@품절-미노출처리 /kiditem  LCD전자메모보드(6.5인치)',
        sellpiaName: null,
        statusWords: ['판매종료', '전시안함'],
      }),
    ], 'icecream-mall');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ state: 'COMPLETE' });
    const icecream = (await readSource()).body.malls[1];
    expect(icecream.latestPublication).toEqual({
      listings: 2,
      deactivated: 0,
      missingNames: 1,
      codedListings: 0,
      statuses: { 판매중: 1, 판매종료: 1 },
    });
    await expect(prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: ORG, externalOptionId: '889504' },
      select: { itemName: true, status: true },
    })).resolves.toEqual({ itemName: null, status: '판매종료' });
  });

  it('turns off only its own listings that left the list — not a Sabangnet or KidItem listing on the row', async () => {
    await complete([row(), row({ mallProductCode: '176227' })]);
    await prisma.channelListing.createMany({
      data: [
        {
          organizationId: ORG,
          channelAccountId: KIDKIDS,
          externalId: 'KIDITEM-REGISTERED',
          status: 'active',
          rawJson: { source: 'kiditem_registration' },
        },
        {
          organizationId: ORG,
          channelAccountId: KIDKIDS,
          externalId: 'SABANGNET-SENT',
          status: '사방넷 공급중',
          rawJson: { source: 'sabangnet_mall_listings' },
        },
      ],
    });

    const { response } = await complete([row()]);
    expect(response.status).toBe(200);
    const byId = new Map(
      (await prisma.channelListing.findMany({
        where: { organizationId: ORG, channelAccountId: KIDKIDS },
        select: { externalId: true, isActive: true, options: { select: { isActive: true } } },
      })).map((listing) => [listing.externalId, listing]),
    );
    expect(byId.get('1098464')).toMatchObject({ isActive: true, options: [{ isActive: true }] });
    expect(byId.get('176227')).toMatchObject({ isActive: false, options: [{ isActive: false }] });
    expect(byId.get('KIDITEM-REGISTERED')).toMatchObject({ isActive: true });
    expect(byId.get('SABANGNET-SENT')).toMatchObject({ isActive: true });
    expect((await readSource()).body.malls[0].latestPublication).toMatchObject({
      listings: 1,
      deactivated: 1,
    });
  });

  it('replays the same completion, and rejects a different body after the attempt ended', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()]);
    const first = await finish(attempt, body).expect(200);
    expect((await finish(attempt, body).expect(200)).body).toEqual(first.body);
    await finish(attempt, submission(attempt, [row({ salePrice: 2000 })])).expect(409);
  });

  it('fails an attempt whose list was not read to the end, publishes nothing, and alerts for that mall', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()], { totalRecords: 41, recordsRead: 1 });
    const response = await finish(attempt, body).expect(200);
    expect(response.body).toMatchObject({ state: 'FAILED', errorCode: 'MALL_COLLECTION_INCOMPLETE' });
    await expect(prisma.channelListing.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.alert.findFirstOrThrow({
      where: { organizationId: ORG, dedupeKey: `channels:mall-admin-listings:${ORG}:${KIDKIDS}` },
      select: { title: true, sourceType: true },
    })).resolves.toEqual({ title: '키드키즈 등록 상품 가져오기 실패', sourceType: 'mall_admin_listings' });

    // 그 몰이 다시 가져오면 알림이 닫힌다.
    await complete([row()]);
    await expect(prisma.alert.findFirstOrThrow({
      where: { organizationId: ORG, dedupeKey: `channels:mall-admin-listings:${ORG}:${KIDKIDS}` },
      select: { status: true },
    })).resolves.toEqual({ status: 'RESOLVED' });
  });

  it('fails a mall that names from details when a product was never opened', async () => {
    const attempt = await begin('icecream-mall');
    const body = submission(attempt, [row({ statusWords: ['판매중', '전시'] })], {
      detailsRead: 0,
      detailsMissing: 0,
    });
    const response = await finish(attempt, body).expect(200);
    expect(response.body).toMatchObject({ state: 'FAILED', errorCode: 'MALL_COLLECTION_INCOMPLETE' });
  });

  it('refuses a submission that names another mall as a lost plan fence', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()]);
    await finish(attempt, { ...body, proof: { ...body.proof, mallKey: 'icecream-mall' } }).expect(409);
  });

  it('writes to the row the hub picks when a mall has two rows', async () => {
    await prisma.channelAccount.create({
      data: {
        id: KIDKIDS_LATER,
        organizationId: ORG,
        channel: 'kidkids',
        externalAccountId: 'kidkids-2',
        name: '키드키즈 2',
        status: 'configured',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    await complete([row()]);
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, externalId: '1098464' },
    })).resolves.toMatchObject({ channelAccountId: KIDKIDS });
  });

  it('rejects a stale token and lets the operator stop a running attempt without one', async () => {
    const attempt = await begin();
    await finish(attempt, submission(attempt, [row()]), randomUUID()).expect(409);
    const stopped = await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/cancel`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(stopped.body).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });
    await start('kidkids').expect(201);
  });
});
