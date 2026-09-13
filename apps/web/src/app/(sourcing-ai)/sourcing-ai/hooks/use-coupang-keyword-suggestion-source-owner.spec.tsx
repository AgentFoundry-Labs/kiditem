import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { keywordSuggestionSnapshotQueryKey } from '../keywords/lib/coupang-keyword-snapshot-api';
import { coupangKeywordSuggestionAttemptStorageKey } from '../keywords/lib/coupang-keyword-source-owner';
import { useCoupangKeywordSuggestionSourceOwner } from './use-coupang-keyword-suggestion-source-owner';

const api = vi.hoisted(() => ({ getParsed: vi.fn() }));
const extension = vi.hoisted(() => ({ detect: vi.fn(), send: vi.fn() }));
const auth = vi.hoisted(() => ({ organizationId: 'org-1' as string | null }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: extension.detect,
  sendToExtension: extension.send,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: auth.organizationId ? { organizationId: auth.organizationId } : null }),
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const KEYWORD = '슬라임';

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING',
  attemptId = ATTEMPT_ID,
  patch: Record<string, unknown> = {},
) {
  return {
    attemptId,
    sourceKey: 'coupang.keyword_suggestion',
    scopeKey: 'default',
    targetKey: 'keyword:슬라임',
    generation: 1,
    state,
    plan: { source: 'coupang.keyword_suggestion', keyword: KEYWORD, maxResults: 30 },
    planChecksum: 'plan-checksum',
    contentChecksum: null,
    acceptedCount: 0,
    expiresAt: '2099-01-01T00:15:00.000Z',
    errorCode: null,
    errorMessage: null,
    completedAt: state === 'COMPLETE' ? '2026-09-07T00:00:00.000Z' : null,
    ...patch,
  };
}

function status(
  latestAttempt: ReturnType<typeof attempt> | null,
  latestComplete: ReturnType<typeof attempt> | null = null,
) {
  return {
    ready: latestAttempt?.state === 'COMPLETE',
    latestAttempt,
    latestComplete,
    actualCutoffAt: latestComplete?.completedAt ?? null,
    errorCode: latestAttempt?.errorCode ?? null,
    errorMessage: latestAttempt?.errorMessage ?? null,
  };
}

