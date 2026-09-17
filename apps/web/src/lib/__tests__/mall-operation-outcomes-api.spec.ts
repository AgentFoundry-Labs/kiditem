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
      operation: 'registration_fill',
      outcome: 'failed',
      message: '실패 https://x.test/a?b=c',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/channels/mall-operation-outcomes',
      expect.objectContaining({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        mallKey: 'onch',
        operation: 'registration_fill',
        outcome: 'failed',
        message: '실패 https://x.test/a',
      }),
      expect.objectContaining({ suppressNetworkErrorLog: true }),
    );
  });

  /**
   * 쿠팡직배송은 로켓 계정 행을 함께 쓴다. 보낼 때부터 접어야 화면이 읽는 키와 같은 줄에
   * 쌓인다 — 서버만 접으면 화면은 `coupang-direct` 줄을 찾다 못 찾아 한 바퀴마다 새로 쓴다.
   */
  it('⭐ folds a shared-account mall key onto the row it shares', async () => {
    await recordMallOperationOutcome({
      mallKey: 'coupang-direct',
      operation: 'login_check',
      outcome: 'succeeded',
      reasonCode: 'session_alive',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/channels/mall-operation-outcomes',
      expect.objectContaining({ mallKey: 'rocket' }),
      expect.anything(),
    );
  });

  /**
   * 몰이 돌려준 문장에는 아이디 · 주문번호가 섞인다("아이디(abc123)가 존재하지 않습니다").
   * 이유 코드가 이미 무슨 일인지 말하므로 글은 싣지 않는다 — 몰의 말은 화면과 토스트에만.
   */
  it('⭐ drops the message when a reason code already says what happened', async () => {
    await recordMallOperationOutcome({
      mallKey: 'kidsnote',
      operation: 'login_test',
      outcome: 'failed',
      reasonCode: 'credentials_rejected',
      message: '키즈노트: 아이디(abc123)가 존재하지 않습니다',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/channels/mall-operation-outcomes',
      expect.objectContaining({ reasonCode: 'credentials_rejected', message: null }),
      expect.anything(),
    );
    expect(JSON.stringify(mockPost.mock.calls)).not.toContain('abc123');
  });

  it('keeps a short summary when nothing else says what happened', async () => {
    await recordMallOperationOutcome({
      mallKey: 'onch',
      operation: 'registration_fill',
      outcome: 'succeeded',
      message: '12건 채움',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/channels/mall-operation-outcomes',
      expect.objectContaining({ message: '12건 채움' }),
      expect.anything(),
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
