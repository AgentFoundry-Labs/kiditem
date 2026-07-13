import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DefinitiveMarketplaceRegistrationError } from '../../port/in/capability/marketplace-registration.port';
import { CoupangProviderRequestError } from '../../port/out/provider/coupang-provider.port';
import { MarketplaceRegistrationService } from '../marketplace-registration.service';

describe('MarketplaceRegistrationService application orchestration', () => {
  it('validates the frozen payload before marking the provider outcome uncertain', async () => {
    const beforeProviderCreate = vi.fn();
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = { createSellerProduct: vi.fn() };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: { registrationInput: { items: [] } },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'not_attempted',
      providerCreateAllowed: true,
    }, beforeProviderCreate)).rejects.toThrow(
      'Frozen preparation marketplace payload must contain at least one item.',
    );

    expect(beforeProviderCreate).not.toHaveBeenCalled();
    expect(coupang.createSellerProduct).not.toHaveBeenCalled();
  });

  it('marks the provider outcome uncertain immediately before the provider POST', async () => {
    const callOrder: string[] = [];
    const beforeProviderCreate = vi.fn(async () => {
      callOrder.push('mark-uncertain');
    });
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockImplementation(async (
        _organizationId: string,
        _payload: unknown,
        _channelAccountId: string,
        beforeDispatch: () => Promise<void>,
      ) => {
        await beforeDispatch();
        callOrder.push('provider-post');
        return {
          code: '200',
          message: '',
          data: { code: 'SUCCESS', data: 427011919 },
        };
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: { items: [{ itemName: 'Blue', salePrice: 12900 }] },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'not_attempted',
      providerCreateAllowed: true,
    }, beforeProviderCreate);

    expect(beforeProviderCreate).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['mark-uncertain', 'provider-post']);
  });

  it('leaves the provider outcome safe when provider setup fails before dispatch', async () => {
    const beforeProviderCreate = vi.fn();
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockRejectedValue(new Error('missing credentials')),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: { items: [{ itemName: 'Blue', salePrice: 12900 }] },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'not_attempted',
      providerCreateAllowed: true,
    }, beforeProviderCreate)).rejects.toThrow('missing credentials');

    expect(beforeProviderCreate).not.toHaveBeenCalled();
  });

  it('submits a frozen preparation through the selected account without a Master identity', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const productBarcodes = {};
    const coupang = {
      createSellerProduct: vi.fn().mockResolvedValue({
        code: '200',
        message: '',
        data: { code: 'SUCCESS', data: 427011919 },
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      productBarcodes as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: {
          listingPayload: {
            sellerProductName: 'Kids rain boots',
            items: [{ itemName: 'Blue', salePrice: 12900 }],
          },
        },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'uncertain',
      providerCreateAllowed: true,
    })).resolves.toMatchObject({
      providerSubmissionId: '427011919',
      externalListingId: '427011919',
      channel: 'coupang',
    });
    expect(coupang.createSellerProduct).toHaveBeenCalledWith(
      'org-1',
      {
        sellerProductName: 'Kids rain boots',
        items: [{
          itemName: 'Blue',
          salePrice: 12900,
          externalVendorSku: 'submission-key-1',
        }],
      },
      'account-1',
      expect.any(Function),
    );
  });

  it('reconciles an uncertain create timeout by the durable submission key', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      getSellerProductsByExternalVendorSku: vi.fn().mockResolvedValue({
        code: 'SUCCESS',
        message: '',
        data: [{ sellerProductId: 427011919, sellerProductName: 'Kids rain boots' }],
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.reconcileProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: true,
      providerOutcome: 'uncertain',
      providerCreateAllowed: false,
    })).resolves.toMatchObject({
      providerSubmissionId: '427011919',
      externalListingId: '427011919',
    });
    expect(coupang.getSellerProductsByExternalVendorSku).toHaveBeenCalledWith(
      'org-1',
      'submission-key-1',
      'account-1',
    );
  });

  it('does not create a second listing when retry reconciliation has no result yet', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn(),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: true,
      providerOutcome: 'uncertain',
      providerCreateAllowed: false,
    })).rejects.toThrow(
      'Provider outcome is still uncertain; automatic retry will not create a duplicate listing.',
    );
    expect(coupang.createSellerProduct).not.toHaveBeenCalled();
  });

  it('allows a proven definitive non-create retry after reconciliation', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockResolvedValue({
        code: '200',
        message: '',
        data: { code: 'SUCCESS', data: 427011919 },
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: { items: [{ itemName: 'Blue', salePrice: 12900 }] },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: true,
      providerOutcome: 'uncertain',
      providerCreateAllowed: true,
    })).resolves.toMatchObject({ externalListingId: '427011919' });
    expect(coupang.createSellerProduct).toHaveBeenCalledTimes(1);
  });

  it('classifies an explicit provider rejection as a definitive non-create', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockResolvedValue({
        code: '400',
        message: 'invalid category',
        data: { code: 'ERROR', message: 'invalid category', data: null },
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: { items: [{ itemName: 'Blue', salePrice: 12900 }] },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'uncertain',
      providerCreateAllowed: true,
    })).rejects.toBeInstanceOf(DefinitiveMarketplaceRegistrationError);
  });

  it('maps a typed HTTP validation rejection to the cross-domain definitive failure', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      createSellerProduct: vi.fn().mockRejectedValue(
        new CoupangProviderRequestError(
          'Coupang API error 400: invalid category',
          400,
          'definitive_failure',
        ),
      ),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {
        registrationInput: { items: [{ itemName: 'Blue', salePrice: 12900 }] },
      },
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'uncertain',
      providerCreateAllowed: true,
    })).rejects.toBeInstanceOf(DefinitiveMarketplaceRegistrationError);
  });

  it('reconciles recorded provider identity through the same channel account before create', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang' }),
    };
    const coupang = {
      getSellerProduct: vi.fn().mockResolvedValue({
        code: '200',
        message: '',
        data: { sellerProductId: 427011919, sellerProductName: 'Kids rain boots' },
      }),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.reconcileProductRegistration({
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: '427011919',
      registrationResult: null,
    })).resolves.toMatchObject({ externalListingId: '427011919' });
    expect(coupang.getSellerProduct).toHaveBeenCalledWith(
      'org-1',
      '427011919',
      'account-1',
    );
  });

  it('resolves the account-scoped listing inside the caller transaction', async () => {
    const tx = { opaque: true };
    const repository = {
      resolveProductRegistration: vi.fn().mockResolvedValue({
        listingId: 'listing-1',
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: '427011919',
        status: 'active',
      }),
    };
    const service = new MarketplaceRegistrationService(repository as never, {} as never);
    const input = {
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: '427011919',
      registrationResult: null,
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    };

    await service.resolveProductRegistration(tx, input);
    expect(repository.resolveProductRegistration).toHaveBeenCalledWith(tx, input);
  });

  it('stores channel listing identity and product barcode through separate ports', async () => {
    const repository = {
      assertLegacyFamilyMaster: vi.fn().mockResolvedValue(undefined),
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
      assertLegacyFamilyMaster: vi.fn().mockResolvedValue(undefined),
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
      assertLegacyFamilyMaster: vi.fn().mockResolvedValue(undefined),
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
    }, 'account-1');
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

  it('rejects a staged Sellpia Master before dispatching a live confirmed listing', async () => {
    const repository = {
      assertLegacyFamilyMaster: vi.fn().mockRejectedValue(
        new NotFoundException('재고 상품을 찾을 수 없습니다.'),
      ),
      registerConfirmedListing: vi.fn(),
    };
    const coupang = {
      createSellerProduct: vi.fn(),
    };
    const service = new MarketplaceRegistrationService(
      repository as never,
      {} as never,
      coupang as never,
    );

    await expect(service.submitCoupangListing('org-1', {
      masterId: 'staged-sellpia-master',
      channelAccountId: 'account-1',
      listingPayload: {
        sellerProductName: 'Physical inventory identity',
        items: [{ itemName: '단품', salePrice: 12900 }],
      },
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(coupang.createSellerProduct).not.toHaveBeenCalled();
    expect(repository.registerConfirmedListing).not.toHaveBeenCalled();
  });
});
