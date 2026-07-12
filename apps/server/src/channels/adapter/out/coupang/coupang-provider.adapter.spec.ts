import { describe, expect, it, vi } from 'vitest';
import { CoupangProviderAdapter } from './coupang-provider.adapter';

vi.mock('./products', () => ({
  createSellerProduct: vi.fn().mockResolvedValue({ code: '200', data: 1 }),
  getSellerProducts: vi.fn(),
  getSellerProductsByExternalVendorSku: vi.fn().mockResolvedValue({ code: 'SUCCESS', data: [] }),
  getSellerProduct: vi.fn().mockResolvedValue({ code: '200', data: { sellerProductId: 1 } }),
}));

describe('CoupangProviderAdapter account scope', () => {
  it('loads credentials from the explicitly selected account for create and reconcile', async () => {
    const credentials = {
      resolveCoupangCredentials: vi.fn().mockResolvedValue({
        vendorId: 'A0001',
        accessKey: 'access',
        secretKey: 'secret',
      }),
    };
    const adapter = new CoupangProviderAdapter(credentials as never);

    await adapter.createSellerProduct('org-1', { sellerProductName: 'Toy' }, 'account-2');
    await adapter.getSellerProduct('org-1', '427011919', 'account-2');
    await adapter.getSellerProductsByExternalVendorSku(
      'org-1',
      'submission-key-1',
      'account-2',
    );

    expect(credentials.resolveCoupangCredentials).toHaveBeenNthCalledWith(1, 'org-1', 'account-2');
    expect(credentials.resolveCoupangCredentials).toHaveBeenNthCalledWith(2, 'org-1', 'account-2');
    expect(credentials.resolveCoupangCredentials).toHaveBeenNthCalledWith(3, 'org-1', 'account-2');
  });
});
