import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSellerProduct,
  getSellerProductsByExternalVendorSku,
} from './products';
import { CoupangProviderRequestError } from '../../../application/port/out/provider/coupang-provider.port';

describe('Coupang product API helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a seller-product creation payload to the Coupang product creation endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/json' : ''),
      },
      json: async () => ({ code: 'SUCCESS', message: '', data: 427011919 }),
    });
    vi.stubGlobal('fetch', fetch);

    const response = await createSellerProduct(
      {
        vendorId: 'A00012345',
        accessKey: 'access-key',
        secretKey: 'secret-key',
      },
      {
        vendorId: 'A00012345',
        sellerProductName: '쿠팡 판매명',
        requested: true,
      },
    );

    expect(response).toEqual({
      code: 'SUCCESS',
      message: '',
      data: 427011919,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api-gateway.coupang.com/v2/providers/seller_api/apis/api/v1/marketplace/seller-products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          vendorId: 'A00012345',
          sellerProductName: '쿠팡 판매명',
          requested: true,
        }),
      }),
    );
  });

  it('uses the credential vendorId instead of trusting the listing payload vendorId', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/json' : ''),
      },
      json: async () => ({ code: 'SUCCESS', message: '', data: 427011920 }),
    });
    vi.stubGlobal('fetch', fetch);

    await createSellerProduct(
      {
        vendorId: 'A00012345',
        accessKey: 'access-key',
        secretKey: 'secret-key',
      },
      {
        vendorId: 'WRONG_VENDOR',
        sellerProductName: '쿠팡 판매명',
        requested: true,
      },
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          vendorId: 'A00012345',
          sellerProductName: '쿠팡 판매명',
          requested: true,
        }),
      }),
    );
  });

  it('queries uncertain product creation by the encoded external vendor SKU', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/json' : ''),
      },
      json: async () => ({ code: 'SUCCESS', message: '', data: [] }),
    });
    vi.stubGlobal('fetch', fetch);

    await getSellerProductsByExternalVendorSku(
      {
        vendorId: 'A00012345',
        accessKey: 'access-key',
        secretKey: 'secret-key',
      },
      'submission:key/1',
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api-gateway.coupang.com/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/external-vendor-sku-codes/submission%3Akey%2F1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('classifies an HTTP validation rejection as a definitive non-create', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid display category',
    }));

    await expect(createSellerProduct(
      {
        vendorId: 'A00012345',
        accessKey: 'access-key',
        secretKey: 'secret-key',
      },
      {
        sellerProductName: '쿠팡 판매명',
        items: [{ itemName: '단품' }],
      },
    )).rejects.toMatchObject<CoupangProviderRequestError>({
      providerOutcome: 'definitive_failure',
      status: 400,
    });
  });
});
