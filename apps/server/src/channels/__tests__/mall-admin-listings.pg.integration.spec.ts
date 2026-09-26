import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  MALL_ADMIN_LISTING_MALL_KEYS,
  MALL_ADMIN_LISTING_READERS,
  type MallAdminListingMallKey,
  type MallAdminListingRow,
  type MallAdminListingsSubmission,
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
import { makeChannelsOperations } from '../../test-helpers/channels-operations';
import { completedCatalogRunWhere } from '../adapter/out/repository/completed-catalog-run';
import { ChannelsProductMappingGenerationAdapter } from "../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { ChannelBusinessExceptionFilter } from '../adapter/in/web/channel-business-exception.filter';

// 옛 시도 경로에 남은 몰(온채널 · 꼬망세). 1차 몰 넷은 실행 kind다 — mall-admin-listings-operation.pg(KID-363).
const ONCH = '11111111-1111-4111-8111-111111111111';
const ONCH_LATER = '11111111-1111-4111-8111-111111111112';
const KKOMANGSE = '22222222-2222-4222-8222-222222222222';
const KIDKIDS = '44444444-4444-4444-8444-444444444444';
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
    statusWords: ['판매중'],
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
    new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    );
    const module = await Test.createTestingModule({
      controllers: [MallAdminListingsController],
      providers: [
        {
          provide: MALL_ADMIN_LISTINGS_PORT,
          useValue: new MallAdminListingsService(repository, repository, makeChannelsOperations(prisma).operations),
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
    app.useGlobalFilters(new GlobalExceptionFilter(), new ChannelBusinessExceptionFilter());
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
          id: ONCH,
          organizationId: ORG,
          channel: 'onch',
          externalAccountId: 'onch',
          name: '온채널',
          status: 'configured',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: KKOMANGSE,
          organizationId: ORG,
          channel: 'kkomangse',
          externalAccountId: 'kkomangse',
          name: '꼬망세',
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
  async function begin(mallKey: MallAdminListingMallKey = 'onch'): Promise<Attempt> {
    return (await start(mallKey).expect(201)).body;
  }
  async function complete(rows: MallAdminListingRow[], mallKey: MallAdminListingMallKey = 'onch') {
    const attempt = await begin(mallKey);
    return { attempt, response: await finish(attempt, submission(attempt, rows)) };
  }

  async function publicationOf(attemptId: string) {
    const run = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attemptId }, select: { qualityReport: true } });
    return (run.qualityReport as { publication?: unknown } | null)?.publication;
  }
  function latestOnchRun() {
    return prisma.sourceImportRun.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId: ONCH, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
  }

  it('freezes the mall row it will write, replays a begin, and runs one import per mall at a time', async () => {
    const key = randomUUID();
    const first = await start('onch', key).expect(201);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        sourceType: 'mall_admin_listings',
        mallKey: 'onch',
        channelAccountId: ONCH,
        sourceOrigin: 'https://www.onch3.co.kr',
        pageSize: 15,
      },
    });
    expect((await start('onch', key).expect(201)).body).toEqual(first.body);
    const second = await start('onch').expect(409);
    expect(second.body).toMatchObject({ code: 'ATTEMPT_IN_PROGRESS', attemptId: first.body.attemptId });
    // 다른 몰은 따로 돈다 — 한 몰의 로그인 실패가 다른 몰을 막지 않는다. 상태(paused)는 가리지 않는다.
    const kkomangse = await start('kkomangse').expect(201);
    expect(kkomangse.body.plan).toMatchObject({
      mallKey: 'kkomangse',
      channelAccountId: KKOMANGSE,
      sourceOrigin: 'https://nstore.edupre.co.kr',
      pageSize: 10000,
    });

    const source = (await readSource()).body;
    // 읽기기가 있는 몰은 모두 목록에 선다. 계정 행이 없는 몰은 channelAccountId null 로 선다.
    expect(source.malls).toEqual(
      MALL_ADMIN_LISTING_MALL_KEYS.map((mallKey) => {
        if (mallKey === 'onch') {
          return {
            mallKey: 'onch',
            mallName: '온채널',
            channelAccountId: ONCH,
            latestAttempt: expect.objectContaining({ attemptId: first.body.attemptId, state: 'RUNNING' }),
            latestComplete: null,
            latestPublication: null,
            latestOperation: null,
            latestSucceeded: null,
          };
        }
        if (mallKey === 'kkomangse') {
          return expect.objectContaining({
            mallKey: 'kkomangse',
            latestAttempt: expect.objectContaining({ attemptId: kkomangse.body.attemptId }),
          });
        }
        return {
          mallKey,
          mallName: MALL_ADMIN_LISTING_READERS[mallKey].mallName,
          channelAccountId: null,
          latestAttempt: null,
          latestComplete: null,
          latestPublication: null,
          latestOperation: null,
          latestSucceeded: null,
        };
      }),
    );
    expect(source.malls.find((mall: { mallKey: string }) => mall.mallKey === 'onch').latestAttempt).not.toHaveProperty('attemptToken');
  });

  it('refuses the four malls moved to the channels.mall_admin_listings operation (KID-363)', async () => {
    await prisma.channelAccount.create({
      data: { id: KIDKIDS, organizationId: ORG, channel: 'kidkids', externalAccountId: 'kidkids', name: '키드키즈', status: 'configured' },
    });
    for (const mallKey of ['kidkids', 'icecream-mall', 'art09', 'domeggook']) {
      const refused = await start(mallKey).expect(400);
      expect(refused.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        // 봉투는 등록된 details 키만 싣는다 — mallKey 는 로그 줄에 남는다.
        details: { reason: 'mall_admin_operation_mall_moved' },
      });
    }
    await expect(prisma.sourceImportRun.count()).resolves.toBe(0);
  });

  it('refuses a mall without an account row or a reader, and hides attempts across organizations', async () => {
    await start('onch', randomUUID(), OTHER_ORG).expect(404);
    await start('boribori').expect(400);
    const otherSource = (await readSource(OTHER_ORG)).body;
    expect(otherSource.malls.map((mall: { channelAccountId: string | null }) => mall.channelAccountId))
      .toEqual(MALL_ADMIN_LISTING_MALL_KEYS.map(() => null));
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
        statusWords: ['단종'],
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
        [ONCH, '1038722', '판매종료'],
        [ONCH, '1098464', '판매중'],
        [ONCH, '176227', '품절'],
      ]);
    expect(listings[1]).toMatchObject({
      channelName: '[키드아이템] 왁스팝 말랑이 1p 왁뿌',
      rawJson: { source: 'mall_admin_listings', mallKey: 'onch', statusWords: ['판매중'] },
      options: [{
        externalOptionId: '1098464',
        itemName: '3000왁스팝 말랑이',
        sellerSku: null,
        salePrice: 1900,
        status: '판매중',
        rawJson: expect.objectContaining({ source: 'mall_admin_listings', sellpiaName: '3000왁스팝 말랑이' }),
      }],
    });

    const onch = (await readSource()).body.malls.find((mall: { mallKey: string }) => mall.mallKey === 'onch');
    expect(onch.latestComplete).toMatchObject({ attemptId: attempt.attemptId, state: 'COMPLETE' });
    expect(onch.latestPublication).toEqual({
      listings: 3,
      deactivated: 0,
      missingNames: 0,
      codedListings: 0,
      statuses: { 판매중: 1, 품절: 1, 판매종료: 1 },
    });
    // 매칭 가용성 규칙이 이 원천의 완료를 카탈로그로 본다.
    await expect(prisma.sourceImportRun.count({
      where: completedCatalogRunWhere(ORG, ONCH),
    })).resolves.toBe(1);
  });

  it('refreshes the listing image on every import so a changed mall image reaches the listing (KID-313 W3a)', async () => {
    await complete([row({ imageUrl: 'https://mall.example.com/first.jpg' })]);
    await complete([row({ imageUrl: 'https://mall.example.com/second.jpg' })]);
    await expect(prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, externalId: '1098464' }, select: { imageUrl: true } }))
      .resolves.toEqual({ imageUrl: 'https://mall.example.com/second.jpg' });

    // 사진을 주지 않는 목록은 남긴 사진을 지우지 않는다.
    await complete([row()]);
    await expect(prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, externalId: '1098464' }, select: { imageUrl: true } }))
      .resolves.toEqual({ imageUrl: 'https://mall.example.com/second.jpg' });
  });

  it('turns off only its own listings that left the list — not a Sabangnet or KidItem listing on the row', async () => {
    await complete([row(), row({ mallProductCode: '176227' })]);
    await prisma.channelListing.createMany({
      data: [
        {
          organizationId: ORG,
          channelAccountId: ONCH,
          externalId: 'KIDITEM-REGISTERED',
          status: 'active',
          rawJson: { source: 'kiditem_registration' },
        },
        {
          organizationId: ORG,
          channelAccountId: ONCH,
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
        where: { organizationId: ORG, channelAccountId: ONCH },
        select: { externalId: true, isActive: true, options: { select: { isActive: true } } },
      })).map((listing) => [listing.externalId, listing]),
    );
    expect(byId.get('1098464')).toMatchObject({ isActive: true, options: [{ isActive: true }] });
    expect(byId.get('176227')).toMatchObject({ isActive: false, options: [{ isActive: false }] });
    expect(byId.get('KIDITEM-REGISTERED')).toMatchObject({ isActive: true });
    expect(byId.get('SABANGNET-SENT')).toMatchObject({ isActive: true });
    expect(await publicationOf((await latestOnchRun()).id)).toMatchObject({
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
      where: { organizationId: ORG, dedupeKey: `channels:mall-admin-listings:${ORG}:${ONCH}` },
      select: { title: true, sourceType: true },
    })).resolves.toEqual({ title: '온채널 등록 상품 가져오기 실패', sourceType: 'mall_admin_listings' });

    // 그 몰이 다시 가져오면 알림이 닫힌다.
    await complete([row()]);
    await expect(prisma.alert.findFirstOrThrow({
      where: { organizationId: ORG, dedupeKey: `channels:mall-admin-listings:${ORG}:${ONCH}` },
      select: { status: true },
    })).resolves.toEqual({ status: 'RESOLVED' });
  });

  it('refuses a submission that names another mall as a lost plan fence', async () => {
    const attempt = await begin();
    const body = submission(attempt, [row()]);
    await finish(attempt, { ...body, proof: { ...body.proof, mallKey: 'kkomangse' } }).expect(409);
  });

  it('writes to the row the hub picks when a mall has two rows', async () => {
    await prisma.channelAccount.create({
      data: {
        id: ONCH_LATER,
        organizationId: ORG,
        channel: 'onch',
        externalAccountId: 'onch-2',
        name: '온채널 2',
        status: 'configured',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    });
    await complete([row()]);
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, externalId: '1098464' },
    })).resolves.toMatchObject({ channelAccountId: ONCH });
  });

  it('rejects a stale token and lets the operator stop a running attempt without one', async () => {
    const attempt = await begin();
    await finish(attempt, submission(attempt, [row()]), randomUUID()).expect(409);
    const stopped = await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/cancel`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(stopped.body).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });
    await start('onch').expect(201);
  });
});
