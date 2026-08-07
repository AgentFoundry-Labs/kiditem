import { describe, expect, it } from 'vitest';
import {
  canManageSourcingDecision,
  describeSourcingCode,
  formatBatchSourceCoverage,
  resolveCandidateActionAvailability,
} from './decision-center-presenter';
import type { SourcingDecisionCandidateViewModel } from './sourcing-decision-center';

describe('decision center presenter', () => {
  describe('formatBatchSourceCoverage', () => {
    it('배치 값을 퍼센트로 보이되 후보 증거량·확률과 구분해 설명한다', () => {
      expect(formatBatchSourceCoverage(0.83)).toEqual({
        label: '소스 커버리지',
        value: '83%',
        description: expect.stringContaining('후보별 증거량이나 판매 성공 확률이 아닙니다'),
      });
    });

    it('배치 단위로 확정할 수 없으면 값을 만들어내지 않는다', () => {
      expect(formatBatchSourceCoverage(null).value).toBe('—');
    });
  });

  describe('canManageSourcingDecision', () => {
    it.each(['owner', 'OWNER', ' Owner ', 'admin', 'AdMiN'])(
      'allows %s',
      (role) => expect(canManageSourcingDecision(role)).toBe(true),
    );

    it.each(['member', 'viewer', '', null, undefined])(
      'denies %s',
      (role) => expect(canManageSourcingDecision(role)).toBe(false),
    );
  });

  describe('describeSourcingCode', () => {
    it.each([
      ['decision_batch_expired', '분석 배치의 유효 기간'],
      ['coverage_confidence_not_executable', '판매 성공 확률이 아니'],
      ['add_coupang_evidence', '쿠팡 수요 증거 추가'],
      ['supplier_offer_expired', '공급자 제안 스냅샷'],
    ])('describes the known code %s', (code, expectedText) => {
      expect(describeSourcingCode(code)).toContain(expectedText);
      expect(describeSourcingCode(code)).not.toContain(code);
    });

    it('expands nested unknown and blocking risk codes', () => {
      expect(describeSourcingCode('unknown_risk:supplier_identity_unverified'))
        .toBe('미확인 위험: 공급자 신원이 확인되지 않았습니다.');
      expect(describeSourcingCode('blocking_risk:prohibited_ip'))
        .toBe('차단 위험: 지식재산권 침해 위험이 있습니다.');
    });

    it('preserves human-authored text but hides unknown machine identifiers', () => {
      expect(describeSourcingCode('공급자 확인 필요')).toBe('공급자 확인 필요');
      expect(describeSourcingCode('new_internal_blocker')).toBe(
        '추가 검토가 필요한 항목입니다.',
      );
    });
  });

  describe('resolveCandidateActionAvailability', () => {
    it('enables RFQ and sample actions when the candidate and role permit them', () => {
      expect(resolveCandidateActionAvailability(candidate({
        canRequestRfq: true,
        canRequestSample: true,
      }), true)).toEqual({
        rfq: { enabled: true, reason: '견적 요청을 만들 수 있습니다.' },
        sample: { enabled: true, reason: '샘플 요청을 만들 수 있습니다.' },
      });
    });

    it('makes the permission blocker visible for both actions', () => {
      const availability = resolveCandidateActionAvailability(candidate({
        canRequestRfq: true,
        canRequestSample: true,
      }), false);

      expect(availability.rfq).toEqual({
        enabled: false,
        reason: 'Owner 또는 Admin 권한이 필요합니다.',
      });
      expect(availability.sample).toEqual(availability.rfq);
    });

    it('uses the candidate action blocker as a visible Korean reason', () => {
      const availability = resolveCandidateActionAvailability(candidate({
        actionBlockReasons: ['decision_batch_expired', 'supplier_offer_missing'],
      }), true);

      expect(availability.rfq).toMatchObject({
        enabled: false,
        reason: expect.stringContaining('분석 배치의 유효 기간'),
      });
      expect(availability.sample).toMatchObject({
        enabled: false,
        reason: expect.stringContaining('분석 배치의 유효 기간'),
      });
    });

    it('blocks a sample explicitly when the supplier does not provide one', () => {
      const availability = resolveCandidateActionAvailability(candidate({
        canRequestRfq: true,
        canRequestSample: true,
        offer: { sampleAvailable: false } as SourcingDecisionCandidateViewModel['offer'],
      }), true);

      expect(availability.rfq.enabled).toBe(true);
      expect(availability.sample).toEqual({
        enabled: false,
        reason: '공급자가 샘플을 제공하지 않는 제안입니다.',
      });
    });

    it('blocks only the action matching the latest proposed intent', () => {
      const base = candidate({ canRequestRfq: true, canRequestSample: true });
      const rfqPending = candidate({
        ...base,
        latestIntent: proposedIntent('request_rfq'),
      });
      const samplePending = candidate({
        ...base,
        latestIntent: proposedIntent('request_sample'),
      });

      expect(resolveCandidateActionAvailability(rfqPending, true)).toMatchObject({
        rfq: { enabled: false, reason: expect.stringContaining('이미 제안 상태') },
        sample: { enabled: true },
      });
      expect(resolveCandidateActionAvailability(samplePending, true)).toMatchObject({
        rfq: { enabled: true },
        sample: { enabled: false, reason: expect.stringContaining('이미 제안 상태') },
      });
    });
  });
});

function candidate(
  overrides: Partial<SourcingDecisionCandidateViewModel> = {},
): SourcingDecisionCandidateViewModel {
  return {
    id: 'candidate-1',
    rank: 1,
    productName: '자석 블록',
    decision: 'hold',
    decisionLabel: '보류',
    executionEligible: false,
    score: 78,
    confidence: 0.67,
    confidenceKind: 'coverage',
    evidenceFamilyCount: 3,
    evidencePlatformCount: 2,
    hasCoupangEvidence: true,
    has1688Evidence: true,
    nextEvidenceAction: 'obtain_calibrated_probability',
    reasonCodes: [],
    riskCodes: [],
    offer: null,
    launchCandidate: null,
    latestIntent: null,
    canRequestRfq: false,
    canRequestSample: false,
    actionBlockReasons: [],
    ...overrides,
  };
}

function proposedIntent(
  intentType: 'request_rfq' | 'request_sample',
): NonNullable<SourcingDecisionCandidateViewModel['latestIntent']> {
  return {
    id: `intent-${intentType}`,
    organizationId: 'organization-1',
    decisionBatchItemId: 'candidate-1',
    launchCandidateId: null,
    supplierOfferSkuSnapshotId: 'offer-1',
    selectedPriceTierId: null,
    sourceRecommendationArtifactId: 'batch-1',
    requestedByUserId: 'user-1',
    reviewedByUserId: null,
    intentType,
    status: 'proposed',
    idempotencyKey: `intent:${intentType}:1`,
    requestHash: 'request-hash',
    requestedPurchaseUnits: null,
    unitsPerPurchaseUnit: null,
    unitsPerSellableBundle: null,
    requestedSellableUnits: null,
    selectedUnitPriceCny: null,
    expectedGoodsTotalCny: null,
    currency: null,
    expiresAt: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  };
}
