import { describe, expect, it, vi } from 'vitest';
import { ChannelProductRegistrationAdapter } from './channel-product-registration.adapter';

describe('ChannelProductRegistrationAdapter', () => {
  it('preserves the frozen submission and caller transaction across the owner boundary', async () => {
    const capability = {
      reconcileProductRegistration: vi.fn().mockResolvedValue(null),
      submitProductRegistration: vi.fn().mockResolvedValue({ externalListingId: '427011919' }),
      resolveProductRegistration: vi.fn().mockResolvedValue({ listingId: 'listing-1' }),
    };
    const adapter = new ChannelProductRegistrationAdapter(capability as never);
    const submission = {
      organizationId: 'org-1',
      preparationId: 'preparation-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      submissionKey: 'key-1',
      submissionPayloadHash: 'hash-1',
      submissionPayloadJson: {},
      providerSubmissionId: null,
      registrationResult: null,
    };
    const tx = { opaque: true } as never;
    const beforeProviderCreate = vi.fn().mockResolvedValue(undefined);

    await adapter.reconcile(submission);
    await adapter.submit(submission, beforeProviderCreate);
    await adapter.resolveListing(tx, {
      ...submission,
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    });

    expect(capability.reconcileProductRegistration).toHaveBeenCalledWith(submission);
    expect(capability.submitProductRegistration).toHaveBeenCalledWith(
      submission,
      beforeProviderCreate,
    );
    expect(capability.resolveProductRegistration).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ externalListingId: '427011919' }),
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
