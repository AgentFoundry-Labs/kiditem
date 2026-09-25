import { createHash, randomUUID } from 'node:crypto';
import { Injectable, type INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OPERATION_TOKEN_HEADER,
  OperationBeginResponseSchema,
  OperationListResponseSchema,
  type OperationPlanResult,
  type OperationStagedChunk,
  type OperationWindow,
} from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../../test-helpers/real-prisma';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter';
import { OperationsController } from '../adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../application/port/in/operation.port';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../application/port/out/owner/operation-owner.port';
import { OPERATION_REPOSITORY } from '../application/port/out/repository/operation.repository.port';
import { OperationOwner } from '../application/port/out/owner/operation-owner.decorator';
import { OperationOwnerRegistry } from '../application/service/operation-owner.registry';
import { OperationService } from '../application/service/operation.service';

interface FinalizeCall {
  kind: string;
  chunks: OperationStagedChunk[];
  window: OperationWindow | null;
  plan: JsonObject;
}
const finalizeCalls: FinalizeCall[] = [];

/** 더미 owner: scope.lockKeys를 잡고, finalize는 받은 청크를 result에 요약한다. scope.failFinalize면 던진다. */
abstract class EchoOwner implements OperationOwnerPort {
  abstract readonly kind: string;

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const lockKeys = Array.isArray(scope.lockKeys) ? (scope.lockKeys as string[]) : ['org'];
    return {
      plan: { echo: true, failFinalize: scope.failFinalize === true },
      lockKeys,
      ...(scope.window ? { window: scope.window as OperationWindow } : {}),
    };
  }

  async finalize(chunks: OperationStagedChunk[], window: OperationWindow | null, context: OperationFinalizeContext) {
    finalizeCalls.push({ kind: this.kind, chunks, window, plan: context.plan });
    if (context.plan.failFinalize === true) throw new Error('owner ledger write failed');
    return {
      result: {
        chunks: chunks.map((chunk) => `${chunk.chunkKind}#${chunk.sequence}`),
        items: chunks.reduce((total, chunk) => total + chunk.itemCount, 0),
      },
    };
  }
}

@Injectable()
@OperationOwner()
class TestEchoOwner extends EchoOwner {
  readonly kind = 'test.echo';
}

@Injectable()
@OperationOwner()
class TestOtherOwner extends EchoOwner {
  readonly kind = 'test.other';
}

/** 트랜잭션 `size`개가 도착하거나 `timeoutMs`가 지나면 한꺼번에 푸는 장벽. 처음 한 번만 붙잡는다. */
function barrier(size: number, timeoutMs = 500) {
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => { release = resolve; });
  const timer = setTimeout(() => release(), timeoutMs);
  return {
    async arrive() {
      arrived += 1;
      if (arrived > size) return;
      if (arrived === size) {
        clearTimeout(timer);
        release();
      }
      await open;
    },
  };
}
let raceBarriers: { holders: ReturnType<typeof barrier>; firstLock: ReturnType<typeof barrier> } | null = null;

const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

