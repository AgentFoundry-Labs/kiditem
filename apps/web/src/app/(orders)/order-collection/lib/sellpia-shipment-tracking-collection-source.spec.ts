import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { apiClient } from '@/lib/api-client';
import { sellpiaShipmentTrackingCollectionSource } from './sellpia-shipment-tracking-collection-source';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));

const RUNNING_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const COMPLETE_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';

function status(patch: Partial<OrderCollectionSourceStatus> = {}): OrderCollectionSourceStatus {
  return {
    mallKey: null,
    channelAccountId: null,
    running: null,
    lastComplete: null,
    lastAttempt: null,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sellpiaShipmentTrackingCollectionSource', () => {
  /** 송장 조회는 부른 화면이 행을 받아 가는 흐름이라 시작은 그 화면이 그대로 한다. */
  it('shows the running collection and its stop without offering a second start', () => {
    const source = sellpiaShipmentTrackingCollectionSource();

    expect(source.start).toBeUndefined();
    expect(source.sourceKey).toBe('orders.sellpia_shipment_tracking');
    expect(source.readRunning(status({
      running: {
        attemptId: RUNNING_ATTEMPT_ID,
        collectionMode: null,
        startedAt: '2026-09-15T01:00:00.000Z',
        expiresAt: '2026-09-15T01:30:00.000Z',
      },
    }))).toEqual({ attemptId: RUNNING_ATTEMPT_ID, scopeLabel: null });
  });

  it('is not running once the lease expired', () => {
    expect(sellpiaShipmentTrackingCollectionSource().readRunning(status({
      lastAttempt: {
        attemptId: RUNNING_ATTEMPT_ID,
        state: 'FAILED',
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: '수집 시도가 만료되었습니다.',
        endedAt: '2026-09-15T01:30:00.000Z',
      },
    }))).toBeNull();
  });

  it('names the latest complete attempt', () => {
    expect(sellpiaShipmentTrackingCollectionSource().readCompleteId(status({
      lastComplete: {
        attemptId: COMPLETE_ATTEMPT_ID,
        completedAt: '2026-09-15T01:10:00.000Z',
        publicationSequence: null,
      },
    }))).toBe(COMPLETE_ATTEMPT_ID);
  });

  it('stops the running attempt through the owner cancel route, without an attempt token', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({});

    await sellpiaShipmentTrackingCollectionSource()
      .cancelOnServer!(RUNNING_ATTEMPT_ID, { status: undefined });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/orders/sellpia-shipment-tracking/attempts/${RUNNING_ATTEMPT_ID}/cancel`,
    );
  });
});
