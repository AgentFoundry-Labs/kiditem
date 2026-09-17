import { randomUUID } from 'node:crypto';
import { isSellpiaInventoryLastAttemptStopped } from '@kiditem/shared/sellpia-inventory-freshness';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaInventorySourceController } from '../adapter/in/http/sellpia-inventory-source.controller';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from '../adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from '../adapter/out/repository/inventory-availability.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { SELLPIA_INVENTORY_IMPORT_PORT } from '../application/port/in/stock/sellpia-inventory-import.port';
import { InventoryAvailabilityService } from '../application/service/inventory-availability.service';
import { SellpiaInventoryFileValidator } from '../application/service/sellpia-inventory-file.validator';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';
import type { Prisma, PrismaClient } from '@prisma/client';
import { FactNotFoundError } from '../../common/errors/fact-errors';
import {
  lockSellpiaInventory,
  type SellpiaInventoryLock,
} from '../transaction/sellpia-inventory-lock';
import {
  readActiveInventoryMatchingCandidates,
  readInventoryAvailability,
  readInventoryAvailabilityCandidates,
} from '../read/inventory-availability';

const base = '/api/inventory/sellpia-source';

describe('Sellpia inventory source owner HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let alerts: SourceFailureAlerts;
  let snapshots: InventorySkuSnapshotListService;
  let availability: InventoryAvailabilityService;
  let freshness: SellpiaInventoryFreshnessService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    const prismaService = prisma as never;
    snapshots = new InventorySkuSnapshotListService(
      new InventorySkuSnapshotListRepositoryAdapter(prismaService),
    );
    availability = new InventoryAvailabilityService(
      new InventoryAvailabilityRepositoryAdapter(prismaService),
    );
    freshness = new SellpiaInventoryFreshnessService(
      new SellpiaInventoryFreshnessRepositoryAdapter(prismaService),
    );
    const runRepository = new SellpiaImportRunRepositoryAdapter(prismaService, alerts);
    const publication = new SellpiaSnapshotPublicationRepositoryAdapter(
      prismaService,
      alerts,
    );
    const service = new SellpiaInventoryImportService(
      runRepository,
      publication,
      new ConfirmedChannelComponentReferenceRepositoryAdapter(prismaService),
      new SellpiaInventoryFileValidator(),
    );
    const module = await Test.createTestingModule({
      controllers: [SellpiaInventorySourceController],
      providers: [{ provide: SELLPIA_INVENTORY_IMPORT_PORT, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const organizationId = req.headers['x-test-organization'];
        if (organizationId) {
          req.authUser = {
            id: TEST_USER_ID,
            organizationId,
            membershipId: null,
            role: 'owner',
            type: 'human',
            email: 'test@test.local',
          };
        }
        next();
      },
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        requestedGeneration: 1n,
        verifiedGeneration: 0n,
        freshnessFence: randomUUID(),
      },
    });
  });

  it('persists before capture, replays the exact begin, and fences live/key-drift conflicts', async () => {
    const first = await begin('begin-replay');
    expect(first).toMatchObject({
      state: 'RUNNING',
      plan: {
        sourceType: 'sellpia_inventory',
        parserVersion: 'sellpia-inventory-v1',
        scope: 'inventory',
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      },
    });
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: first.attemptId } }),
    ).toMatchObject({ status: 'running', fileHash: null, rowCount: 0 });
    expect(await begin('begin-replay')).toEqual(first);
    const live = await postBegin('other-live');
    expect(live.status).toBe(409);
    const drift = await postBegin('begin-replay', { scope: 'full' });
    expect(drift.status).toBe(409);
    expect(
      (await postBegin('legacy-trigger', {
        scope: 'inventory',
        trigger: 'order_transmission_requested',
      })).status,
    ).toBe(400);
  });

  it('accepts an attested manual upload through the same owner publication', async () => {
    const attempt = await begin('manual-upload');
    const response = await complete(attempt, snapshot(6), 'application/json', true)
      .expect(201);
    expect(response.body).toMatchObject({ state: 'COMPLETE', rowCount: 1 });
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }),
    ).toMatchObject({ manualFreshExportConfirmedBy: TEST_USER_ID });
  });

  it('publishes the same browser artifact again as a distinct owner generation', async () => {
    const first = await begin('same-artifact-first');
    await complete(first, snapshot(8)).expect(201);
    const second = await begin('same-artifact-second');
    await complete(second, snapshot(8)).expect(201);

    const runs = await prisma.sourceImportRun.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        id: { in: [first.attemptId, second.attemptId] },
      },
      orderBy: { freshnessGeneration: 'asc' },
      select: { id: true, status: true, fileHash: true, freshnessGeneration: true },
    });
    expect(runs).toHaveLength(2);
    expect(runs).toEqual([
      expect.objectContaining({ id: first.attemptId, status: 'completed', freshnessGeneration: 1n }),
      expect.objectContaining({ id: second.attemptId, status: 'completed', freshnessGeneration: 2n }),
    ]);
  });

  it('publishes through the canonical snapshot path, preserves prior stock on failure, and resolves its Alert on retry', async () => {
    const first = await begin('prior-snapshot');
    await complete(first, snapshot(8)).expect(201);
    const priorSku = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: TEST_ORGANIZATION_ID, code: 'SP-001' } },
    });

    const failed = await begin('invalid-artifact');
    await complete(failed, Buffer.from('<html>not a snapshot</html>'), 'text/html').expect(400);
    expect(
      (await prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: priorSku.id } }))
        .currentStock,
    ).toBe(8);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: failed.attemptId, status: 'OPEN' },
    ]);

    const retry = await begin('valid-retry');
    await complete(retry, snapshot(9)).expect(201);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: retry.attemptId, status: 'RESOLVED' },
    ]);
    expect(
      (await prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: priorSku.id } }))
        .currentStock,
    ).toBe(9);
  });

  it('rejects stale terminal writes and exposes an expired read before the explicit next begin settles it', async () => {
    const stale = await begin('stale');
    await fail(stale, 'sellpia_network_failed').expect(201);
    const current = await begin('current');
    await expectComplete(stale, snapshot(2), 409);
    await expectCompleteWithToken(current, stale.attemptToken, snapshot(2), 409);
    await fail(current, 'sellpia_network_failed').expect(201);

    const expired = await begin('expired');
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId },
      data: { expiresAt: new Date(0) },
    });
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { activeSyncLeaseExpiresAt: new Date(0) },
    });
    expect((await get(`/attempts/${expired.attemptId}`)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).toMatchObject({
      status: 'failed',
      activeSync: null,
      lastAttempt: {
        errorCode: null,
        errorMessage: 'Sellpia inventory collection attempt expired.',
      },
    });
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: expired.attemptId } }),
    ).toMatchObject({ status: 'running' });

    const next = await begin('after-expired');
    expect(next.state).toBe('RUNNING');
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: expired.attemptId } }),
    ).toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: expired.attemptId, status: 'OPEN' },
    ]);
  });

  it('stops a running attempt for an operator without its token or an Alert, releases the browser lease and admits the next begin at once', async () => {
    const attempt = await begin('operator-stop');
    await cancel(attempt.attemptId, OTHER_ORGANIZATION_ID).expect(404);
    const stopped = (await cancel(attempt.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual([]);
    expect(
      await prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).toMatchObject({ activeSyncToken: null, activeSyncLeaseExpiresAt: null });
    await expectComplete(attempt, snapshot(3), 409);
    expect((await cancel(attempt.attemptId).expect(200)).body).toEqual(stopped);
    const next = await begin('after-operator-stop');
    expect(next.state).toBe('RUNNING');
    expect(next.attemptId).not.toBe(attempt.attemptId);
  });

  it('settles an operator stop after the lease passed as expiry with its Alert and leaves a COMPLETE attempt unchanged', async () => {
    const expired = await begin('operator-expired');
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId },
      data: { expiresAt: new Date(0) },
    });
    expect((await cancel(expired.attemptId).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: expired.attemptId } }),
    ).toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toMatchObject([
      { attemptId: expired.attemptId, status: 'OPEN' },
    ]);

    const completed = await begin('operator-complete');
    await complete(completed, snapshot(4)).expect(201);
    const view = (await get(`/attempts/${completed.attemptId}`).expect(200)).body;
    expect(view.state).toBe('COMPLETE');
    expect((await cancel(completed.attemptId).expect(200)).body).toEqual(view);
  });

  it('ends a stop from the operator route or the extension session as a cancellation, not a failure, keeping the previous snapshot current', async () => {
    const basis = await begin('stopped-basis');
    await complete(basis, snapshot(5)).expect(201);
    const verified = await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });

    for (const stop of [
      async () => cancel((await begin('stopped-by-operator')).attemptId).expect(200),
      async () => fail(await begin('stopped-by-extension'), 'COLLECTION_CANCELLED').expect(201),
    ]) {
      await stop();
      expect(await freshness.getState({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
      })).toMatchObject({
        status: 'refresh_required',
        verifiedGeneration: verified.verifiedGeneration,
        lastVerifiedAt: verified.lastVerifiedAt,
        activeSync: null,
        lastAttempt: { errorCode: null, errorMessage: null },
      });
    }

    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual([]);
    const current = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(current.latestImport).toMatchObject({ id: basis.attemptId });
    expect(current.items[0]).toMatchObject({ code: 'SP-001', currentStock: 5 });
  });

  it('names the running attempt in the organization freshness read by its id, never its token, so any browser can stop it', async () => {
    const attempt = await begin('freshness-names-attempt');
    const running = await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    expect(running).toMatchObject({
      status: 'syncing',
      activeSync: { attemptId: attempt.attemptId },
    });
    expect(JSON.stringify(running)).not.toContain(attempt.attemptToken);

    expect((await cancel(running.activeSync?.attemptId ?? attempt.attemptToken).expect(200)).body)
      .toMatchObject({ attemptId: attempt.attemptId, state: 'FAILED', errorCode: 'USER_CANCELLED' });
    expect(await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).toMatchObject({ activeSync: null });
  });

  it('names no attempt while a manual upload claim holds the lease', async () => {
    const claimToken = randomUUID();
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: {
        activeSyncToken: claimToken,
        activeSyncOwnerUserId: TEST_USER_ID,
        activeSyncStartedAt: new Date(),
        activeSyncLeaseExpiresAt: new Date(Date.now() + 90_000),
        activeSyncScope: 'inventory',
        activeGeneration: 1n,
      },
    });

    const view = await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    expect(view).toMatchObject({ status: 'syncing', activeSync: { attemptId: null } });
    expect(JSON.stringify(view)).not.toContain(claimToken);
  });

  it('publishes the last attempt error facts without an outcome word and clears them on completion', async () => {
    const readFreshness = () => freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });

    const failed = await begin('last-attempt-failed');
    await fail(failed, 'sellpia_network_failed').expect(201);
    const failedAttempt = (await readFreshness()).lastAttempt;
    expect(failedAttempt).toMatchObject({ errorCode: 'sellpia_network_failed' });
    expect(failedAttempt).not.toHaveProperty('status');

    const next = await begin('last-attempt-next');
    await complete(next, snapshot(4)).expect(201);
    expect((await readFreshness()).lastAttempt).toMatchObject({
      errorCode: null,
      errorMessage: null,
    });
  });

  it('publishes last attempt facts that tell an operator stop from a completion and a failure', async () => {
    const readFreshness = () => freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });

    const completed = await begin('stop-facts-complete');
    await complete(completed, snapshot(5)).expect(201);
    const afterCompletion = await readFreshness();
    expect(afterCompletion.lastAttempt).toMatchObject({ errorCode: null, errorMessage: null });
    // A completion verifies the snapshot at the attempt's own instant.
    expect(afterCompletion.lastAttempt?.attemptedAt).toBe(afterCompletion.lastVerifiedAt);
    expect(isSellpiaInventoryLastAttemptStopped(afterCompletion)).toBe(false);
    expect(isSellpiaInventoryLastAttemptStopped({ ...afterCompletion, status: 'refresh_required' }))
      .toBe(false);

    await cancel((await begin('stop-facts-stop')).attemptId).expect(200);
    const afterStop = await readFreshness();
    expect(afterStop).toMatchObject({
      status: 'refresh_required',
      lastVerifiedAt: afterCompletion.lastVerifiedAt,
      lastAttempt: { errorCode: null, errorMessage: null },
    });
    const stoppedAt = Date.parse(afterStop.lastAttempt?.attemptedAt ?? 'missing');
    expect(stoppedAt).toBeGreaterThan(Date.parse(afterStop.lastVerifiedAt ?? 'missing'));
    expect(isSellpiaInventoryLastAttemptStopped(afterStop)).toBe(true);

    await fail(await begin('stop-facts-failure'), 'sellpia_network_failed').expect(201);
    const afterFailure = await readFreshness();
    expect(afterFailure.lastAttempt).toMatchObject({ errorCode: 'sellpia_network_failed' });
    expect(isSellpiaInventoryLastAttemptStopped(afterFailure)).toBe(false);
    expect(isSellpiaInventoryLastAttemptStopped({ ...afterFailure, status: 'refresh_required' }))
      .toBe(false);
  });

  it('publishes a stop after a real failure as a stopped last attempt, keeping the previous snapshot current', async () => {
    const readFreshness = () => freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    await complete(await begin('failure-then-stop-basis'), snapshot(5)).expect(201);
    const verified = await readFreshness();

    await fail(await begin('failure-then-stop-failure'), 'sellpia_network_failed').expect(201);
    const afterFailure = await readFreshness();
    expect(afterFailure).toMatchObject({
      status: 'failed',
      lastVerifiedAt: verified.lastVerifiedAt,
      lastAttempt: { errorCode: 'sellpia_network_failed' },
    });
    expect(isSellpiaInventoryLastAttemptStopped(afterFailure)).toBe(false);

    await cancel((await begin('failure-then-stop-stop')).attemptId).expect(200);
    const afterStop = await readFreshness();
    expect(afterStop).toMatchObject({
      status: 'refresh_required',
      verifiedGeneration: verified.verifiedGeneration,
      lastVerifiedAt: verified.lastVerifiedAt,
      activeSync: null,
      lastAttempt: { errorCode: null, errorMessage: null },
    });
    expect(Date.parse(afterStop.lastAttempt?.attemptedAt ?? 'missing'))
      .toBeGreaterThan(Date.parse(afterStop.lastVerifiedAt ?? 'missing'));
    expect(isSellpiaInventoryLastAttemptStopped(afterStop)).toBe(true);
  });

  it('publishes a stop before any snapshot exists as a stopped last attempt with nothing verified', async () => {
    const readFreshness = () => freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    expect(await readFreshness()).toMatchObject({
      status: 'refresh_required',
      lastVerifiedAt: null,
      lastAttempt: null,
    });

    await cancel((await begin('stop-before-snapshot')).attemptId).expect(200);
    const afterStop = await readFreshness();
    expect(afterStop).toMatchObject({
      status: 'refresh_required',
      verifiedGeneration: '0',
      lastVerifiedAt: null,
      activeSync: null,
      lastAttempt: { errorCode: null, errorMessage: null },
    });
    expect(isSellpiaInventoryLastAttemptStopped(afterStop)).toBe(true);
    expect(await alerts.list(TEST_ORGANIZATION_ID)).toEqual([]);
  });

  it('keeps an uncollected canonical identity visibly unverified in ordinary reads', async () => {
    const identity = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'UNVERIFIED-SP',
        name: '수동 매칭 대기 상품',
        currentStock: 0,
        isActive: true,
      },
    });

    const list = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(list).toMatchObject({ latestImport: null, total: 0, items: [] });
    await expect(snapshots.getSnapshot(TEST_ORGANIZATION_ID, identity.id))
      .rejects.toMatchObject({ status: 404 });
    expect(await availability.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [identity.id],
    })).toEqual({
      snapshot: { collected: false, generation: null, verifiedAt: null },
      items: [],
    });

    const attempt = await begin('unverified-identity-publish');
    await complete(attempt, snapshotFor('UNVERIFIED', 'SP', 5)).expect(201);
    const published = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(published.items).toEqual([
      expect.objectContaining({
        sellpiaInventorySkuId: identity.id,
        code: 'UNVERIFIED-SP',
        currentStock: 5,
        lastImportRunId: attempt.attemptId,
      }),
    ]);
  });

  it('reads only the published run through the transaction-aware organization fence', async () => {
    const attempt = await begin('transaction-reader');
    await complete(attempt, snapshot(7)).expect(201);
    const published = await prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-001',
        },
      },
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: published.id },
      data: { name: 'Candidate published' },
    });
    const stale = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'A-STALE-ROW',
        name: 'Candidate stale identity',
        currentStock: 99,
        isActive: true,
        lastImportRunId: null,
      },
    });
    const foreign = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'FOREIGN-ROW',
        name: 'Foreign identity',
        currentStock: 88,
        isActive: true,
      },
    });

    await expect(underInventoryLock((tx, lock) =>
      readInventoryAvailability(tx, lock, {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuIds: [published.id, stale.id],
      }))).resolves.toMatchObject({
      snapshot: { collected: true, generation: '1' },
      items: [{
        sellpiaInventorySkuId: published.id,
        currentStock: 7,
        availableStock: 7,
        generation: '1',
      }],
    });

    const foreignRead = underInventoryLock((tx, lock) =>
      readInventoryAvailability(tx, lock, {
        organizationId: TEST_ORGANIZATION_ID,
        sellpiaInventorySkuIds: [published.id, foreign.id],
      }));
    await expect(foreignRead).rejects.toBeInstanceOf(FactNotFoundError);
    await expect(foreignRead).rejects.toThrow(
      'One or more Sellpia inventory SKUs were not found in this organization',
    );

    await expect(underInventoryLock((tx, lock) =>
      readActiveInventoryMatchingCandidates(tx, lock, TEST_ORGANIZATION_ID)))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: stale.id, currentStock: null }),
        expect.objectContaining({ id: published.id, currentStock: 7 }),
      ]));
    await expect(underInventoryLock((tx, lock) =>
      readInventoryAvailabilityCandidates(tx, lock, {
        organizationId: TEST_ORGANIZATION_ID,
        query: 'Candidate',
        limit: 1,
        stockStatus: 'in_stock',
      }))).resolves.toEqual([
      expect.objectContaining({ sellpiaInventorySkuId: published.id, currentStock: 7 }),
    ]);
    await expect(underInventoryLock((tx, lock) =>
      readInventoryAvailabilityCandidates(tx, lock, {
        organizationId: TEST_ORGANIZATION_ID,
        query: 'Candidate',
        limit: 1,
        stockStatus: 'all',
      }))).resolves.toEqual([
      expect.objectContaining({ sellpiaInventorySkuId: stale.id, currentStock: null }),
    ]);
  });

  it('reads only under Sellpia lock evidence issued for the same transaction and organization', async () => {
    const attempt = await begin('lock-evidence');
    await complete(attempt, snapshot(7)).expect(201);
    const sku = await publishedSku();
    const lockedReads: Array<(
      tx: Prisma.TransactionClient,
      lock: SellpiaInventoryLock,
      organizationId: string,
    ) => Promise<unknown>> = [
      (tx, lock, organizationId) => readInventoryAvailability(tx, lock, {
        organizationId,
        sellpiaInventorySkuIds: organizationId === TEST_ORGANIZATION_ID ? [sku.id] : [],
      }),
      (tx, lock, organizationId) => readInventoryAvailabilityCandidates(tx, lock, {
        organizationId,
        query: 'SP',
        limit: 5,
        stockStatus: 'all',
      }),
      (tx, lock, organizationId) => readActiveInventoryMatchingCandidates(tx, lock, organizationId),
    ];
    const committedLock = await prisma.$transaction((tx) =>
      lockSellpiaInventory(tx, TEST_ORGANIZATION_ID));
    const forgeries: Array<(tx: Prisma.TransactionClient) => Promise<{
      lock: SellpiaInventoryLock;
      organizationId: string;
    }>> = [
      async (tx) => {
        const lock = await lockSellpiaInventory(tx, TEST_ORGANIZATION_ID);
        // @ts-expect-error A spread copy loses the private brand, so it is no evidence.
        const copy: SellpiaInventoryLock = { ...lock };
        return { lock: copy, organizationId: TEST_ORGANIZATION_ID };
      },
      async (tx) => {
        const lock = await lockSellpiaInventory(tx, TEST_ORGANIZATION_ID);
        // @ts-expect-error A copy relabelled for another organization is no evidence.
        const relabelled: SellpiaInventoryLock = { ...lock, organizationId: OTHER_ORGANIZATION_ID };
        return { lock: relabelled, organizationId: OTHER_ORGANIZATION_ID };
      },
      async (tx) => {
        // @ts-expect-error Another transaction's evidence pointed at this one is no evidence.
        const repointed: SellpiaInventoryLock = { ...committedLock, tx };
        return { lock: repointed, organizationId: TEST_ORGANIZATION_ID };
      },
    ];

    for (const read of lockedReads) {
      await expect(prisma.$transaction((tx) => read(tx, committedLock, TEST_ORGANIZATION_ID)))
        .rejects.toThrow('Sellpia inventory lock was taken in another transaction');
      await expect(prisma.$transaction(async (tx) =>
        read(tx, await lockSellpiaInventory(tx, OTHER_ORGANIZATION_ID), TEST_ORGANIZATION_ID)))
        .rejects.toThrow('Sellpia inventory lock was taken for another organization');
      for (const forge of forgeries) {
        await expect(prisma.$transaction(async (tx) => {
          const { lock, organizationId } = await forge(tx);
          return read(tx, lock, organizationId);
        })).rejects.toThrow('Sellpia inventory lock evidence was not issued by lockSellpiaInventory');
      }
      await expect(prisma.$transaction(async (tx) => {
        const lock = await lockSellpiaInventory(tx, TEST_ORGANIZATION_ID);
        expect(() => Object.assign(lock, { organizationId: OTHER_ORGANIZATION_ID }))
          .toThrow(TypeError);
        expect(lock.organizationId).toBe(TEST_ORGANIZATION_ID);
        await expect(read(tx, lock, OTHER_ORGANIZATION_ID))
          .rejects.toThrow('Sellpia inventory lock was taken for another organization');
        return read(tx, lock, TEST_ORGANIZATION_ID);
      })).resolves.toBeDefined();
    }
    await expect(underInventoryLock((tx, lock) => lockedReads[0]!(tx, lock, TEST_ORGANIZATION_ID)))
      .resolves.toMatchObject({
        items: [{ sellpiaInventorySkuId: sku.id, currentStock: 7 }],
      });
  });

  it('cannot tell the root client from a transaction client by $transaction', async () => {
    // Prisma 7 transaction clients open nested transactions, so both expose
    // $transaction; only the root client keeps $connect. Passing the root
    // client to lockSellpiaInventory releases the lock at once.
    const surface = (client: object) => {
      const members = client as Record<string, unknown>;
      return {
        $transaction: typeof members.$transaction,
        $connect: typeof members.$connect,
      };
    };

    expect(surface(prisma)).toEqual({ $transaction: 'function', $connect: 'function' });
    await expect(prisma.$transaction(async (tx) => surface(tx)))
      .resolves.toEqual({ $transaction: 'function', $connect: 'undefined' });
  });

  it('holds a reader caller behind a publication that holds the Sellpia lock until it commits', async () => {
    const attempt = await begin('lock-serialization');
    await complete(attempt, snapshot(7)).expect(201);
    const sku = await publishedSku();
    let lockHeld!: () => void;
    const held = new Promise<void>((resolve) => { lockHeld = resolve; });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const publication = prisma.$transaction(async (tx) => {
      await lockSellpiaInventory(tx, TEST_ORGANIZATION_ID);
      lockHeld();
      await released;
      await tx.sellpiaInventorySku.update({
        where: { id: sku.id },
        data: { currentStock: 9 },
      });
    }, { maxWait: 10_000, timeout: 30_000 });
    await held;

    let readSettled = false;
    const read = availability.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [sku.id],
    }).finally(() => {
      readSettled = true;
    });
    try {
      await waitForBlockedAdvisoryLock(prisma);
      expect(readSettled).toBe(false);
    } finally {
      release();
      await publication;
    }
    await expect(read).resolves.toMatchObject({
      items: [{ sellpiaInventorySkuId: sku.id, currentStock: 9, availableStock: 9 }],
    });
  });

  it('keeps one completed basis visible through running/failure and exposes the stale status', async () => {
    const uncollected = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(uncollected).toMatchObject({ items: [], total: 0, latestImport: null });
    expect((await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).status).toBe('refresh_required');

    const first = await begin('consumer-basis-first');
    await complete(first, snapshot(0)).expect(201);

    const firstView = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    const firstItem = firstView.items[0];
    const firstBasis = firstView.latestImport;
    expect(firstItem).toMatchObject({ code: 'SP-001', currentStock: 0 });
    expect(firstBasis).toMatchObject({ id: first.attemptId, status: 'completed' });
    expect(firstItem?.lastImportedAt).toBe(firstBasis?.importedAt);
    expect((await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).status).toBe('fresh');

    const firstAvailability = await availability.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [firstItem!.sellpiaInventorySkuId],
    });
    expect(firstAvailability).toMatchObject({
      snapshot: {
        collected: true,
        generation: '1',
        verifiedAt: firstBasis?.importedAt,
      },
      items: [{ currentStock: 0, availableStock: 0, generation: '1' }],
    });

    const running = await begin('consumer-basis-running');
    expect((await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).status).toBe('syncing');
    const runningView = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(runningView.items[0]).toMatchObject({
      sellpiaInventorySkuId: firstItem!.sellpiaInventorySkuId,
      currentStock: 0,
      lastImportedAt: firstBasis?.importedAt,
    });
    expect(runningView.latestImport).toMatchObject({ id: first.attemptId });

    await fail(running, 'sellpia_network_failed').expect(201);
    expect((await freshness.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).status).toBe('failed');
    const failedView = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    expect(failedView.items[0]).toMatchObject({
      sellpiaInventorySkuId: firstItem!.sellpiaInventorySkuId,
      currentStock: 0,
      lastImportedAt: firstBasis?.importedAt,
    });
    expect(failedView.latestImport).toMatchObject({ id: first.attemptId });
    const failedAvailability = await availability.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [firstItem!.sellpiaInventorySkuId],
    });
    expect(failedAvailability).toMatchObject({
      snapshot: {
        collected: true,
        generation: '1',
        verifiedAt: firstBasis?.importedAt,
      },
      items: [{ currentStock: 0, availableStock: 0, generation: '1' }],
    });

    const newer = await begin('consumer-basis-newer');
    await complete(newer, snapshot(9)).expect(201);
    const newerView = await snapshots.listSnapshot(TEST_ORGANIZATION_ID, {
      page: 1,
      limit: 50,
      stockStatus: 'all',
    });
    const newerItem = newerView.items[0];
    const newerBasis = newerView.latestImport;
    expect(newerItem).toMatchObject({
      sellpiaInventorySkuId: firstItem!.sellpiaInventorySkuId,
      currentStock: 9,
      lastImportedAt: newerBasis?.importedAt,
    });
    expect(newerBasis).toMatchObject({ id: newer.attemptId, status: 'completed' });
    const newerAvailability = await availability.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [newerItem!.sellpiaInventorySkuId],
    });
    expect(newerAvailability).toMatchObject({
      snapshot: {
        collected: true,
        generation: '3',
        verifiedAt: newerBasis?.importedAt,
      },
      items: [{ currentStock: 9, availableStock: 9, generation: '3' }],
    });

    await expectComplete(running, snapshot(9), 409);
  });

  it('rolls back the terminal failure when the Alert write fails', async () => {
    const attempt = await begin('alert-rollback');
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_sellpia_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test alert unavailable'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_sellpia_alert BEFORE UPDATE OR INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION reject_sellpia_alert()`,
    );
    try {
      await fail(attempt, 'sellpia_network_failed').expect(500);
      expect((await get(`/attempts/${attempt.attemptId}`)).body.state).toBe('RUNNING');
      expect(
        await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }),
      ).toMatchObject({ status: 'running' });
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_sellpia_alert ON alerts');
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_sellpia_alert()');
    }
    await fail(attempt, 'sellpia_network_failed').expect(201);
    expect((await get(`/attempts/${attempt.attemptId}`)).body.state).toBe('FAILED');
  });

  function postBegin(key: string, body: Record<string, unknown> = { scope: 'inventory' }) {
    return request(app.getHttpServer())
      .post(base + '/attempts')
      .set('x-test-organization', TEST_ORGANIZATION_ID)
      .set('Idempotency-Key', key)
      .send(body);
  }

  async function begin(key: string) {
    return (await postBegin(key).expect(201)).body as {
      attemptId: string;
      attemptToken: string;
      state: string;
    };
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(base + path)
      .set('x-test-organization', TEST_ORGANIZATION_ID);
  }

  function underInventoryLock<T>(
    read: (tx: Prisma.TransactionClient, lock: SellpiaInventoryLock) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) =>
      read(tx, await lockSellpiaInventory(tx, TEST_ORGANIZATION_ID)));
  }

  function publishedSku() {
    return prisma.sellpiaInventorySku.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-001',
        },
      },
    });
  }

  function cancel(attemptId: string, organizationId = TEST_ORGANIZATION_ID) {
    return request(app.getHttpServer())
      .post(base + `/attempts/${attemptId}/cancel`)
      .set('x-test-organization', organizationId);
  }

  function complete(
    attempt: { attemptId: string; attemptToken: string },
    bytes: Buffer,
    contentType = 'application/json',
    manualFreshExportConfirmed = false,
  ) {
    const completion = request(app.getHttpServer())
      .post(base + `/attempts/${attempt.attemptId}/complete`)
      .set('x-test-organization', TEST_ORGANIZATION_ID)
      .set('X-Source-Attempt-Token', attempt.attemptToken);
    if (manualFreshExportConfirmed) {
      completion.field('manualFreshExportConfirmed', 'true');
    }
    return completion.attach('file', bytes, {
      filename: 'sellpia-inventory-snapshot-v1.json',
      contentType,
    });
  }

  function fail(attempt: { attemptId: string; attemptToken: string }, errorCode: string) {
    return request(app.getHttpServer())
      .post(base + `/attempts/${attempt.attemptId}/fail`)
      .set('x-test-organization', TEST_ORGANIZATION_ID)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send({ errorCode, errorMessage: 'source unavailable' });
  }

  async function expectComplete(
    attempt: { attemptId: string; attemptToken: string },
    bytes: Buffer,
    status: number,
  ) {
    await complete(attempt, bytes).expect(status);
  }

  async function expectCompleteWithToken(
    attempt: { attemptId: string; attemptToken: string },
    token: string,
    bytes: Buffer,
    status: number,
  ) {
    await request(app.getHttpServer())
      .post(base + `/attempts/${attempt.attemptId}/complete`)
      .set('x-test-organization', TEST_ORGANIZATION_ID)
      .set('X-Source-Attempt-Token', token)
      .attach('file', bytes, {
        filename: 'sellpia-inventory-snapshot-v1.json',
        contentType: 'application/json',
      })
      .expect(status);
  }
});

async function waitForBlockedAdvisoryLock(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted
    `;
    if ((row?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the reader caller to wait on the Sellpia lock.');
}

function snapshot(stock: number): Buffer {
  return snapshotFor('SP', '001', stock);
}

function snapshotFor(productCode: string, optionCode: string, stock: number): Buffer {
  return Buffer.from(JSON.stringify({
    source: 'sellpia_product_search',
    version: 1,
    rowCount: 1,
    rows: [{
      productCode,
      optionCode,
      name: '상품',
      optionName: null,
      barcode: '8801234567890',
      currentStock: stock,
      purchasePrice: 100,
      salePrice: 200,
    }],
  }));
}
