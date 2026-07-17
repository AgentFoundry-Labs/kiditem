import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sellpiaInventoryFreshnessApi } from '../sellpia-inventory-freshness-api';

const apiClient = vi.hoisted(() => ({
  getParsed: vi.fn(),
  post: vi.fn(),
  uploadParsed: vi.fn(),
}));

vi.mock('../api-client', () => ({ apiClient }));

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

  it('uses strict server-scoped order transmission intent endpoints', async () => {
    const state = {
      status: 'refresh_required',
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: 'kiditem',
        confirmed: true,
      },
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
      requestedGeneration: '5',
      verifiedGeneration: '4',
      refreshRequestedAt: '2026-07-16T00:01:00.000Z',
      refreshReason: 'order_transmission_requested',
      syncNotBefore: '2026-07-16T00:03:00.000Z',
      activeSync: null,
      lastAttempt: null,
    };
    apiClient.post
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'prepared', state })
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'finalized',
        finalizedGeneration: '5',
        state,
      })
      .mockResolvedValueOnce({ intentKey: 'orders-1', status: 'aborted', state });

    await sellpiaInventoryFreshnessApi.prepareOrderTransmissionIntent('orders-1');
    await sellpiaInventoryFreshnessApi.finalizeOrderTransmissionIntent('orders-1');
    await sellpiaInventoryFreshnessApi.abortOrderTransmissionIntent('orders-1');

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/inventory/sellpia-freshness/order-transmission-intents/prepare',
      { intentKey: 'orders-1' },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/inventory/sellpia-freshness/order-transmission-intents/finalize',
      { intentKey: 'orders-1' },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      3,
      '/api/inventory/sellpia-freshness/order-transmission-intents/abort',
      { intentKey: 'orders-1' },
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

  it('reads the authoritative completed inventory basis independently of paged attempt history', async () => {
    const latestImport = {
      id: '33333333-3333-4333-8333-333333333333',
      fileName: 'authoritative.xls',
    };
    apiClient.getParsed.mockResolvedValueOnce({ latestImport });
    const api = sellpiaInventoryFreshnessApi as typeof sellpiaInventoryFreshnessApi & {
      getCurrentBasis?: () => Promise<unknown>;
    };

    expect(typeof api.getCurrentBasis).toBe('function');
    if (!api.getCurrentBasis) return;

    await expect(api.getCurrentBasis()).resolves.toBe(latestImport);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/inventory/sellpia-skus?page=1&limit=1',
      expect.anything(),
    );
  });
});
