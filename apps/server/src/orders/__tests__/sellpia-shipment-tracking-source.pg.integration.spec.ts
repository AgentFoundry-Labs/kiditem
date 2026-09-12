import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT,
} from '../application/port/in/sellpia-shipment-tracking-source.port';
import { SellpiaShipmentTrackingSourceRepository } from '../adapter/out/repository/sellpia-shipment-tracking-source.repository';
import { SellpiaShipmentTrackingSourceController } from '../controllers/sellpia-shipment-tracking-source.controller';

const BASE = '/api/orders/sellpia-shipment-tracking';
const DATE = '2026-09-07';

describe('Sellpia shipment tracking source owner over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let owner: SellpiaShipmentTrackingSourceRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    owner = new SellpiaShipmentTrackingSourceRepository(prisma as never, alerts);
    const module = await Test.createTestingModule({
      controllers: [SellpiaShipmentTrackingSourceController],
      providers: [{
        provide: SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT,
        useValue: owner,
      }],
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
  });

  const begin = (organizationId = ORG, key = randomUUID()) =>
    request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('x-test-org', organizationId)
      .set('Idempotency-Key', key)
      .send({ startDate: DATE, endDate: DATE });

  const control = (organizationId: string, attemptId: string) =>
    request(httpUrl)
      .get(`${BASE}/attempts/${attemptId}/control`)
      .set('x-test-org', organizationId);

  const complete = (
    organizationId: string,
    attempt: { attemptId: string; attemptToken: string },
    bytes = Buffer.from('{"rows":[],"total":0,"range":{"start":"2026-09-07","end":"2026-09-07"}}'),
  ) => request(httpUrl)
    .post(`${BASE}/attempts/${attempt.attemptId}/complete`)
    .set('x-test-org', organizationId)
    .set('x-source-attempt-token', attempt.attemptToken)
    .attach('file', bytes, {
      filename: 'sellpia-shipment-tracking-v1.json',
      contentType: 'application/json',
    });

  it('enforces org/token fences and replays duplicate COMPLETE without another artifact', async () => {
    const started = (await begin().expect(201)).body;
    const scopedControl = (await control(ORG, started.attemptId).expect(200)).body;

    await request(httpUrl)
      .post(`${BASE}/attempts/${started.attemptId}/fail`)
      .set('x-test-org', OTHER_ORG)
      .set('x-source-attempt-token', scopedControl.attemptToken)
      .send({ errorCode: 'sellpia_network_failed', errorMessage: 'provider unavailable' })
      .expect(404);
    await complete(OTHER_ORG, scopedControl).expect(404);
    await complete(ORG, {
      attemptId: scopedControl.attemptId,
      attemptToken: randomUUID(),
    }).expect(409);

    const first = await complete(ORG, scopedControl).expect(201);
    const replay = await complete(ORG, scopedControl).expect(201);
    expect(first.body).toMatchObject({ state: 'COMPLETE', artifactId: expect.any(String) });
    expect(replay.body.artifactId).toBe(first.body.artifactId);
    await expect(prisma.orderCollectionArtifact.count({
      where: { organizationId: ORG, sourceImportRunId: started.attemptId },
    })).resolves.toBe(1);
  });

  it('keeps an earlier COMPLETE artifact when a later source attempt fails', async () => {
    const first = (await begin().expect(201)).body;
    const firstControl = (await control(ORG, first.attemptId).expect(200)).body;
    await complete(ORG, firstControl).expect(201);

    const second = (await begin().expect(201)).body;
    const secondControl = (await control(ORG, second.attemptId).expect(200)).body;
    const failed = await request(httpUrl)
      .post(`${BASE}/attempts/${second.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', secondControl.attemptToken)
      .send({ errorCode: 'sellpia_login_required', errorMessage: '로그인이 필요합니다.' })
      .expect(201);

    expect(failed.body.state).toBe('FAILED');
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: first.attemptId } }))
      .resolves.toMatchObject({ status: 'completed' });
    await expect(prisma.orderCollectionArtifact.count({
      where: { organizationId: ORG, sourceImportRunId: first.attemptId },
    })).resolves.toBe(1);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: second.attemptId } }))
      .resolves.toMatchObject({ status: 'failed', errorCode: 'sellpia_login_required' });
  });

  it('rolls the source failure and alert back together when Alert persistence fails', async () => {
    const started = (await begin().expect(201)).body;
    const scopedControl = (await control(ORG, started.attemptId).expect(200)).body;
    const failingAlerts = new SourceFailureAlerts(prisma as never);
    const upsert = vi.spyOn(failingAlerts, 'recordTerminalOutcome').mockRejectedValueOnce(
      new Error('alert persistence failed'),
    );
    const failingOwner = new SellpiaShipmentTrackingSourceRepository(prisma as never, failingAlerts);

    try {
      await expect(failingOwner.failAttempt({
        organizationId: ORG,
        attemptId: started.attemptId,
        attemptToken: scopedControl.attemptToken,
        errorCode: 'sellpia_network_failed',
        errorMessage: 'provider unavailable',
      })).rejects.toThrow('alert persistence failed');
    } finally {
      upsert.mockRestore();
    }

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });
    await expect(prisma.alert.count({
      where: { organizationId: ORG, sourceType: 'sellpia_shipment_tracking', attemptId: started.attemptId },
    })).resolves.toBe(0);
  });

  it('reports expiry without read-time mutation and terminalizes only same-org attempts on begin', async () => {
    const started = (await begin().expect(201)).body;
    const foreign = (await begin(OTHER_ORG).expect(201)).body;
    await prisma.sourceImportRun.updateMany({
      where: { id: { in: [started.attemptId, foreign.attemptId] } },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const read = await request(httpUrl)
      .get(`${BASE}/attempts/${started.attemptId}`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(read.body).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });

    const next = (await begin().expect(201)).body;
    expect(next.attemptId).not.toBe(started.attemptId);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attemptId } }))
      .resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: foreign.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });

    const nextForeign = (await begin(OTHER_ORG).expect(201)).body;
    expect(nextForeign.attemptId).not.toBe(foreign.attemptId);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: foreign.attemptId } }))
      .resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
  });

  it('serves the persisted raw artifact through the owner source read', async () => {
    const started = (await begin().expect(201)).body;
    const scopedControl = (await control(ORG, started.attemptId).expect(200)).body;
    const raw = Buffer.from('{"rows":[{"ordNo":"ORDER-1"}],"total":1,"range":{"start":"2026-09-07","end":"2026-09-07"}}');
    await complete(ORG, scopedControl, raw).expect(201);

    const response = await request(httpUrl)
      .get(`${BASE}/attempts/${started.attemptId}/source`)
      .set('x-test-org', ORG)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(Buffer.compare(response.body, raw)).toBe(0);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const artifact = await prisma.orderCollectionArtifact.findUniqueOrThrow({
      where: {
        sourceImportRunId_organizationId: {
          sourceImportRunId: started.attemptId,
          organizationId: ORG,
        },
      },
    });
    expect(Buffer.compare(Buffer.from(artifact.sourceBytes), raw)).toBe(0);
  });
});
