import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useReadinessCollection } from './useReadinessCollection';
import type { WingRankBatch } from '@kiditem/shared/advertising';
import type { ReadinessCheck } from '@kiditem/shared/readiness';

// AuthProvider also mounts unrelated legacy collection providers. Only its
// context is isolated; rank, auth handoff, API and Chrome helpers stay real.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ status: 'ready', user: { organizationId: 'org-1' } }),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const check = { key: 'wing_kpi', collector: 'extension' } as ReadinessCheck;
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];
const path = '/api/ads/keyword-rank/wing/batch-attempts';
function batch(
  states: Array<'RUNNING' | 'COMPLETE' | 'FAILED'>,
): WingRankBatch {
  return {
    attempts: states.map((state, index) => ({
      attemptId: ids[index],
      keyword: ['연필', '색연필'][index],
      generation: '1',
      state,
      expiresAt: '2026-09-10T00:00:00.000Z',
      actualCutoffAt: state === 'COMPLETE' ? '2026-09-06T00:00:00.000Z' : null,
      itemCount: state === 'COMPLETE' ? 20 : 0,
      errorCode: state === 'FAILED' ? 'WING_RANK_PROVIDER_WALL' : null,
      errorMessage: state === 'FAILED' ? 'Wing 로그인이 필요합니다.' : null,
      plan: {
        sourceType: 'coupang_wing_rank',
        parserVersion: 'wing-rank-v1',
        keyword: ['연필', '색연필'][index],
        maxPages: 5,
        targets: [
          {
            vendorItemId: `V${index}`,
            productName: '연필',
            category: null,
            keyword: ['연필', '색연필'][index],
            candidateIndex: 0,
          },
        ],
      },
    })),
    selection: {
      productCount: states.length,
      candidateCount: states.length,
      keywordCount: states.length,
      targetKeywordCount: states.length,
      resumed: false,
      pendingProductCount: states.length,
      targets: states.map((_, index) => ({
        keyword: ['연필', '색연필'][index],
        vendorItemIds: [`V${index}`],
        productCount: 1,
        primaryProductCount: 1,
        pendingProductCount: 1,
        pendingPrimaryProductCount: 1,
        phase: 'primary',
        maxPages: 5,
      })),
    },
  };
}

