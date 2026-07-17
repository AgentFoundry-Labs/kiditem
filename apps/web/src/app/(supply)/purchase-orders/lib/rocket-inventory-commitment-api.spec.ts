import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  listRocketInventoryCommitments,
  releaseRocketFinalOrderCommitments,
  settleRocketFinalOrderCommitments,
} from './rocket-inventory-commitment-api';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const COMMITMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('rocket inventory commitment API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses action-body requests for persisted list, settlement, and release', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValue({ affectedCommitmentIds: [COMMITMENT_ID] });

    await listRocketInventoryCommitments({ channelAccountId: ACCOUNT_ID, limit: 50 });
    await settleRocketFinalOrderCommitments({
      commitmentIds: [COMMITMENT_ID],
      reason: 'Sellpia 출고 반영',
    });
    await releaseRocketFinalOrderCommitments({
      commitmentIds: [COMMITMENT_ID],
      reason: '쿠팡 주문 취소',
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/purchase-orders', {
      action: 'listRocketCommitments',
      channelAccountId: ACCOUNT_ID,
      limit: 50,
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/purchase-orders', {
      action: 'settleRocketFinalOrderCommitments',
      commitmentIds: [COMMITMENT_ID],
      reason: 'Sellpia 출고 반영',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/api/purchase-orders', {
      action: 'releaseRocketFinalOrderCommitments',
      commitmentIds: [COMMITMENT_ID],
      reason: '쿠팡 주문 취소',
    });
  });
});
