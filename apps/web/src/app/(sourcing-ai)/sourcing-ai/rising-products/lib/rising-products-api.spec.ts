import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNullable: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';
import { fetchLatestRisingProducts } from './rising-products-api';

const getNullable = vi.mocked(apiClient.getNullable);

describe('fetchLatestRisingProducts', () => {
  beforeEach(() => {
    getNullable.mockReset();
  });

  // 저장된 스냅샷이 없으면 Nest 가 본문 없는 200 을 보낸다. 평범한 `get` 은 그것을
  // truthy 한 `{}` 로 만들어 "데이터 없음" 판정을 호출부마다 다시 구현하게 만든다.
  it('빈 응답을 null 로 돌려주는 getNullable 을 사용한다', async () => {
    getNullable.mockResolvedValue(null);

    await expect(fetchLatestRisingProducts()).resolves.toBeNull();
    expect(getNullable).toHaveBeenCalledWith('/api/sourcing/rising-products');
  });

  it('스냅샷이 있으면 그대로 돌려준다', async () => {
    const result = { model: { candidates: [] } };
    getNullable.mockResolvedValue(result as never);

    await expect(fetchLatestRisingProducts()).resolves.toBe(result);
  });
});
