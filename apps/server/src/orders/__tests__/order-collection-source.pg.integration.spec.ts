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
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import type { ChannelAccountPort } from '../../channels/application/port/in/account/channel-account.port';
import {
  ORDER_COLLECTION_SOURCE_PORT,
  orderCollectionJsonSubmission,
} from '../application/port/in/order-collection-source.port';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { OrderCollectionController } from '../adapter/in/web/order-collection.controller';
import { OrderCollectionSourceController } from '../adapter/in/web/order-collection-source.controller';
import { OrderCollectionService } from '../application/service/order-collection.service';
import { MallOrdersOperationService } from '../application/service/mall-orders-operation.service';
import { ORDER_COLLECTION_TODAY_ORDERS_PORT } from '../application/port/in/order-collection-today-orders.port';
import { MALL_CHANNELS } from '@kiditem/shared/channel-registry';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';

const BASE = '/api/orders/collection';

/**
 * 옛 주문 attempt 경로는 카카오만 쓴다(KID-379 — 셀피아 변환 규격이 생길 때까지). 시작·제어 읽기·실패(원본 artifact +
 * 실패 알림)·중단·몰 상태 목록만 남고, 완료·빈 완료·원본 다운로드·옛 재변환은 없다(KID-380 T4). 나머지 몰은
 * `orders.mall_orders` 실행이다.
 */
