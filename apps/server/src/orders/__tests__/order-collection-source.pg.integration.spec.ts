import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
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
  let conversion: ReturnType<typeof art09Conversion>;
  let convertArt09Orders: ReturnType<typeof vi.fn>;
  let convertKidsnoteOrders: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    owner = new OrderCollectionSourceRepository(prisma as never, alerts);
    conversion = art09Conversion();
    convertArt09Orders = vi.fn().mockReturnValue(conversion);
    convertKidsnoteOrders = vi.fn();
    const collection = {
      convertArt09Orders,
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
      ],
    });
    convertArt09Orders.mockClear();
    convertKidsnoteOrders.mockClear();
  });

  const begin = (mallKey: string, idempotencyKey = randomUUID()) =>
    request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ mallKey, collectionDate: null, collectionMode: 'browser' });

  const control = (attemptId: string) =>
    request(httpUrl).get(`${BASE}/attempts/${attemptId}/control`);

  const convertArt09 = (attempt: { attemptId: string; attemptToken: string }) =>
    request(httpUrl)
      .post(`${BASE}/art09/convert`)
      .set('x-order-collection-attempt-id', attempt.attemptId)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(ART09_BODY);

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
      severity: 'error',
      href: '/order-collection',
    });
  });

  it('rolls raw capture and terminal state back when Alert persistence fails', async () => {
    const attempt = (await begin('art09').expect(201)).body;
    const controlAttempt = (await control(attempt.attemptId).expect(200)).body;
    const failingAlerts = new SourceFailureAlerts(prisma as never);
    const upsert = vi.spyOn(failingAlerts, 'upsertSourceFailure').mockRejectedValueOnce(
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
