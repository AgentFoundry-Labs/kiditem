import { describe, expect, it } from 'vitest';
import { CHANNELS_CAPABILITIES } from '../domain/capability/channels.capabilities';

describe('Channels final capability definitions', () => {
  it('owns all three marketplace mutations with real strict schemas', () => {
    expect(CHANNELS_CAPABILITIES.map((capability) => capability.key)).toEqual([
      'channels.register_confirmed_listing',
      'channels.submit_coupang_listing',
      'channels.submit_wing_thumbnail',
    ]);
    for (const capability of CHANNELS_CAPABILITIES) {
      expect(capability.ownerDomain).toBe('channels');
      expect(capability.inputSchema.safeParse({ organizationId: 'forged' }).success).toBe(false);
      expect(capability.outputSchema.safeParse({}).success).toBe(false);
      expect(capability.idempotency).toBe('required');
    }
  });

  it('rejects the retired master-only shape and accepts frozen provenance-complete input', () => {
    const definition = CHANNELS_CAPABILITIES.find((item) => item.key === 'channels.submit_coupang_listing')!;
    expect(definition.inputSchema.safeParse({ masterId: 'master-1', channelAccountId: 'account-1' }).success).toBe(false);
    expect(definition.inputSchema.safeParse({
      executionId: '00000000-0000-4000-8000-000000000011', preparationId: '00000000-0000-4000-8000-000000000012',
      sourceCandidateId: '00000000-0000-4000-8000-000000000013', channelAccountId: '00000000-0000-4000-8000-000000000014',
      submissionKey: 'submission-key', submissionPayloadHash: 'b'.repeat(64), submissionPayloadJson: { sellerProductName: 'Toy' },
      providerSubmissionId: null, registrationResult: null, isRetry: false, providerOutcome: 'not_attempted', providerCreateAllowed: true, optionLinks: [],
    }).success).toBe(true);
  });
});
