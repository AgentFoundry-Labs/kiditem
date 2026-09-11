import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelProductMatchingController } from '../adapter/in/http/channel-product-matching.controller';
import { SellpiaManualMatchRepositoryAdapter } from '../adapter/out/repository/sellpia-manual-match.repository.adapter';
import { ChannelProductMatchingService } from '../application/service/channel-product-matching.service';
import { SellpiaManualMatchService } from '../application/service/sellpia-manual-match.service';
import type { SellpiaManualMatchSnapshot } from '@kiditem/shared/sellpia-manual-match';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { INestApplication } from '@nestjs/common';

const ACCOUNT_ID = '71000000-0000-4000-8000-000000000001';
const SOURCE_TYPE = 'sellpia_product_manual_match';
const ALERT_DEDUPE_KEY = 'source:sellpia-manual-match';

describe('Sellpia manual-match source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let owner: SellpiaManualMatchRepositoryAdapter;
  let httpUrl: string;
  let firstSkuId: string;
  let secondSkuId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = createOwner(prisma);
    const module = await Test.createTestingModule({
      controllers: [ChannelProductMatchingController],
      providers: [
        { provide: ChannelProductMatchingService, useValue: {} },
        {
          provide: SellpiaManualMatchService,
          useValue: new SellpiaManualMatchService({} as never, owner),
        },
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
          id: 'f1234567-89ab-4cde-8f01-23456789abcd',
          organizationId: req.headers['x-test-org'] ?? TEST_ORGANIZATION_ID,
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
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
      },
    });
    const catalogRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        status: 'completed',
        fileName: 'catalog.xlsx',
        fileHash: randomUUID(),
      },
    });
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: `LISTING-${randomUUID()}`,
        displayName: 'Match Alias',
        lastImportRunId: catalogRun.id,
        isActive: true,
      },
    });
    const firstSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: '6402-1',
        name: 'First SKU',
        currentStock: 10,
      },
    });
    const secondSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: '6402-2',
        name: 'Second SKU',
        currentStock: 10,
      },
    });
    firstSkuId = firstSku.id;
    secondSkuId = secondSku.id;
  });

  it('replays the same frozen attempt after the active inventory changes', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: secondSkuId },
      data: { isActive: false },
    });

    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'same-key',
    })).resolves.toEqual(first);
    expect(first.plan.targetCodes).toEqual(['6402-1', '6402-2']);
    expect(await prisma.sourceImportRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: SOURCE_TYPE,
      },
    })).toBe(1);
  });

  it('freezes targets and rejects terminal drift while preserving the prior snapshot', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'first-complete',
    });
    await owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      snapshot: snapshot(),
    });
    const prior = await owner.getCurrentStatus(TEST_ORGANIZATION_ID);
    const refresh = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'drifted-refresh',
    });

    await prisma.sellpiaInventorySku.update({
      where: { id: secondSkuId },
      data: { isActive: false },
    });
    await expect(owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: refresh.attemptId,
      attemptToken: refresh.attemptToken,
      snapshot: snapshot(),
    })).rejects.toThrow('Active Sellpia inventory changed');

    await expect(owner.getCurrentStatus(TEST_ORGANIZATION_ID)).resolves.toEqual(prior);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: refresh.attemptId },
    })).resolves.toMatchObject({ status: 'running' });
  });

  it('aggregates current aliases atomically and preserves the snapshot when a later attempt fails', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'aggregate-first',
    });
    await owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      snapshot: snapshot(),
    });
    const prior = await owner.getCurrentStatus(TEST_ORGANIZATION_ID);

    const refresh = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'aggregate-failure',
    });
    await expect(owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: refresh.attemptId,
      attemptToken: refresh.attemptToken,
      errorCode: 'sellpia_manual_match_network_failed',
      errorMessage: 'Sellpia page was unavailable',
    })).resolves.toMatchObject({ state: 'FAILED' });

    await expect(owner.getCurrentStatus(TEST_ORGANIZATION_ID)).resolves.toEqual(prior);
    await expect(prisma.sellpiaManualMatchAlias.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: {
        sellpiaInventorySkuId: true,
        aliasTitle: true,
        matchedType: true,
        evidenceCount: true,
      },
    })).resolves.toEqual([{
      sellpiaInventorySkuId: firstSkuId,
      aliasTitle: 'Match Alias',
      matchedType: 'M',
      evidenceCount: 3,
    }]);
    await expect(prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: ALERT_DEDUPE_KEY,
        },
      },
    })).resolves.toMatchObject({ status: 'OPEN', attemptId: refresh.attemptId });
  });

  it('atomically rolls back terminal publication when resolving the failure alert fails', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'rollback-first',
    });
    await owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      snapshot: snapshot(),
    });
    const prior = await owner.getCurrentStatus(TEST_ORGANIZATION_ID);
    const refresh = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'rollback-refresh',
    });
    const failingAlerts = {
      resolveSourceFailure: vi.fn().mockRejectedValue(new Error('alert write failed')),
      recordTerminalOutcome: vi.fn(),
    } as unknown as SourceFailureAlerts;
    const failingOwner = new SellpiaManualMatchRepositoryAdapter(
      prisma as unknown as PrismaService,
      failingAlerts,
    );

    await expect(failingOwner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: refresh.attemptId,
      attemptToken: refresh.attemptToken,
      snapshot: snapshot(),
    })).rejects.toThrow('alert write failed');
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: refresh.attemptId },
    })).resolves.toMatchObject({ status: 'running' });
    await expect(failingOwner.getCurrentStatus(TEST_ORGANIZATION_ID)).resolves.toEqual(prior);
  });

  it('expires the old active attempt before admitting a replacement and fences organization/token access', async () => {
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'expiry-first',
    });
    await prisma.sourceImportRun.update({
      where: { id: first.attemptId },
      data: { expiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });

    const replacement = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'expiry-replacement',
    });
    expect(replacement.state).toBe('RUNNING');
    await expect(owner.readAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: replacement.attemptId,
    })).rejects.toThrow('SELLPIA_MANUAL_MATCH_ATTEMPT_NOT_FOUND');
    await expect(owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: replacement.attemptId,
      attemptToken: '00000000-0000-4000-8000-000000000000',
      errorCode: 'sellpia_manual_match_timeout',
      errorMessage: 'wrong token',
    })).rejects.toThrow('ATTEMPT_FENCE_LOST');
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: first.attemptId },
    })).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: ALERT_DEDUPE_KEY,
        },
      },
    })).resolves.toMatchObject({ status: 'OPEN', attemptId: first.attemptId });
  });

  it('publishes and replays through HTTP, rejects changed terminal payloads, and retires the old import route', async () => {
    const base = '/api/channels/product-mappings/sellpia-manual-match';
    const begin = await request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', 'http-owner')
      .set('x-test-org', TEST_ORGANIZATION_ID)
      .send({})
      .expect(201);
    const control = begin.body as { attemptId: string; attemptToken: string };

    const complete = await request(httpUrl)
      .post(`${base}/attempts/${control.attemptId}/complete`)
      .set('X-Source-Attempt-Token', control.attemptToken)
      .set('x-test-org', TEST_ORGANIZATION_ID)
      .send(snapshot())
      .expect(201);
    const replay = await request(httpUrl)
      .post(`${base}/attempts/${control.attemptId}/complete`)
      .set('X-Source-Attempt-Token', control.attemptToken)
      .set('x-test-org', TEST_ORGANIZATION_ID)
      .send(snapshot())
      .expect(201);
    expect(replay.body).toEqual(complete.body);

    await request(httpUrl)
      .post(`${base}/attempts/${control.attemptId}/complete`)
      .set('X-Source-Attempt-Token', control.attemptToken)
      .set('x-test-org', TEST_ORGANIZATION_ID)
      .send({
        ...snapshot(),
        rows: snapshot().rows.map((row, index) =>
          index === 0 ? { ...row, evidenceCount: row.evidenceCount + 1 } : row),
      })
      .expect(409);

    await request(httpUrl)
      .post(`${base}/import`)
      .set('x-test-org', TEST_ORGANIZATION_ID)
      .send(snapshot())
      .expect(404);
    await request(httpUrl)
      .get(`${base}/attempts/${control.attemptId}`)
      .set('x-test-org', OTHER_ORGANIZATION_ID)
      .expect(404);
  });

  it('serializes terminal publication behind an in-flight inventory owner mutation', async () => {
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: 'lock-serialization',
    });
    let lockAcquired!: () => void;
    const lockReady = new Promise<void>((resolve) => { lockAcquired = resolve; });
    let releaseLock!: () => void;
    const lockRelease = new Promise<void>((resolve) => { releaseLock = resolve; });
    const mutation = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`inventory-sellpia:${TEST_ORGANIZATION_ID}:sellpia_inventory`}, 0)
        )::text AS "lock"
      `);
      lockAcquired();
      await lockRelease;
      await tx.sellpiaInventorySku.update({
        where: { id: secondSkuId },
        data: { isActive: false },
      });
    }, { maxWait: 10_000, timeout: 30_000 });
    await lockReady;

    const completion = owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      snapshot: snapshot(),
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseLock();
    await expect(completion).rejects.toThrow('Active Sellpia inventory changed');
    await mutation;
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    })).resolves.toMatchObject({ status: 'running' });
    await expect(owner.getCurrentStatus(TEST_ORGANIZATION_ID)).resolves.toBeNull();
  });

  function createOwner(client: PrismaClient): SellpiaManualMatchRepositoryAdapter {
    return new SellpiaManualMatchRepositoryAdapter(
      client as unknown as PrismaService,
      new SourceFailureAlerts(client as unknown as PrismaService),
    );
  }

  function snapshot(): SellpiaManualMatchSnapshot {
    return {
      source: SOURCE_TYPE,
      version: 1,
      targetCount: 2,
      targetCodes: ['6402-1', '6402-2'],
      rowCount: 3,
      rows: [
        {
          productCode: '6402-1',
          aliasTitle: 'Match Alias',
          itemCount: 2,
          matchedType: 'E',
          evidenceCount: 1,
        },
        {
          productCode: '6402-1',
          aliasTitle: 'Match Alias',
          itemCount: 2,
          matchedType: 'M',
          evidenceCount: 2,
        },
        {
          productCode: '6402-2',
          aliasTitle: 'Not Current',
          itemCount: 1,
          matchedType: 'M',
          evidenceCount: 1,
        },
      ],
    };
  }
});
