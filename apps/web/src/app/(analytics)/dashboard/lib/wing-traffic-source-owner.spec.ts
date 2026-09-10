import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import {
  cancelWingTrafficSource,
  collectWingTrafficSource,
  WingTrafficRangeMismatchError,
} from './wing-traffic-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: vi.fn(() => '33333333-3333-4333-8333-333333333333'),
}));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function plan(parserVersion: 'wing-traffic-v1' | 'wing-traffic-daily-v2' = 'wing-traffic-daily-v2') {
  return parserVersion === 'wing-traffic-v1'
    ? {
      sourceType: 'coupang_wing_traffic' as const,
      parserVersion,
      channelAccountId: ACCOUNT_ID,
      expectedAdvertiserId: 'A123',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      businessDate: '2026-09-01',
      periodDays: 7,
      targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    }
    : {
      sourceType: 'coupang_wing_traffic' as const,
      parserVersion,
      channelAccountId: ACCOUNT_ID,
      expectedAdvertiserId: 'A123',
      providerVendorId: 'A123',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      businessDate: '2026-09-07',
      periodDays: 7,
      expectedDates: [
        '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
        '2026-09-05', '2026-09-06', '2026-09-07',
      ],
      filterScope: 'ALL_NORMAL_RFM' as const,
      targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    };
}

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  parserVersion: 'wing-traffic-v1' | 'wing-traffic-daily-v2' = 'wing-traffic-daily-v2',
) {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    channelAccountId: ACCOUNT_ID,
    state,
    plan: plan(parserVersion),
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-08T00:00:00.000Z' : null,
    manifestChecksum: 'a'.repeat(64),
    rowCount: 0,
    matchedRowCount: 0,
    unmatchedRowCount: 0,
    receiptCount: state === 'RUNNING' ? 2 : 7,
    expectedPages: 7,
    terminalPageObserved: state === 'COMPLETE',
    errorCode: state === 'FAILED' ? 'PROVIDER_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'Wing 응답 오류' : null,
  };
}

function source(latestAttempt: ReturnType<typeof attempt>) {
  return {
    channelAccountId: ACCOUNT_ID,
    status: 'MISSING' as const,
    refreshing: latestAttempt.state === 'RUNNING',
    latestAttempt,
    latestComplete: null,
    actualCutoffAt: null,
  };
}

beforeEach(() => {
  vi.mocked(detectExtensionId).mockResolvedValue('wing-extension');
  vi.mocked(sendToExtension).mockResolvedValue({
    success: true,
    capabilities: {
      wingTrafficSourceOwnerV1: true,
      wingTrafficSourceOwnerV2: true,
    },
  });
  vi.mocked(transferExtensionAuthTo).mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('Wing traffic source owner bridge', () => {
  it('blocks a wrong-range resume before extension detection', async () => {
    const running = attempt('RUNNING', 'wing-traffic-v1');
    vi.mocked(apiClient.get).mockResolvedValue(source(running));

    await expect(collectWingTrafficSource({
      startDate: '2026-09-02',
      endDate: '2026-09-06',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    })).rejects.toBeInstanceOf(WingTrafficRangeMismatchError);

    expect(detectExtensionId).not.toHaveBeenCalled();
    expect(transferExtensionAuthTo).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('resumes a same-range active owner attempt without creating a second attempt', async () => {
    const running = attempt('RUNNING');
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(running))
      .mockResolvedValueOnce(running);

    await collectWingTrafficSource({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    });

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(sendToExtension).toHaveBeenLastCalledWith(
      'wing-extension',
      { action: 'collectAdvertisingWingTraffic', attemptId: running.attemptId },
      expect.any(Number),
    );
  });

  it('reuses the extension owner cancellation action for a running attempt', async () => {
    const running = attempt('RUNNING', 'wing-traffic-daily-v2');
    const cancelled = {
      ...attempt('FAILED', 'wing-traffic-daily-v2'),
      errorCode: 'USER_CANCELLED',
      errorMessage: '사용자가 Wing 트래픽 수집을 중단했습니다.',
    };
    vi.mocked(apiClient.get).mockResolvedValue(cancelled);

    await cancelWingTrafficSource(running.attemptId, running.plan.parserVersion);

    expect(sendToExtension).toHaveBeenLastCalledWith(
      'wing-extension',
      { action: 'cancelAdvertisingWingTraffic', attemptId: running.attemptId },
      expect.any(Number),
    );
  });

  it('requires the daily extension capability before a failed retry creates a new attempt', async () => {
    const failed = attempt('FAILED', 'wing-traffic-daily-v2');
    const restarted = attempt('RUNNING', 'wing-traffic-daily-v2');
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(failed))
      .mockResolvedValueOnce({ ...restarted, state: 'COMPLETE' });
    vi.mocked(apiClient.post).mockResolvedValue(restarted);

    await collectWingTrafficSource({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    });

    expect(sendToExtension).toHaveBeenCalledWith('wing-extension', { action: 'ping' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/ads/traffic/attempts',
      expect.objectContaining({ startDate: '2026-09-01', endDate: '2026-09-07' }),
      { headers: { 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' } },
    );
  });

  it('re-checks an admitted running range before dispatching after a create race', async () => {
    const failed = attempt('FAILED', 'wing-traffic-daily-v2');
    const admitted = {
      ...attempt('RUNNING', 'wing-traffic-v1'),
      plan: {
        ...plan('wing-traffic-v1'),
        startDate: '2026-09-02',
        endDate: '2026-09-08',
      },
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(source(failed));
    vi.mocked(apiClient.post).mockResolvedValue(admitted);

    await expect(collectWingTrafficSource({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    })).rejects.toBeInstanceOf(WingTrafficRangeMismatchError);

    // The initial capability ping is allowed before admission; the browser
    // action itself must not be sent for another tab's wrong-range attempt.
    expect(sendToExtension).toHaveBeenCalledTimes(1);
    expect(sendToExtension).toHaveBeenCalledWith('wing-extension', { action: 'ping' });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('re-checks parser capability when admission returns a legacy running attempt', async () => {
    const failed = attempt('FAILED', 'wing-traffic-daily-v2');
    const admitted = attempt('RUNNING', 'wing-traffic-v1');
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(failed))
      .mockResolvedValueOnce(admitted);
    vi.mocked(apiClient.post).mockResolvedValue(admitted);

    await collectWingTrafficSource({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    });

    expect(sendToExtension).toHaveBeenNthCalledWith(1, 'wing-extension', { action: 'ping' });
    expect(sendToExtension).toHaveBeenNthCalledWith(2, 'wing-extension', { action: 'ping' });
    expect(sendToExtension).toHaveBeenNthCalledWith(
      3,
      'wing-extension',
      { action: 'collectAdvertisingWingTraffic', attemptId: admitted.attemptId },
      expect.any(Number),
    );
    expect(transferExtensionAuthTo).toHaveBeenCalledTimes(2);
  });
});
