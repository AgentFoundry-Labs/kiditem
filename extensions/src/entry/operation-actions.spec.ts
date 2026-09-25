import { describe, expect, it } from 'vitest';
import type { ApiPort } from '../core/api';
import type { BrowserResources } from '../core/browser';
import '../collectors/test.echo';
import { createOperationActions, type ExternalAction } from './operation-actions';

const OP = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

function view(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: OP,
    kind: 'test.echo',
    status,
    lockKeys: status === 'executing' ? ['org'] : [],
    plan: { echo: true },
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-25T00:01:00.000Z',
    expiresAt: '2026-09-25T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...extra,
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** 서버 경계(ApiPort) 가짜: 실행 계약 라우트를 흉내 내고 요청을 기록한다. chunk는 gate가 열릴 때까지 붙잡을 수 있다. */
function fakeServer(options: { busy?: boolean; reused?: boolean } = {}) {
  const requests: Array<{ environmentId: string; method: string; path: string; body: unknown }> = [];
  let openGate!: () => void;
  let gate: Promise<void> | null = null;
  const finished: Array<Promise<void>> = [];
  let markFinished!: () => void;
  finished.push(new Promise<void>((resolve) => { markFinished = resolve; }));
  const apiFor = (environmentId: string): ApiPort => ({
    async fetch(path, init) {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ environmentId, method, path, body });
      if (method === 'POST' && path === '/api/operations') {
        if (options.busy) {
          return json(409, {
            statusCode: 409,
            code: 'OPERATION_IN_PROGRESS',
            kind: 'in_progress',
            message: '같은 실행이 이미 진행 중입니다.',
            errors: [],
            details: { existing: { operationId: OP, kind: 'test.echo' } },
          });
        }
        return json(201, { operation: view('executing'), token: TOKEN, reused: options.reused ?? false });
      }
      if (method === 'PUT') {
        if (gate) await gate;
        const segments = path.split('/');
        return json(200, { operationId: OP, chunkKind: segments[5], sequence: Number(segments[6]), itemCount: body.payload.length, expiresAt: '2026-09-25T00:30:00.000Z' });
      }
      if (method === 'POST' && path.endsWith('/finish')) {
        markFinished();
        return json(200, { operation: view(body.outcome, { result: body.result ?? null }) });
      }
      if (method === 'POST' && path.endsWith('/cancel')) {
        return json(200, { operation: view('cancelled', { errorCode: 'USER_CANCELLED' }) });
      }
      return json(404, { statusCode: 404, code: 'OPERATION_NOT_FOUND', kind: 'not_found', message: '없음', errors: [] });
    },
  });
  return {
    apiFor,
    requests,
    options,
    finished: finished[0],
    holdChunks() {
      gate = new Promise<void>((resolve) => { openGate = resolve; });
    },
    releaseChunks() {
      openGate();
    },
  };
}

function orgOnlyBrowser(): BrowserResources & { releases: number } {
  const browser = {
    releases: 0,
    async acquire() {
      return { tabId: null, release: async () => { browser.releases += 1; } };
    },
  };
  return browser;
}

