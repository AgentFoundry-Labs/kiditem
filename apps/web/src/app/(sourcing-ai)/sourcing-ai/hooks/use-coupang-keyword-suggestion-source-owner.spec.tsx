import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keywordSuggestionSnapshotQueryKey } from '../keywords/lib/coupang-keyword-snapshot-api';
import { useCoupangKeywordSuggestionSourceOwner } from './use-coupang-keyword-suggestion-source-owner';

const mocks = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: { get: (path: string) => mocks.list(path) } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: mocks.start }));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const PREVIOUS_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_KEYWORD_ID = '33333333-3333-4333-8333-333333333333';
const KEYWORD = '슬라임';

function operation(
  id: string,
  status: 'executing' | 'succeeded' | 'failed' | 'cancelled',
  keyword = KEYWORD,
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    kind: 'sourcing.coupang_keyword_suggestion',
    status,
    lockKeys: ['resource:coupang:keyword-slime'],
    plan: { source: 'coupang.keyword_suggestion', keyword, maxResults: 30 },
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-07T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-07T00:00:00.000Z',
    expiresAt: '2026-09-07T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

function renderOwner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = renderHook(
    () => useCoupangKeywordSuggestionSourceOwner({ keyword: KEYWORD }),
    { wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children) },
  );
  return { ...rendered, client };
}

describe('Coupang keyword suggestion collection as an operation kind (KID-360)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ operations: [] });
    mocks.start.mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
  });

  it('starts the kind with the keyword scope and refreshes the persisted snapshot once the operation succeeds', async () => {
    const { result, client } = renderOwner();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith('/api/operations?kinds=sourcing.coupang_keyword_suggestion&limit=20'));

    mocks.list.mockResolvedValue({ operations: [operation(OPERATION_ID, 'executing')] });
    await act(async () => {
      await result.current.collect(KEYWORD);
    });

    expect(mocks.start).toHaveBeenCalledWith('sourcing.coupang_keyword_suggestion', { keyword: KEYWORD, maxResults: 30 });
    await waitFor(() => expect(result.current.isCollecting).toBe(true));
    expect(result.current.latestAttempt).toMatchObject({ attemptId: OPERATION_ID, state: 'RUNNING' });

    mocks.list.mockResolvedValue({ operations: [operation(OPERATION_ID, 'succeeded')] });
    await act(async () => {
      await client.refetchQueries();
    });
    await waitFor(() => expect(result.current.latestAttempt).toMatchObject({ state: 'COMPLETE' }));
    expect(result.current.isCollecting).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keywordSuggestionSnapshotQueryKey(KEYWORD), exact: true });
  });

  it("reads only this keyword's operations and shows a failure over the previous success", async () => {
    mocks.list.mockResolvedValue({ operations: [
      operation(OTHER_KEYWORD_ID, 'executing', '지우개'),
      operation(OPERATION_ID, 'failed', KEYWORD, { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '쿠팡 로그인이 필요합니다.' }),
      operation(PREVIOUS_ID, 'succeeded'),
    ] });
    const { result } = renderOwner();

    await waitFor(() => expect(result.current.latestAttempt).toMatchObject({ attemptId: OPERATION_ID, state: 'FAILED' }));
    expect(result.current.latestAttempt?.errorMessage).toBe('쿠팡 로그인이 필요합니다.');
    expect(result.current.latestComplete).toMatchObject({ attemptId: PREVIOUS_ID, state: 'COMPLETE' });
    expect(result.current.isCollecting).toBe(false);
  });

  it('shows a stopped operation as a cancelled failure, and a lock refusal as the error', async () => {
    mocks.list.mockResolvedValue({ operations: [operation(OPERATION_ID, 'cancelled')] });
    mocks.start.mockResolvedValue({ outcome: 'refused', message: '같은 키워드를 이미 수집하고 있습니다.' });
    const { result } = renderOwner();

    await waitFor(() => expect(result.current.latestAttempt).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' }));
    await act(async () => {
      await expect(result.current.collect(KEYWORD)).rejects.toThrow('같은 키워드를 이미 수집하고 있습니다.');
    });
    await waitFor(() => expect(result.current.error).toBe('같은 키워드를 이미 수집하고 있습니다.'));
  });

  it('refuses an empty keyword before asking the extension', async () => {
    const { result } = renderOwner();
    await act(async () => {
      await expect(result.current.collect('   ')).rejects.toThrow('수집할 키워드를 입력해주세요.');
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