describe('operation contract HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;

  beforeAll(async () => {
    prisma = makeTestPrisma().$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          // 동시 begin 두 개가 모두 "잠금 보유자 없음"을 읽고, 각자 첫 잠금 행을 쓴 뒤에 다음 행으로 가게 한다.
          // 키 순서가 엇갈리면 여기서 교착이 난다. 한쪽이 unique 대기로 못 오면 시간 제한으로 풀린다.
          const holderRead = operation === '$queryRaw' && JSON.stringify(args ?? null).includes('operation_locks');
          const lockWrite = model === 'OperationLock' && operation === 'create';
          if (raceBarriers && (holderRead || lockWrite)) {
            await (holderRead ? raceBarriers.holders : raceBarriers.firstLock).arrive();
          }
          return result;
        },
      },
    }) as unknown as PrismaClient;
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        TestEchoOwner,
        TestOtherOwner,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
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
    finalizeCalls.length = 0;
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const begin = (body: Record<string, unknown>) => request(httpUrl).post('/api/operations').send(body);
  const beginOk = async (body: Record<string, unknown>) => {
    const response = await begin(body).expect(201);
    return OperationBeginResponseSchema.parse(response.body);
  };
  const put = (id: string, token: string, chunkKind: string, sequence: number, payload: unknown[], extra: Record<string, unknown> = {}) =>
    request(httpUrl)
      .put(`/api/operations/${id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, token)
      .send({ checksum: checksum(payload), payload, ...extra });
  const finish = (id: string, token: string, body: Record<string, unknown>) =>
    request(httpUrl).post(`/api/operations/${id}/finish`).set(OPERATION_TOKEN_HEADER, token).send(body);
  const cancel = (id: string) => request(httpUrl).post(`/api/operations/${id}/cancel`).send();
  const list = async (query: string) => {
    const response = await request(httpUrl).get(`/api/operations?${query}`).expect(200);
    return OperationListResponseSchema.parse(response.body).operations;
  };
  const stagedRows = (operationId: string) => prisma.operationChunk.count({ where: { operationId } });
  const lockRows = (operationId: string) => prisma.operationLock.count({ where: { operationId } });

  it('1. begin → chunks → finish(succeeded) hands the chunks to finalize in order and clears staging and locks', async () => {
    const { operation, token, reused } = await beginOk({
      kind: 'test.echo',
      scope: { lockKeys: ['resource:test:1'], window: { start: '2026-09-01', end: '2026-09-24' } },
    });
    expect(reused).toBe(false);
    expect(operation).toMatchObject({ kind: 'test.echo', status: 'executing', lockKeys: ['resource:test:1'], window: { start: '2026-09-01', end: '2026-09-24' } });

    await put(operation.id, token, 'list', 2, [{ id: 'c' }]).expect(200);
    await put(operation.id, token, 'list', 1, [{ id: 'a' }, { id: 'b' }]).expect(200);
    await put(operation.id, token, 'detail', 1, [{ id: 'a', price: 1000 }]).expect(200);

    const finished = await finish(operation.id, token, { outcome: 'succeeded' }).expect(200);
    expect(finished.body.operation).toMatchObject({
      id: operation.id,
      status: 'succeeded',
      result: { chunks: ['detail#1', 'list#1', 'list#2'], items: 4 },
      window: { start: '2026-09-01', end: '2026-09-24' },
      lockKeys: [],
      errorCode: null,
    });
    expect(finished.body.operation.finishedAt).not.toBeNull();
    expect(finalizeCalls).toHaveLength(1);
    expect(finalizeCalls[0].chunks.map((chunk) => [chunk.chunkKind, chunk.sequence, chunk.payload])).toEqual([
      ['detail', 1, [{ id: 'a', price: 1000 }]],
      ['list', 1, [{ id: 'a' }, { id: 'b' }]],
      ['list', 2, [{ id: 'c' }]],
    ]);
    expect(finalizeCalls[0].window).toEqual({ start: '2026-09-01', end: '2026-09-24' });
    expect(await stagedRows(operation.id)).toBe(0);
    expect(await lockRows(operation.id)).toBe(0);
  });

  it('2. a second begin on a held lockKey is refused with OPERATION_IN_PROGRESS naming the running operation', async () => {
    const first = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1', 'org'] } });
    const refused = await begin({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } }).expect(409);
    expect(refused.body).toMatchObject({
      code: 'OPERATION_IN_PROGRESS',
      kind: 'in_progress',
      details: {
        operationId: first.operation.id,
        kind: 'test.echo',
        lockKeys: ['org', 'resource:test:1'],
        startedAt: first.operation.startedAt,
        expiresAt: first.operation.expiresAt,
      },
    });
    expect(await prisma.operation.count()).toBe(1);
  });

  it('3. a different kind on the same lockKey is refused too (the lock unique has no kind)', async () => {
    const first = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:x:1'] } });
    const refused = await begin({ kind: 'test.other', scope: { lockKeys: ['resource:x:1'] } }).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id, kind: 'test.echo' } });
    await beginOk({ kind: 'test.other', scope: { lockKeys: ['resource:x:2'] } });
  });

  it('4. an expired lease refuses the next chunk as expired, frees the key and leaves the operation failed', async () => {
    const stale = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    await put(stale.operation.id, stale.token, 'list', 1, [1]).expect(200);
    await prisma.operation.update({ where: { id: stale.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    const refused = await put(stale.operation.id, stale.token, 'list', 2, [2]).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_FENCE_LOST', details: { operationId: stale.operation.id, reason: 'expired' } });
    const again = await put(stale.operation.id, stale.token, 'list', 2, [2]).expect(409);
    expect(again.body.details).toEqual({ operationId: stale.operation.id, reason: 'expired' });

    const next = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    expect(next.operation.id).not.toBe(stale.operation.id);
    const [old] = (await list('kinds=test.echo')).filter((operation) => operation.id === stale.operation.id);
    expect(old).toMatchObject({ status: 'failed', errorCode: 'OPERATION_FENCE_LOST', errorMessage: 'expired', lockKeys: [] });
    expect(await stagedRows(stale.operation.id)).toBe(0);
  });

  it('4b. begin closes an expired holder in place and takes its key', async () => {
    const stale = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    await prisma.operation.update({ where: { id: stale.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const next = await beginOk({ kind: 'test.other', scope: { lockKeys: ['resource:test:1'] } });
    expect(next.operation.lockKeys).toEqual(['resource:test:1']);
    const old = await prisma.operation.findUniqueOrThrow({ where: { id: stale.operation.id } });
    expect(old).toMatchObject({ status: 'failed', errorCode: 'OPERATION_FENCE_LOST', errorMessage: 'expired' });
  });

  it('5. a chunk after the terminal state is refused as terminal; a wrong token answers not found', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: {} });
    await finish(operation.id, token, { outcome: 'succeeded' }).expect(200);
    const terminal = await put(operation.id, token, 'list', 1, [1]).expect(409);
    expect(terminal.body).toMatchObject({ code: 'OPERATION_FENCE_LOST', details: { operationId: operation.id, reason: 'terminal' } });
    const finishedAgain = await finish(operation.id, token, { outcome: 'succeeded' }).expect(409);
    expect(finishedAgain.body.details).toEqual({ operationId: operation.id, reason: 'terminal' });

    const live = await beginOk({ kind: 'test.echo', scope: {} });
    const wrong = await put(live.operation.id, randomUUID(), 'list', 1, [1]).expect(404);
    expect(wrong.body).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    expect(wrong.body).not.toHaveProperty('details');
    await request(httpUrl).put(`/api/operations/${live.operation.id}/chunks/list/1`).send({ checksum: checksum([1]), payload: [1] }).expect(404);
    await finish(live.operation.id, 'not-a-token', { outcome: 'succeeded' }).expect(404);
    await put(randomUUID(), live.token, 'list', 1, [1]).expect(404);
  });

  it('6. the same (chunkKind, sequence) with the same checksum is an idempotent 200; a different checksum is a chunk conflict', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: {} });
    const first = await put(operation.id, token, 'list', 1, [{ id: 'a' }]).expect(200);
    const resend = await put(operation.id, token, 'list', 1, [{ id: 'a' }]).expect(200);
    expect(resend.body).toMatchObject({ operationId: operation.id, chunkKind: 'list', sequence: 1, itemCount: 1 });
    expect(first.body.itemCount).toBe(1);
    expect(await stagedRows(operation.id)).toBe(1);

    const conflict = await put(operation.id, token, 'list', 1, [{ id: 'b' }]).expect(409);
    expect(conflict.body).toMatchObject({ code: 'OPERATION_FENCE_LOST', details: { operationId: operation.id, reason: 'chunk_conflict' } });
    await finish(operation.id, token, { outcome: 'succeeded' }).expect(200);
    expect(finalizeCalls[0].chunks.map((chunk) => chunk.payload)).toEqual([[{ id: 'a' }]]);
  });

  it('7. every chunk PUT extends the lease', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: {} });
    const shortened = new Date(Date.now() + 60_000);
    await prisma.operation.update({ where: { id: operation.id }, data: { expiresAt: shortened } });
    const first = await put(operation.id, token, 'list', 1, [1]).expect(200);
    expect(new Date(first.body.expiresAt).getTime()).toBeGreaterThan(shortened.getTime() + 25 * 60_000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await put(operation.id, token, 'list', 2, [2], { progress: { done: 2 } }).expect(200);
    expect(new Date(second.body.expiresAt).getTime()).toBeGreaterThan(new Date(first.body.expiresAt).getTime());
    const [view] = await list('kinds=test.echo');
    expect(view).toMatchObject({ expiresAt: second.body.expiresAt, progress: { done: 2 } });
  });

  it('8. finish(failed) never calls finalize, clears staging and locks and records the error code', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    await put(operation.id, token, 'list', 1, [1]).expect(200);
    const failed = await finish(operation.id, token, { outcome: 'failed', errorCode: 'PROVIDER_ERROR', errorMessage: '몰 응답 없음' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_ERROR', errorMessage: '몰 응답 없음', result: null, lockKeys: [] });
    expect(finalizeCalls).toHaveLength(0);
    expect(await stagedRows(operation.id)).toBe(0);
    expect(await lockRows(operation.id)).toBe(0);
    await finish(operation.id, token, { outcome: 'failed' }).expect(400);
  });

  it('9. a throwing finalize rolls the whole finish back: still executing, chunks and locks kept', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: { failFinalize: true, lockKeys: ['resource:test:1'] } });
    await put(operation.id, token, 'list', 1, [1]).expect(200);
    await finish(operation.id, token, { outcome: 'succeeded' }).expect(500);
    expect(finalizeCalls).toHaveLength(1);
    const [view] = await list('kinds=test.echo');
    expect(view).toMatchObject({ id: operation.id, status: 'executing', result: null, finishedAt: null, lockKeys: ['resource:test:1'] });
    expect(await stagedRows(operation.id)).toBe(1);
    expect(await lockRows(operation.id)).toBe(1);
  });

  it('10. cancel closes as cancelled with USER_CANCELLED and cleans up; cancelling a finished operation returns it unchanged', async () => {
    const { operation, token } = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    await put(operation.id, token, 'list', 1, [1]).expect(200);
    const cancelled = await cancel(operation.id).expect(200);
    expect(cancelled.body.operation).toMatchObject({ status: 'cancelled', errorCode: 'USER_CANCELLED', lockKeys: [] });
    expect(await stagedRows(operation.id)).toBe(0);
    expect(await lockRows(operation.id)).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
    const again = await cancel(operation.id).expect(200);
    expect(again.body.operation).toEqual(cancelled.body.operation);
    await put(operation.id, token, 'list', 2, [2]).expect(409);

    const done = await beginOk({ kind: 'test.echo', scope: {} });
    const succeeded = await finish(done.operation.id, done.token, { outcome: 'succeeded' }).expect(200);
    const untouched = await cancel(done.operation.id).expect(200);
    expect(untouched.body.operation).toEqual(succeeded.body.operation);
    await cancel(randomUUID()).expect(404);
  });

  it('11. an idempotencyKey resend returns the same operation reused; different content under the key is refused', async () => {
    const body = { kind: 'test.echo', scope: { lockKeys: ['resource:test:1'], a: 1 }, idempotencyKey: 'begin-1' };
    const first = await beginOk(body);
    const resend = await beginOk({ ...body, scope: { a: 1, lockKeys: ['resource:test:1'] } });
    expect(resend).toMatchObject({ reused: true, token: first.token, operation: { id: first.operation.id } });
    // sha256('{"fileHash":null,"kind":"test.echo","scope":{"a":1,"lockKeys":["resource:test:1"]}}')
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: first.operation.id } })).requestHash)
      .toBe('dc9e5b74e9ff258a8149b5aad260e10cd53bbc5a628caeda4a9d12284afdb4d6');
    const refused = await begin({ ...body, scope: { lockKeys: ['resource:test:1'], a: 2 } }).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'idempotency_key_reused' } });
    expect(await prisma.operation.count()).toBe(1);
  });

  it('12. the reader shows several kinds in one call, filters by status and limit, and shows an expired operation as failed', async () => {
    const echo = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } });
    const other = await beginOk({ kind: 'test.other', scope: { lockKeys: ['resource:test:2'] } });
    const done = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:test:3'] } });
    await finish(done.operation.id, done.token, { outcome: 'succeeded' }).expect(200);
    await prisma.operation.update({ where: { id: other.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    const both = await list('kinds=test.echo,test.other');
    expect(both.map((operation) => operation.id)).toEqual([done.operation.id, other.operation.id, echo.operation.id]);
    expect(both.find((operation) => operation.id === other.operation.id)).toMatchObject({ status: 'failed', errorMessage: 'expired', lockKeys: [] });
    expect((await list('kinds=test.echo')).map((operation) => operation.id)).toEqual([done.operation.id, echo.operation.id]);
    expect((await list('kinds=test.echo,test.other&status=executing')).map((operation) => operation.id)).toEqual([echo.operation.id]);
    expect(await list('kinds=test.echo,test.other&limit=1')).toHaveLength(1);
    for (const operation of both) expect(operation).not.toHaveProperty('token');
    await request(httpUrl).get('/api/operations').expect(400);
    await request(httpUrl).get('/api/operations?kinds=Bad-Kind').expect(400);
  });


  it('13. concurrent begins on overlapping keys admit exactly one and refuse the other, whatever order the keys come in', async () => {
    const statuses = async (bodies: Array<Record<string, unknown>>) => {
      raceBarriers = { holders: barrier(bodies.length), firstLock: barrier(bodies.length) };
      try {
        const responses = await Promise.all(bodies.map((body) => begin(body)));
        return { responses, codes: responses.map((response) => response.status).sort() };
      } finally {
        raceBarriers = null;
      }
    };
    const same = await statuses([
      { kind: 'test.echo', scope: { lockKeys: ['resource:test:1'] } },
      { kind: 'test.other', scope: { lockKeys: ['resource:test:1'] } },
    ]);
    expect(same.codes).toEqual([201, 409]);
    expect(same.responses.find((response) => response.status === 409)!.body.code).toBe('OPERATION_IN_PROGRESS');

    for (let round = 0; round < 3; round += 1) {
      await resetDb(prisma);
      const crossed = await statuses([
        { kind: 'test.echo', scope: { lockKeys: ['resource:test:x', 'resource:test:y'] } },
        { kind: 'test.other', scope: { lockKeys: ['resource:test:y', 'resource:test:x'] } },
      ]);
      expect(crossed.codes).toEqual([201, 409]);
      expect(crossed.responses.find((response) => response.status === 409)!.body.code).toBe('OPERATION_IN_PROGRESS');
      expect(await prisma.operationLock.count()).toBe(2);
    }
  });


  it('14. the same fileHash applies once per kind: refused after success, restartable after failure or cancel', async () => {
    const file = 'f'.repeat(64);
    const applied = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:file:1'] }, fileHash: file });
    await finish(applied.operation.id, applied.token, { outcome: 'succeeded' }).expect(200);
    const refused = await begin({ kind: 'test.echo', scope: { lockKeys: ['resource:file:1'] }, fileHash: file }).expect(409);
    expect(refused.body).toMatchObject({
      code: 'DB_CONFLICT',
      details: { reason: 'file_already_applied', existing: { operationId: applied.operation.id } },
    });
    await beginOk({ kind: 'test.other', scope: { lockKeys: ['resource:file:2'] }, fileHash: file });

    const other = 'e'.repeat(64);
    const failed = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:file:3'] }, fileHash: other });
    await finish(failed.operation.id, failed.token, { outcome: 'failed', errorCode: 'PARSE_ERROR' }).expect(200);
    const retried = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:file:3'] }, fileHash: other });
    expect(retried.operation.id).not.toBe(failed.operation.id);
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: failed.operation.id } })).fileHash).toBeNull();

    await cancel(retried.operation.id).expect(200);
    const again = await beginOk({ kind: 'test.echo', scope: { lockKeys: ['resource:file:3'] }, fileHash: other });
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: retried.operation.id } })).fileHash).toBeNull();
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: again.operation.id } })).fileHash).toBe(other);
  });

});
