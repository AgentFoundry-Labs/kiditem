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
import { OrderCollectionSourceStatusSchema } from '@kiditem/shared/order-collection-source';

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

  it('keeps the requested day separate from an unconfirmed provider window', async () => {
    const attempt = (await begin().expect(201)).body;
    const completed = (await complete(ORG, attempt).expect(201)).body;
    expect(completed).toMatchObject({
      state: 'COMPLETE',
      plan: { startDate: DATE, endDate: DATE },
      coverageStartDate: null,
      coverageEndDate: null,
    });
  });

  it('publishes only the narrower window independently confirmed by the provider', async () => {
    const attempt = (await request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', randomUUID())
      .send({ startDate: '2026-09-07', endDate: '2026-09-09' })
      .expect(201)).body;
    const payload = Buffer.from(JSON.stringify({
      rows: [], total: 0,
      range: { start: '2026-09-07', end: '2026-09-09' },
      confirmedRange: { start: '2026-09-07', end: '2026-09-08' },
    }));
    const completed = (await complete(ORG, attempt, payload).expect(201)).body;
    expect(completed).toMatchObject({
      state: 'COMPLETE',
      plan: { startDate: '2026-09-07', endDate: '2026-09-09' },
      coverageStartDate: '2026-09-07',
      coverageEndDate: '2026-09-08',
    });
    expect((await control(ORG, attempt.attemptId).expect(200)).body).toMatchObject({
      coverageStartDate: '2026-09-07', coverageEndDate: '2026-09-08',
    });
    expect((await complete(ORG, attempt, payload).expect(201)).body).toEqual(completed);
    await complete(ORG, attempt, Buffer.from(JSON.stringify({
      rows: [], total: 0,
      range: { start: '2026-09-07', end: '2026-09-09' },
      confirmedRange: { start: '2026-09-07', end: '2026-09-09' },
    }))).expect(409);
    expect((await control(ORG, attempt.attemptId).expect(200)).body.coverageEndDate)
      .toBe('2026-09-08');
  });

  it.each([
    ['missing query', { rows: [], total: 0 }],
    ['query outside plan', { rows: [], total: 0, range: { start: DATE, end: '2026-09-08' } }],
    ['coverage outside query', {
      rows: [], total: 0, range: { start: DATE, end: DATE },
      confirmedRange: { start: '2026-09-06', end: DATE },
    }],
    ['invalid calendar date', {
      rows: [], total: 0, range: { start: DATE, end: DATE },
      confirmedRange: { start: '2026-02-30', end: DATE },
    }],
  ])('rejects %s before writing source facts or an artifact', async (_name, payload) => {
    const attempt = (await begin().expect(201)).body;
    await complete(ORG, attempt, Buffer.from(JSON.stringify(payload))).expect(400);
    expect((await control(ORG, attempt.attemptId).expect(200)).body).toMatchObject({
      state: 'RUNNING', artifactId: null, coverageStartDate: null, coverageEndDate: null,
    });
    await expect(prisma.orderCollectionArtifact.count({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(0);
  });

  it('rejects a requested window longer than 31 days without claiming an attempt', async () => {
    await request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', randomUUID())
      .send({ startDate: '2026-08-07', endDate: DATE })
      .expect(400);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);
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

  const cancel = (organizationId: string, attemptId: string) =>
    request(httpUrl)
      .post(`${BASE}/attempts/${attemptId}/cancel`)
      .set('x-test-org', organizationId);

  it('stops a running attempt for an operator without its token or an Alert, and admits the next begin at once', async () => {
    const attempt = (await begin().expect(201)).body;
    await cancel(OTHER_ORG, attempt.attemptId).expect(404);

    const stopped = (await cancel(ORG, attempt.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(await prisma.alert.findFirst({
      where: { sourceType: 'sellpia_shipment_tracking', attemptId: attempt.attemptId },
    })).toBeNull();
    // 같은 중단을 다시 눌러도 끝난 시도를 그대로 돌려준다.
    expect((await cancel(ORG, attempt.attemptId).expect(200)).body)
      .toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });

    const next = (await begin().expect(201)).body;
    expect(next.attemptId).not.toBe(attempt.attemptId);
    expect(next.state).toBe('RUNNING');
  });

  it('settles an operator stop after the lease passed as expiry and leaves a COMPLETE attempt unchanged', async () => {
    const expiring = (await begin().expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: expiring.attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await cancel(ORG, expiring.attemptId).expect(200)).body)
      .toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.findFirstOrThrow({
      where: { sourceType: 'sellpia_shipment_tracking', attemptId: expiring.attemptId },
    })).toMatchObject({ status: 'OPEN' });

    const completed = (await begin().expect(201)).body;
    const scopedControl = (await control(ORG, completed.attemptId).expect(200)).body;
    await complete(ORG, scopedControl).expect(201);
    expect((await cancel(ORG, completed.attemptId).expect(200)).body)
      .toMatchObject({ state: 'COMPLETE', errorCode: null });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: completed.attemptId } }))
      .resolves.toMatchObject({ status: 'completed', errorCode: null });
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

  const readSource = (organizationId = ORG) =>
    request(httpUrl).get(`${BASE}/source`).set('x-test-org', organizationId);

  it('answers the shipment tracking source with its running, last complete and last attempt slots', async () => {
    const idle = OrderCollectionSourceStatusSchema.parse((await readSource().expect(200)).body);
    expect(idle).toEqual({
      mallKey: null,
      channelAccountId: null,
      running: null,
      lastComplete: null,
      lastAttempt: null,
    });

    const started = (await begin().expect(201)).body;
    const runningView = OrderCollectionSourceStatusSchema.parse((await readSource().expect(200)).body);
    expect(runningView.running).toMatchObject({
      attemptId: started.attemptId,
      collectionMode: null,
      expiresAt: started.expiresAt,
    });
    expect(runningView.lastAttempt).toMatchObject({ attemptId: started.attemptId, state: 'RUNNING' });
    // 상태 읽기는 토큰을 담지 않는다(strict 스키마가 여분 키를 거른다).
    expect(JSON.stringify(runningView)).not.toContain(started.attemptToken);
    // 다른 조직은 이 조직의 수집을 보지 못한다.
    expect(OrderCollectionSourceStatusSchema.parse((await readSource(OTHER_ORG).expect(200)).body))
      .toMatchObject({ running: null, lastAttempt: null });

    const scopedControl = (await control(ORG, started.attemptId).expect(200)).body;
    await complete(ORG, scopedControl).expect(201);
    const completed = OrderCollectionSourceStatusSchema.parse((await readSource().expect(200)).body);
    expect(completed.running).toBeNull();
    expect(completed.lastComplete).toMatchObject({
      attemptId: started.attemptId,
      publicationSequence: null,
    });
    expect(completed.lastComplete?.completedAt).toEqual(expect.any(String));
    expect(completed.lastAttempt).toMatchObject({ attemptId: started.attemptId, state: 'COMPLETE' });

    // 뒤이어 중단한 시도는 lastAttempt만 바꾸고 마지막 완료분은 그대로 둔다.
    const stopped = (await begin().expect(201)).body;
    await request(httpUrl)
      .post(`${BASE}/attempts/${stopped.attemptId}/cancel`)
      .set('x-test-org', ORG)
      .expect(200);
    const afterStop = OrderCollectionSourceStatusSchema.parse((await readSource().expect(200)).body);
    expect(afterStop.running).toBeNull();
    expect(afterStop.lastComplete?.attemptId).toBe(started.attemptId);
    expect(afterStop.lastAttempt).toMatchObject({
      attemptId: stopped.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
    });
    expect(afterStop.lastAttempt?.endedAt).toEqual(expect.any(String));
  });

  it('reads an expired shipment tracking lease as no longer running without writing the attempt', async () => {
    const started = (await begin().expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: started.attemptId },
      data: { expiresAt: new Date(0) },
    });

    const view = OrderCollectionSourceStatusSchema.parse((await readSource().expect(200)).body);
    expect(view.running).toBeNull();
    expect(view.lastAttempt).toMatchObject({
      attemptId: started.attemptId,
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attemptId } }))
      .resolves.toMatchObject({ status: 'running', errorCode: null });
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
