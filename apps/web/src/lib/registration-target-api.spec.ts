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
  registrationInput: { mallCategory: null, mallFields: {}, adapter: {} },
  selectedThumbnailAssetId: null,
  selectedDetailPageRevisionId: null,
  selectedOptions: [{ salesProductOptionId: OPTION_ID }],
  resolved: {
    name: '동물 블록',
    options: [{ salesProductOptionId: OPTION_ID, code: '100-0001', values: ['파랑'], salePrice: 5900, normalPrice: 12_000 }],
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

  it('writes the mall values, selected content ids and selected option order through update only', async () => {
    vi.mocked(apiClient.put).mockResolvedValue(target);

    const editable = {
      registrationInput: { mallCategory: { key: '완구>블록', label: null }, mallFields: { supplyPrice: '2500' }, adapter: {} },
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      selectedOptions: [{ salesProductOptionId: OPTION_ID }],
    };
    await registrationTargetApi.update(TARGET_ID, { ...editable, expectedVersion: 3 });

    // 설정이 생기는 길은 resolve 하나다(KID-313) — 값을 채워 만드는 create 경로는 없다.
    expect(registrationTargetApi).not.toHaveProperty('create');
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.put).toHaveBeenCalledWith(`/api/channels/registration-targets/${TARGET_ID}`, {
      ...editable,
      expectedVersion: 3,
    });
  });
});
