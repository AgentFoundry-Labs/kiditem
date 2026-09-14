import { describe, expect, it, vi } from 'vitest';
import { ChannelProductRegistrationAdapter } from './channel-product-registration.adapter';

describe('ChannelProductRegistrationAdapter', () => {
  it('delegates browser registration reads and final listing resolution across the owner boundary', async () => {
    const capability = {
      previewExternalProductRegistrationMatch: vi.fn().mockResolvedValue({
        status: 'selection_required',
        reason: 'choose_sku',
        sellpiaMatch: null,
        proposals: [],
      }),
      preflightExternalProductRegistration: vi.fn().mockResolvedValue({
        sellpiaMatch: {
          sellpiaInventorySkuId: 'sku-1',
          code: '10451-1',
          name: '꿀사과슬랑이',
          optionName: null,
          currentStock: 13,
          quantity: 1,
        },
        existingListing: null,
      }),
      assertExternalProductRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'coupang',
        vendorId: 'A00012345',
      }),
      resolveProductRegistration: vi.fn().mockResolvedValue({ listingId: 'listing-1' }),
    };
    const adapter = new ChannelProductRegistrationAdapter(capability as never);
    const previewInput = {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      listingName: 'Kids rain boots',
      itemName: null,
    };
    const preflightInput = {
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sourceCandidateId: 'candidate-1',
      listingName: 'Kids rain boots',
      itemName: null,
    };
    const submission = {
      executionId: 'execution-1',
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: null,
      registrationResult: null,
      isRetry: false,
      providerOutcome: 'not_attempted' as const,
      providerCreateAllowed: false,
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    };
    const tx = { opaque: true } as never;

    await expect(adapter.previewExternalRegistrationMatch(previewInput)).resolves.toEqual({
      status: 'selection_required',
      reason: 'choose_sku',
      sellpiaMatch: null,
      proposals: [],
    });
    await adapter.preflightExternalRegistration(preflightInput);
    await adapter.assertExternalRegistrationAccount({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
    });
    await adapter.resolveListing(tx, submission);

    expect(capability.previewExternalProductRegistrationMatch).toHaveBeenCalledWith(previewInput);
    expect(capability.preflightExternalProductRegistration).toHaveBeenCalledWith(preflightInput);
    expect(capability.assertExternalProductRegistrationAccount).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
    });
    expect(capability.resolveProductRegistration).toHaveBeenCalledWith(
      tx,
      submission,
    );
  });

  it('delegates the Sellpia and Coupang pre-registration check without changing its result', async () => {
    const preflight = {
      sellpiaMatch: {
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: {
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      },
    };
    const capability = {
      preflightExternalProductRegistration: vi.fn().mockResolvedValue(preflight),
    };
    const adapter = new ChannelProductRegistrationAdapter(capability as never);
    const input = {
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sourceCandidateId: 'candidate-1',
      listingName: '꿀사과슬랑이',
      itemName: null,
    };

    await expect(adapter.preflightExternalRegistration(input)).resolves.toEqual(preflight);
    expect(capability.preflightExternalProductRegistration).toHaveBeenCalledWith(input);
  });
});
