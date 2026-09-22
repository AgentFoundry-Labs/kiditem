import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { registrationTargetApi } from '@/lib/registration-target-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';

const target = {
  id: TARGET_ID,
  salesProductId: PRODUCT_ID,
  channelAccountId: ACCOUNT_ID,
  version: 3,
  displayName: null,
  registrationInput: { provider: 'document' },
  selectedOptions: [{ salesProductOptionId: OPTION_ID, salePrice: null, normalPrice: 12_000, supplyPrice: null }],
  resolved: {
    name: '동물 블록',
    options: [{ salesProductOptionId: OPTION_ID, code: '100-0001', values: ['파랑'], salePrice: 5900, normalPrice: 12_000, supplyPrice: null }],
  },
};

describe('registration target API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists targets by sales product through the Channels endpoint', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue([target]);

    await expect(registrationTargetApi.list(PRODUCT_ID)).resolves.toEqual([target]);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/registration-targets?salesProductId=${PRODUCT_ID}`,
      expect.any(Object),
    );
  });

  it('resolves a common default or an explicitly selected target', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(target);

    await registrationTargetApi.resolve({ salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID });
    await registrationTargetApi.resolve({ salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID, targetId: TARGET_ID });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/channels/registration-targets/resolve', {
      salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID,
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/channels/registration-targets/resolve', {
      salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID, targetId: TARGET_ID,
    });
  });

  it('writes nullable overrides, selected option order, and provider document', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(target);
    vi.mocked(apiClient.put).mockResolvedValue(target);

    const editable = {
      displayName: '파랑 블록',
      registrationInput: { provider: 'document' },
      selectedOptions: [{ salesProductOptionId: OPTION_ID, salePrice: null, normalPrice: 12_000, supplyPrice: 2500 }],
    };
    await registrationTargetApi.create({ ...editable, salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID });
    await registrationTargetApi.update(TARGET_ID, { ...editable, expectedVersion: 3 });

    expect(apiClient.post).toHaveBeenCalledWith('/api/channels/registration-targets', {
      ...editable,
      salesProductId: PRODUCT_ID,
      channelAccountId: ACCOUNT_ID,
    });
    expect(apiClient.put).toHaveBeenCalledWith(`/api/channels/registration-targets/${TARGET_ID}`, {
      ...editable,
      expectedVersion: 3,
    });
  });
});
