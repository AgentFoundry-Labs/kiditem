import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingPromotionService } from './sourcing-promotion.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const TX = { opaque: true } as never;

function setup() {
  const candidates = {
    runInTransaction: vi.fn((operation) => operation(TX)),
    lockCandidate: vi.fn().mockResolvedValue(undefined),
    findCandidateState: vi.fn().mockResolvedValue({
      id: CANDIDATE_ID,
      status: 'sourced',
    }),
    rejectCandidate: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const preparations = {
    assertCandidateTerminalTransitionAllowed: vi.fn().mockResolvedValue(undefined),
  };
  const service = new SourcingPromotionService(
    candidates as never,
    preparations as never,
  );
  return { service, candidates, preparations };
}

describe('SourcingPromotionService candidate terminal transitions', () => {
  it('locks and revalidates the sourced candidate before checking preparation blockers', async () => {
    const { service, candidates, preparations } = setup();

    await expect(service.reject(
      CANDIDATE_ID,
      ORGANIZATION_ID,
      { reason: 'not viable' },
      USER_ID,
    )).resolves.toEqual({ status: 'rejected' });

    expect(candidates.lockCandidate).toHaveBeenCalledWith(TX, {
      id: CANDIDATE_ID,
      organizationId: ORGANIZATION_ID,
    });
    expect(preparations.assertCandidateTerminalTransitionAllowed).toHaveBeenCalledWith(TX, {
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: CANDIDATE_ID,
    });
    expect(candidates.lockCandidate.mock.invocationCallOrder[0])
      .toBeLessThan(candidates.findCandidateState.mock.invocationCallOrder[0]);
    expect(candidates.findCandidateState.mock.invocationCallOrder[0])
      .toBeLessThan(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0]);
    expect(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0])
      .toBeLessThan(candidates.rejectCandidate.mock.invocationCallOrder[0]);
  });

  it('does not reject when an active or provider-identified preparation blocks termination', async () => {
    const { service, candidates, preparations } = setup();
    preparations.assertCandidateTerminalTransitionAllowed.mockRejectedValueOnce(
      new ConflictException('Candidate has an active product preparation.'),
    );

    await expect(service.reject(
      CANDIDATE_ID,
      ORGANIZATION_ID,
      { reason: 'not viable' },
      USER_ID,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(candidates.rejectCandidate).not.toHaveBeenCalled();
  });
});
