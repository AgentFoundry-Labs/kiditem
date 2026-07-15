import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({
  getParsed: vi.fn(),
  post: vi.fn(),
  uploadParsed: vi.fn(),
}));

vi.mock('../api-client', () => ({ apiClient }));

import { sellpiaInventoryFreshnessApi } from '../sellpia-inventory-freshness-api';

describe('sellpiaInventoryFreshnessApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses server-scoped freshness lease endpoints without an organization body', async () => {
    const state = {
      status: 'refresh_required',
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: 'kiditem',
        confirmed: true,
      },
      lastVerifiedAt: null,
      expiresAt: null,
      requestedGeneration: '1',
      verifiedGeneration: '0',
      refreshRequestedAt: '2026-07-16T00:00:00.000Z',
      refreshReason: 'ttl_expired',
      syncNotBefore: null,
      activeSync: null,
      lastAttempt: null,
    };
    apiClient.post
      .mockResolvedValueOnce({ claimed: false, state })
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(state);

    await sellpiaInventoryFreshnessApi.claimDue();
    await sellpiaInventoryFreshnessApi.heartbeat('11111111-1111-4111-8111-111111111111');
    await sellpiaInventoryFreshnessApi.cancel('11111111-1111-4111-8111-111111111111');

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/inventory/sellpia-freshness/claims',
      {},
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/inventory/sellpia-freshness/claims/11111111-1111-4111-8111-111111111111/heartbeat',
      {},
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      3,
      '/api/inventory/sellpia-freshness/claims/11111111-1111-4111-8111-111111111111/cancel',
      {},
    );
  });

  it('uploads browser bytes with the claim token, generation, trigger, and fixed source identity', async () => {
    apiClient.uploadParsed.mockResolvedValue({});
    const file = new File(['workbook'], 'inventory.xls', {
      type: 'application/vnd.ms-excel',
    });

    await sellpiaInventoryFreshnessApi.importBrowser(file, {
      claimToken: '11111111-1111-4111-8111-111111111111',
      activeGeneration: '7',
      trigger: 'ttl_expired',
    });

    const [, , form] = apiClient.uploadParsed.mock.calls[0];
    expect(Object.fromEntries((form as FormData).entries())).toMatchObject({
      file,
      kind: 'browser',
      claimToken: '11111111-1111-4111-8111-111111111111',
      activeGeneration: '7',
      trigger: 'ttl_expired',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
    });
  });

  it('requires the manual fresh-export attestation in the multipart request', async () => {
    apiClient.uploadParsed.mockResolvedValue({});
    const file = new File(['workbook'], 'manual.xls');

    await sellpiaInventoryFreshnessApi.importManual(file, true);

    const [, , form] = apiClient.uploadParsed.mock.calls[0];
    expect(Object.fromEntries((form as FormData).entries())).toMatchObject({
      file,
      kind: 'manual',
      manualFreshExportConfirmed: 'true',
    });
  });
});