async function send(actions: ReturnType<typeof createOperationActions>, message: unknown, environmentId = 'local') {
  const action = actions[(message as { action: 'operation.start' | 'operation.cancel' }).action] as ExternalAction<unknown>;
  return action.handle(action.validate(message), environmentId);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('operation.start · operation.cancel 입구', () => {
  it('start는 begin 성공 즉시 답하고, 실행은 청크 → finish까지 계속된다', async () => {
    const server = fakeServer();
    server.holdChunks();
    const actions = createOperationActions({ apiFor: server.apiFor, browser: orgOnlyBrowser() });

    const response = await send(actions, { action: 'operation.start', kind: 'test.echo' });

    expect(response).toEqual({ success: true, operationId: OP, reused: false });
    expect(server.requests.some((request) => request.path.endsWith('/finish'))).toBe(false);

    server.releaseChunks();
    await server.finished;
    await settle();
    expect(server.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /api/operations',
      `PUT /api/operations/${OP}/chunks/echo/1`,
      `PUT /api/operations/${OP}/chunks/echo/2`,
      `POST /api/operations/${OP}/finish`,
    ]);
    expect(server.requests[0]).toMatchObject({ environmentId: 'local', body: { kind: 'test.echo', scope: {} } });
    expect(server.requests[3].body).toEqual({ outcome: 'succeeded', result: { echo: true } });
  });

  it('잠금이 잡혀 있으면 existing을 그대로 웹앱에 돌려준다', async () => {
    const server = fakeServer({ busy: true });
    const actions = createOperationActions({ apiFor: server.apiFor, browser: orgOnlyBrowser() });

    const response = await send(actions, { action: 'operation.start', kind: 'test.echo', idempotencyKey: 'k1' });

    expect(response).toEqual({
      success: false,
      errorCode: 'OPERATION_IN_PROGRESS',
      error: expect.any(String),
      details: { existing: { operationId: OP, kind: 'test.echo' } },
    });
  });

  it('확장이 모르는 kind는 begin 없이 거절한다', async () => {
    const server = fakeServer();
    const actions = createOperationActions({ apiFor: server.apiFor, browser: orgOnlyBrowser() });

    const response = await send(actions, { action: 'operation.start', kind: 'test.unknown' });

    expect(response).toMatchObject({ success: false, errorCode: 'RUNTIME_UNKNOWN_KIND' });
    expect(server.requests).toEqual([]);
  });

  it.each([
    { action: 'operation.start', kind: 'NotAKind' },
    { action: 'operation.start', kind: 'test.echo', extra: true },
    { action: 'operation.cancel', operationId: 'not-a-uuid' },
  ])('모양이 틀린 메시지는 VALIDATION_FAILED로 답하고 서버를 부르지 않는다 (%o)', async (message) => {
    const server = fakeServer();
    const actions = createOperationActions({ apiFor: server.apiFor, browser: orgOnlyBrowser() });

    const response = await send(actions, message);

    expect(response).toMatchObject({ success: false, errorCode: 'VALIDATION_FAILED', error: expect.any(String) });
    expect(server.requests).toEqual([]);
  });

  it('validate는 던지지 않는다 — 옛 dispatch가 validate 예외에는 errorCode를 싣지 않기 때문', () => {
    const actions = createOperationActions({ apiFor: fakeServer().apiFor, browser: orgOnlyBrowser() });

    expect(() => actions['operation.start'].validate({ action: 'operation.start' })).not.toThrow();
    expect(() => actions['operation.cancel'].validate(null)).not.toThrow();
  });

  it('cancel은 서버 cancel 뒤 로컬 실행을 멈춘다 — finish를 보내지 않고 브라우저 자원을 푼다', async () => {
    const server = fakeServer();
    server.holdChunks();
    const browser = orgOnlyBrowser();
    const actions = createOperationActions({ apiFor: server.apiFor, browser });
    await send(actions, { action: 'operation.start', kind: 'test.echo' });

    const response = await send(actions, { action: 'operation.cancel', operationId: OP });
    server.releaseChunks();
    await settle();
    await settle();

    expect(response).toMatchObject({ success: true, operation: { id: OP, status: 'cancelled' } });
    const sent = server.requests.map((request) => `${request.method} ${request.path}`);
    expect(sent).toContain(`POST /api/operations/${OP}/cancel`);
    expect(sent).not.toContain(`PUT /api/operations/${OP}/chunks/echo/2`);
    expect(sent.filter((line) => line.endsWith('/finish'))).toEqual([]);
    expect(browser.releases).toBe(1);
  });

  it('이 확장에서 이미 돌고 있는 실행을 reused로 다시 받으면 두 번째 수집을 시작하지 않는다', async () => {
    const server = fakeServer();
    server.holdChunks();
    const browser = orgOnlyBrowser();
    const actions = createOperationActions({ apiFor: server.apiFor, browser });
    await send(actions, { action: 'operation.start', kind: 'test.echo', idempotencyKey: 'k1' });
    server.options.reused = true;

    const again = await send(actions, { action: 'operation.start', kind: 'test.echo', idempotencyKey: 'k1' });
    server.releaseChunks();
    await server.finished;
    await settle();

    expect(again).toEqual({ success: true, operationId: OP, reused: true });
    const chunkPuts = server.requests.filter((request) => request.method === 'PUT').map((request) => request.path);
    expect(chunkPuts).toEqual([`/api/operations/${OP}/chunks/echo/1`, `/api/operations/${OP}/chunks/echo/2`]);
    expect(server.requests.filter((request) => request.path.endsWith('/finish'))).toHaveLength(1);
  });
});
