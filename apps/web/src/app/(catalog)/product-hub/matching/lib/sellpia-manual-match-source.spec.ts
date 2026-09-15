import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellpiaManualMatchSourceStatus } from '@kiditem/shared/sellpia-manual-match';
import { apiClient } from '@/lib/api-client';
import { COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import { sellpiaManualMatchCollectionSource } from './sellpia-manual-match-source';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));

const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function attempt(patch: Record<string, unknown> = {}) {
  return {
    attemptId: RUNNING_ATTEMPT_ID,
    state: 'RUNNING' as const,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan: {} as never,
    contentChecksum: null,
    capturedAt: null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function status(
  patch: Partial<SellpiaManualMatchSourceStatus> = {},
): SellpiaManualMatchSourceStatus {
  return { latestAttempt: null, currentSnapshot: null, ...patch } as SellpiaManualMatchSourceStatus;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-09-15T01:00:00.000Z'));
});

/** 수동 매칭 수집은 매칭 화면이 스냅샷을 받아 가는 흐름이라 시작은 그대로 둔다. */
describe('sellpiaManualMatchCollectionSource', () => {
  it('shows the running attempt and its stop without offering a second start', () => {
    const adapter = sellpiaManualMatchCollectionSource();

    expect(adapter.start).toBeUndefined();
    expect(adapter.sourceKey).toBe('channels.sellpia_manual_match');
    expect(adapter.readRunning(status({ latestAttempt: attempt() })))
      .toEqual({ attemptId: RUNNING_ATTEMPT_ID, scopeLabel: null });
  });

  it('is not running once the lease expired', () => {
    expect(sellpiaManualMatchCollectionSource().readRunning(status({
      latestAttempt: attempt({ expiresAt: '2026-09-15T00:30:00.000Z' }),
    }))).toBeNull();
  });

  it('names the latest complete attempt', () => {
    expect(sellpiaManualMatchCollectionSource().readCompleteId(status({
      latestAttempt: attempt({ state: 'COMPLETE', capturedAt: '2026-09-15T01:00:00.000Z' }),
    }))).toBe(RUNNING_ATTEMPT_ID);
    expect(sellpiaManualMatchCollectionSource().readCompleteId(status({
      latestAttempt: attempt({ state: 'FAILED' }),
    }))).toBeNull();
  });

  /**
   * 수집은 매칭 실행이 시작하고, 끝나야 원천을 다시 읽었다. 60초짜리 대기 중에 짧은
   * 수집이 통째로 지나가 "수집 중단"이 한 번도 보이지 않았다(KID-170 D3).
   */
  it('reads the owner at the running cadence while the screen`s own run is in flight', () => {
    const poll = (adapter: ReturnType<typeof sellpiaManualMatchCollectionSource>) => {
      const interval = adapter.statusQuery.refetchInterval;
      return typeof interval === 'function'
        ? interval({ state: { status: 'success', error: null } } as never)
        : interval;
    };

    expect(poll(sellpiaManualMatchCollectionSource({ localStartInFlight: true })))
      .toBe(COLLECTION_RUNNING_POLL_MS);
    expect(poll(sellpiaManualMatchCollectionSource({ localStartInFlight: false }))).toBe(60_000);
    expect(poll(sellpiaManualMatchCollectionSource())).toBe(60_000);
  });

  it('stops the running attempt through the owner cancel route, without an attempt token', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});

    await sellpiaManualMatchCollectionSource()
      .cancelOnServer!(RUNNING_ATTEMPT_ID, { status: undefined });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/product-mappings/sellpia-manual-match/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    );
  });
});
