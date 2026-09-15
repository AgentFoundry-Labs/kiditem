import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import {
  coupangShipmentSummaryCollectionSource,
  type CoupangShipmentSummarySource,
} from '@/lib/coupang-shipment-summary-action';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));

const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function attempt(patch: Record<string, unknown> = {}) {
  return {
    attemptId: RUNNING_ATTEMPT_ID,
    state: 'RUNNING' as const,
    generation: '7',
    plan: {
      sourceType: 'coupang_shipment_summary' as const,
      parserVersion: 'shipment-summary-v1' as const,
      maxPages: 10,
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function source(patch: Partial<CoupangShipmentSummarySource> = {}): CoupangShipmentSummarySource {
  return {
    ready: false,
    latestAttempt: null,
    latestComplete: null,
    items: [],
    capturedItems: [],
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-09-15T01:00:00.000Z'));
});

/** 발송일 조회는 달력 화면이 직접 시작한다. 공용 컨트롤은 진행 중과 중단만 맡는다. */
describe('coupangShipmentSummaryCollectionSource', () => {
  it('shows the running attempt and its stop without offering a second start', () => {
    const adapter = coupangShipmentSummaryCollectionSource();

    expect(adapter.start).toBeUndefined();
    expect(adapter.readRunning(source({ latestAttempt: attempt() })))
      .toEqual({ attemptId: RUNNING_ATTEMPT_ID, scopeLabel: null });
  });

  it('is not running once the lease expired', () => {
    expect(coupangShipmentSummaryCollectionSource().readRunning(source({
      latestAttempt: attempt({ expiresAt: '2026-09-15T00:30:00.000Z' }),
    }))).toBeNull();
  });

  it('names the latest complete generation', () => {
    expect(coupangShipmentSummaryCollectionSource().readCompleteId(source({
      latestComplete: attempt({ state: 'COMPLETE', generation: '9' }),
    }))).toBe('9');
    expect(coupangShipmentSummaryCollectionSource().readCompleteId(source())).toBeNull();
  });

  /**
   * 조회는 이 화면이 시작하고, 끝나야 원천을 다시 읽었다. 60초짜리 대기 중에 11초짜리
   * 조회가 통째로 지나가 "수집 중단"이 한 번도 보이지 않았다(KID-170 D3).
   */
  it('reads the owner at the running cadence while the screen`s own query is in flight', () => {
    const poll = (adapter: ReturnType<typeof coupangShipmentSummaryCollectionSource>) => {
      const interval = adapter.statusQuery.refetchInterval;
      return typeof interval === 'function'
        ? interval({ state: { status: 'success', error: null } } as never)
        : interval;
    };

    expect(poll(coupangShipmentSummaryCollectionSource({ localStartInFlight: true })))
      .toBe(COLLECTION_RUNNING_POLL_MS);
    expect(poll(coupangShipmentSummaryCollectionSource({ localStartInFlight: false }))).toBe(60_000);
    expect(poll(coupangShipmentSummaryCollectionSource())).toBe(60_000);
  });

  it('stops the running attempt through the owner cancel route, without an attempt token', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});

    await coupangShipmentSummaryCollectionSource()
      .cancelOnServer!(RUNNING_ATTEMPT_ID, { status: undefined });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/coupang-shipments/date-summary/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    );
  });
});
