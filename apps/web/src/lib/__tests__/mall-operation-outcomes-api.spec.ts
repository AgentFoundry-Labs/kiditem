import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.hoisted(() => vi.fn());
const mockGetParsed = vi.hoisted(() => vi.fn());

vi.mock('../api-client', () => ({
  apiClient: { post: mockPost, getParsed: mockGetParsed },
}));

vi.mock('../secure-random-uuid', () => ({
  createSecureRandomUuid: () => '11111111-1111-4111-8111-111111111111',
}));

import {
  mallOperationOutcomesApi,
  recordMallOperationOutcome,
  sanitizeOutcomeMessage,
} from '../mall-operation-outcomes-api';

describe('sanitizeOutcomeMessage', () => {
  it('drops URL query strings, folds whitespace and trims long text', () => {
    expect(sanitizeOutcomeMessage('실패 https://mall.example.com/admin?token=abc&id=1\n다시')).toBe(
      '실패 https://mall.example.com/admin 다시',
    );
    expect(sanitizeOutcomeMessage('가'.repeat(250))).toHaveLength(200);
    expect(sanitizeOutcomeMessage('   ')).toBeNull();
    expect(sanitizeOutcomeMessage(undefined)).toBeNull();
  });
});

describe('recordMallOperationOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({});
  });

  it('posts one outcome with an idempotency key and a sanitized message', async () => {
    await recordMallOperationOutcome({
      mallKey: 'onch',
      operation: 'order_collection',
      outcome: 'failed',
      reasonCode: 'network_failed',
      message: '실패 https://x.test/a?b=c',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/channels/mall-operation-outcomes',
      expect.objectContaining({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        mallKey: 'onch',
        operation: 'order_collection',
        outcome: 'failed',
        message: '실패 https://x.test/a',
      }),
      expect.objectContaining({ suppressNetworkErrorLog: true }),
    );
  });

  it('never blocks the work — a failed request is swallowed', async () => {
    mockPost.mockRejectedValueOnce(new Error('offline'));
    await expect(
      recordMallOperationOutcome({ mallKey: 'onch', operation: 'login_test', outcome: 'succeeded' }),
    ).resolves.toBeUndefined();
  });

  /** 기억에 비밀번호 같은 값이 섞이면 보내지 않고 버린다. */
  it('⭐ never sends unknown fields such as a password', async () => {
    const tainted = { mallKey: 'onch', operation: 'login_test', outcome: 'succeeded', password: 'secret' };
    await recordMallOperationOutcome(tainted as never);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('mallOperationOutcomesApi', () => {
  it('reads the summary for a day window', async () => {
    mockGetParsed.mockResolvedValue({ since: '', days: 7, total: 0, rows: [] });
    await mallOperationOutcomesApi.summary(7);
    expect(mockGetParsed).toHaveBeenCalledWith('/api/channels/mall-operation-outcomes/summary?days=7', expect.anything());
  });
});
