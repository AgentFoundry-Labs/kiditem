import { describe, expect, it } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import type { OperationRunner, RunOutcome } from '../core/runner';
import { RUN_PREPARED_OPERATIONS, installPreparedOperations, runPreparedOperations } from './prepared-operations';

const KIND = 'advertising.ad_action';

function finished(id: string, status: OperationView['status'], result: Record<string, unknown> | null, errorMessage: string | null = null): RunOutcome {
  return {
    kind: 'finished',
    operation: {
      id, kind: KIND, status, lockKeys: [`resource:ad-action:${id}`], plan: null, progress: null, result, window: null,
      errorCode: errorMessage ? 'X' : null, errorMessage, startedAt: '2026-09-29T00:00:00.000Z', finishedAt: '2026-09-29T00:01:00.000Z',
      expiresAt: '2026-09-29T00:10:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
    },
  };
}

/** 가짜 runner: claim할 때마다 `queue`의 다음 결과(다 쓰면 null = 후보 없음). */
function fakeRunner(queue: Array<RunOutcome | null>) {
  const claims: Array<{ kinds: string[]; workerId: string }> = [];
  const runner: OperationRunner = {
    run: async () => { throw new Error('begin 경로를 쓰지 않는다'); },
    async runClaimed(input) {
      claims.push({ kinds: input.kinds, workerId: input.workerId });
      return queue.length > 0 ? queue.shift()! : null;
    },
  };
  return { runner, claims };
}

describe('서버 준비 실행 돌리기(팝업 버튼, KID-386)', () => {
  it('후보가 없을 때까지 하나씩 claim해 돌리고 결과를 모은다(성공 finish의 광고 결과는 created·uncertain으로 나눈다)', async () => {
    const { runner, claims } = fakeRunner([
      finished('op-1', 'succeeded', { providerOutcome: 'created', campaignId: '1' }),
      finished('op-2', 'succeeded', { providerOutcome: 'uncertain', message: '번호를 못 읽음' }),
      finished('op-3', 'failed', { providerOutcome: 'not_attempted' }, '등록 화면이 바뀌었습니다.'),
    ]);

    const summary = await runPreparedOperations(runner, { kinds: [KIND], workerId: 'popup', signal: new AbortController().signal });

    expect(claims).toHaveLength(4);
    expect(summary).toEqual({
      ok: true,
      ran: 3,
      created: 1,
      uncertain: 1,
      failed: 1,
      messages: ['번호를 못 읽음', '등록 화면이 바뀌었습니다.'],
    });
  });

  it('claim 자체가 실패하면 멈추고 그 까닭을 돌려준다', async () => {
    const { runner } = fakeRunner([{ kind: 'failed', operationId: null, errorCode: 'RUNTIME_API_UNREACHABLE', errorMessage: 'KidItem 서버에 연결하지 못했습니다.' }]);

    const summary = await runPreparedOperations(runner, { kinds: [KIND], workerId: 'popup', signal: new AbortController().signal });

    expect(summary).toEqual({ ok: false, errorCode: 'RUNTIME_API_UNREACHABLE', error: 'KidItem 서버에 연결하지 못했습니다.', ran: 0 });
  });

  it('로그인 필요·업체 불일치·등록 화면 변경처럼 액션 하나와 무관한 실패면 멈추고 남은 준비 실행은 claim하지 않는다', async () => {
    for (const [code, stopped] of [
      ['SITE_LOGIN_REQUIRED', '쿠팡 광고센터에 로그인한 뒤 다시 실행해 주세요.'],
      ['ADVERTISING_IDENTITY_MISMATCH', '광고 액션의 업체로 광고센터에 다시 로그인한 뒤 실행해 주세요.'],
      ['ADVERTISING_AD_CENTER_FORM_CHANGED', '광고센터 등록 화면이 바뀌어 남은 액션을 멈췄습니다. 개발자에게 알려 주세요.'],
    ] as const) {
      const failed = finished('op-1', 'failed', { providerOutcome: 'not_attempted' }, '멈춘 까닭');
      if (failed.kind === 'finished') failed.operation.errorCode = code;
      const { runner, claims } = fakeRunner([failed, finished('op-2', 'succeeded', { providerOutcome: 'created' })]);

      const summary = await runPreparedOperations(runner, { kinds: [KIND], workerId: 'popup', signal: new AbortController().signal });

      expect(claims).toHaveLength(1);
      expect(summary).toMatchObject({ ok: true, ran: 1, failed: 1, created: 0, stopped });
    }
  });

  it('액션 하나의 실패(상품을 못 찾음)는 다음 액션으로 넘어간다', async () => {
    const failed: RunOutcome = { kind: 'failed', operationId: 'op-1', errorCode: 'SITE_REQUEST_FAILED', errorMessage: '상품을 찾지 못했습니다' };
    const { runner, claims } = fakeRunner([failed, finished('op-2', 'succeeded', { providerOutcome: 'created' })]);

    const summary = await runPreparedOperations(runner, { kinds: [KIND], workerId: 'popup', signal: new AbortController().signal });

    expect(claims).toHaveLength(3);
    expect(summary).toMatchObject({ ok: true, ran: 2, created: 1, failed: 1 });
    expect(summary).not.toHaveProperty('stopped');
  });

  it('한 번 누름에 상한까지만 돈다', async () => {
    const { runner, claims } = fakeRunner(Array.from({ length: 30 }, (_, i) => finished(`op-${i}`, 'succeeded', { providerOutcome: 'created' })));

    const summary = await runPreparedOperations(runner, { kinds: [KIND], workerId: 'popup', signal: new AbortController().signal, maxRuns: 5 });

    expect(claims).toHaveLength(5);
    expect(summary).toMatchObject({ ok: true, ran: 5, created: 5 });
  });
});

