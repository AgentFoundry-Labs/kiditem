import { describe, expect, it, vi } from 'vitest';
import { ChannelsFinalCapabilityAdapter } from './channels-final-capability.adapter';

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001', initiatingUserId: '00000000-0000-4000-8000-000000000002',
  sessionId: 'session-1', taskId: 'task-1', attemptId: 'attempt-1', agentVersionId: 'version-1', ownerIdempotencyKey: 'owner-key', applicationVersion: '0.25.0', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli',
};
const input = {
  executionId: '00000000-0000-4000-8000-000000000004', preparationId: '00000000-0000-4000-8000-000000000005', sourceCandidateId: '00000000-0000-4000-8000-000000000006', channelAccountId: '00000000-0000-4000-8000-000000000007', submissionKey: 'frozen-submission', submissionPayloadHash: 'a'.repeat(64), submissionPayloadJson: { registrationInput: {} }, providerSubmissionId: null, registrationResult: null, isRetry: false, providerOutcome: 'not_attempted' as const, providerCreateAllowed: true, optionLinks: [],
};

describe('ChannelsFinalCapabilityAdapter', () => {
  it('uses Sourcing only as a read-only provenance guard while Channels owns submission and listing resolution', async () => {
    const registrations = {
      reconcileProductRegistration: vi.fn().mockResolvedValue(null),
      submitProductRegistration: vi.fn().mockResolvedValue({ externalListingId: 'provider-hidden' }),
      resolveProductRegistration: vi.fn().mockResolvedValue({ listingId: '00000000-0000-4000-8000-000000000008' }),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const provenance = { validateSubmission: vi.fn().mockResolvedValue({ displayName: 'Toy', expectedProviderAccountId: null }), validateExternalConfirmation: vi.fn() };
    const prisma = { $transaction: vi.fn(async (work: (tx: object) => unknown) => work({ tx: true })) };
    const adapter = new ChannelsFinalCapabilityAdapter(registrations as never, provenance as never, prisma as never);

    await expect(adapter.submitCoupangListing({ context, input })).resolves.toEqual({ preparationId: input.preparationId, listingId: '00000000-0000-4000-8000-000000000008', status: 'registered' });
    expect(provenance.validateSubmission).toHaveBeenCalledWith(expect.objectContaining({ organizationId: context.organizationId, initiatingUserId: context.initiatingUserId }));
    expect(registrations.submitProductRegistration).toHaveBeenCalledOnce();
    expect(registrations.resolveProductRegistration).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ externalListingId: 'provider-hidden', sourceCandidateId: input.sourceCandidateId }));
  });
});
