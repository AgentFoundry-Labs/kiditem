import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../../test-helpers/real-prisma';
import { ownerTransaction } from '../../../prisma/owner-transaction';
import { OperationRepositoryAdapter } from '../adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT, type OperationPort } from '../application/port/in/operation.port';
import type {
  JsonObject,
  OperationFailedContext,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../application/port/out/owner/operation-owner.port';
import { OPERATION_REPOSITORY } from '../application/port/out/repository/operation.repository.port';
import { OperationOwner } from '../application/port/out/owner/operation-owner.decorator';
import { OperationOwnerRegistry } from '../application/service/operation-owner.registry';
import { OperationService } from '../application/service/operation.service';

const finalized: Array<{ operationId: string; chunks: OperationStagedChunk[] }> = [];
const failures: Array<Pick<OperationFailedContext, 'operationId' | 'errorCode' | 'errorMessage' | 'attempts'>> = [];

/** 서버 워커가 돌리는 kind: 60초 임대, 최종 실패에 onFailed. */
@Injectable()
@OperationOwner()
class WorkerOwner implements OperationOwnerPort {
  readonly kind = 'test.worker';
  readonly leaseMs = 60_000;

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    return { plan: { job: scope.job ?? null }, lockKeys: [String(scope.lockKey ?? 'resource:job:1')] };
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    finalized.push({ operationId: context.operationId, chunks });
    return { result: { projected: chunks.length } };
  }

  async onFailed(context: OperationFailedContext) {
    failures.push({
      operationId: context.operationId,
      errorCode: context.errorCode,
      errorMessage: context.errorMessage,
      attempts: context.attempts,
    });
  }
}

/** 브라우저가 begin하는 kind: 기본 30분 임대. */
@Injectable()
@OperationOwner()
class BrowserOwner implements OperationOwnerPort {
  readonly kind = 'test.browser';
  async plan(): Promise<OperationPlanResult> {
    return { plan: {}, lockKeys: ['resource:browser:1'] };
  }
  async finalize() {
    return {};
  }
}

const EMPTY_CHECKSUM = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'; // sha256('[]')

