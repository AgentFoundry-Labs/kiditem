import { describe, expect, it } from 'vitest';
import {
  blocksCandidateTerminalTransition,
  candidateRegistrationState,
  countFrozenSalesProductOptionReferences,
  type RegistrationExecutionFact,
} from './registration-execution-state';

function fact(overrides: Partial<RegistrationExecutionFact> = {}): RegistrationExecutionFact {
  return {
    executionId: 'execution-1',
    registrationTargetId: 'preparation-1',
    channelAccountId: 'account-1',
    channelListingId: null,
    executionKind: 'external_wing',
    status: 'prepared',
    providerOutcome: 'not_attempted',
    providerSubmissionId: null,
    externalListingId: null,
    hasResult: false,
    reviewPayloadHash: null,
    approvedAt: null,
    approvedByUserId: null,
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
    ...overrides,
  };
}

describe('registration execution state', () => {
  describe('candidateRegistrationState', () => {
    it('reads none when the fence has never been entered', () => {
      expect(candidateRegistrationState([])).toBe('none');
    });

    it('reads preparing for a frozen submission that was never started', () => {
      expect(candidateRegistrationState([fact()])).toBe('preparing');
    });

    it('reads confirming while an uncertain submission is being reconciled', () => {
      expect(candidateRegistrationState([
        fact({ status: 'reconciling', providerOutcome: 'uncertain' }),
      ])).toBe('confirming');
    });

    it('reads confirming for a started execution whose provider result is unknown', () => {
      expect(candidateRegistrationState([
        fact({ status: 'executing', providerOutcome: 'uncertain' }),
      ])).toBe('confirming');
    });

    it('reads registered once the provider result landed, before the row completes', () => {
      expect(candidateRegistrationState([
        fact({ status: 'executing', providerOutcome: 'succeeded', externalListingId: '427011919' }),
      ])).toBe('registered');
    });

    it('reads registered for a completed execution', () => {
      expect(candidateRegistrationState([
        fact({ status: 'succeeded', providerOutcome: 'succeeded', channelListingId: 'listing-1' }),
      ])).toBe('registered');
    });

    it('reads failed for a definitively failed execution', () => {
      expect(candidateRegistrationState([
        fact({ status: 'failed', providerOutcome: 'definitive_failure' }),
      ])).toBe('failed');
    });

    it('answers from the newest execution, because a retry supersedes the attempt it replaced', () => {
      // 리더가 createdAt 내림차순으로 읽어 주므로 첫 줄이 가장 최근이다.
      expect(candidateRegistrationState([
        fact({ executionId: 'execution-2', status: 'reconciling', providerOutcome: 'uncertain' }),
        fact({ executionId: 'execution-1', status: 'failed', providerOutcome: 'definitive_failure' }),
      ])).toBe('confirming');
    });

    it('treats a cancelled execution as no registration at all', () => {
      expect(candidateRegistrationState([fact({ status: 'cancelled' })])).toBe('none');
    });
  });

  describe('blocksCandidateTerminalTransition', () => {
    it('lets a candidate with no execution reach a terminal state', () => {
      expect(blocksCandidateTerminalTransition([])).toBe(false);
    });

    it('lets a cancelled execution with no provider trace go', () => {
      expect(blocksCandidateTerminalTransition([fact({ status: 'cancelled' })])).toBe(false);
    });

    it.each(['prepared', 'executing', 'reconciling', 'succeeded'])(
      'blocks while an execution is still live (%s)',
      (status) => {
        expect(blocksCandidateTerminalTransition([fact({ status })])).toBe(true);
      },
    );

    it('blocks a closed execution that still holds a provider submission id', () => {
      expect(blocksCandidateTerminalTransition([
        fact({ status: 'failed', providerSubmissionId: 'provider-1' }),
      ])).toBe(true);
    });

    it('blocks a closed execution that still holds an external listing id', () => {
      expect(blocksCandidateTerminalTransition([
        fact({ status: 'cancelled', externalListingId: '427011919' }),
      ])).toBe(true);
    });

    it('blocks a closed execution that retained a provider result', () => {
      expect(blocksCandidateTerminalTransition([
        fact({ status: 'failed', hasResult: true }),
      ])).toBe(true);
    });
  });

  describe('countFrozenSalesProductOptionReferences', () => {
    it('counts each option once per immutable target execution', () => {
      const counts = countFrozenSalesProductOptionReferences([
        {
          submissionPayloadJson: {
            product: { options: [{ id: 'option-1' }, { id: 'option-2' }] },
            supplyPrices: [
              { salesProductOptionId: 'option-1', supplyPrice: 1_000 },
              { salesProductOptionId: 'option-2', supplyPrice: null },
            ],
          },
        },
        {
          submissionPayloadJson: {
            product: { options: [{ id: 'option-1' }] },
            supplyPrices: [{ salesProductOptionId: 'option-1', supplyPrice: 1_200 }],
          },
        },
        { submissionPayloadJson: { registrationInput: { optionLinks: [] } } },
      ]);

      expect([...counts.entries()]).toEqual([
        ['option-1', 2],
        ['option-2', 1],
      ]);
    });

    it('ignores malformed and non-target snapshots', () => {
      const counts = countFrozenSalesProductOptionReferences([
        { submissionPayloadJson: null },
        { submissionPayloadJson: { product: { options: [{ id: 7 }, {}] } } },
        { submissionPayloadJson: { supplyPrices: [{ salesProductOptionId: 9 }] } },
      ]);

      expect([...counts.entries()]).toEqual([]);
    });
  });
});
