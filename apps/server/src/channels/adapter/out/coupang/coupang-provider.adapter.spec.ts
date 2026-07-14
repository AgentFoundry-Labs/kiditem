import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupangProviderAdapter } from './coupang-provider.adapter';
import { createSellerProduct } from './products';

vi.mock('./products', () => ({
  createSellerProduct: vi.fn().mockResolvedValue({ code: '200', data: 1 }),
  getSellerProducts: vi.fn(),
  getSellerProductsByExternalVendorSku: vi.fn().mockResolvedValue({ code: 'SUCCESS', data: [] }),
  getSellerProduct: vi.fn().mockResolvedValue({ code: '200', data: { sellerProductId: 1 } }),
}));

describe('CoupangProviderAdapter account scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('marks a create uncertain only after account credentials resolve and immediately before dispatch', async () => {
    const callOrder: string[] = [];
    const credentials = {
      resolveCoupangCredentials: vi.fn().mockImplementation(async () => {
        callOrder.push('credentials');
        return {
          vendorId: 'A0001',
          accessKey: 'access',
          secretKey: 'secret',
        };
      }),
    };
    vi.mocked(createSellerProduct).mockImplementationOnce(async (
      _resolvedCredentials,
      _payload,
      dispatchBoundary,
    ) => {
      await dispatchBoundary?.();
      callOrder.push('dispatch');
      return { code: '200', message: '', data: 1 };
    });
    const beforeDispatch = vi.fn(async () => {
      callOrder.push('mark-uncertain');
    });
    const adapter = new CoupangProviderAdapter(credentials as never);

    await adapter.createSellerProduct(
      'org-1',
      { sellerProductName: 'Toy' },
      'account-2',
      beforeDispatch,
    );

    expect(callOrder).toEqual(['credentials', 'mark-uncertain', 'dispatch']);
  });

  it('does not mark a create uncertain when account credential resolution fails', async () => {
    const credentials = {
      resolveCoupangCredentials: vi.fn().mockRejectedValue(new Error('missing credentials')),
    };
    const beforeDispatch = vi.fn();
    const adapter = new CoupangProviderAdapter(credentials as never);

    await expect(adapter.createSellerProduct(
      'org-1',
      { sellerProductName: 'Toy' },
      'account-2',
      beforeDispatch,
    )).rejects.toThrow('missing credentials');

    expect(beforeDispatch).not.toHaveBeenCalled();
    expect(createSellerProduct).not.toHaveBeenCalled();
  });
});
