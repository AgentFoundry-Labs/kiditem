import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATION_CHUNK_MAX_BYTES, OPERATION_CHUNKS_MAX, OPERATION_LEASE_MS, type OperationView } from '@kiditem/shared/operation';
import type { BrowserLease, BrowserResources } from './browser';
import { RuntimeError } from './errors';
import type { OperationClient } from './operation-client';
import { createRunner, type RunnableCollector, type RunnableChunk } from './runner';

const OP = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

function view(overrides: Partial<OperationView> = {}): OperationView {
  return {
    id: OP,
    kind: 'test.echo',
    status: 'executing',
    lockKeys: ['org'],
    plan: { echo: true },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-25T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

type Step = string;

/** 서버 경계(operation client)와 브라우저 경계의 가짜. 호출 순서를 한 줄로 기록한다. */
function harness(options: {
  reused?: boolean;
  beginError?: RuntimeError;
  putDelay?: (chunkKind: string) => Promise<void> | undefined;
  putError?: (sequence: number, chunkKind: string) => RuntimeError | null;
  finishError?: RuntimeError;
} = {}) {
  const steps: Step[] = [];
  const puts: Array<{ chunkKind: string; sequence: number; payload: unknown[]; progress?: Record<string, unknown> }> = [];
  const finishes: Array<Record<string, unknown>> = [];
  let releases = 0;
  const releaseErrors: unknown[] = [];
  const client: OperationClient = {
    async begin(request) {
      steps.push(`begin:${request.kind}`);
      if (options.beginError) throw options.beginError;
      return { operation: view({ kind: request.kind }), token: TOKEN, reused: options.reused ?? false };
    },
    async putChunk(input) {
      steps.push(`put:${input.chunkKind}#${input.sequence}`);
      expect(input.token).toBe(TOKEN);
      puts.push({ chunkKind: input.chunkKind, sequence: input.sequence, payload: input.payload, progress: input.progress });
      const delay = options.putDelay?.(input.chunkKind);
      if (delay) {
        await delay;
        steps.push(`put-done:${input.chunkKind}#${input.sequence}`);
      }
      const error = options.putError?.(input.sequence, input.chunkKind);
      if (error) throw error;
      return { operationId: OP, chunkKind: input.chunkKind, sequence: input.sequence, itemCount: input.payload.length, expiresAt: '2026-09-25T00:30:00.000Z' };
    },
    async finish(input) {
      steps.push(`finish:${input.request.outcome}`);
      finishes.push(input.request as Record<string, unknown>);
      if (options.finishError) throw options.finishError;
      return { operation: view({ status: input.request.outcome, result: input.request.result ?? null }) };
    },
    async cancel() {
      throw new Error('runner never cancels');
    },
  };
  const acquired: Array<{ operationId: string; lockKeys: readonly string[]; site?: string | null }> = [];
  const browser: BrowserResources = {
    async acquire(input) {
      steps.push('acquire');
      acquired.push({ operationId: input.operationId, lockKeys: input.lockKeys, site: input.site });
      const lease: BrowserLease = {
        tabId: null,
        async release(outcome) {
          steps.push('release');
          releases += 1;
          releaseErrors.push(outcome?.error ?? null);
        },
      };
      return lease;
    },
  };
  return { steps, puts, finishes, acquired, client, browser, releaseErrors, releases: () => releases };
}

function collector(chunks: RunnableChunk[] | ((signal: AbortSignal) => AsyncIterable<RunnableChunk>), extra: Partial<RunnableCollector> = {}): RunnableCollector {
  return {
    site: null,
    collect: (_plan, _site, context) =>
      typeof chunks === 'function'
        ? chunks(context.signal)
        : (async function* () {
          yield* chunks;
        })(),
    ...extra,
  };
}

const echoChunk = (n: number): RunnableChunk => ({ chunkKind: 'echo', payload: [{ i: n }], progress: { done: n } });

function runWith(h: ReturnType<typeof harness>, c: RunnableCollector | null, signal = new AbortController().signal) {
  const runner = createRunner({ client: h.client, browser: h.browser, siteFor: () => null }, () => c);
  return runner.run({ kind: 'test.echo', scope: {}, signal });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createRunner — 실행 하나의 순서', () => {
  it('브라우저 자원에 수집기가 선언한 사이트 이름을 넘긴다(account 잠금이 그 사이트의 탭을 열도록)', async () => {
    const h = harness();

    await runWith(h, collector([echoChunk(1)], { site: 'supplier' }));

    expect(h.acquired).toEqual([{ operationId: OP, lockKeys: ['org'], site: 'supplier' }]);
  });

  it('begin → acquire → 청크마다 put → finish(succeeded) → release, 순번은 chunkKind별 1..n', async () => {
    const h = harness();
    const c = collector(
      [echoChunk(1), { chunkKind: 'detail', payload: [{ d: 1 }] }, echoChunk(2)],
      { summarize: ({ chunks, items }) => ({ result: { chunks, items }, window: { start: '2026-09-01', end: '2026-09-02' } }) },
    );

    const outcome = await runWith(h, c);

    expect(h.steps).toEqual(['begin:test.echo', 'acquire', 'put:echo#1', 'put:detail#1', 'put:echo#2', 'finish:succeeded', 'release']);
    expect(h.acquired).toEqual([{ operationId: OP, lockKeys: ['org'], site: null }]);
    expect(h.puts[0]).toEqual({ chunkKind: 'echo', sequence: 1, payload: [{ i: 1 }], progress: { done: 1 } });
    expect(h.finishes).toEqual([
      { outcome: 'succeeded', result: { chunks: 3, items: 3 }, window: { start: '2026-09-01', end: '2026-09-02' } },
    ]);
    expect(outcome).toMatchObject({ kind: 'finished', operation: { status: 'succeeded' } });
  });

  it('begin이 성공하면 수집 전에 onBegun으로 operationId·reused를 알린다', async () => {
    const h = harness();
    const seen: Array<{ operationId: string; reused: boolean; stepsSoFar: string[] }> = [];
    const runner = createRunner({ client: h.client, browser: h.browser, siteFor: () => null }, () => collector([echoChunk(1)]));

    await runner.run({
      kind: 'test.echo',
      scope: {},
      signal: new AbortController().signal,
      onBegun: (begun) => seen.push({ ...begun, stepsSoFar: [...h.steps] }),
    });

    expect(seen).toEqual([{ operationId: OP, reused: false, stepsSoFar: ['begin:test.echo'] }]);
  });

  it('OPERATION_IN_PROGRESS면 acquire 없이 기존 실행을 돌려준다', async () => {
    const existing = { operationId: OP, kind: 'test.echo', lockKeys: ['org'], startedAt: '2026-09-25T00:00:00.000Z', expiresAt: '2026-09-25T00:30:00.000Z' };
    const h = harness({ beginError: new RuntimeError('OPERATION_IN_PROGRESS', '진행 중', existing) });

    const outcome = await runWith(h, collector([echoChunk(1)]));

    expect(outcome).toEqual({ kind: 'already_running', existing, message: '진행 중' });
    expect(h.steps).toEqual(['begin:test.echo']);
  });

  it('begin이 살아 있는 실행을 reused로 돌려주면 수집·cancel 없이 already_running(그 실행)으로 끝난다', async () => {
    const h = harness({ reused: true });
    const begun: unknown[] = [];
    const runner = createRunner({ client: h.client, browser: h.browser, siteFor: () => null }, () => collector([echoChunk(1)]));

    const outcome = await runner.run({ kind: 'test.echo', scope: {}, idempotencyKey: 'k1', signal: new AbortController().signal, onBegun: (b) => begun.push(b) });

    expect(outcome).toEqual({
      kind: 'already_running',
      existing: { operationId: OP, kind: 'test.echo', lockKeys: ['org'], startedAt: '2026-09-25T00:00:00.000Z', expiresAt: '2026-09-25T00:30:00.000Z' },
      reused: true,
    });
    expect(h.steps).toEqual(['begin:test.echo']);
    expect(begun).toEqual([]);
  });

  it('begin의 그 밖 거절은 finish 없이 failed(operationId null)', async () => {
    const h = harness({ beginError: new RuntimeError('VALIDATION_FAILED', '입력값', null) });

    const outcome = await runWith(h, collector([echoChunk(1)]));

    expect(outcome).toEqual({ kind: 'failed', operationId: null, errorCode: 'VALIDATION_FAILED', errorMessage: '입력값' });
    expect(h.steps).toEqual(['begin:test.echo']);
  });

  it('등록된 수집기가 없는 kind는 begin하지 않는다', async () => {
    const h = harness();

    const outcome = await runWith(h, null);

    expect(outcome).toMatchObject({ kind: 'failed', operationId: null, errorCode: 'RUNTIME_UNKNOWN_KIND' });
    expect(h.steps).toEqual([]);
  });

  it('청크 도중 fence_lost면 수집을 멈추고 finish 없이 release 1회', async () => {
    const h = harness({
      putError: (sequence) => (sequence === 2 ? new RuntimeError('OPERATION_FENCE_LOST', '만료', { operationId: OP, reason: 'expired' }) : null),
    });

    const outcome = await runWith(h, collector([echoChunk(1), echoChunk(2), echoChunk(3)]));

    expect(outcome).toEqual({ kind: 'fence_lost', operationId: OP, reason: 'expired' });
    expect(h.steps).toEqual(['begin:test.echo', 'acquire', 'put:echo#1', 'put:echo#2', 'release']);
    expect(h.releases()).toBe(1);
  });

  it('토큰 불일치(OPERATION_NOT_FOUND)도 fence_lost처럼 finish를 보내지 않는다', async () => {
    const h = harness({ putError: () => new RuntimeError('OPERATION_NOT_FOUND', '없음', null) });

    const outcome = await runWith(h, collector([echoChunk(1)]));

    expect(outcome).toEqual({ kind: 'fence_lost', operationId: OP, reason: null });
    expect(h.finishes).toEqual([]);
  });

  it('put의 그 밖 거절은 finish(failed, 그 코드)를 보낸다', async () => {
    const h = harness({ putError: () => new RuntimeError('VALIDATION_FAILED', '청크가 너무 큽니다', { reason: 'chunk_too_large' }) });

    const outcome = await runWith(h, collector([echoChunk(1)]));

    expect(h.finishes).toEqual([{ outcome: 'failed', errorCode: 'VALIDATION_FAILED', errorMessage: '청크가 너무 큽니다' }]);
    expect(outcome).toEqual({ kind: 'failed', operationId: OP, errorCode: 'VALIDATION_FAILED', errorMessage: '청크가 너무 큽니다', details: { reason: 'chunk_too_large' } });
    expect(h.releases()).toBe(1);
  });

  it('finish(failed)마저 실패해도 삼키고 failed로 끝난다', async () => {
    const h = harness({
      putError: () => new RuntimeError('VALIDATION_FAILED', 'x', null),
      finishError: new RuntimeError('RUNTIME_API_UNREACHABLE', '연결 안 됨', null),
    });

    const outcome = await runWith(h, collector([echoChunk(1)]));

    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'VALIDATION_FAILED' });
    expect(h.releases()).toBe(1);
  });

  it('수집기 예외는 finish(failed, RUNTIME_COLLECT_FAILED)·release 1회', async () => {
    const h = harness();
    const c = collector(async function* () {
      yield echoChunk(1);
      throw new Error('boom');
    });

    const outcome = await runWith(h, c);

    expect(h.steps).toEqual(['begin:test.echo', 'acquire', 'put:echo#1', 'finish:failed', 'release']);
    expect(h.finishes).toEqual([{ outcome: 'failed', errorCode: 'RUNTIME_COLLECT_FAILED', errorMessage: 'boom' }]);
    expect(outcome).toMatchObject({ kind: 'failed', operationId: OP, errorCode: 'RUNTIME_COLLECT_FAILED' });
  });

  it('수집기가 RuntimeError를 던지면 그 코드로 finish(failed)', async () => {
    const h = harness();
    const c = collector(async function* () {
      throw new RuntimeError('SITE_LOGIN_REQUIRED', '로그인 필요', null);
    });

    await runWith(h, c);

    expect(h.finishes).toEqual([{ outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인 필요' }]);
  });

  it('release에 실행을 끝낸 오류를 넘긴다(운영자가 풀 탭을 남기도록), 성공이면 오류 없음', async () => {
    const failed = harness();
    await runWith(failed, collector(async function* () {
      throw new RuntimeError('SITE_LOGIN_REQUIRED', '로그인 필요', null);
    }));
    expect(failed.releaseErrors).toEqual([expect.objectContaining({ code: 'SITE_LOGIN_REQUIRED' })]);

    const ok = harness();
    await runWith(ok, collector([echoChunk(1)]));
    expect(ok.releaseErrors).toEqual([null]);
  });

  it('abort되면 수집을 멈추고 finish 없이 release 1회', async () => {
    const h = harness();
    const controller = new AbortController();
    const c = collector(async function* () {
      yield echoChunk(1);
      controller.abort();
      yield echoChunk(2);
      yield echoChunk(3);
    });

    const outcome = await runWith(h, c, controller.signal);

    expect(h.steps).toEqual(['begin:test.echo', 'acquire', 'put:echo#1', 'release']);
    expect(outcome).toMatchObject({ kind: 'failed', operationId: OP, errorCode: 'USER_CANCELLED' });
  });

  it('acquire가 실패하면 finish(failed)를 보내고 release할 것이 없다', async () => {
    const h = harness();
    const browser: BrowserResources = {
      async acquire() {
        throw new RuntimeError('RUNTIME_BROWSER_UNAVAILABLE', '탭을 열 수 없습니다', null);
      },
    };
    const runner = createRunner({ client: h.client, browser, siteFor: () => null }, () => collector([echoChunk(1)]));

    const outcome = await runner.run({ kind: 'test.echo', scope: {}, signal: new AbortController().signal });

    expect(h.finishes).toEqual([{ outcome: 'failed', errorCode: 'RUNTIME_BROWSER_UNAVAILABLE', errorMessage: '탭을 열 수 없습니다' }]);
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'RUNTIME_BROWSER_UNAVAILABLE' });
  });

  it('청크가 1MB를 넘으면 RUNTIME_CHUNK_TOO_LARGE로 거절하고 올리지 않는다', async () => {
    const h = harness();
    const big = 'x'.repeat(OPERATION_CHUNK_MAX_BYTES);

    const outcome = await runWith(h, collector([{ chunkKind: 'echo', payload: [big] }]));

    expect(h.puts).toEqual([]);
    expect(h.finishes).toEqual([expect.objectContaining({ outcome: 'failed', errorCode: 'RUNTIME_CHUNK_TOO_LARGE' })]);
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'RUNTIME_CHUNK_TOO_LARGE' });
  });

  it('수집기의 빈 청크는 임대 연장으로만 보내고 청크 수·순번에 세지 않는다', async () => {
    const h = harness();
    const summarized: unknown[] = [];
    const c = collector(
      [
        { chunkKind: 'echo', payload: [{ i: 1 }] },
        { chunkKind: 'echo', payload: [], progress: { waiting: true } },
        { chunkKind: 'echo', payload: [{ i: 2 }] },
      ],
      { summarize: (input) => { summarized.push(input); return {}; } },
    );

    await runWith(h, c);

    expect(h.puts.map((put) => [put.chunkKind, put.sequence, put.payload.length])).toEqual([
      ['echo', 1, 1],
      ['echo', 2, 0],
      ['echo', 2, 1],
    ]);
    expect(summarized).toEqual([{ chunks: 2, items: 2 }]);
  });

  it('수집기가 예약된 chunkKind heartbeat를 쓰면 올리지 않고 finish(failed, RUNTIME_COLLECT_FAILED{reserved_chunk_kind})', async () => {
    const h = harness();

    const outcome = await runWith(h, collector([{ chunkKind: 'heartbeat', payload: [{ i: 1 }] }]));

    expect(h.puts).toEqual([]);
    expect(h.finishes).toEqual([expect.objectContaining({ outcome: 'failed', errorCode: 'RUNTIME_COLLECT_FAILED' })]);
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'RUNTIME_COLLECT_FAILED', details: { reason: 'reserved_chunk_kind' } });
  });

  it('1,001번째 청크는 올리지 않고 finish(failed, RUNTIME_CHUNK_TOO_LARGE{too_many_chunks})', async () => {
    const h = harness();
    const c = collector(async function* () {
      for (let n = 1; n <= OPERATION_CHUNKS_MAX + 1; n += 1) yield { chunkKind: 'echo', payload: [{ n }] };
    });

    const outcome = await runWith(h, c);

    expect(h.puts).toHaveLength(OPERATION_CHUNKS_MAX);
    expect(h.puts.at(-1)).toMatchObject({ chunkKind: 'echo', sequence: OPERATION_CHUNKS_MAX });
    expect(h.finishes).toEqual([expect.objectContaining({ outcome: 'failed', errorCode: 'RUNTIME_CHUNK_TOO_LARGE' })]);
    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'RUNTIME_CHUNK_TOO_LARGE', details: { reason: 'too_many_chunks' } });
    expect(h.releases()).toBe(1);
  });

  it('청크 없이 leaseMs/3이 지나면 빈 payload로 임대를 연장한다(heartbeat)', async () => {
    vi.useFakeTimers();
    const h = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const c = collector(async function* () {
      yield echoChunk(1);
      await gate;
      yield echoChunk(2);
    });

    const running = runWith(h, c);
    await vi.advanceTimersByTimeAsync(OPERATION_LEASE_MS / 3 - 1);
    expect(h.puts.map((put) => put.chunkKind)).toEqual(['echo']);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.puts[1]).toEqual({ chunkKind: 'heartbeat', sequence: 1, payload: [], progress: { done: 1 } });

    await vi.advanceTimersByTimeAsync(OPERATION_LEASE_MS / 3);
    expect(h.puts.filter((put) => put.chunkKind === 'heartbeat')).toHaveLength(2);

    release();
    await running;
    expect(h.steps.slice(-3)).toEqual(['put:echo#2', 'finish:succeeded', 'release']);
    const heartbeatsAfterFinish = h.puts.length;
    await vi.advanceTimersByTimeAsync(OPERATION_LEASE_MS);
    expect(h.puts).toHaveLength(heartbeatsAfterFinish);
  });

  it('수집기가 청크 사이에 report(progress)하면 곧바로 progress만 올리고(임대 연장 겸) 다음 heartbeat도 그 progress를 싣는다', async () => {
    const h = harness();
    const attention = { current: 1, total: 2, label: '笔袋', attention: { kind: 'verification', site: '1688', label: '笔袋', since: 'now' } };
    const outcome = await runWith(h, {
      site: null,
      collect: (_plan, _site, context) => (async function* () {
        yield echoChunk(1);
        await context.report?.(attention);
        await context.report?.({ current: 1, total: 2, label: '笔袋', attention: null });
        yield echoChunk(2);
      })(),
    });

    expect(outcome.kind).toBe('finished');
    expect(h.puts.map((put) => [put.chunkKind, put.payload.length, put.progress])).toEqual([
      ['echo', 1, { done: 1 }],
      ['heartbeat', 0, attention],
      ['heartbeat', 0, { current: 1, total: 2, label: '笔袋', attention: null }],
      ['echo', 1, { done: 2 }],
    ]);
  });

  it('날아가는 heartbeat가 끝난 뒤에 finish를 보낸다', async () => {
    vi.useFakeTimers();
    let releaseHeartbeat!: () => void;
    const heartbeatGate = new Promise<void>((resolve) => { releaseHeartbeat = resolve; });
    const h = harness({ putDelay: (chunkKind) => (chunkKind === 'heartbeat' ? heartbeatGate : undefined) });
    let endCollection!: () => void;
    const collectionGate = new Promise<void>((resolve) => { endCollection = resolve; });
    const c = collector(async function* () {
      yield echoChunk(1);
      await collectionGate;
    });

    const running = runWith(h, c);
    await vi.advanceTimersByTimeAsync(OPERATION_LEASE_MS / 3);
    expect(h.steps.at(-1)).toBe('put:heartbeat#1');
    endCollection();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.steps).not.toContain('finish:succeeded');

    releaseHeartbeat();
    await running;
    expect(h.steps.slice(-3)).toEqual(['put-done:heartbeat#1', 'finish:succeeded', 'release']);
  });

  it('heartbeat가 fence_lost를 받으면 수집을 멈추고 finish 없이 끝난다', async () => {
    vi.useFakeTimers();
    const h = harness({
      putError: (_sequence, chunkKind) =>
        chunkKind === 'heartbeat' ? new RuntimeError('OPERATION_FENCE_LOST', '만료', { operationId: OP, reason: 'expired' }) : null,
    });
    const c = collector((signal) => (async function* () {
      yield echoChunk(1);
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      yield echoChunk(2);
    })());

    const running = runWith(h, c);
    await vi.advanceTimersByTimeAsync(OPERATION_LEASE_MS / 3);
    const outcome = await running;

    expect(outcome).toEqual({ kind: 'fence_lost', operationId: OP, reason: 'expired' });
    expect(h.finishes).toEqual([]);
    expect(h.steps.filter((step) => step === 'release')).toHaveLength(1);
    expect(h.puts.map((put) => `${put.chunkKind}#${put.sequence}`)).toEqual(['echo#1', 'heartbeat#1']);
  });

  it('start의 자격은 사이트 lease로만 넘기고 청크·progress·finish에는 싣지 않는다(KID-377)', async () => {
    const h = harness();
    const leases: unknown[] = [];
    const credentials = { loginId: 'fake-id', password: 'fake-password' };
    const runner = createRunner({
      client: h.client,
      browser: h.browser,
      siteFor: (_kind, lease) => {
        leases.push(lease);
        return null;
      },
    }, () => collector([echoChunk(1)]));

    const outcome = await runner.run({ kind: 'test.echo', scope: {}, signal: new AbortController().signal, credentials });

    expect(outcome.kind).toBe('finished');
    expect(leases).toEqual([{ tabId: null, credentials }]);
    expect(JSON.stringify([h.puts, h.finishes, outcome])).not.toMatch(/fake-password|fake-id/);
  });

  it('로그인 화면에서 멈춘 실행은 finish(failed)의 result.login에 까닭·몰의 말만 싣는다 — 웹이 자동 로그인을 막을지 정한다', async () => {
    const h = harness();
    const c = collector(() => (async function* (): AsyncIterable<RunnableChunk> {
      throw new RuntimeError('SITE_LOGIN_REQUIRED', '테스트몰 로그인이 필요합니다.', {
        url: 'https://auth.test/login',
        reason: 'credentials_rejected',
        mallMessage: '비밀번호가 일치하지 않습니다.',
      });
    })());
    const runner = createRunner({ client: h.client, browser: h.browser, siteFor: () => null }, () => c);

    const outcome = await runner.run({ kind: 'test.echo', scope: {}, signal: new AbortController().signal, credentials: { loginId: 'fake-id', password: 'fake-password' } });

    expect(outcome).toMatchObject({ kind: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', details: { reason: 'credentials_rejected' } });
    expect(h.finishes).toEqual([{
      outcome: 'failed',
      errorCode: 'SITE_LOGIN_REQUIRED',
      errorMessage: '테스트몰 로그인이 필요합니다.',
      result: { login: { reason: 'credentials_rejected', mallMessage: '비밀번호가 일치하지 않습니다.' } },
    }]);
    expect(JSON.stringify(h.finishes)).not.toMatch(/fake-password/);
  });

  it('로그인 까닭이 없는 실패는 result 없이 finish(failed)한다', async () => {
    const h = harness();
    const c = collector(() => (async function* (): AsyncIterable<RunnableChunk> {
      throw new RuntimeError('SITE_LOGIN_REQUIRED', '로그인이 필요합니다.', { url: 'https://auth.test/login' });
    })());
    await runWith(h, c);
    expect(h.finishes).toEqual([{ outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '로그인이 필요합니다.' }]);
  });
});

