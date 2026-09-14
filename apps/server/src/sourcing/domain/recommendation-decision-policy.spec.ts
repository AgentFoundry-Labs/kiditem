import { describe, expect, it } from 'vitest';
import {
  SOURCING_RECOMMENDATION_DECISIONS,
  decideSourcingRecommendation,
  type RecommendationDecisionPolicyInput,
} from './recommendation-decision-policy';

function qualifiedInput(
  overrides: Partial<RecommendationDecisionPolicyInput> = {},
): RecommendationDecisionPolicyInput {
  return {
    baselineDecision: 'order',
    confidenceKind: 'calibrated_probability',
    confidence: 0.67,
    supportingEvidenceFamilies: [
      'coupang_market',
      '1688_supply',
      'naver_demand',
    ],
    supportingPlatforms: ['coupang', '1688', 'naver'],
    hasCoupangDemandEvidence: true,
    has1688SupplyEvidence: true,
    economics: { status: 'known', profitP10: 12_000 },
    gates: {
      compliance: 'passed',
      ip: 'passed',
      qc: 'passed',
    },
    blockingRiskCodes: [],
    unknownRiskCodes: [],
    ...overrides,
  };
}

describe('recommendation decision policy', () => {
  it('uses exactly the three canonical decisions', () => {
    expect(SOURCING_RECOMMENDATION_DECISIONS).toEqual([
      'test_order',
      'hold',
      'reject',
    ]);
  });

  it('allows test_order only when every calibrated gate passes at the 0.67 boundary', () => {
    expect(decideSourcingRecommendation(qualifiedInput())).toEqual({
      decision: 'test_order',
      executionEligible: true,
      nextEvidenceAction: null,
      reasonCodes: ['all_test_order_gates_passed'],    });
  });

  it.each(['order', 'observe_3d'] as const)(
    'keeps Phase 0 coverage confidence on hold for baseline decision %s',
    (baselineDecision) => {
      const decision = decideSourcingRecommendation(qualifiedInput({
        baselineDecision,
        confidenceKind: 'coverage',
        confidence: 1,
      }));

      expect(decision).toMatchObject({
        decision: 'hold',
        executionEligible: false,
        nextEvidenceAction: 'obtain_calibrated_probability',      });
      expect(decision.reasonCodes).toContain('coverage_confidence_not_executable');
    },
  );

  it('maps a baseline model exclusion to canonical reject', () => {
    expect(decideSourcingRecommendation(qualifiedInput({
      baselineDecision: 'exclude',
      confidenceKind: 'coverage',
      confidence: 1,
    }))).toEqual({
      decision: 'reject',
      executionEligible: false,
      nextEvidenceAction: null,
      reasonCodes: ['baseline_model_excluded'],    });
  });

  it('rejects a Phase 0 candidate when a hard gate is blocked', () => {
    const decision = decideSourcingRecommendation(qualifiedInput({
      confidenceKind: 'coverage',
      confidence: 1,
      gates: {
        compliance: 'blocked',
        ip: 'passed',
        qc: 'passed',
      },
    }));

    expect(decision).toEqual({
      decision: 'reject',
      executionEligible: false,
      nextEvidenceAction: null,
      reasonCodes: ['compliance_blocked'],    });
  });

  it.each([0, -1])(
    'rejects Phase 0 when profit P10 is non-positive (%s)',
    (profitP10) => {
      expect(decideSourcingRecommendation(qualifiedInput({
        confidenceKind: 'coverage',
        economics: { status: 'known', profitP10 },
      }))).toMatchObject({
        decision: 'reject',
        executionEligible: false,
        reasonCodes: ['profit_p10_not_positive'],      });
    },
  );

  it.each([
    ['baseline order', { baselineDecision: 'observe_3d' }, 'reassess_baseline_decision'],
    ['calibrated threshold', { confidence: 0.669 }, 'increase_calibrated_confidence'],
    [
      'three evidence families',
      { supportingEvidenceFamilies: ['coupang_market', '1688_supply'] },
      'collect_supporting_evidence',
    ],
    [
      'two independent platforms',
      { supportingPlatforms: ['coupang', 'coupang'] },
      'add_independent_platform_evidence',
    ],
    [
      'Coupang evidence',
      {
        supportingPlatforms: ['1688', 'naver'],
        hasCoupangDemandEvidence: false,
      },
      'add_coupang_evidence',
    ],
    [
      '1688 evidence',
      {
        supportingPlatforms: ['coupang', 'naver'],
        has1688SupplyEvidence: false,
      },
      'add_1688_evidence',
    ],
    [
      'known economics',
      { economics: { status: 'unknown', profitP10: null } },
      'complete_economics',
    ],
  ] as const)(
    'holds when the %s gate is missing',
    (_label, overrides, nextEvidenceAction) => {
      expect(decideSourcingRecommendation(qualifiedInput(
        overrides as Partial<RecommendationDecisionPolicyInput>,
      ))).toMatchObject({
        decision: 'hold',
        executionEligible: false,
        nextEvidenceAction,      });
    },
  );

  it.each([
    ['compliance', 'verify_compliance'],
    ['ip', 'verify_ip'],
    ['qc', 'verify_qc'],
  ] as const)(
    'holds and requests verification when %s is unknown',
    (gate, nextEvidenceAction) => {
      const input = qualifiedInput();
      input.gates = { ...input.gates, [gate]: 'unknown' };
      expect(decideSourcingRecommendation(input)).toMatchObject({
        decision: 'hold',
        executionEligible: false,
        nextEvidenceAction,      });
    },
  );

  it.each([
    ['compliance', 'verify_compliance'],
    ['ip', 'verify_ip'],
    ['qc', 'verify_qc'],
  ] as const)(
    'keeps an unevaluated %s gate distinct from an inconclusive evaluation',
    (gate, nextEvidenceAction) => {
      const input = qualifiedInput();
      input.gates = { ...input.gates, [gate]: 'not_evaluated' };
      expect(decideSourcingRecommendation(input)).toMatchObject({
        decision: 'hold',
        executionEligible: false,
        nextEvidenceAction,
        reasonCodes: [`${gate}_not_evaluated`],
      });
    },
  );

  it.each(['compliance', 'ip', 'qc'] as const)(
    'rejects when the %s gate is blocked',
    (gate) => {
      const input = qualifiedInput();
      input.gates = { ...input.gates, [gate]: 'blocked' };
      expect(decideSourcingRecommendation(input)).toMatchObject({
        decision: 'reject',
        executionEligible: false,
        reasonCodes: [`${gate}_blocked`],      });
    },
  );

  it('holds unknown risks but rejects blocking risks', () => {
    expect(decideSourcingRecommendation(qualifiedInput({
      unknownRiskCodes: ['supplier_identity_unverified'],
    }))).toMatchObject({
      decision: 'hold',
      executionEligible: false,
      nextEvidenceAction: 'resolve_unknown_risk',
      reasonCodes: ['unknown_risk:supplier_identity_unverified'],    });

    expect(decideSourcingRecommendation(qualifiedInput({
      blockingRiskCodes: ['prohibited_ip'],
    }))).toMatchObject({
      decision: 'reject',
      executionEligible: false,
      nextEvidenceAction: null,
      reasonCodes: ['blocking_risk:prohibited_ip'],    });
  });

  it('does not let duplicate evidence labels fabricate family or platform coverage', () => {
    const decision = decideSourcingRecommendation(qualifiedInput({
      supportingEvidenceFamilies: ['same', 'same', 'same'],
      supportingPlatforms: ['coupang', 'coupang', '1688'],
    }));

    expect(decision).toMatchObject({
      decision: 'hold',
      executionEligible: false,
      nextEvidenceAction: 'collect_supporting_evidence',    });
    expect(decision.reasonCodes).toContain(
      'supporting_evidence_families_below_minimum',
    );
  });

  it('never fabricates a propensity for hold, reject, or test_order', () => {
    const decisions = [
      decideSourcingRecommendation(qualifiedInput()),
      decideSourcingRecommendation(qualifiedInput({ confidenceKind: 'coverage' })),
      decideSourcingRecommendation(qualifiedInput({
        economics: { status: 'known', profitP10: -1 },
      })),
    ];

    expect(decisions.map((decision) => decision.decision)).toEqual([
      'test_order',
      'hold',
      'reject',
    ]);
    for (const decision of decisions) {
      expect(decision).not.toHaveProperty('policyProbability');
    }
  });

  it('rejects invalid probability-like inputs instead of coercing them', () => {
    expect(() => decideSourcingRecommendation(qualifiedInput({ confidence: Number.NaN })))
      .toThrow(/between 0 and 1/);
    expect(() => decideSourcingRecommendation(qualifiedInput({ confidence: 1.01 })))
      .toThrow(/between 0 and 1/);
    expect(() => decideSourcingRecommendation(qualifiedInput({
      economics: { status: 'known', profitP10: Number.NaN },
    }))).toThrow(/finite number/);
  });
});
