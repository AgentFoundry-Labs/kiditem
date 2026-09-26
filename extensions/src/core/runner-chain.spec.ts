import { describe, expect, it } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import type { BrowserResources } from './browser';
import { RuntimeError } from './errors';
import type { OperationClient } from './operation-client';
import { createRunner, nextOperationFrom, type RunnableCollector } from './runner';

describe('nextOperationFrom — 실행 연쇄 규칙', () => {
  it('result.next가 {kind, scope}면 다음 실행이다', () => {
    expect(nextOperationFrom({ next: { kind: 'channels.wing_catalog_details', scope: { channelAccountId: 'x' } } }))
      .toEqual({ kind: 'channels.wing_catalog_details', scope: { channelAccountId: 'x' } });
  });
  it('next가 없거나 null이면 연쇄 없음', () => {
    expect(nextOperationFrom({ chunks: 2 })).toBeNull();
    expect(nextOperationFrom({ next: null })).toBeNull();
    expect(nextOperationFrom(null)).toBeNull();
  });
  it('모양이 틀리면(kind 형식·scope 없음) 연쇄하지 않는다', () => {
    expect(nextOperationFrom({ next: { kind: 'bogus', scope: {} } })).toBeNull();
    expect(nextOperationFrom({ next: { kind: 'a.b' } })).toBeNull();
  });
});

describe('createRunner — 연쇄', () => {
  it('성공한 실행의 result.next로 두 번째 kind를 이어서 begin하고, 두 번째가 거절되면 그 거절이 결과다', async () => {
    const OP1 = '11111111-1111-4111-8111-111111111111';
    const TOKEN = '22222222-2222-4222-8222-222222222222';
    const steps: string[] = [];
    const begunIds: string[] = [];
    const client: OperationClient = {
      async begin(request) {
        steps.push(`begin:${request.kind}:${JSON.stringify(request.scope)}`);
        if (request.kind === 'a.second') {
          throw new RuntimeError('OPERATION_IN_PROGRESS', '돌고 있습니다', {
            operationId: '33333333-3333-4333-8333-333333333333',
            kind: 'a.second',
            lockKeys: ['org'],
            startedAt: '2026-09-25T00:00:00.000Z',
            expiresAt: '2026-09-25T00:30:00.000Z',
          });
        }
        return { operation: view(OP1, request.kind), token: TOKEN, reused: false };
      },
      async putChunk(input) {
        steps.push(`put:${input.chunkKind}`);
        return { operationId: OP1, chunkKind: input.chunkKind, sequence: input.sequence, itemCount: 1, expiresAt: '2026-09-25T00:30:00.000Z' };
      },
      async finish(input) {
        steps.push(`finish:${input.request.outcome}`);
        return { operation: { ...view(OP1, 'a.first'), status: 'succeeded', result: { next: { kind: 'a.second', scope: { ids: ['p'] } } } } };
      },
      async cancel() {
        throw new Error('runner never cancels');
      },
    };
    const browser: BrowserResources = {
      async acquire() {
        steps.push('acquire');
        return { tabId: null, async release() { steps.push('release'); } };
      },
    };
    const collector: RunnableCollector = {
      site: null,
      collect: async function* () {
        yield { chunkKind: 'echo', payload: [1] };
      },
    };
    const runner = createRunner({ client, browser, siteFor: () => null }, () => collector);
    const outcome = await runner.run({
      kind: 'a.first',
      scope: {},
      signal: new AbortController().signal,
      onBegun: ({ operationId }) => begunIds.push(operationId),
    });

    expect(steps).toEqual([
      'begin:a.first:{}', 'acquire', 'put:echo', 'finish:succeeded', 'release',
      'begin:a.second:{"ids":["p"]}',
    ]);
    expect(begunIds).toEqual([OP1]);
    expect(outcome).toMatchObject({ kind: 'already_running', existing: { operationId: '33333333-3333-4333-8333-333333333333' } });
  });
});

describe('createRunner — 연쇄와 자격(KID-377 리뷰)', () => {
  /** 첫 실행이 next로 둘째 kind를 넘기고 둘 다 성공한다. siteFor가 받은 lease를 kind별로 적는다. */
  async function chain(sites: { first: string; second: string }) {
    const TOKEN = '22222222-2222-4222-8222-222222222222';
    const leases: Array<{ kind: string; lease: unknown }> = [];
    let n = 0;
    const client: OperationClient = {
      async begin(request) {
        n += 1;
        return { operation: view(`1111111${n}-1111-4111-8111-111111111111`, request.kind), token: TOKEN, reused: false };
      },
      async putChunk(input) {
        return { operationId: input.operationId, chunkKind: input.chunkKind, sequence: input.sequence, itemCount: 1, expiresAt: '2026-09-25T00:30:00.000Z' };
      },
      async finish(input) {
        const kind = n === 1 ? 'a.first' : 'a.second';
        return { operation: { ...view(input.operationId, kind), status: 'succeeded', result: n === 1 ? { next: { kind: 'a.second', scope: {} } } : {} } };
      },
      async cancel() {
        throw new Error('runner never cancels');
      },
    };
    const browser: BrowserResources = { async acquire() { return { tabId: null, async release() {} }; } };
    const collector = (site: string): RunnableCollector => ({ site, collect: async function* () { yield { chunkKind: 'echo', payload: [1] }; } });
    const runner = createRunner(
      { client, browser, siteFor: (kind, lease) => { leases.push({ kind, lease }); return null; } },
      (kind) => collector(kind === 'a.first' ? sites.first : sites.second),
    );
    await runner.run({ kind: 'a.first', scope: {}, signal: new AbortController().signal, credentials: { loginId: 'fake-id', password: 'fake-password' } });
    return leases;
  }

  it('이어지는 실행의 수집기가 같은 사이트면 자격을 넘긴다(윙 목록 → 상세)', async () => {
    const leases = await chain({ first: 'wing', second: 'wing' });
    expect(leases.map((entry) => [entry.kind, (entry.lease as { credentials?: unknown }).credentials !== undefined])).toEqual([['a.first', true], ['a.second', true]]);
  });

  it('다른 사이트면 자격을 넘기지 않는다 — 한 사이트의 자격이 다른 사이트로 가지 않게', async () => {
    const leases = await chain({ first: 'wing', second: 'coupang-supplier' });
    expect(leases.map((entry) => [entry.kind, (entry.lease as { credentials?: unknown }).credentials !== undefined])).toEqual([['a.first', true], ['a.second', false]]);
  });
});

function view(id: string, kind: string): OperationView {
  return {
    id, kind, status: 'executing', lockKeys: ['org'], plan: {}, progress: null, result: null, window: null,
    errorCode: null, errorMessage: null, startedAt: '2026-09-25T00:00:00.000Z', finishedAt: null,
    expiresAt: '2026-09-25T00:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
  };
}
