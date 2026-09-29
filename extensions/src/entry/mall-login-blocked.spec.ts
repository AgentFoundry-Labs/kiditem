import { describe, expect, it } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import type { BrowserResources } from '../core/browser';
import type { OperationClient } from '../core/operation-client';
import { createRunner } from '../core/runner';
import { collectorFor } from '../collectors';
import '../collectors/orders.mall_orders';
import '../sites/mall-orders';
import '../sites/kidkids';
import { fastClock } from '../sites/login.fake';
import { siteFactoryFor, type SiteDeps, type SiteLease } from '../sites/registry';
import { fakeTabPages } from '../sites/tab-page.fake';

// 재QA 2 B3: 웹이 차단 때문에 자격을 싣지 않은 몰 주문 실행이 로그인 화면에서 멈추면, 실제 수집기(orders.mall_orders)·
// 몰 주문 라우터·키드키즈 사이트·로그인 문턱을 거쳐 runner가 finish(failed)의 result.login.reason을 blocked로 적는다.
// 가짜는 서버(operation client)·브라우저 자원·탭 경계뿐이다.
const OP = '11111111-1111-4111-8111-111111111111';
const PLAN = { channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11', mallKey: 'kidkids', mallName: '키드키즈', collectionDate: '2026-09-26', collectionMode: 'browser', selectionMode: 'manual' };

function view(overrides: Partial<OperationView> = {}): OperationView {
  return {
    id: OP, kind: 'orders.mall_orders', status: 'executing', lockKeys: ['account:5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11'], plan: PLAN, progress: null,
    result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T00:00:00.000Z', finishedAt: null,
    expiresAt: '2026-09-27T00:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null, ...overrides,
  };
}

describe('차단된 몰의 실행(재QA 2 B3)', () => {
  it('자격 없이(loginBlocked) 시작한 키드키즈 실행이 로그인 화면에서 멈추면 result.login.reason = blocked', async () => {
    const finishes: Array<Record<string, unknown>> = [];
    const client: OperationClient = {
      begin: async () => ({ operation: view(), token: '22222222-2222-4222-8222-222222222222', reused: false }),
      putChunk: async () => { throw new Error('no chunks expected'); },
      finish: async (input) => {
        finishes.push(input.request as Record<string, unknown>);
        return { operation: view({ status: input.request.outcome }) };
      },
      cancel: async () => { throw new Error('runner never cancels'); },
      claim: async () => ({ operation: null, token: null }),
    };
    const browser: BrowserResources = { acquire: async () => ({ tabId: null, release: async () => undefined }) };
    const tabs = fakeTabPages({ landAt: () => 'https://www.kidkids.net/join/partner_login.htm', answer: () => ({ ok: false, error: 'content_script_missing' }) });
    const deps: SiteDeps = { tabs: tabs.tabs, randomId: () => 'id', ...fastClock(), cookies: { async get() { return null; } }, fetch: async () => new Response('', { status: 404 }) };
    const runner = createRunner({
      client,
      browser,
      siteFor: (_kind, lease) => siteFactoryFor('mall-orders')!.create(deps, lease as SiteLease),
    }, collectorFor);

    await runner.run({ kind: 'orders.mall_orders', scope: {}, signal: new AbortController().signal, loginBlocked: true });

    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({ outcome: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', result: { login: { reason: 'blocked' } } });
  });
});
