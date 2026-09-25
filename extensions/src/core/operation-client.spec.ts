import { describe, expect, it } from 'vitest';
import type { ApiPort } from './api';
import { RuntimeError } from './errors';
import { createOperationClient, stopFor } from './operation-client';

describe('stopFor — 서버 거절 코드 → 런타임 행동', () => {
  const running = {
    operationId: '11111111-1111-4111-8111-111111111111',
    kind: 'test.echo',
    lockKeys: ['org'],
    startedAt: '2026-09-25T00:00:00.000Z',
    expiresAt: '2026-09-25T00:30:00.000Z',
  };

  it('OPERATION_IN_PROGRESS는 시작하지 않고, 평평한 details(돌고 있는 실행)를 existing으로 보고한다', () => {
    expect(stopFor('OPERATION_IN_PROGRESS', running)).toEqual({ kind: 'already_running', existing: running });
  });

  it('OPERATION_IN_PROGRESS details가 계약 모양이 아니면 existing은 null', () => {
    expect(stopFor('OPERATION_IN_PROGRESS', { existing: { operationId: 'x' } })).toEqual({ kind: 'already_running', existing: null });
    expect(stopFor('OPERATION_IN_PROGRESS', null)).toEqual({ kind: 'already_running', existing: null });
  });

  it.each(['expired', 'terminal', 'chunk_conflict'])('OPERATION_FENCE_LOST{%s}는 멈추고 finish를 보내지 않는다', (reason) => {
    expect(stopFor('OPERATION_FENCE_LOST', { reason })).toEqual({ kind: 'fence_lost', reason });
  });

  it('OPERATION_NOT_FOUND(토큰 불일치)도 fence_lost로 본다', () => {
    expect(stopFor('OPERATION_NOT_FOUND', null)).toEqual({ kind: 'fence_lost', reason: null });
  });

  it('그 밖의 코드는 finish(failed)로 알린다', () => {
    expect(stopFor('VALIDATION_FAILED', undefined)).toEqual({ kind: 'report_failed' });
  });
});

const OP = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

