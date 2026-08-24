import { describe, expect, it, vi } from 'vitest';
import { deriveOwnerIdempotencyKey } from '../../../../common/owner-idempotency-key';
import { ChannelsFinalCapabilityAdapter } from './channels-final-capability.adapter';

const input = {
  executionId: '00000000-0000-4000-8000-000000000004', preparationId: '00000000-0000-4000-8000-000000000005', sourceCandidateId: '00000000-0000-4000-8000-000000000006', channelAccountId: '00000000-0000-4000-8000-000000000007', submissionKey: 'frozen-submission', submissionPayloadHash: 'a'.repeat(64), submissionPayloadJson: { registrationInput: {} }, providerSubmissionId: null, registrationResult: null, isRetry: false, providerOutcome: 'not_attempted' as const, providerCreateAllowed: true, optionLinks: [],
};

function context() {
  const attemptId = 'attempt-1';
  return {
    organizationId: '00000000-0000-4000-8000-000000000001', initiatingUserId: '00000000-0000-4000-8000-000000000002',
    sessionId: 'session-1', taskId: 'task-1', attemptId, agentVersionId: 'version-1',
    ownerIdempotencyKey: deriveOwnerIdempotencyKey({
      attemptId,
      capabilityKey: 'channels.submit_coupang_listing',
      input,
    }),
    applicationVersion: '0.25.0', authorizingGitSha: 'a'.repeat(40), runtimeType: 'codex_cli',
  };
}

describe('ChannelsFinalCapabilityAdapter', () => {
  it('uses Sourcing only as a read-only provenance guard while Channels owns submission and listing resolution', async () => {
    const executionContext = context();
    const registrations = {
      reconcileProductRegistration: vi.fn().mockResolvedValue(null),
      submitProductRegistration: vi.fn().mockResolvedValue({ externalListingId: 'provider-hidden' }),
      resolveProductRegistration: vi.fn().mockResolvedValue({ listingId: '00000000-0000-4000-8000-000000000008' }),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi.fn().mockResolvedValue({ mode: 'create', leaseToken: 'lease-1' }),
      finalizeProviderWrite: vi.fn().mockResolvedValue(undefined),
      markProviderWriteUncertain: vi.fn().mockResolvedValue(undefined),
      markProviderWriteDefinitiveFailure: vi.fn().mockResolvedValue(undefined),
    };
    const provenance = { validateSubmission: vi.fn().mockResolvedValue({ displayName: 'Toy', expectedProviderAccountId: null }), validateExternalConfirmation: vi.fn() };
    const prisma = { $transaction: vi.fn(async (work: (tx: object) => unknown) => work({ tx: true })) };
    const adapter = new ChannelsFinalCapabilityAdapter(registrations as never, provenance as never, prisma as never, executions as never);

    await expect(adapter.submitCoupangListing({ context: executionContext, input })).resolves.toEqual({ preparationId: input.preparationId, listingId: '00000000-0000-4000-8000-000000000008', status: 'registered' });
    expect(provenance.validateSubmission).toHaveBeenCalledWith(expect.objectContaining({ organizationId: executionContext.organizationId, initiatingUserId: executionContext.initiatingUserId }));
    expect(registrations.submitProductRegistration).toHaveBeenCalledOnce();
    expect(registrations.submitProductRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIdempotencyKey: executionContext.ownerIdempotencyKey }),
      expect.any(Function),
    );
    expect(executions.claimProviderWrite).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: executionContext.organizationId,
      executionId: input.executionId,
      idempotencyKey: input.submissionKey,
      requestHash: input.submissionPayloadHash,
      ownerIdempotencyKey: executionContext.ownerIdempotencyKey,
    }));
    expect(executions.finalizeProviderWrite).toHaveBeenCalledWith(expect.objectContaining({
      leaseToken: 'lease-1',
      externalListingId: 'provider-hidden',
    }));
    expect(registrations.resolveProductRegistration).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ externalListingId: 'provider-hidden', sourceCandidateId: input.sourceCandidateId }));
  });

  it('replays the completed Channels execution without another provider create', async () => {
    const executionContext = context();
    const registrations = {
      reconcileProductRegistration: vi.fn(),
      submitProductRegistration: vi.fn(),
      resolveProductRegistration: vi.fn().mockResolvedValue({ listingId: '00000000-0000-4000-8000-000000000008' }),
      assertExternalProductRegistrationAccount: vi.fn(),
    };
    const executions = {
      claimProviderWrite: vi.fn().mockResolvedValue({
        mode: 'replay',
        leaseToken: null,
        providerSubmissionId: 'provider-submission',
        externalListingId: 'provider-listing',
      }),
      finalizeProviderWrite: vi.fn(), markProviderWriteUncertain: vi.fn(), markProviderWriteDefinitiveFailure: vi.fn(),
    };
    const provenance = { validateSubmission: vi.fn().mockResolvedValue({ displayName: 'Toy', expectedProviderAccountId: null }), validateExternalConfirmation: vi.fn() };
    const prisma = { $transaction: vi.fn(async (work: (tx: object) => unknown) => work({ tx: true })) };
    const adapter = new ChannelsFinalCapabilityAdapter(registrations as never, provenance as never, prisma as never, executions as never);

    await adapter.submitCoupangListing({ context: executionContext, input });

    expect(registrations.reconcileProductRegistration).not.toHaveBeenCalled();
    expect(registrations.submitProductRegistration).not.toHaveBeenCalled();
    expect(executions.finalizeProviderWrite).not.toHaveBeenCalled();
  });

  it('rejects a changed owner key before it can claim or call the provider', async () => {
    const registrations = { reconcileProductRegistration: vi.fn(), submitProductRegistration: vi.fn(), resolveProductRegistration: vi.fn(), assertExternalProductRegistrationAccount: vi.fn() };
    const executions = { claimProviderWrite: vi.fn(), finalizeProviderWrite: vi.fn(), markProviderWriteUncertain: vi.fn(), markProviderWriteDefinitiveFailure: vi.fn() };
    const provenance = { validateSubmission: vi.fn().mockResolvedValue({ displayName: 'Toy', expectedProviderAccountId: null }), validateExternalConfirmation: vi.fn() };
    const prisma = { $transaction: vi.fn() };
    const adapter = new ChannelsFinalCapabilityAdapter(registrations as never, provenance as never, prisma as never, executions as never);

    await expect(adapter.submitCoupangListing({ context: { ...context(), ownerIdempotencyKey: 'changed' }, input }))
      .rejects.toThrow('owner_idempotency_key_conflict');

    expect(executions.claimProviderWrite).not.toHaveBeenCalled();
    expect(registrations.submitProductRegistration).not.toHaveBeenCalled();
  });
});
