import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellpiaManualMatchSourceStatus } from '@kiditem/shared/sellpia-manual-match';
import { apiClient } from '@/lib/api-client';
import { requestOperationCancel } from '@/lib/operation-start';
import { COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import { sellpiaManualMatchCollectionSource } from './sellpia-manual-match-source';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));

const OPERATION_ID = '22222222-2222-4222-8222-222222222222';

function operation(status: 'executing' | 'succeeded' | 'failed') {
  return {
    id: OPERATION_ID,
    kind: 'channels.sellpia_manual_match',
    status,
    lockKeys: status === 'executing' ? ['resource:sellpia:login'] : [],
    plan: null,
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-15T00:59:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-15T01:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  } as unknown as NonNullable<SellpiaManualMatchSourceStatus['latestOperation']>;
}

function status(latestOperation: SellpiaManualMatchSourceStatus['latestOperation'] = null): SellpiaManualMatchSourceStatus {
  return { latestOperation, currentSnapshot: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** 수동 매칭 수집은 매칭 화면이 스냅샷을 받아 가는 흐름이라 시작은 화면이 한다(KID-363: 실행 계약). */
describe('sellpiaManualMatchCollectionSource', () => {
  it('shows the running operation and its stop without offering a second start', () => {
    const adapter = sellpiaManualMatchCollectionSource();

    expect(adapter.start).toBeUndefined();
    expect(adapter.sourceKey).toBe('channels.sellpia_manual_match');
    expect(adapter.readRunning(status(operation('executing')))).toEqual({ attemptId: OPERATION_ID, scopeLabel: null });
    expect(adapter.readRunning(status(operation('failed')))).toBeNull();
  });

  it('names the latest succeeded operation', () => {
    expect(sellpiaManualMatchCollectionSource().readCompleteId(status(operation('succeeded')))).toBe(OPERATION_ID);
    expect(sellpiaManualMatchCollectionSource().readCompleteId(status(operation('failed')))).toBeNull();
  });

  /**
   * 수집은 매칭 실행이 시작하고, 끝나야 원천을 다시 읽었다. 60초짜리 대기 중에 짧은
   * 수집이 통째로 지나가 "수집 중단"이 한 번도 보이지 않았다(KID-170 D3).
   */
  it('reads the source at the running cadence while the screen`s own run or any run is in flight', () => {
    const poll = (adapter: ReturnType<typeof sellpiaManualMatchCollectionSource>, data?: SellpiaManualMatchSourceStatus) => {
      const interval = adapter.statusQuery.refetchInterval;
      return typeof interval === 'function'
        ? interval({ state: { status: 'success', error: null, data } } as never)
        : interval;
    };

    expect(poll(sellpiaManualMatchCollectionSource({ localStartInFlight: true }))).toBe(COLLECTION_RUNNING_POLL_MS);
    expect(poll(sellpiaManualMatchCollectionSource(), status(operation('executing')))).toBe(COLLECTION_RUNNING_POLL_MS);
    expect(poll(sellpiaManualMatchCollectionSource({ localStartInFlight: false }))).toBe(60_000);
  });

  it('stops the running operation in this browser and on the server', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});
    const adapter = sellpiaManualMatchCollectionSource();

    await adapter.cancelInExtension!(OPERATION_ID, { status: undefined });
    await adapter.cancelOnServer!(OPERATION_ID, { status: undefined });

    expect(requestOperationCancel).toHaveBeenCalledWith(OPERATION_ID);
    expect(apiClient.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
  });
});