function setup(
  initial = batch(['RUNNING', 'RUNNING']),
  gate: 'ready' | 'outdated' | 'chrome_required' | 'missing' = 'ready',
) {
  let current = initial;
  let readError = false;
  let dispatchReply: Record<string, unknown> = { success: true, started: true };
  const events: string[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    // Readiness also observes the campaign sweep owner. That read is not Wing
    // IO, so it answers idle and stays out of the recorded Wing requests.
    if (String(url).endsWith('/api/ads/ad-campaigns/source')) {
      return Response.json({
        channelAccountId: null,
        ready: false,
        latestAttempt: null,
        latestComplete: null,
        actualCutoffAt: null,
      });
    }
    requests.push({ url: String(url), init });
    events.push(`${init.method ?? 'GET'} ${url}`);
    if (String(url).endsWith('/extension-handoff'))
      return Response.json({ token: 'a'.repeat(43) });
    if (!String(url).endsWith(path)) throw new Error(`Unexpected HTTP: ${url}`);
    if (readError && init.method !== 'POST')
      return Response.json({ message: 'unavailable' }, { status: 503 });
    return Response.json(current);
  });
  vi.stubGlobal(
    'chrome',
    gate === 'chrome_required'
      ? undefined
      : {
          runtime: {
            sendMessage: (
              _id: string,
              message: Record<string, unknown>,
              callback: (value: unknown) => void,
            ) => {
              messages.push(message);
              events.push(String(message.action));
              callback(
                message.action === 'ping'
                  ? {
                      success: gate !== 'missing',
                      version: '1.2.102',
                      capabilities: {
                        kiditemEnvironmentProfilesV1: true,
                        browserCollectionSessions: true,
                        wingRankSourceOwnerV1: gate === 'ready',
                      },
                    }
                  : message.action === 'collectAdvertisingWingRankBatch'
                    ? dispatchReply
                    : { success: true },
              );
            },
          },
        },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const refetchReadiness = vi.fn().mockResolvedValue(undefined);
  const view = renderHook(() => useReadinessCollection({ refetchReadiness }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return {
    ...view,
    client,
    refetchReadiness,
    events,
    messages,
    requests,
    setResult: (value: WingRankBatch) => {
      current = value;
    },
    setReadError: (value: boolean) => {
      readError = value;
    },
    setDispatchReply: (value: Record<string, unknown>) => {
      dispatchReply = value;
    },
    start: async () => {
      await act(async () => {
        await view.result.current.handleCollect(check);
      });
    },
    refresh: async () => {
      await act(async () => {
        await client.invalidateQueries({
          queryKey: queryKeys.ads.keywordRank(),
        });
      });
    },
  };
}

describe('Readiness Wing source owner boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('kiditem-ext-id', 'coupang-extension');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('hands off auth before frozen admission and dispatch, then waits for persisted per-keyword results', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const h = setup();
    await h.start();
    expect(open).not.toHaveBeenCalled();
    const begin = h.requests.find(
      ({ url, init }) => url.endsWith(path) && init.method === 'POST',
    );
    expect(begin).toBeDefined();
    const key = new Headers(begin!.init.headers).get('Idempotency-Key');
    expect(JSON.parse(String(begin!.init.body))).toEqual({});
    expect(h.messages).toContainEqual({
      action: 'collectAdvertisingWingRankBatch',
      idempotencyKey: key,
    });
    expect(h.events.indexOf('setAuthToken')).toBeLessThan(
      h.events.indexOf(`POST ${begin!.url}`),
    );
    expect(h.events.indexOf(`POST ${begin!.url}`)).toBeLessThan(
      h.events.indexOf('collectAdvertisingWingRankBatch'),
    );
    expect(h.result.current.pendingKey).toBe('wing_kpi');
    expect(h.refetchReadiness).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    const action = vi
      .mocked(toast.info)
      .mock.calls.find(([, options]) => options?.action)?.[1]?.action;
    expect(action).toMatchObject({ label: '진행 보기' });
    if (action && typeof action === 'object' && 'onClick' in action)
      action.onClick({} as never);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      `/rank-tracking?rankBatch=${key}`,
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
    h.setResult(batch(['COMPLETE', 'RUNNING']));
    await h.refresh();
    await waitFor(() => expect(h.refetchReadiness).toHaveBeenCalledTimes(1));
    expect(h.result.current.pendingKey).toBe('wing_kpi');
    h.setResult(batch(['COMPLETE', 'FAILED']));
    await h.refresh();
    await waitFor(() => expect(h.refetchReadiness).toHaveBeenCalledTimes(2));
    expect(h.result.current.pendingKey).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Wing 로그인이 필요합니다.'),
    );
    expect(
      h.client.getQueryData<WingRankBatch>([
        ...queryKeys.ads.keywordRank(),
        'batch',
        key,
      ])?.attempts[0].state,
    ).toBe('COMPLETE');
    await h.refresh();
    expect(h.refetchReadiness).toHaveBeenCalledTimes(2);
    expect(
      h.requests.every(
        ({ url }) => url.endsWith(path) || url.endsWith('/extension-handoff'),
      ),
    ).toBe(true);
    expect(
      h.messages.some(({ action: name }) =>
        String(name).includes('CollectionSession'),
      ),
    ).toBe(false);
  });

  it('does not dispatch or poll an empty admission', async () => {
    const h = setup(batch([]));
    await h.start();
    expect(toast.info).toHaveBeenCalledWith(
      '순위를 확인할 자사 상품이 없습니다.',
    );
    expect(
      h.messages.some(
        ({ action }) => action === 'collectAdvertisingWingRankBatch',
      ),
    ).toBe(false);
    expect(
      h.requests.filter(
        ({ url, init }) => url.endsWith(path) && init.method !== 'POST',
      ),
    ).toEqual([]);
    expect(h.result.current.pendingKey).toBeNull();
    expect(h.refetchReadiness).not.toHaveBeenCalled();
  });

  it.each(['outdated', 'chrome_required', 'missing'] as const)(
    'keeps %s guidance without legacy run issuance or admission',
    async (gate) => {
      const h = setup(batch(['RUNNING']), gate);
      await h.start();
      expect(h.requests).toEqual([]);
      expect(
        gate === 'outdated' ? toast.error : toast.warning,
      ).toHaveBeenCalled();
      expect(h.result.current.pendingKey).toBeNull();
    },
  );

  it('does not treat a started:false ACK as empty and announces success only after owner COMPLETE', async () => {
    const h = setup(batch(['RUNNING']));
    h.setDispatchReply({ success: true, started: false });
    await h.start();
    expect(h.result.current.pendingKey).toBe('wing_kpi');
    expect(toast.info).not.toHaveBeenCalledWith(
      '순위를 확인할 자사 상품이 없습니다.',
    );
    expect(toast.success).not.toHaveBeenCalled();
    h.setResult(batch(['COMPLETE']));
    await waitFor(
      () => expect(toast.success).toHaveBeenCalledWith('1/1개 키워드 수집 완료'),
      { timeout: 3000 },
    );
    expect(h.result.current.pendingKey).toBeNull();
    expect(h.refetchReadiness).toHaveBeenCalledTimes(1);
  });

  it('keeps an admitted receipt and progress action after dispatch fails, without claiming a terminal result', async () => {
    const h = setup(batch(['RUNNING']));
    h.setDispatchReply({ success: false, error: 'dispatch unavailable' });
    await h.start();
    await waitFor(() => expect(h.result.current.pendingKey).toBe('wing_kpi'));
    expect(toast.error).toHaveBeenCalledWith('dispatch unavailable');
    expect(toast.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: expect.objectContaining({ label: '진행 보기' }),
      }),
    );
    expect(h.refetchReadiness).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed read running, recovers terminal confirmation, and retries with a new receipt key', async () => {
    const h = setup(batch(['RUNNING']));
    await h.start();
    h.setReadError(true);
    await h.refresh();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        '서버의 Wing 수집 결과를 확인하지 못했습니다.',
      ),
    );
    expect(h.result.current.pendingKey).toBe('wing_kpi');
    expect(h.refetchReadiness).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    h.setReadError(false);
    h.setResult(batch(['FAILED']));
    await h.refresh();
    await waitFor(() => expect(h.result.current.pendingKey).toBeNull());
    h.setResult(batch(['RUNNING']));
    await h.start();
    const keys = h.requests
      .filter(({ url, init }) => url.endsWith(path) && init.method === 'POST')
      .map(({ init }) => new Headers(init.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(h.result.current.pendingKey).toBe('wing_kpi');
  });
});
