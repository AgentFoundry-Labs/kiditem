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
    knownThrough: '2026-09-07',
    ready: false,
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
    // A success reply releases only once the owner attempt settles.
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(running))
      .mockResolvedValueOnce(attempt('COMPLETE'));

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
    // Only attempt creation gets a deadline; a hung POST must not pin the
    // dashboard button, and status reads keep the client read default.
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/ads/traffic/attempts',
      expect.objectContaining({ startDate: '2026-09-01', endDate: '2026-09-07' }),
      {
        headers: { 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' },
        timeoutMs: 30_000,
      },
    );
    for (const call of vi.mocked(apiClient.get).mock.calls) expect(call).toHaveLength(1);
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

describe('Wing traffic dispatch release', () => {
  const request = {
    startDate: '2026-09-01',
    endDate: '2026-09-07',
    url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
  };
  const created = { ...attempt('RUNNING'), receiptCount: 0 };
  const neverAnswered = () => new Promise<never>(() => undefined);

  function dispatchReplies(reply: () => Promise<unknown>) {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
      if ((message as { action?: string }).action === 'ping') {
        return {
          success: true,
          capabilities: { wingTrafficSourceOwnerV1: true, wingTrafficSourceOwnerV2: true },
        };
      }
      return reply();
    });
  }

  function track(promise: ReturnType<typeof collectWingTrafficSource>) {
    const seen: { outcome?: Awaited<typeof promise>; error?: unknown } = {};
    promise.then((outcome) => { seen.outcome = outcome; }, (error) => { seen.error = error; });
    return seen;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset().mockResolvedValue(created);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases on the terminal owner attempt while the extension dispatch is still unanswered', async () => {
    const expired = {
      ...attempt('FAILED'),
      errorCode: 'ATTEMPT_EXPIRED',
      errorMessage: 'Wing traffic collection expired.',
    };
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValueOnce(created)
      .mockResolvedValue(expired);
    dispatchReplies(neverAnswered);

    const seen = track(collectWingTrafficSource(request));
    await vi.advanceTimersByTimeAsync(4_000);

    expect(seen.error).toBeUndefined();
    expect(seen.outcome).toMatchObject({
      release: 'terminal',
      attempt: { state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' },
    });
  });

  it('releases as unresponsive (the card notice) after 90 seconds without attempt progress and leaves the attempt running', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValue(created);
    dispatchReplies(neverAnswered);

    const seen = track(collectWingTrafficSource(request));
    await vi.advanceTimersByTimeAsync(88_000);
    expect(seen.outcome).toBeUndefined();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(seen.error).toBeUndefined();
    expect(seen.outcome).toMatchObject({
      release: 'extension-unresponsive',
      attempt: { attemptId: created.attemptId, state: 'RUNNING' },
    });
    // The owner attempt is not failed on the extension's behalf.
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('keeps the request pending without the unresponsive release when progress first arrives at 60 seconds', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValue(created);
    dispatchReplies(neverAnswered);

    const seen = track(collectWingTrafficSource(request));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(seen.outcome).toBeUndefined();

    // Real Chrome runs have uploaded their first receipt 30 to 50 seconds in.
    vi.mocked(apiClient.get).mockResolvedValue({ ...created, receiptCount: 1 });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(seen.error).toBeUndefined();
    expect(seen.outcome).toBeUndefined();

    vi.mocked(apiClient.get).mockResolvedValue(attempt('COMPLETE'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(seen.outcome).toMatchObject({ release: 'terminal', attempt: { state: 'COMPLETE' } });
  });

  it.each([
    [
      'a Korean refusal as sent',
      () => Promise.resolve({
        success: false,
        attemptId: created.attemptId,
        terminalState: 'RUNNING',
        continuationRequired: false,
        error: '다른 Wing 트래픽 수집이 진행 중입니다.',
      }),
      '다른 Wing 트래픽 수집이 진행 중입니다.',
    ],
    [
      'an English refusal reason as a Korean sentence',
      () => Promise.resolve({
        success: false,
        attemptId: created.attemptId,
        terminalState: 'RUNNING',
        continuationRequired: false,
        errorCode: 'SOURCE_OWNER_UNAVAILABLE',
        error: 'Wing traffic completion acknowledgement did not match the manifest.',
      }),
      'Wing 트래픽 수집 확장이 작업을 마치지 못했습니다.',
    ],
    [
      'a browser transport failure as a Korean sentence',
      () => Promise.reject(new Error('The message port closed before a response was received.')),
      '확장과 통신하지 못했습니다. 확장 상태를 확인한 뒤 다시 시도해 주세요.',
    ],
  ])('releases on a failed extension answer and shows %s', async (_label, reply, message) => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValue(created);
    dispatchReplies(reply);

    const seen = track(collectWingTrafficSource(request));
    await vi.advanceTimersByTimeAsync(100);

    expect(seen.error).toBeUndefined();
    expect(seen.outcome).toMatchObject({
      release: 'extension-failed',
      failure: message,
      attempt: { state: 'RUNNING' },
    });
    await expect(seen.outcome?.extensionReply).resolves.toEqual({ ok: false, message });
  });

  it('keeps waiting for the terminal attempt after a success reply', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValue(created);
    dispatchReplies(() => Promise.resolve({
      success: true,
      attemptId: created.attemptId,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    }));

    const seen = track(collectWingTrafficSource(request));
    // A success reply proves the extension ran, so the 90-second no-progress grace no longer applies.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(seen.outcome).toBeUndefined();

    vi.mocked(apiClient.get).mockResolvedValue(attempt('COMPLETE'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(seen.error).toBeUndefined();
    expect(seen.outcome).toMatchObject({ release: 'terminal', attempt: { state: 'COMPLETE' } });
  });

  it('stops reading the attempt once the request is aborted', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(source(attempt('FAILED')))
      .mockResolvedValue(created);
    dispatchReplies(neverAnswered);
    const controller = new AbortController();

    const seen = track(collectWingTrafficSource(request, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(4_000);
    const readsBeforeAbort = vi.mocked(apiClient.get).mock.calls.length;
    expect(readsBeforeAbort).toBeGreaterThan(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(readsBeforeAbort);
    expect(seen.outcome).toBeUndefined();
    expect(seen.error).toMatchObject({ name: 'AbortError' });
  });
});

describe('Wing traffic extension messages', () => {
  it('names a failed cancel dispatch in Korean instead of the browser transport error', async () => {
    vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
      if ((message as { action?: string }).action === 'ping') {
        return {
          success: true,
          capabilities: { wingTrafficSourceOwnerV1: true, wingTrafficSourceOwnerV2: true },
        };
      }
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });

    await expect(cancelWingTrafficSource(attempt('RUNNING').attemptId, 'wing-traffic-daily-v2'))
      .rejects.toThrow('확장과 통신하지 못했습니다. 확장 상태를 확인한 뒤 다시 시도해 주세요.');
  });
});
