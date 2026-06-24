import { describe, expect, it, vi } from 'vitest';
import { MarketplaceRegistrationService } from '../marketplace-registration.service';

describe('MarketplaceRegistrationService application orchestration', () => {
  it('stores channel listing identity and product barcode through separate ports', async () => {
    const repository = {
      registerConfirmedListing: vi.fn().mockResolvedValue({ id: 'listing-1' }),
    };
    const productBarcodes = {
      assertMasterBarcodeAvailable: vi.fn().mockResolvedValue(undefined),
      updateMasterBarcode: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MarketplaceRegistrationService(repository as never, productBarcodes as never);

    const result = await service.registerConfirmedListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: 'COUPANG-720445',
      productBarcode: ' 8806384882841 ',
      channelName: '쿠팡 판매명',
      channelPrice: 12900,
    });

    expect(result).toEqual({ id: 'listing-1' });
    expect(productBarcodes.assertMasterBarcodeAvailable).toHaveBeenCalledWith({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    });
    expect(repository.registerConfirmedListing).toHaveBeenCalledWith('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: 'COUPANG-720445',
      channelName: '쿠팡 판매명',
      channelPrice: 12900,
    });
    expect(productBarcodes.updateMasterBarcode).toHaveBeenCalledWith({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    });
    expect(productBarcodes.assertMasterBarcodeAvailable.mock.invocationCallOrder[0])
      .toBeLessThan(repository.registerConfirmedListing.mock.invocationCallOrder[0]);
    expect(repository.registerConfirmedListing.mock.invocationCallOrder[0])
      .toBeLessThan(productBarcodes.updateMasterBarcode.mock.invocationCallOrder[0]);
  });

  it('does not write a channel listing when product barcode preflight rejects it', async () => {
    const error = new Error('이미 다른 상품에서 사용 중인 바코드입니다.');
    const repository = {
      registerConfirmedListing: vi.fn(),
    };
    const productBarcodes = {
      assertMasterBarcodeAvailable: vi.fn().mockRejectedValue(error),
      updateMasterBarcode: vi.fn(),
    };
    const service = new MarketplaceRegistrationService(repository as never, productBarcodes as never);

    await expect(service.registerConfirmedListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: 'COUPANG-720445',
      productBarcode: '8806384882841',
    })).rejects.toBe(error);

    expect(repository.registerConfirmedListing).not.toHaveBeenCalled();
    expect(productBarcodes.updateMasterBarcode).not.toHaveBeenCalled();
  });

  it('submits a full Coupang seller product payload then stores the returned listing identity', async () => {
    const repository = {
      registerConfirmedListing: vi.fn().mockResolvedValue({
        id: 'listing-1',
        masterId: 'master-1',
        channel: 'coupang',
        channelAccountId: 'account-1',
        externalId: '427011919',
        channelName: '쿠팡 판매명',
        channelPrice: 12900,
        status: 'pending_approval',
      }),
    };
    const productBarcodes = {
      assertMasterBarcodeAvailable: vi.fn().mockResolvedValue(undefined),
      updateMasterBarcode: vi.fn().mockResolvedValue(undefined),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockResolvedValue({
        code: '200',
        message: '',
        data: {
          code: 'SUCCESS',
          message: '',
          data: 427011919,
        },
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      productBarcodes as never,
      coupang as never,
    );

    const result = await service.submitCoupangListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      productBarcode: ' 8806384882841 ',
      listingPayload: {
        vendorId: 'A00012345',
        sellerProductName: '쿠팡 판매명',
        requested: true,
        items: [{ itemName: '단품', salePrice: 12900 }],
      },
    });

    expect(result).toEqual({
      listingId: 'listing-1',
      sellerProductId: '427011919',
      masterId: 'master-1',
      channel: 'coupang',
      channelAccountId: 'account-1',
      externalId: '427011919',
      status: 'pending_approval',
    });
    expect(productBarcodes.assertMasterBarcodeAvailable).toHaveBeenCalledWith({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    });
    expect(coupang.createSellerProduct).toHaveBeenCalledWith('org-1', {
      vendorId: 'A00012345',
      sellerProductName: '쿠팡 판매명',
      requested: true,
      items: [{ itemName: '단품', salePrice: 12900 }],
    });
    expect(repository.registerConfirmedListing).toHaveBeenCalledWith('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: '427011919',
      channelName: '쿠팡 판매명',
      channelPrice: 12900,
    });
    expect(productBarcodes.updateMasterBarcode).toHaveBeenCalledWith({
      organizationId: 'org-1',
      masterId: 'master-1',
      barcode: '8806384882841',
    });
  });
});