describe('operation contract — server-driven kinds (prepare · claim · retry · onFailed · kind lease)', () => {
  let prisma: PrismaClient;
  let operations: OperationPort;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        WorkerOwner,
        BrowserOwner,
      ],
    }).compile();
    await module.init();
    operations = module.get(OPERATION_PORT);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    finalized.length = 0;
    failures.length = 0;
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const prepare = (scope: JsonObject = {}, extra: { maxAttempts?: number; scheduledFor?: string } = {}) =>
    operations.prepare(ORG, { kind: 'test.worker', scope, maxAttempts: extra.maxAttempts ?? 3, ...(extra.scheduledFor ? { scheduledFor: extra.scheduledFor } : {}) });
  const claim = () => operations.claim({ kinds: ['test.worker'], workerId: 'worker-a' });
  const heartbeat = (operationId: string, token: string, progress?: JsonObject) =>
    operations.putChunk({
      organizationId: ORG,
      operationId,
      token,
      chunkKind: 'heartbeat',
      sequence: 1,
      request: { checksum: EMPTY_CHECKSUM, payload: [], ...(progress ? { progress } : {}) },
    });
  const failAttempt = (operationId: string, token: string, retryAfterMs?: number) =>
    operations.finish({
      organizationId: ORG,
      operationId,
      token,
      request: { outcome: 'failed', errorCode: 'provider_timeout', errorMessage: '시간 초과', ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
    });
  const lockRows = (operationId: string) => prisma.operationLock.count({ where: { operationId } });
  const chunkRows = (operationId: string) => prisma.operationChunk.count({ where: { operationId } });
  const dueNow = (operationId: string) => prisma.operation.update({ where: { id: operationId }, data: { scheduledFor: new Date(Date.now() - 1_000) } });

  it('1. prepare → claim → heartbeat extends the lease → finish(succeeded) → finalize writes the ledger once', async () => {
    const { operation: prepared, reused } = await prepare({ job: 'a' });
    expect(reused).toBe(false);
    expect(prepared).toMatchObject({ status: 'prepared', attempts: 0, maxAttempts: 3, scheduledFor: null, lockKeys: ['resource:job:1'] });

    const claimed = (await claim())!;
    expect(claimed.operation).toMatchObject({ id: prepared.id, status: 'executing', attempts: 1, plan: { job: 'a' } });
    expect(claimed.organizationId).toBe(ORG);
    await prisma.operation.update({ where: { id: prepared.id }, data: { expiresAt: new Date(Date.now() + 5_000) } });
    const beat = await heartbeat(prepared.id, claimed.token, { checkpoint: 'result_saved' });
    expect(new Date(beat.expiresAt).getTime()).toBeGreaterThan(Date.now() + 50_000);

    const done = await operations.finish({ organizationId: ORG, operationId: prepared.id, token: claimed.token, request: { outcome: 'succeeded' } });
    expect(done.operation).toMatchObject({ status: 'succeeded', result: { projected: 1 }, progress: { checkpoint: 'result_saved' }, lockKeys: [] });
    expect(finalized.map((call) => call.operationId)).toEqual([prepared.id]);
    expect(await claim()).toBeNull();
  });

  it('2. two retried failures and a third failure end terminal failed, onFailed exactly once, no chunks or locks left', async () => {
    const { operation } = await prepare();
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const claimed = (await claim())!;
      expect(claimed.operation.attempts).toBe(attempt);
      await heartbeat(operation.id, claimed.token);
      const retried = await failAttempt(operation.id, claimed.token, 30_000);
      expect(retried.operation).toMatchObject({ status: 'prepared', errorCode: 'provider_timeout', lockKeys: ['resource:job:1'] });
      expect(await chunkRows(operation.id)).toBe(0);
      await dueNow(operation.id);
    }
    const last = (await claim())!;
    expect(last.operation.attempts).toBe(3);
    const failed = await failAttempt(operation.id, last.token, 30_000);
    expect(failed.operation).toMatchObject({ status: 'failed', errorCode: 'provider_timeout', lockKeys: [] });
    expect(failures).toEqual([{ operationId: operation.id, errorCode: 'provider_timeout', errorMessage: '시간 초과', attempts: 3 }]);
    expect(await lockRows(operation.id)).toBe(0);
    expect(await chunkRows(operation.id)).toBe(0);
    expect(await claim()).toBeNull();
  });

  it('3. another worker claims an executing operation whose lease ran out; the old token then answers not found', async () => {
    const { operation } = await prepare();
    const first = (await claim())!;
    await heartbeat(operation.id, first.token, { checkpoint: 'result_saved' });
    await prisma.operation.update({ where: { id: operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    const second = (await operations.claim({ kinds: ['test.worker'], workerId: 'worker-b' }))!;
    expect(second.operation).toMatchObject({ id: operation.id, status: 'executing', attempts: 2, progress: { checkpoint: 'result_saved' } });
    expect(second.token).not.toBe(first.token);
    expect(await chunkRows(operation.id)).toBe(1);
    await expect(heartbeat(operation.id, first.token)).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await expect(failAttempt(operation.id, first.token)).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await heartbeat(operation.id, second.token);
  });

  it('4. two concurrent claims take the one candidate exactly once', async () => {
    const { operation } = await prepare();
    const results = await Promise.all([claim(), operations.claim({ kinds: ['test.worker'], workerId: 'worker-b' })]);
    const taken = results.filter((result) => result !== null);
    expect(taken).toHaveLength(1);
    expect(taken[0]!.operation).toMatchObject({ id: operation.id, attempts: 1 });
  });

  it('5. a second prepare on a held lockKey is refused with OPERATION_IN_PROGRESS naming the prepared operation', async () => {
    const { operation } = await prepare({ lockKey: 'resource:job:7' });
    await expect(prepare({ lockKey: 'resource:job:7' })).rejects.toMatchObject({
      code: 'OPERATION_IN_PROGRESS',
      details: { operationId: operation.id, kind: 'test.worker', lockKeys: ['resource:job:7'] },
    });
    await expect(operations.begin(ORG, { kind: 'test.browser', scope: {} })).resolves.toMatchObject({ reused: false });
    expect(await prisma.operation.count({ where: { kind: 'test.worker' } })).toBe(1);
  });

  it('5b. prepare joins the owner transaction: a rolled back owner write leaves no operation', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await operations.prepare(ORG, { kind: 'test.worker', scope: {}, maxAttempts: 3 }, ownerTransaction(tx));
      throw new Error('owner ledger write failed');
    })).rejects.toThrow('owner ledger write failed');
    expect(await prisma.operation.count()).toBe(0);
    expect(await prisma.operationLock.count()).toBe(0);
  });

  it('6. a kind lease of sixty seconds applies to claim and to every fenced write; begin keeps thirty minutes', async () => {
    await prepare();
    const before = Date.now();
    const claimed = (await claim())!;
    const lease = new Date(claimed.operation.expiresAt).getTime() - before;
    expect(lease).toBeGreaterThanOrEqual(59_000);
    expect(lease).toBeLessThanOrEqual(61_000);
    const beat = await heartbeat(claimed.operation.id, claimed.token);
    expect(new Date(beat.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(61_000);

    const browser = await operations.begin(ORG, { kind: 'test.browser', scope: {} });
    expect(new Date(browser.operation.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  it('7. cancel closes a prepared operation: USER_CANCELLED, lock released, never claimed, onFailed not called', async () => {
    const { operation } = await prepare();
    const cancelled = await operations.cancel(ORG, operation.id);
    expect(cancelled.operation).toMatchObject({ status: 'cancelled', errorCode: 'USER_CANCELLED', lockKeys: [] });
    expect(await lockRows(operation.id)).toBe(0);
    expect(await claim()).toBeNull();
    expect(failures).toEqual([]);

    const again = await prepare();
    await prisma.$transaction(async (tx) => {
      await operations.cancel(ORG, again.operation.id, ownerTransaction(tx));
    });
    expect((await operations.list(ORG, { kinds: ['test.worker'], status: 'cancelled', limit: 10 })).operations).toHaveLength(2);
  });

  it('8. an operation waiting for its retry (prepared, scheduled in the future) is not claimed and shows in the reader', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const { operation } = await prepare({}, { scheduledFor: future });
    expect(await claim()).toBeNull();
    const waiting = await operations.list(ORG, { kinds: ['test.worker'], status: 'prepared', limit: 10 });
    expect(waiting.operations).toEqual([expect.objectContaining({ id: operation.id, status: 'prepared', scheduledFor: future })]);
    await dueNow(operation.id);
    expect((await claim())!.operation.id).toBe(operation.id);
  });

  it('9. a failed finish without retryAfterMs is terminal on the first attempt even with attempts left', async () => {
    const { operation } = await prepare();
    const claimed = (await claim())!;
    const failed = await failAttempt(operation.id, claimed.token);
    expect(failed.operation).toMatchObject({ status: 'failed', attempts: 1, maxAttempts: 3, lockKeys: [] });
    expect(failures).toHaveLength(1);
    expect(await claim()).toBeNull();
  });

  it('9b. a lease that runs out on the last attempt is closed failed by the next claim and calls onFailed', async () => {
    const { operation } = await prepare({}, { maxAttempts: 1 });
    await claim();
    await prisma.operation.update({ where: { id: operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect(await claim()).toBeNull();
    const [closed] = (await operations.list(ORG, { kinds: ['test.worker'], limit: 10 })).operations;
    expect(closed).toMatchObject({ status: 'failed', errorCode: 'OPERATION_FENCE_LOST', errorMessage: 'expired', lockKeys: [] });
    expect(failures).toEqual([{ operationId: operation.id, errorCode: 'OPERATION_FENCE_LOST', errorMessage: 'expired', attempts: 1 }]);
  });

  it('10. an operation opened by begin reads attempts 1 of 1 with no schedule (regression)', async () => {
    const { operation } = await operations.begin(ORG, { kind: 'test.browser', scope: {} });
    expect(operation).toMatchObject({ status: 'executing', attempts: 1, maxAttempts: 1, scheduledFor: null });
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(row).toMatchObject({ attempts: 1, maxAttempts: 1, scheduledFor: null });
  });

  it('11. get reads one operation (expiring a lapsed lease first) and answers null for another organization or id', async () => {
    const { operation } = await prepare({}, { maxAttempts: 1 });
    await claim();
    await prisma.operation.update({ where: { id: operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect(await operations.get(ORG, operation.id)).toMatchObject({ id: operation.id, status: 'failed', errorMessage: 'expired' });
    expect(failures).toHaveLength(1);
    expect(await operations.get('00000000-0000-4000-8000-000000000000', operation.id)).toBeNull();
    expect(await operations.get(ORG, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('12. findLive names the operation holding a lockKey, inside an owner transaction too, and null once it is terminal', async () => {
    const { operation } = await prepare({ lockKey: 'resource:job:9' });
    expect(await operations.findLive(ORG, 'resource:job:9')).toMatchObject({ id: operation.id, status: 'prepared' });
    await prisma.$transaction(async (tx) => {
      const live = await operations.findLive(ORG, 'resource:job:9', ownerTransaction(tx));
      await operations.cancel(ORG, live!.id, ownerTransaction(tx));
    });
    expect(await operations.findLive(ORG, 'resource:job:9')).toBeNull();
    expect(await operations.findLive(ORG, 'resource:job:10')).toBeNull();
  });

  it('13. readers take no row lock: get and list answer while another transaction holds the running operation', async () => {
    const { operation } = await prepare();
    const claimed = (await claim())!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => { locked = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM operations WHERE id = ${operation.id}::uuid FOR UPDATE`;
      locked();
      await held;
    }, { timeout: 10_000 });
    await lockTaken;
    try {
      const within = <T>(work: Promise<T>) => Promise.race([
        work,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('reader waited on a row lock')), 2_000)),
      ]);
      await expect(within(operations.get(ORG, operation.id))).resolves.toMatchObject({ id: operation.id, status: 'executing' });
      await expect(within(operations.list(ORG, { kinds: ['test.worker'], limit: 10 }))).resolves.toMatchObject({
        operations: [expect.objectContaining({ id: operation.id, status: 'executing', expiresAt: claimed.operation.expiresAt })],
      });
    } finally {
      release();
      await holder;
    }
  });
});
