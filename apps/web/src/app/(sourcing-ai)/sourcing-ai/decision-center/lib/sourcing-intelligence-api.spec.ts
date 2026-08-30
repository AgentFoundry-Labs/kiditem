import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { getLatestSourcingDecisionBatch } from './sourcing-intelligence-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNullable: vi.fn(),
  },
}));

const getNullable = vi.mocked(apiClient.getNullable);

describe('getLatestSourcingDecisionBatch', () => {
  beforeEach(() => {
    getNullable.mockReset();
  });

  // 배치가 없으면 Nest 가 본문 없는 200 을 보낸다. 평범한 `get` 은 그것을 truthy 한
  // `{}` 로 만들어 소비자의 null 가드를 통과시키고 `expiresAt` 을 undefined 로 만든다.
  it('빈 응답을 null 로 돌려주는 getNullable 을 사용한다', async () => {
    getNullable.mockResolvedValue(null);

    await expect(getLatestSourcingDecisionBatch()).resolves.toBeNull();
    expect(getNullable).toHaveBeenCalledWith(
      '/api/sourcing/intelligence/decision-batches/latest',
    );
  });

  it('배치가 있으면 그대로 돌려준다', async () => {
    const batch = { id: 'batch-1', expiresAt: '2026-08-03T00:00:00.000Z' };
    getNullable.mockResolvedValue(batch as never);

    await expect(getLatestSourcingDecisionBatch()).resolves.toBe(batch);
  });
});