function renderOwner(client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})) {
  const rendered = renderHook(
    () => useCoupangKeywordSuggestionSourceOwner({ keyword: KEYWORD }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...rendered, client };
}

let currentAttempt: ReturnType<typeof attempt>;
let currentStatus: ReturnType<typeof status>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.organizationId = 'org-1';
  currentAttempt = attempt();
  currentStatus = status(null);
  extension.detect.mockResolvedValue('kiditem-os');
  extension.send.mockResolvedValue({ success: true, attemptId: ATTEMPT_ID, state: 'COMPLETE' });
  api.getParsed.mockImplementation(async (path: string, schema: { parse: (value: unknown) => unknown }) => (
    schema.parse(path.includes('/current') ? currentStatus : currentAttempt)
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Coupang keyword suggestion source owner', () => {
  it('dispatches the exact worker action and invalidates the persisted snapshot after owner COMPLETE', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keywordSuggestionSnapshotQueryKey(KEYWORD), { keyword: KEYWORD });
    const owner = renderOwner(client);
    await waitFor(() => expect(api.getParsed).toHaveBeenCalledWith(
      `/api/sourcing/workspace/keyword-suggestions/current?keyword=${encodeURIComponent(KEYWORD)}`,
      expect.anything(),
    ));

    currentAttempt = attempt('COMPLETE');
    currentStatus = status(currentAttempt, currentAttempt);
    await act(async () => {
      await expect(owner.result.current.collect()).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
      });
    });

    expect(extension.send).toHaveBeenCalledWith(
      'kiditem-os',
      {
        action: 'collectSourcingKeywordSuggestions',
        idempotencyKey: expect.any(String),
        keyword: KEYWORD,
        maxResults: 30,
      },
      null,
    );
    expect(client.getQueryState(keywordSuggestionSnapshotQueryKey(KEYWORD))?.isInvalidated).toBe(true);
    owner.unmount();
    client.clear();
  });

  it('shows an owner FAILED attempt while leaving the previous COMPLETE snapshot untouched', async () => {
    const previous = attempt('COMPLETE', ATTEMPT_ID);
    currentAttempt = attempt('FAILED', NEXT_ATTEMPT_ID, {
      errorCode: 'keyword_suggestion_collection_failed',
      errorMessage: 'Coupang is unavailable.',
    });
    currentStatus = status(currentAttempt, previous);
    extension.send.mockResolvedValue({
      success: false,
      attemptId: NEXT_ATTEMPT_ID,
      state: 'FAILED',
      errorCode: 'keyword_suggestion_collection_failed',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keywordSuggestionSnapshotQueryKey(KEYWORD), { keyword: KEYWORD, items: ['old'] });
    const owner = renderOwner(client);

    await act(async () => {
      await expect(owner.result.current.collect()).resolves.toMatchObject({
        attemptId: NEXT_ATTEMPT_ID,
        state: 'FAILED',
      });
    });

    expect(owner.result.current.latestAttempt?.state).toBe('FAILED');
    expect(owner.result.current.latestComplete?.attemptId).toBe(ATTEMPT_ID);
    expect(client.getQueryState(keywordSuggestionSnapshotQueryKey(KEYWORD))?.isInvalidated).toBe(false);
    owner.unmount();
    client.clear();
  });

  it('persists the idempotency key before a lost extension response and reuses it on explicit retry', async () => {
    extension.send
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({ success: true, attemptId: ATTEMPT_ID, state: 'COMPLETE' });
    currentAttempt = attempt('COMPLETE');
    currentStatus = status(currentAttempt, currentAttempt);
    const owner = renderOwner();

    await act(async () => {
      await expect(owner.result.current.collect()).rejects.toThrow('extension response lost');
    });
    const pendingKey = localStorage.getItem(
      Object.keys(localStorage).find((key) => key.includes('coupang-keyword-suggestion-attempt'))!,
    );
    expect(pendingKey).toContain('idempotencyKey');

    await act(async () => {
      await owner.result.current.collect();
    });
    const firstKey = extension.send.mock.calls[0]?.[1]?.idempotencyKey;
    const secondKey = extension.send.mock.calls[1]?.[1]?.idempotencyKey;
    expect(firstKey).toBe(secondKey);
    expect(localStorage.length).toBe(0);
    owner.unmount();
  });

  it('displays newer server RUNNING and FAILED attempts over an older local terminal reference without provider work', async () => {
    for (const state of ['RUNNING', 'FAILED'] as const) {
      localStorage.clear();
      const previous = attempt('COMPLETE', ATTEMPT_ID);
      const newer = attempt(state, NEXT_ATTEMPT_ID, state === 'FAILED'
        ? { errorCode: 'keyword_suggestion_collection_failed', errorMessage: 'Coupang is unavailable.' }
        : {});
      localStorage.setItem(
        coupangKeywordSuggestionAttemptStorageKey('org-1', KEYWORD),
        JSON.stringify({
          attemptId: ATTEMPT_ID,
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
          keyword: KEYWORD,
          maxResults: 30,
        }),
      );
      currentAttempt = newer;
      currentStatus = status(newer, previous);
      const owner = renderOwner();

      await waitFor(() => expect(owner.result.current.latestAttempt).toMatchObject({
        attemptId: NEXT_ATTEMPT_ID,
        state,
      }));
      expect(owner.result.current.latestComplete?.attemptId).toBe(ATTEMPT_ID);
      expect(api.getParsed.mock.calls.some(([path]) => String(path).includes('/attempts/'))).toBe(false);
      expect(extension.detect).not.toHaveBeenCalled();
      expect(extension.send).not.toHaveBeenCalled();
      owner.unmount();
      owner.client.clear();
    }
  });

  it('clears a stale persisted attempt only on an explicit retry', async () => {
    localStorage.setItem(
      coupangKeywordSuggestionAttemptStorageKey('org-1', KEYWORD),
      JSON.stringify({
        attemptId: ATTEMPT_ID,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
        keyword: KEYWORD,
        maxResults: 30,
      }),
    );
    let attemptReads = 0;
    api.getParsed.mockImplementation(async (path: string, schema: { parse: (value: unknown) => unknown }) => {
      if (path.includes(`/attempts/${ATTEMPT_ID}`)) {
        attemptReads += 1;
        if (attemptReads === 1) {
          throw new ApiError(404, 'SOURCE_ATTEMPT_NOT_FOUND', 'not found');
        }
        return schema.parse(currentAttempt);
      }
      return schema.parse(status(null));
    });
    currentAttempt = attempt('COMPLETE');
    extension.send.mockResolvedValue({ success: true, attemptId: ATTEMPT_ID, state: 'COMPLETE' });
    const owner = renderOwner();
    await waitFor(() => expect(api.getParsed).toHaveBeenCalled());
    expect(extension.send).not.toHaveBeenCalled();

    await act(async () => {
      await expect(owner.result.current.collect()).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
      });
    });
    expect(extension.detect).toHaveBeenCalled();
    expect(extension.send).toHaveBeenCalled();
    owner.unmount();
  });
});