describe('installPreparedOperations — 팝업 메시지', () => {
  function install(queue: Array<RunOutcome | null> = []) {
    let listener!: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void;
    const fake = fakeRunner(queue);
    const environments: string[] = [];
    installPreparedOperations(
      { runtime: { id: 'ext-id', onMessage: { addListener: (l) => { listener = l; } } } },
      { runnerFor: (environmentId) => { environments.push(environmentId); return fake.runner; } },
    );
    const send = (message: unknown, sender: unknown = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' }) =>
      new Promise<unknown>((resolve) => {
        const handled = listener(message, sender, resolve);
        if (handled !== true) resolve(undefined);
      });
    return { send, environments, claims: fake.claims };
  }

  it('확장 페이지(팝업)의 메시지만 받아 그 환경의 runner로 돈다', async () => {
    const { send, environments } = install([finished('op-1', 'succeeded', { providerOutcome: 'created' })]);

    const response = await send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: [KIND] });

    expect(response).toMatchObject({ ok: true, ran: 1, created: 1 });
    expect(environments).toEqual(['office']);
  });

  it('탭(content script)에서 온 메시지와 준비 실행이 아닌 kind는 돌리지 않는다', async () => {
    const { send, claims } = install();

    expect(await send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: [KIND] }, { id: 'ext-id', tab: { id: 3 } })).toMatchObject({ ok: false });
    expect(await send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: ['advertising.ad_report'] })).toMatchObject({ ok: false });
    expect(await send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: [KIND] }, { id: 'other-ext' })).toMatchObject({ ok: false });
    expect(claims).toEqual([]);
  });

  it('돌고 있는 동안 다시 누르면 겹쳐 돌리지 않는다', async () => {
    const { send } = install([finished('op-1', 'succeeded', { providerOutcome: 'created' })]);

    const [first, second] = await Promise.all([
      send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: [KIND] }),
      send({ type: RUN_PREPARED_OPERATIONS, environmentId: 'office', kinds: [KIND] }),
    ]);

    expect(first).toMatchObject({ ok: true, ran: 1 });
    expect(second).toMatchObject({ ok: false, error: '승인된 광고 액션을 이미 실행하고 있습니다.' });
  });

  it('다른 메시지는 받지 않는다', async () => {
    const { send } = install();
    expect(await send({ type: 'COLLECT_CURRENT' })).toBeUndefined();
  });
});
