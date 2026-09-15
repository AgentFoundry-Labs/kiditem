import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import {
  OrderCollectionSourceStatusSchema,
  type OrderCollectionSourceStatus,
} from '@kiditem/shared/order-collection-source';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
} from '../application/port/in/order-collection-source.port';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { OrderCollectionController } from '../controllers/order-collection.controller';
import { OrderCollectionSourceController } from '../controllers/order-collection-source.controller';
import { CoupangDirectshipService } from '../coupang-directship/coupang-directship.service';
import { CoupangDirectPoSnapshotService } from '../services/coupang-direct-po-snapshot.service';
import { OrderCollectionService } from '../services/order-collection.service';
import { ORDER_COLLECTION_MALLS } from '../services/order-collection-mall-account.service';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const BASE = '/api/orders/collection';
const ART09_BODY = {
  rows: [{
    orderId: '20260907-1234567',
    productName: '상품',
    qty: 1,
  }],
};

describe('Order collection source owner over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let owner: OrderCollectionSourceRepository;
  let alerts: SourceFailureAlerts;
  let conversion: ReturnType<typeof art09Conversion>;
  let convertArt09Orders: ReturnType<typeof vi.fn>;
  let convertHaebeopOrders: ReturnType<typeof vi.fn>;
  let convertKidsnoteOrders: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    owner = new OrderCollectionSourceRepository(prisma as never, alerts);
    conversion = art09Conversion();
    convertArt09Orders = vi.fn().mockReturnValue(conversion);
    convertHaebeopOrders = vi.fn().mockReturnValue(conversion);
    convertKidsnoteOrders = vi.fn();
    const collection = {
      convertArt09Orders,
      convertHaebeopOrders,
      convertKidsnoteOrders,
    };
    const module = await Test.createTestingModule({
      controllers: [OrderCollectionController, OrderCollectionSourceController],
      providers: [
        { provide: OrderCollectionService, useValue: collection },
        { provide: CoupangDirectshipService, useValue: {} },
        { provide: CoupangDirectPoSnapshotService, useValue: {} },
        { provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT, useValue: {} },
        { provide: ORDER_COLLECTION_SOURCE_PORT, useValue: owner },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: '25mb' }));
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.authUser = {
          id: USER,
          organizationId: req.headers['x-test-org'] ?? ORG,
        };
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
          organizationId: ORG,
          channel: 'order_collection',
          name: '아트공구',
          externalAccountId: 'art09',
          isPrimary: true,
        },
        {
          organizationId: ORG,
          channel: 'order_collection',
          name: '카카오',
          externalAccountId: 'kakao',
        },
        {
          organizationId: ORG,
          channel: 'order_collection',
          name: '해법몰',
          externalAccountId: 'haebub-mall',
        },
        {
          organizationId: ORG,
          channel: 'order_collection',
          name: '도매꾹',
          externalAccountId: 'domeggook',
        },
      ],
    });
    convertArt09Orders.mockClear();
    convertHaebeopOrders.mockClear();
    convertKidsnoteOrders.mockClear();
  });

  const begin = (
    mallKey: string,
    idempotencyKey = randomUUID(),
    collectionDate: string | null = null,
  ) =>
    request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ mallKey, collectionDate, collectionMode: 'browser' });

  const control = (attemptId: string) =>
    request(httpUrl).get(`${BASE}/attempts/${attemptId}/control`);

  it.each(['haebub-mall', 'domeggook'])('publishes and replays a confirmed empty %s window without conversion or failure alerts', async (mallKey) => {
    const attempt = (await begin(mallKey, randomUUID(), '2026-09-07').expect(201)).body;
    const payload = {
      kind: 'confirmed-empty-orders',
      mallKey,
      orders: [],
      confirmedCoverage: { startDate: '2026-09-07', endDate: '2026-09-07' },
    };
    const complete = (body: Record<string, unknown>) => request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/complete-empty`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(body);
    await complete({ ...payload, orders: [{ orderId: 'unexpected' }] }).expect(400);
    await complete({ ...payload, confirmedCoverage: null }).expect(400);
    await complete({ ...payload, confirmedCoverage: { startDate: '2026-09-06', endDate: '2026-09-06' } }).expect(409);
    await complete(payload).expect(201);
    const completed = (await control(attempt.attemptId).expect(200)).body;
    expect(completed).toMatchObject({
      state: 'COMPLETE', coverageStartDate: '2026-09-07', coverageEndDate: '2026-09-07',
    });
    await complete(payload).expect(201);
    expect((await control(attempt.attemptId).expect(200)).body.artifactId).toBe(completed.artifactId);
    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/convert`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .expect(204)
      .expect('X-Order-Collection-Source-Rows', '0')
      .expect('X-Order-Collection-Output-Rows', '0');
    expect(convertHaebeopOrders).not.toHaveBeenCalled();
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(0);
  });

  const convertArt09 = (attempt: { attemptId: string; attemptToken: string }) =>
    request(httpUrl)
      .post(`${BASE}/art09/convert`)
      .set('x-order-collection-attempt-id', attempt.attemptId)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(ART09_BODY);

  const convertHaebeop = (
    attempt: { attemptId: string; attemptToken: string },
    coverage?: { startDate: string; endDate: string },
  ) => {
    const conversion = request(httpUrl)
      .post(`${BASE}/haebeop/convert`)
      .set('x-order-collection-attempt-id', attempt.attemptId)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ orders: [] });
    if (coverage) {
      conversion
        .set('x-order-collection-coverage-start-date', coverage.startDate)
        .set('x-order-collection-coverage-end-date', coverage.endDate);
    }
    return conversion;
  };

  it('publishes only the provider-confirmed collection day on the public attempt', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;

    await convertHaebeop(attempt, {
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    }).expect(201);

    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          state: 'COMPLETE',
          coverageStartDate: '2026-09-07',
          coverageEndDate: '2026-09-07',
        });
      });
  });

  it('does not promote the requested day when the provider sends no coverage receipt', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;

    await convertHaebeop(attempt).expect(201);

    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          state: 'COMPLETE',
          coverageStartDate: null,
          coverageEndDate: null,
        });
      });
  });

  it('rejects malformed coverage before conversion and leaves the attempt running without an artifact', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;

    await request(httpUrl)
      .post(`${BASE}/haebeop/convert`)
      .set('x-order-collection-attempt-id', attempt.attemptId)
      .set('x-source-attempt-token', attempt.attemptToken)
      .set('x-order-collection-coverage-start-date', '2026-09-07')
      .send(ART09_BODY)
      .expect(400);
    await convertHaebeop(attempt, {
      startDate: '2026-02-31',
      endDate: '2026-02-31',
    }).expect(400);

    expect(convertHaebeopOrders).not.toHaveBeenCalled();
    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          state: 'RUNNING',
          artifactId: null,
          coverageStartDate: null,
          coverageEndDate: null,
        });
      });
  });

  it('rejects coverage outside the frozen plan before conversion and preserves owner state', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;

    await convertHaebeop(attempt, {
      startDate: '2026-09-08',
      endDate: '2026-09-08',
    }).expect(409);

    expect(convertHaebeopOrders).not.toHaveBeenCalled();
    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ state: 'RUNNING', artifactId: null });
      });
  });

  it('rejects a different terminal coverage replay before conversion and preserves the artifact', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;
    const completed = await convertHaebeop(attempt).expect(201);
    const artifactId = completed.headers['x-order-collection-artifact-id'];

    await convertHaebeop(attempt, {
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    }).expect(409);

    expect(convertHaebeopOrders).toHaveBeenCalledTimes(1);
    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          state: 'COMPLETE',
          artifactId,
          coverageStartDate: null,
          coverageEndDate: null,
        });
      });
  });

  it('rolls back the artifact, coverage, and terminal state when completion bookkeeping fails', async () => {
    const started = (await begin('haebub-mall', randomUUID(), '2026-09-07').expect(201)).body;
    const attempt = (await control(started.attemptId).expect(200)).body;
    const resolve = vi.spyOn(alerts, 'resolveSourceFailure').mockRejectedValueOnce(
      new Error('completion bookkeeping failed'),
    );

    try {
      await convertHaebeop(attempt, {
        startDate: '2026-09-07',
        endDate: '2026-09-07',
      }).expect(500);
    } finally {
      resolve.mockRestore();
    }

    expect(convertHaebeopOrders).toHaveBeenCalledTimes(1);
    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          state: 'RUNNING',
          artifactId: null,
          coverageStartDate: null,
          coverageEndDate: null,
        });
      });
  });

  it('persists raw evidence for distinct same-input attempts and replays a terminal ACK', async () => {
    const first = (await begin('art09').expect(201)).body;
    const firstControl = (await control(first.attemptId).expect(200)).body;
    const firstResponse = await convertArt09(firstControl).expect(201);
    expect(firstResponse.headers['x-order-collection-artifact-id']).toBeTruthy();

    const second = (await begin('art09').expect(201)).body;
    const secondControl = (await control(second.attemptId).expect(200)).body;
    const secondResponse = await convertArt09(secondControl).expect(201);
    const replayResponse = await convertArt09(secondControl).expect(201);

    expect(convertArt09Orders).toHaveBeenCalledTimes(3);
    expect(replayResponse.headers['x-order-collection-artifact-id']).toBe(
      secondResponse.headers['x-order-collection-artifact-id'],
    );
    const artifacts = await prisma.orderCollectionArtifact.findMany({
      where: { organizationId: ORG },
      orderBy: { createdAt: 'asc' },
    });
    expect(artifacts).toHaveLength(2);
    expect(Buffer.compare(Buffer.from(artifacts[0]!.sourceBytes), Buffer.from(artifacts[1]!.sourceBytes))).toBe(0);

    const runs = await prisma.sourceImportRun.findMany({
      where: { organizationId: ORG, sourceType: 'order_collection_mall' },
      orderBy: { createdAt: 'asc' },
      select: { status: true, contentChecksum: true, fileHash: true },
    });
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status)).toEqual(['completed', 'completed']);
    expect(runs[0]?.contentChecksum).toBe(runs[1]?.contentChecksum);
    expect(runs.every((run) => run.fileHash === null)).toBe(true);
  });

  it('keeps Kakao raw-only failure evidence and its source Alert in one terminal transaction', async () => {
    const attempt = (await begin('kakao').expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const failed = await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/fail`)
      .set('x-source-attempt-token', controlAttempt.attemptToken)
      .send({
        code: 'UNSUPPORTED_CONVERSION',
        message: 'Kakao conversion is not supported.',
        sourcePayload: { orders: [{ paymentId: 'kakao-1' }] },
      })
      .expect(201);

    expect(failed.body).toMatchObject({ state: 'FAILED', errorCode: 'UNSUPPORTED_CONVERSION' });
    const run = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } });
    expect(run.status).toBe('failed');
    const artifact = await prisma.orderCollectionArtifact.findUniqueOrThrow({
      where: { sourceImportRunId_organizationId: { sourceImportRunId: attempt.attemptId, organizationId: ORG } },
    });
    expect(Buffer.from(artifact.sourceBytes).toString('utf8')).toBe(
      '{"orders":[{"paymentId":"kakao-1"}]}',
    );
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'order_collection_mall', attemptId: attempt.attemptId },
    })).resolves.toMatchObject({
      status: 'OPEN',
      href: '/order-collection',
    });
  });

  it('rolls raw capture and terminal state back when Alert persistence fails', async () => {
    const attempt = (await begin('art09').expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const failingAlerts = new SourceFailureAlerts(prisma as never);
    const upsert = vi.spyOn(failingAlerts, 'recordTerminalOutcome').mockRejectedValueOnce(
      new Error('alert persistence failed'),
    );
    const failingOwner = new OrderCollectionSourceRepository(prisma as never, failingAlerts);

    try {
      await expect(failingOwner.failAttempt({
        organizationId: ORG,
        attemptId: attempt.attemptId,
        attemptToken: controlAttempt.attemptToken,
        code: 'UNSUPPORTED_CONVERSION',
        message: 'Kakao conversion is not supported.',
        source: orderCollectionJsonSubmission({ rows: [{ paymentId: 'raw-only' }] }),
      })).rejects.toThrow('alert persistence failed');
    } finally {
      upsert.mockRestore();
    }

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });
    await expect(prisma.orderCollectionArtifact.count({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(0);
    await expect(prisma.alert.count({
      where: { organizationId: ORG, sourceType: 'order_collection_mall', attemptId: attempt.attemptId },
    })).resolves.toBe(0);
  });

  const readSource = (mallKey?: string, organizationId = ORG) => {
    const query = mallKey === undefined ? '' : `?mallKey=${encodeURIComponent(mallKey)}`;
    return request(httpUrl).get(`${BASE}/source${query}`).set('x-test-org', organizationId);
  };

  const readSources = (organizationId = ORG) =>
    request(httpUrl).get(`${BASE}/sources`).set('x-test-org', organizationId);

  const cancel = (attemptId: string, organizationId = ORG) =>
    request(httpUrl)
      .post(`${BASE}/attempts/${attemptId}/cancel`)
      .set('x-test-org', organizationId);

  it('answers the mall source with its running, last complete and last attempt slots', async () => {
    await readSource().expect(400);
    await readSource('not-a-mall').expect(404);

    const idle = OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body);
    const account = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: ORG, channel: 'order_collection', externalAccountId: 'art09' },
    });
    expect(idle).toEqual({
      mallKey: 'art09',
      channelAccountId: account.id,
      running: null,
      lastComplete: null,
      lastAttempt: null,
    });

    const first = (await begin('art09').expect(201)).body;
    const started = OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body);
    expect(started.running).toMatchObject({
      attemptId: first.attemptId,
      collectionMode: 'browser',
      expiresAt: first.expiresAt,
    });
    expect(started.lastAttempt).toMatchObject({ attemptId: first.attemptId, state: 'RUNNING', endedAt: null });
    expect(started.lastComplete).toBeNull();
    // 상태 읽기는 토큰을 절대 담지 않는다(strict 스키마가 여분 키를 거른다).
    expect(JSON.stringify(started)).not.toContain(first.attemptToken);

    await convertArt09(first).expect(201);
    const completed = OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body);
    expect(completed.running).toBeNull();
    expect(completed.lastComplete).toMatchObject({
      attemptId: first.attemptId,
      publicationSequence: null,
    });
    expect(completed.lastComplete?.completedAt).toEqual(expect.any(String));
    expect(completed.lastAttempt).toMatchObject({ attemptId: first.attemptId, state: 'COMPLETE' });

    // 뒤이어 실패한 시도는 lastAttempt만 바꾸고 마지막 완료분은 그대로 둔다.
    const second = (await begin('art09').expect(201)).body;
    await cancel(second.attemptId).expect(200);
    const afterFailure = OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body);
    expect(afterFailure.running).toBeNull();
    expect(afterFailure.lastComplete?.attemptId).toBe(first.attemptId);
    expect(afterFailure.lastAttempt).toMatchObject({
      attemptId: second.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
    });
    expect(afterFailure.lastAttempt?.endedAt).toEqual(expect.any(String));
  });

  it('keeps each mall and each organization in its own source read', async () => {
    const art09 = (await begin('art09').expect(201)).body;

    const other = OrderCollectionSourceStatusSchema.parse((await readSource('kakao').expect(200)).body);
    expect(other.running).toBeNull();
    expect(other.lastAttempt).toBeNull();
    expect(other.mallKey).toBe('kakao');
    expect(other.channelAccountId).not.toBe(
      OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body).channelAccountId,
    );
    expect((await readSource('art09').expect(200)).body.running.attemptId).toBe(art09.attemptId);

    // 다른 조직에는 이 조직의 몰 계정 자체가 없다.
    await readSource('art09', OTHER_ORG).expect(404);
  });

  it('reads an expired lease as no longer running without writing the attempt', async () => {
    const attempt = (await begin('art09').expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { expiresAt: new Date(0) },
    });

    const view = OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body);
    expect(view.running).toBeNull();
    expect(view.lastAttempt).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    // 읽기는 행을 끝내지 않는다. 만료 처리는 owner의 쓰기 경로가 한다.
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });
  });

  /**
   * 주문 수집 화면은 몰 카드 20장을 함께 띄운다. 카드마다 한 번씩 읽으면 폴링만으로
   * 전역 throttler(60초 120회)를 넘겨 화면 전체가 429를 받으므로, 화면 하나가 이
   * 목록 한 번으로 20칸을 모두 읽는다(KID-170 D2).
   */
  it('answers every registry mall in one organization-scoped read, in registry order', async () => {
    const complete = (await begin('art09').expect(201)).body;
    await convertArt09(complete).expect(201);
    const cancelled = (await begin('art09').expect(201)).body;
    await cancel(cancelled.attemptId).expect(200);
    const live = (await begin('domeggook').expect(201)).body;
    const leased = (await begin('haebub-mall').expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: leased.attemptId },
      data: { expiresAt: new Date(0) },
    });

    const body = (await readSources().expect(200)).body;
    const malls: OrderCollectionSourceStatus[] = body.malls
      .map((mall: unknown) => OrderCollectionSourceStatusSchema.parse(mall));
    const byKey = new Map(malls.map((mall) => [mall.mallKey, mall]));

    expect(malls.map((mall) => mall.mallKey))
      .toEqual(ORDER_COLLECTION_MALLS.map((mall) => mall.key));

    // 이 조직에 계정 행이 없는 몰은 범위만 비운 채로 한 칸을 차지한다 — 오류가 아니다.
    expect(byKey.get('one-polaris')).toEqual({
      mallKey: 'one-polaris',
      channelAccountId: null,
      running: null,
      lastComplete: null,
      lastAttempt: null,
    });

    // 계정 행은 있지만 아직 시도가 없는 몰.
    expect(byKey.get('kakao')).toMatchObject({
      channelAccountId: expect.any(String),
      running: null,
      lastComplete: null,
      lastAttempt: null,
    });

    expect(byKey.get('domeggook')?.running).toMatchObject({
      attemptId: live.attemptId,
      collectionMode: 'browser',
    });

    // 임대가 지난 RUNNING 행은 진행 중이 아니고, 마지막 시도 자리에 만료로만 비친다.
    expect(byKey.get('haebub-mall')?.running).toBeNull();
    expect(byKey.get('haebub-mall')?.lastAttempt).toMatchObject({
      attemptId: leased.attemptId,
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: leased.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });

    // 몰 하나짜리 읽기와 같은 답이어야 한 화면 안에서 카드가 서로 다른 말을 하지 않는다.
    expect(byKey.get('art09')).toEqual(
      OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body),
    );
    expect(byKey.get('art09')?.lastComplete?.attemptId).toBe(complete.attemptId);
    expect(byKey.get('art09')?.lastAttempt).toMatchObject({
      attemptId: cancelled.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
    });

    // 상태 목록도 시도 토큰을 담지 않는다(strict 스키마가 여분 키를 거른다).
    expect(JSON.stringify(malls)).not.toContain(complete.attemptToken);
  });

  /**
   * 같은 몰에 임대가 지난 RUNNING 행이 더 나중 것으로 남아 있어도, 진행 중인 것은
   * 살아 있는 시도다. 목록을 좁힐 때 만료 규칙이 빠지면 여기서 드러난다(KID-170).
   */
  it('answers the live attempt when a newer RUNNING row on the same mall has expired', async () => {
    const live = (await begin('art09').expect(201)).body;
    const account = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: ORG, channel: 'order_collection', externalAccountId: 'art09' },
    });
    // begin 은 임대가 지난 RUNNING 행을 만나면 끝내 버리므로, 더 나중에 만들어진
    // 만료 행은 owner 밖에서 남긴다(열어 둔 채 사라진 다른 브라우저의 시도).
    const stale = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'order_collection_mall',
        channelAccountId: account.id,
        status: 'running',
        expiresAt: new Date(0),
        parserVersion: 'order-collection-v1',
        plan: {
          sourceType: 'order_collection_mall',
          parserVersion: 'order-collection-v1',
          mallKey: 'art09',
          mallName: '아트공구',
          channelAccountId: account.id,
          collectionDate: null,
          collectionMode: 'browser',
        },
      },
    });

    const malls: OrderCollectionSourceStatus[] = (await readSources().expect(200)).body
      .malls.map((mall: unknown) => OrderCollectionSourceStatusSchema.parse(mall));
    const art09 = malls.find((mall) => mall.mallKey === 'art09');

    expect(art09?.running).toMatchObject({ attemptId: live.attemptId, collectionMode: 'browser' });
    // 마지막 시도 자리에는 가장 나중 행인 만료 행이 비친다.
    expect(art09?.lastAttempt).toMatchObject({
      attemptId: stale.id,
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    // 몰 하나짜리 읽기와 같은 답이어야 한다.
    expect(art09).toEqual(
      OrderCollectionSourceStatusSchema.parse((await readSource('art09').expect(200)).body),
    );
  });

  it('shows another organization its own empty mall registry', async () => {
    const mine = (await begin('art09').expect(201)).body;

    const malls: OrderCollectionSourceStatus[] = (await readSources(OTHER_ORG).expect(200)).body
      .malls.map((mall: unknown) => OrderCollectionSourceStatusSchema.parse(mall));

    expect(malls).toHaveLength(ORDER_COLLECTION_MALLS.length);
    expect(malls.every((mall) => mall.channelAccountId === null)).toBe(true);
    expect(JSON.stringify(malls)).not.toContain(mine.attemptId);
  });

  it('stops a running mall attempt for an operator without its token or an Alert', async () => {
    const attempt = (await begin('art09').expect(201)).body;

    await cancel(attempt.attemptId, OTHER_ORG).expect(404);

    const stopped = (await cancel(attempt.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(await prisma.alert.count({
      where: { organizationId: ORG, sourceType: 'order_collection_mall' },
    })).toBe(0);

    // 같은 중단을 다시 눌러도 끝난 시도를 그대로 돌려준다.
    expect((await cancel(attempt.attemptId).expect(200)).body)
      .toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });

    const next = (await begin('art09').expect(201)).body;
    expect(next.attemptId).not.toBe(attempt.attemptId);
    expect(next.state).toBe('RUNNING');
  });

  it('settles an operator stop after the lease passed as expiry with its Alert', async () => {
    const attempt = (await begin('art09').expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { expiresAt: new Date(0) },
    });

    expect((await cancel(attempt.attemptId).expect(200)).body)
      .toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.findFirstOrThrow({
      where: { organizationId: ORG, sourceType: 'order_collection_mall', attemptId: attempt.attemptId },
    })).toMatchObject({ status: 'OPEN' });
  });

  it('rejects unfenced conversion and the retired direct COMPLETE route', async () => {
    await request(httpUrl)
      .post(`${BASE}/kidsnote/convert`)
      .send({ orders: [{ ono: 'ORDER-1' }] })
      .expect(400);
    expect(convertKidsnoteOrders).not.toHaveBeenCalled();

    await request(httpUrl)
      .post(`${BASE}/attempts/${randomUUID()}/complete`)
      .send({})
      .expect(404);
  });
});

function art09Conversion() {
  return {
    buffer: Buffer.from('\uFEFFheader\r\n'),
    fileName: 'zzogzzog1_20260907_주문수집.csv',
    sourceRows: 1,
    productRows: 1,
    outputRows: 1,
    skippedRows: 0,
  };
}
