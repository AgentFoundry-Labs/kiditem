import { describe, expect, it, vi } from 'vitest';
import { SourcingFrozenRegistrationReadCapabilityAdapter } from './sourcing-frozen-registration-capability.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const preparationId = '00000000-0000-4000-8000-000000000002';
const candidateId = '00000000-0000-4000-8000-000000000003';
const executionId = '00000000-0000-4000-8000-000000000004';
const accountId = '00000000-0000-4000-8000-000000000005';
const userId = '00000000-0000-4000-8000-000000000006';

const frozen = {
  executionId,
  preparationId,
  sourceCandidateId: candidateId,
  channelAccountId: accountId,
  submissionKey: 'frozen-submission',
  submissionPayloadHash: 'a'.repeat(64),
  submissionPayloadJson: { registrationInput: { optionLinks: [] } },
  providerSubmissionId: null,
  registrationResult: null,
  isRetry: false,
  providerOutcome: 'not_attempted',
  displayName: 'Toy',
};

describe('SourcingFrozenRegistrationReadCapabilityAdapter', () => {
  it('accepts only the exact frozen canonical submission without mutating registration state', async () => {
    const preparations = { loadFrozenSubmission: vi.fn().mockResolvedValue(frozen) };
    const adapter = new SourcingFrozenRegistrationReadCapabilityAdapter(preparations as never);

    await expect(adapter.validateSubmission({
      organizationId,
      initiatingUserId: userId,
      ...frozen,
      providerCreateAllowed: false,
      optionLinks: [],
    })).resolves.toEqual({ displayName: 'Toy', expectedProviderAccountId: null });

    await expect(adapter.validateSubmission({
      organizationId,
      initiatingUserId: userId,
      ...frozen,
      submissionPayloadHash: 'b'.repeat(64),
      providerCreateAllowed: false,
      optionLinks: [],
    })).rejects.toThrow('frozen_submission_mismatch');
  });
});