describe('Order collection source owner (kakao old attempt path, KID-379) over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let channelAccounts: ChannelAccountPort;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    const accountPersistence = new ChannelAccountPersistenceAdapter(prisma as unknown as PrismaService, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));
    channelAccounts = new ChannelAccountService(accountPersistence, new ChannelCredentialsAdapter());
    const owner = new OrderCollectionSourceRepository(prisma as never, alerts, channelAccounts);
    const module = await Test.createTestingModule({
      controllers: [OrderCollectionController, OrderCollectionSourceController],
      providers: [
        { provide: OrderCollectionService, useValue: {} },
        { provide: ORDER_COLLECTION_SOURCE_PORT, useValue: owner },
        // 실행 kind 몰의 변환·오늘 주문은 이 스펙의 몫이 아니다(mall-orders-operation PG 스펙).
        { provide: MallOrdersOperationService, useValue: {} },
        { provide: ORDER_COLLECTION_TODAY_ORDERS_PORT, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: '25mb' }));
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
    await prisma.channelAccount.createMany({
      data: [
        { organizationId: ORG, channel: 'kakao', name: '카카오', externalAccountId: 'kakao' },
        { organizationId: ORG, channel: 'art09', name: '아트공구', externalAccountId: 'art09', isPrimary: true },
      ],
    });
  });

  const begin = (mallKey = 'kakao', idempotencyKey = randomUUID(), body: Record<string, unknown> = {}) =>
    request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ mallKey, collectionDate: '2026-09-07', collectionMode: 'browser', ...body });
  const control = (attemptId: string) => request(httpUrl).get(`${BASE}/attempts/${attemptId}/control`);
  const readSources = (organizationId = ORG) => request(httpUrl).get(`${BASE}/sources`).set('x-test-org', organizationId);
  const cancel = (attemptId: string, organizationId = ORG) =>
    request(httpUrl).post(`${BASE}/attempts/${attemptId}/cancel`).set('x-test-org', organizationId);
  const kakaoAccountId = async () =>
    (await prisma.channelAccount.findFirstOrThrow({ where: { organizationId: ORG, channel: 'kakao' } })).id;
  const sources = async (organizationId = ORG): Promise<Map<string, OrderCollectionSourceStatus>> =>
    new Map(((await readSources(organizationId).expect(200)).body.malls as unknown[])
      .map((mall) => OrderCollectionSourceStatusSchema.parse(mall))
      .map((mall) => [mall.mallKey, mall]));

  it('시작은 카카오의 브라우저 수집만 받는다 — 실행 kind로 옮긴 몰·수동 업로드는 VALIDATION_FAILED', async () => {
    const started = (await begin().expect(201)).body;
    expect(started).toMatchObject({ state: 'RUNNING', plan: { mallKey: 'kakao', collectionMode: 'browser', collectionDate: '2026-09-07' } });

    expect((await begin('art09').expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'mall_not_attempt_path' } });
    expect((await begin('kakao', randomUUID(), { collectionMode: 'manual-upload', collectionDate: null }).expect(400)).body)
      .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'manual_upload_moved_to_operation' } });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(1);
  });

  it('같은 키는 같은 시도를 돌려주고, 도는 시도가 있으면 ATTEMPT_IN_PROGRESS', async () => {
    const key = randomUUID();
    const first = (await begin('kakao', key).expect(201)).body;
    expect((await begin('kakao', key).expect(201)).body.attemptId).toBe(first.attemptId);
    expect((await begin().expect(409)).body).toMatchObject({ code: 'ATTEMPT_IN_PROGRESS', details: { attemptId: first.attemptId } });
  });

  it('카카오 실패: 원본(변환 규격 없음)을 실패 artifact로, 몰 실패 알림과 한 트랜잭션에 남긴다', async () => {
    const attempt = (await begin().expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const failed = await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/fail`)
      .set('x-source-attempt-token', controlAttempt.attemptToken)
      .send({
        code: 'UNSUPPORTED_CONVERSION',
        message: '카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.',
        sourcePayload: { orders: [{ paymentId: 'kakao-1' }] },
      })
      .expect(201);

    expect(failed.body).toMatchObject({ state: 'FAILED', errorCode: 'UNSUPPORTED_CONVERSION' });
    const artifact = await prisma.orderCollectionArtifact.findUniqueOrThrow({
      where: { sourceImportRunId_organizationId: { sourceImportRunId: attempt.attemptId, organizationId: ORG } },
    });
    expect(Buffer.from(artifact.sourceBytes).toString('utf8')).toBe('{"orders":[{"paymentId":"kakao-1"}]}');
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'order_collection_mall', attemptId: attempt.attemptId },
    })).resolves.toMatchObject({ status: 'OPEN', href: '/order-collection' });
    // 시도 읽기는 그 artifact를 가리키고, 같은 실패를 다시 보내도 같은 답이다.
    expect((await request(httpUrl).get(`${BASE}/attempts/${attempt.attemptId}`).expect(200)).body)
      .toMatchObject({ state: 'FAILED', artifactId: artifact.id });
    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/fail`)
      .set('x-source-attempt-token', controlAttempt.attemptToken)
      .send({ code: 'UNSUPPORTED_CONVERSION', message: '다시', sourcePayload: { orders: [{ paymentId: 'kakao-1' }] } })
      .expect(201);

    // 임대가 지난 시도의 실패는 받지 않는다 — 원본도 남기지 않는다.
    const leased = (await begin().expect(201)).body;
    const leasedControl = (await control(leased.attemptId).expect(200)).body;
    await prisma.sourceImportRun.update({ where: { id: leased.attemptId }, data: { expiresAt: new Date(0) } });
    await request(httpUrl)
      .post(`${BASE}/attempts/${leased.attemptId}/fail`)
      .set('x-source-attempt-token', leasedControl.attemptToken)
      .send({ code: 'UNSUPPORTED_CONVERSION', message: '늦음', sourcePayload: { orders: [] } })
      .expect(409);
    await expect(prisma.orderCollectionArtifact.count({ where: { sourceImportRunId: leased.attemptId } })).resolves.toBe(0);
  });

  it('알림을 남기지 못하면 원본과 실패를 함께 되돌린다', async () => {
    const attempt = (await begin().expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const failingAlerts = new SourceFailureAlerts(prisma as never);
    const upsert = vi.spyOn(failingAlerts, 'recordTerminalOutcome').mockRejectedValueOnce(new Error('alert persistence failed'));
    const failingOwner = new OrderCollectionSourceRepository(prisma as never, failingAlerts, channelAccounts);
    try {
      await expect(failingOwner.failAttempt({
        organizationId: ORG,
        attemptId: attempt.attemptId,
        attemptToken: controlAttempt.attemptToken,
        code: 'UNSUPPORTED_CONVERSION',
        message: '카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.',
        source: orderCollectionJsonSubmission({ orders: [{ paymentId: 'raw-only' }] }),
      })).rejects.toThrow('alert persistence failed');
    } finally {
      upsert.mockRestore();
    }
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });
    await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.alert.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('운영자 중단은 토큰 없이 조직 범위로 끝내고 알림을 남기지 않는다, 임대가 지난 시도는 만료로 끝내며 알림을 남긴다', async () => {
    const attempt = (await begin().expect(201)).body;
    await cancel(attempt.attemptId, OTHER_ORG).expect(404);
    expect((await cancel(attempt.attemptId).expect(200)).body).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect((await cancel(attempt.attemptId).expect(200)).body).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });
    await expect(prisma.alert.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const leased = (await begin().expect(201)).body;
    await prisma.sourceImportRun.update({ where: { id: leased.attemptId }, data: { expiresAt: new Date(0) } });
    expect((await cancel(leased.attemptId).expect(200)).body).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.alert.findFirstOrThrow({
      where: { organizationId: ORG, sourceType: 'order_collection_mall', attemptId: leased.attemptId },
    })).resolves.toMatchObject({ status: 'OPEN' });
  });

  /**
   * 몰 카드가 한 읽기로 보는 조직 범위 목록(KID-170 D2): 레지스트리 순서로 몰마다 한 칸, 계정 행이 없는 몰은 빈 칸.
   * 옛 attempt 행만 읽는다 — 지금은 카카오의 시도와 옮기기 전 남은 옛 완료 행이다.
   */
  it('몰 상태 목록: 도는 시도·마지막 옛 완료분·마지막 시도(만료 포함), 토큰 없이', async () => {
    const kakao = await kakaoAccountId();
    // 옮기기 전 남은 옛 완료 행(카카오는 이제 완료하지 않는다).
    const legacy = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'order_collection_mall',
        channelAccountId: kakao,
        status: 'completed',
        importedAt: new Date('2026-09-01T00:00:00Z'),
        createdAt: new Date('2026-09-01T00:00:00Z'),
        parserVersion: 'order-collection-v1',
        plan: { sourceType: 'order_collection_mall', parserVersion: 'order-collection-v1', mallKey: 'kakao', mallName: '카카오', channelAccountId: kakao, collectionDate: null, collectionMode: 'browser' },
      },
    });
    const live = (await begin().expect(201)).body;

    const byKey = await sources();
    expect([...byKey.keys()]).toEqual(MALL_CHANNELS.map((mall) => mall.key));
    expect(byKey.get('one-polaris')).toEqual({ mallKey: 'one-polaris', channelAccountId: null, running: null, lastComplete: null, lastAttempt: null });
    expect(byKey.get('kakao')).toMatchObject({
      channelAccountId: kakao,
      running: { attemptId: live.attemptId, collectionMode: 'browser' },
      lastComplete: { attemptId: legacy.id },
      lastAttempt: { attemptId: live.attemptId, state: 'RUNNING', endedAt: null },
    });
    expect(JSON.stringify([...byKey.values()])).not.toContain(live.attemptToken);

    await prisma.sourceImportRun.update({ where: { id: live.attemptId }, data: { expiresAt: new Date(0) } });
    const expired = (await sources()).get('kakao');
    expect(expired?.running).toBeNull();
    expect(expired?.lastAttempt).toMatchObject({ attemptId: live.attemptId, state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    // 읽기는 행을 끝내지 않는다.
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: live.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });

    const other = await sources(OTHER_ORG);
    expect([...other.values()].every((mall) => mall.channelAccountId === null)).toBe(true);
  });

  it('⭐ 몰 로그인을 저장한 계정 행과 그 몰의 시도가 같은 행이다(ADR-0012)', async () => {
    process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    await channelAccounts.update(ORG, 'kakao', { loginId: 'kakao-user', password: 'kakao-password', siteUrl: 'https://shopping-seller.kakao.com' });
    const kakao = await kakaoAccountId();
    const attempt = (await begin().expect(201)).body;
    expect((await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } })).channelAccountId).toBe(kakao);
    expect((await sources()).get('kakao')?.channelAccountId).toBe(kakao);
  });

  it('옛 완료·빈 완료·원본 다운로드·몰 하나 읽기·attempt 재변환은 없다 — 변환은 실행 id로만', async () => {
    const attempt = (await begin().expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const token = { 'x-source-attempt-token': controlAttempt.attemptToken };
    await request(httpUrl).post(`${BASE}/attempts/${attempt.attemptId}/complete-empty`).set(token).send({}).expect(404);
    await request(httpUrl).post(`${BASE}/attempts/${attempt.attemptId}/complete`).set(token).send({}).expect(404);
    await request(httpUrl).get(`${BASE}/artifacts/${randomUUID()}/source`).expect(404);
    await request(httpUrl).get(`${BASE}/source?mallKey=kakao`).expect(404);
    expect((await request(httpUrl).post(`${BASE}/attempts/${attempt.attemptId}/convert`).set(token).send({}).expect(400)).body)
      .toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_id_required' } });
    for (const route of ['art09', 'icecream-mall', 'icecream-mall/convert-rows', 'kidsnote', 'kkomangse', 'onchannel', 'kidkids', 'haebeop', 'domeggook', 'boribori', 'teacherville', 'lotteon', 'gsshop', 'alwayz']) {
      const path = route.includes('/') ? route : `${route}/convert`;
      expect((await request(httpUrl)
        .post(`${BASE}/${path}`)
        .set('x-order-collection-attempt-id', attempt.attemptId)
        .set(token)
        .send({ orders: [] })
        .expect(400)).body, path).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'operation_id_required' } });
    }
    // 시도는 그대로 돈다 — 어느 라우트도 옛 시도를 끝내지 않았다.
    expect((await control(attempt.attemptId).expect(200)).body).toMatchObject({ state: 'RUNNING', artifactId: null });
  });
});