function view(overrides: Record<string, unknown> = {}) {
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

interface Call { path: string; init: RequestInit | undefined }

function fakeApi(respond: (call: Call) => Response | Promise<Response>): { api: ApiPort; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    api: {
      async fetch(path, init) {
        const call = { path, init };
        calls.push(call);
        return respond(call);
      },
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const envelope = (statusCode: number, code: string, details?: Record<string, unknown>) => ({
  statusCode,
  code,
  kind: statusCode === 404 ? 'not_found' : statusCode === 409 ? 'conflict' : 'validation',
  message: `${code} 메시지`,
  errors: [],
  ...(details ? { details } : {}),
});

function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init?.headers).get(name);
}

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('createOperationClient — 실행 계약 HTTP 창구', () => {
  it('begin은 POST /api/operations로 보내고 응답을 parse한다(토큰 헤더 없음)', async () => {
    const { api, calls } = fakeApi(() => json(201, { operation: view(), token: TOKEN, reused: false }));

    const response = await createOperationClient(api).begin({ kind: 'test.echo', scope: {} });

    expect(response).toEqual({ operation: view(), token: TOKEN, reused: false });
    expect(calls[0].path).toBe('/api/operations');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ kind: 'test.echo', scope: {} });
    expect(headerOf(calls[0], 'x-operation-token')).toBeNull();
  });

  it('putChunk는 PUT .../chunks/:kind/:seq에 토큰 헤더와 payload SHA-256 checksum을 싣는다', async () => {
    const { api, calls } = fakeApi(() =>
      json(200, { operationId: OP, chunkKind: 'echo', sequence: 1, itemCount: 1, expiresAt: '2026-09-25T00:40:00.000Z' }),
    );

    const response = await createOperationClient(api).putChunk({
      operationId: OP,
      token: TOKEN,
      chunkKind: 'echo',
      sequence: 1,
      payload: [{ i: 1, at: 'x' }],
      progress: { done: 1 },
    });

    expect(response.itemCount).toBe(1);
    expect(calls[0].path).toBe(`/api/operations/${OP}/chunks/echo/1`);
    expect(calls[0].init?.method).toBe('PUT');
    expect(headerOf(calls[0], 'x-operation-token')).toBe(TOKEN);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      checksum: '39dd2ccf30aa071964fdfa7f767bb0dc5493a5e9bc3b6d727e5fd117ce893ec5',
      payload: [{ i: 1, at: 'x' }],
      progress: { done: 1 },
    });
  });

  it('빈 payload(heartbeat)도 checksum을 계산한다', async () => {
    const { api, calls } = fakeApi(() =>
      json(200, { operationId: OP, chunkKind: 'echo', sequence: 1, itemCount: 0, expiresAt: '2026-09-25T00:40:00.000Z' }),
    );
    await createOperationClient(api).putChunk({ operationId: OP, token: TOKEN, chunkKind: 'echo', sequence: 1, payload: [] });
    expect(JSON.parse(String(calls[0].init?.body)).checksum).toBe('4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  });

  it('finish는 POST .../finish에 토큰 헤더를 싣고 operation을 parse한다', async () => {
    const finished = view({ status: 'succeeded', result: { chunks: 2 }, finishedAt: '2026-09-25T00:01:00.000Z' });
    const { api, calls } = fakeApi(() => json(200, { operation: finished }));

    const response = await createOperationClient(api).finish({ operationId: OP, token: TOKEN, request: { outcome: 'succeeded', result: { echo: true } } });

    expect(response.operation).toEqual(finished);
    expect(calls[0].path).toBe(`/api/operations/${OP}/finish`);
    expect(calls[0].init?.method).toBe('POST');
    expect(headerOf(calls[0], 'x-operation-token')).toBe(TOKEN);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ outcome: 'succeeded', result: { echo: true } });
  });

  it('cancel은 토큰 없이 POST .../cancel하고 operation을 돌려준다', async () => {
    const cancelled = view({ status: 'cancelled', errorCode: 'USER_CANCELLED', finishedAt: '2026-09-25T00:01:00.000Z' });
    const { api, calls } = fakeApi(() => json(200, { operation: cancelled }));

    await expect(createOperationClient(api).cancel(OP)).resolves.toEqual(cancelled);
    expect(calls[0].path).toBe(`/api/operations/${OP}/cancel`);
    expect(calls[0].init?.method).toBe('POST');
    expect(headerOf(calls[0], 'x-operation-token')).toBeNull();
  });

  it('409 OPERATION_IN_PROGRESS는 서버 details(돌고 있는 실행)를 그대로 실은 RuntimeError', async () => {
    const running = { operationId: OP, kind: 'test.echo', lockKeys: ['org'], startedAt: '2026-09-25T00:00:00.000Z', expiresAt: '2026-09-25T00:30:00.000Z' };
    const { api } = fakeApi(() => json(409, envelope(409, 'OPERATION_IN_PROGRESS', running)));

    const error = await rejection(createOperationClient(api).begin({ kind: 'test.echo', scope: {} }));

    expect(error.code).toBe('OPERATION_IN_PROGRESS');
    expect(error.message).toBe('OPERATION_IN_PROGRESS 메시지');
    expect(error.details).toEqual(running);
  });

  it.each(['expired', 'terminal', 'chunk_conflict'])('409 OPERATION_FENCE_LOST{%s}는 reason을 실은 RuntimeError', async (reason) => {
    const { api } = fakeApi(() => json(409, envelope(409, 'OPERATION_FENCE_LOST', { operationId: OP, reason })));

    const error = await rejection(
      createOperationClient(api).putChunk({ operationId: OP, token: TOKEN, chunkKind: 'echo', sequence: 1, payload: [] }),
    );

    expect(error.code).toBe('OPERATION_FENCE_LOST');
    expect(error.details).toEqual({ operationId: OP, reason });
  });

  it('404 OPERATION_NOT_FOUND는 그 코드의 RuntimeError', async () => {
    const { api } = fakeApi(() => json(404, envelope(404, 'OPERATION_NOT_FOUND')));

    const error = await rejection(createOperationClient(api).finish({ operationId: OP, token: TOKEN, request: { outcome: 'succeeded' } }));

    expect(error.code).toBe('OPERATION_NOT_FOUND');
    expect(error.details).toBeNull();
  });

  it('봉투가 아닌 오류 응답은 RUNTIME_API_UNREACHABLE', async () => {
    const { api } = fakeApi(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    const error = await rejection(createOperationClient(api).begin({ kind: 'test.echo', scope: {} }));

    expect(error.code).toBe('RUNTIME_API_UNREACHABLE');
    expect(error.details).toMatchObject({ status: 502 });
  });

  it('네트워크 예외는 RUNTIME_API_UNREACHABLE', async () => {
    const { api } = fakeApi(() => {
      throw new TypeError('Failed to fetch');
    });

    const error = await rejection(createOperationClient(api).cancel(OP));

    expect(error.code).toBe('RUNTIME_API_UNREACHABLE');
  });

  it('2xx인데 계약 모양이 아니면 RUNTIME_API_UNREACHABLE', async () => {
    const { api } = fakeApi(() => json(201, { operation: { id: OP } }));

    const error = await rejection(createOperationClient(api).begin({ kind: 'test.echo', scope: {} }));

    expect(error.code).toBe('RUNTIME_API_UNREACHABLE');
  });
});
