import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdSyncRow } from '@/components/readiness/ReadinessRows';
import { queryKeys } from '@/lib/query-keys';
import { useAdSync } from './useAdSync';
import { useAdKeywordCollect } from './useAdKeywordCollect';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const sources = [
  {
    kind: 'campaign',
    useCollect: useAdSync,
    action: 'collectAdvertisingCampaigns',
    cancel: 'cancelAdvertisingCampaigns',
    capability: 'advertisingCampaignSourceOwnerV1',
    key: queryKeys.ads.campaignSource(),
  },
  {
    kind: 'keyword',
    useCollect: useAdKeywordCollect,
    action: 'collectAdvertisingKeywords',
    cancel: 'cancelAdvertisingKeywords',
    capability: 'advertisingKeywordSourceOwnerV1',
    key: queryKeys.ads.keywordSource(),
  },
] as const;
function attempt(
  kind: 'campaign' | 'keyword',
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING',
) {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    channelAccountId: '22222222-2222-4222-8222-222222222222',
    state,
    plan: {
      sourceType: 'coupang_ad_' + kind,
      parserVersion: 'ad-' + kind + '-v1',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
      expectedAdvertiserId: 'test-account',
      startDate: kind === 'campaign' ? '2026-08-06' : '2026-08-30',
      endDate: '2026-09-05',
      ...(kind === 'campaign'
        ? {
            businessDates: Array.from({ length: 31 }, (_, i) =>
              new Date(Date.UTC(2026, 8, 5 - i)).toISOString().slice(0, 10),
            ),
          }
        : { windowDays: 7 }),
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    manifestChecksum: 'a'.repeat(64),
    rowCount: 10,
    campaignCount: 1,
    rawOnlyCampaignCount: 0,
    warningCount: 0,
    groupCount: 1,
    completedGroupCount: 0,
    errorCode: null,
    errorMessage: null,
  };
}
function source(
  current: ReturnType<typeof attempt> | null,
  previous: ReturnType<typeof attempt> | null = null,
) {
  return {
    channelAccountId: current?.channelAccountId ?? previous?.channelAccountId ?? null,
    ready: current?.state === 'COMPLETE',
    refreshing: current?.state === 'RUNNING',
    latestAttempt: current,
    latestComplete: current?.state === 'COMPLETE' ? current : previous,
    actualCutoffAt: null,
  };
}
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  };
}

it.each(sources)(
  '$kind: lost begin and browser replies reconcile through the owner and retire the start key',
  async (entry) => {
    let current: ReturnType<typeof attempt> | null = null;
    let dispatches = 0;
    const keys: string[] = [],
      messages: Record<string, unknown>[] = [];
    const onComplete = vi.fn();
    localStorage.setItem('kiditem-ext-id', 'test-extension');
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage(
          _id: string,
          message: Record<string, unknown>,
          callback: (value: unknown) => void,
        ) {
          messages.push(message);
          if (message.action === 'ping')
            return callback({
              success: true,
              capabilities: { kiditemEnvironmentProfilesV1: true, [entry.capability]: true },
            });
          if (message.action === entry.action && ++dispatches === 1) {
            current = { ...current!, state: 'COMPLETE' };
            throw new Error('reply lost after publication');
          }
          if (message.action === entry.cancel) current = { ...current!, state: 'FAILED' };
          callback({ success: true }); // Not a source completion proof.
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url, 'http://localhost').pathname;
        if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
        if (path.endsWith('/source')) return Response.json(source(current));
        if (path.endsWith('/attempts') && init?.method === 'POST') {
          keys.push(new Headers(init.headers).get('Idempotency-Key')!);
          current = {
            ...attempt(entry.kind),
            ...(keys.length > 1 ? { attemptId: '33333333-3333-4333-8333-333333333333' } : {}),
          };
          if (keys.length === 1) throw new Error('begin response lost after admission');
        }
        return Response.json(current);
      }),
    );
    const { client, wrapper } = harness();
    const useCollect = entry.useCollect;
    const hook = renderHook(() => useCollect({ onComplete }), { wrapper });
    await waitFor(() => expect(hook.result.current.source.isSuccess).toBe(true));
    expect(messages).toEqual([]);
    expect(keys).toEqual([]);
    await act(() => hook.result.current.run());
    expect(hook.result.current.status?.state).toBe('RUNNING');
    await act(() => hook.result.current.run());
    expect(keys).toHaveLength(1);
    expect(hook.result.current.status?.state).toBe('COMPLETE');
    expect(onComplete).toHaveBeenCalledTimes(1);
    await act(() => hook.result.current.run());
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
    expect(hook.result.current.status?.state).toBe('RUNNING');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(messages.filter((m) => m.action === entry.action)).toEqual([
      { action: entry.action, attemptId: '11111111-1111-4111-8111-111111111111' },
      { action: entry.action, attemptId: '33333333-3333-4333-8333-333333333333' },
    ]);
    await act(() => hook.result.current.cancel());
    expect(hook.result.current.status?.state).toBe('FAILED');
    expect(messages.at(-1)).toEqual({
      action: entry.cancel,
      attemptId: '33333333-3333-4333-8333-333333333333',
    });
    hook.unmount();
    client.clear();
  },
);

it('campaign row displays prior COMPLETE dates beside latest failure and reads publication without executing Chrome', async () => {
  const previous = attempt('campaign', 'COMPLETE');
  const failed = {
    ...attempt('campaign', 'FAILED'),
    attemptId: '33333333-3333-4333-8333-333333333333',
    errorCode: 'LOGIN_REQUIRED',
    errorMessage: '광고센터 로그인이 필요합니다.',
  };
  let snapshot = source(failed as ReturnType<typeof attempt>, previous);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot)),
  );
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const { client, wrapper } = harness();
  const view = render(<AdSyncRow onComplete={vi.fn()} />, { wrapper });
  expect(await screen.findByText('광고센터 로그인이 필요합니다.')).toBeInTheDocument();
  expect(view.container).toHaveTextContent('2026-08-06 ~ 2026-09-05 · 갱신 필요');
  expect(screen.queryByText('최신')).not.toBeInTheDocument();
  const dataKey = [...queryKeys.ads.all, 'visible-campaign-data'];
  client.setQueryData(dataKey, { rows: [] });
  snapshot = source({ ...previous, attemptId: failed.attemptId, rawOnlyCampaignCount: 2 });
  await act(() => client.invalidateQueries({ queryKey: queryKeys.ads.campaignSource() }));
  expect(await screen.findByText('최신')).toBeInTheDocument();
  expect(view.container).toHaveTextContent('2개 원본만 보존');
  await waitFor(() => expect(client.getQueryState(dataKey)?.isInvalidated).toBe(true));
  expect(sendMessage).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
