import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useAdKeywordCollect } from './useAdKeywordCollect';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const attempt = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  channelAccountId: '22222222-2222-4222-8222-222222222222',
  state: 'RUNNING',
  plan: {
    sourceType: 'coupang_ad_keyword',
    parserVersion: 'ad-keyword-v1',
    channelAccountId: '22222222-2222-4222-8222-222222222222',
    expectedAdvertiserId: 'A123',
    startDate: '2026-08-30',
    endDate: '2026-09-05',
    windowDays: 7,
  },
  expiresAt: '2099-01-01T00:00:00.000Z',
  actualCutoffAt: null,
  manifestChecksum: 'a'.repeat(64),
  rowCount: 120,
  groupCount: 10,
  completedGroupCount: 5,
  errorCode: null,
  errorMessage: null,
};

it('refreshes visible ad data when owner polling observes completion without browser execution', async () => {
  const snapshot = {
    status: 'MISSING',
    refreshing: true,
    latestAttempt: attempt,
    latestComplete: null,
    channelAccountId: attempt.channelAccountId,
    actualCutoffAt: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(snapshot)),
  );
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const adDataKey = [...queryKeys.ads.all, 'visible-keyword-data'];
  client.setQueryData(adDataKey, { rows: [] });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useAdKeywordCollect(), { wrapper });
  await waitFor(() => expect(hook.result.current.source.isSuccess).toBe(true));
  expect(client.getQueryState(adDataKey)?.isInvalidated).toBe(false);

  await act(async () => {
    client.setQueryData(queryKeys.ads.keywordSource(), {
      ...snapshot,
      status: 'READY',
      refreshing: false,
      latestAttempt: { ...attempt, state: 'COMPLETE' },
      latestComplete: { ...attempt, state: 'COMPLETE' },
    });
  });
  await waitFor(() => expect(client.getQueryState(adDataKey)?.isInvalidated).toBe(true));
  expect(sendMessage).not.toHaveBeenCalled();
  hook.unmount();
  client.clear();
});

it.each([
  { outcome: 'budget pause', state: 'RUNNING', lostReply: false },
  { outcome: 'lost reply after COMPLETE', state: 'COMPLETE', lostReply: true },
])(
  'mount only reads; explicit continuation reuses the attempt: $outcome',
  async ({ state, lostReply }) => {
    const methods: string[] = [];
    const messages: Record<string, unknown>[] = [];
    const onComplete = vi.fn();
    let current = { ...attempt };
    localStorage.setItem('kiditem-ext-id', 'keyword-extension');
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage(
          _id: string,
          message: Record<string, unknown>,
          callback: (result: unknown) => void,
        ) {
          messages.push(message);
          if (message.action === 'collectAdvertisingKeywords') {
            current = { ...attempt, state };
            if (lostReply) throw new Error('extension port closed after owner commit');
          }
          if (message.action === 'cancelAdvertisingKeywords')
            current = { ...attempt, state: 'FAILED' };
          callback(
            message.action === 'ping'
              ? {
                  success: true,
                  version: 'test',
                  capabilities: {
                    kiditemEnvironmentProfilesV1: true,
                    advertisingKeywordSourceOwnerV1: true,
                  },
                }
              : message.action === 'collectAdvertisingKeywords'
                ? {
                    success: false,
                    attemptId: attempt.attemptId,
                    terminalState: 'RUNNING',
                    continuationRequired: true,
                  }
                : { success: true },
          );
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url, 'http://localhost').pathname;
        methods.push(init?.method ?? 'GET');
        if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
        if (path.endsWith('/source'))
          return Response.json({
            status: state === 'COMPLETE' ? 'READY' : 'MISSING',
            refreshing: current.state === 'RUNNING',
            latestAttempt: current,
            latestComplete: current.state === 'COMPLETE' ? current : null,
            channelAccountId: attempt.channelAccountId,
            actualCutoffAt: null,
          });
        return Response.json(current);
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(() => useAdKeywordCollect({ onComplete }), {
      wrapper,
    });
    await waitFor(() =>
      expect(hook.result.current.source.data?.latestAttempt?.attemptId).toBe(attempt.attemptId),
    );
    expect(methods.every((method) => method === 'GET')).toBe(true);
    expect(messages).toEqual([]);

    await act(async () => {
      await hook.result.current.run();
    });

    expect(messages.find((message) => message.action === 'collectAdvertisingKeywords')).toEqual({
      action: 'collectAdvertisingKeywords',
      attemptId: attempt.attemptId,
    });
    expect(methods.filter((method) => method === 'POST')).toHaveLength(1); // Auth handoff only; no begin.
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.status?.state).toBe(state);
    expect(onComplete).toHaveBeenCalledTimes(state === 'COMPLETE' ? 1 : 0);
    if (state === 'RUNNING') {
      await act(async () => {
        await hook.result.current.cancel();
      });
      expect(messages.find((message) => message.action === 'cancelAdvertisingKeywords')).toEqual({
        action: 'cancelAdvertisingKeywords',
        attemptId: attempt.attemptId,
      });
      expect(hook.result.current.status?.state).toBe('FAILED');
    }
    hook.unmount();
    client.clear();
  },
);

it('keeps a start key after response loss and replaces it only for the next explicit collection', async () => {
  const keys: string[] = [];
  const onComplete = vi.fn();
  let current: typeof attempt | null = null;
  localStorage.setItem('kiditem-ext-id', 'keyword-extension');
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage(
        _id: string,
        message: Record<string, unknown>,
        callback: (result: unknown) => void,
      ) {
        if (message.action === 'collectAdvertisingKeywords')
          current = { ...attempt, state: 'COMPLETE', completedGroupCount: 10 };
        callback(
          message.action === 'ping'
            ? {
                success: true,
                capabilities: {
                  kiditemEnvironmentProfilesV1: true,
                  advertisingKeywordSourceOwnerV1: true,
                },
              }
            : {
                success: true,
                attemptId: attempt.attemptId,
                terminalState: 'COMPLETE',
                continuationRequired: false,
              },
        );
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
      if (path.endsWith('/source'))
        return Response.json({
          status: current?.state === 'COMPLETE' ? 'READY' : 'MISSING',
          refreshing: current?.state === 'RUNNING',
          latestAttempt: current,
          latestComplete: current?.state === 'COMPLETE' ? current : null,
          channelAccountId: attempt.channelAccountId,
          actualCutoffAt: null,
        });
      if (path.endsWith('/attempts')) {
        keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
        if (keys.length === 1) throw new Error('start response lost');
        current = { ...attempt };
        return Response.json(current);
      }
      return Response.json(current);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useAdKeywordCollect({ onComplete }), {
    wrapper,
  });
  await waitFor(() => expect(hook.result.current.source.isSuccess).toBe(true));

  await act(async () => {
    await hook.result.current.run();
  });
  expect(keys).toHaveLength(1);
  await act(async () => {
    await hook.result.current.run();
  });
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(onComplete).toHaveBeenCalledTimes(1);
  await act(async () => {
    await hook.result.current.run();
  });
  expect(keys).toHaveLength(3);
  expect(keys[2]).not.toBe(keys[1]);
  hook.unmount();
  client.clear();
});
