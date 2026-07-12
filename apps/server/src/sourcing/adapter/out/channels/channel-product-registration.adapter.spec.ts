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

    await adapter.reconcile(submission);
    await adapter.submit(submission);
    await adapter.resolveListing(tx, {
      ...submission,
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    });

    expect(capability.reconcileProductRegistration).toHaveBeenCalledWith(submission);
    expect(capability.submitProductRegistration).toHaveBeenCalledWith(submission);
    expect(capability.resolveProductRegistration).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ externalListingId: '427011919' }),
    );
  });
});
