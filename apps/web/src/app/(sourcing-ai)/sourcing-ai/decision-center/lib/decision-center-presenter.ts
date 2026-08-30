import type { SourcingDecisionCandidateViewModel } from './sourcing-decision-center';

export interface DecisionConfidencePresentation {
  label: string;
  value: string;
  description: string;
}

export interface CandidateActionPresentation {
  enabled: boolean;
  reason: string;
}

export interface CandidateActionAvailability {
  rfq: CandidateActionPresentation;
  sample: CandidateActionPresentation;
}

const CODE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // Candidate action blockers
  decision_batch_missing: '분석 배치가 없어 먼저 키워드 분석을 실행해야 합니다.',
  decision_batch_expired: '분석 배치의 유효 기간이 끝나 다시 분석해야 합니다.',
  decision_batch_inactive: '현재 조사 가능한 분석 배치가 아닙니다.',
  recommendation_rejected: '제외된 후보는 조달 요청을 만들 수 없습니다.',
  supplier_offer_missing: '연결된 공급자 제안이 없습니다.',
  exact_supplier_variant_missing: '정확한 옵션·구매 단위가 확인된 공급자 제안이 필요합니다.',
  supplier_sample_unavailable: '공급자가 샘플을 제공하지 않는 제안입니다.',

  // Canonical decision reasons
  all_test_order_gates_passed: '테스트 발주에 필요한 검증 기준을 모두 통과했습니다.',
  baseline_decision_not_order: '기초 추천 결과가 발주 대상이 아닙니다.',
  baseline_model_excluded: '기초 모델이 제외 후보로 판정했습니다.',
  compliance_unknown: '인증·법적 요건이 아직 확인되지 않았습니다.',
  compliance_blocked: '인증·법적 요건을 통과하지 못했습니다.',
  ip_unknown: '지식재산권 위험이 아직 확인되지 않았습니다.',
  ip_blocked: '지식재산권 기준을 통과하지 못했습니다.',
  qc_unknown: '품질 검증이 아직 완료되지 않았습니다.',
  qc_blocked: '품질 기준을 통과하지 못했습니다.',
  economics_unknown: '원가·마진 계산이 아직 완료되지 않았습니다.',
  profit_p10_not_positive: '보수적 수익 추정치가 0원 이하입니다.',
  coverage_confidence_not_executable: '증거 커버리지는 판매 성공 확률이 아니므로 발주 근거로 사용할 수 없습니다.',
  calibrated_probability_below_threshold: '보정된 판매 성공 확률이 테스트 기준보다 낮습니다.',
  coupang_demand_evidence_missing: '쿠팡 수요 증거가 부족합니다.',
  '1688_supply_evidence_missing': '1688 공급 증거가 부족합니다.',
  supporting_evidence_families_below_minimum: '서로 다른 종류의 보조 증거가 부족합니다.',
  supporting_platforms_below_minimum: '독립적인 플랫폼 증거가 부족합니다.',

  // Next evidence actions
  verify_compliance: '인증·법적 요건 확인',
  verify_ip: '지식재산권 위험 확인',
  verify_qc: '품질 기준 검증',
  resolve_unknown_risk: '미확인 위험 해소',
  complete_economics: '원가·마진 계산 완료',
  obtain_calibrated_probability: '실제 결과 기반 판매 성공 확률 확보',
  add_coupang_evidence: '쿠팡 수요 증거 추가',
  add_1688_evidence: '1688 공급 증거 추가',
  collect_supporting_evidence: '다른 종류의 보조 증거 추가',
  add_independent_platform_evidence: '독립적인 플랫폼 증거 추가',
  increase_calibrated_confidence: '보정된 판매 성공 확률 높이기',
  reassess_baseline_decision: '기초 추천 결과 재평가',
  resolve_supplier_variant: '정확한 공급자 옵션·구매 단위 확정',

  // Known bound-evidence and commercial risks
  supplier_offer_provenance_not_bound: '공급자 제안의 출처 연결이 확인되지 않았습니다.',
  evidence_concept_not_bound: '증거와 판매 상품 개념이 일치하지 않습니다.',
  inadmissible_evidence_bound: '결정에 사용할 수 없는 증거가 포함되어 있습니다.',
  economics_blocked: '수익성 기준을 통과하지 못했습니다.',
  launch_candidate_expired: '판매 후보 스냅샷의 유효 기간이 끝났습니다.',
  supplier_offer_expired: '공급자 제안 스냅샷의 유효 기간이 끝났습니다.',
  supplier_identity_unverified: '공급자 신원이 확인되지 않았습니다.',
  prohibited_ip: '지식재산권 침해 위험이 있습니다.',
};

/**
 * 배치 단위 소스 커버리지. 서버는 키워드로 조회한 소스 그룹 중 데이터가 있는 비율을
 * 한 번 계산해 배치 전체에 공유하므로, 이 값은 후보의 증거량도 판매 성공 확률도 아니다.
 *
 * 후보 카드에 놓지 말 것. 후보의 `evidenceFamilyCount`/`evidencePlatformCount` 가
 * 0 인데 이 값이 83% 로 나란히 표시되면 서로 모순되는 화면이 된다.
 */
export function formatBatchSourceCoverage(
  coverage: number | null,
): DecisionConfidencePresentation {
  return {
    label: '소스 커버리지',
    value: coverage === null ? '—' : `${Math.round(coverage * 100)}%`,
    description:
      '이 키워드로 조회한 소스 그룹 중 데이터가 있는 비율입니다. 후보별 증거량이나 판매 성공 확률이 아닙니다.',
  };
}

export function canManageSourcingDecision(
  role: string | null | undefined,
): boolean {
  const normalizedRole = role?.trim().toLowerCase();
  return normalizedRole === 'owner' || normalizedRole === 'admin';
}

/**
 * Converts persisted policy codes into operator language. Unknown machine-like
 * codes intentionally receive a safe generic label instead of leaking raw
 * identifiers into the primary UI.
 */
export function describeSourcingCode(
  code: string | null | undefined,
): string {
  const trimmedCode = code?.trim();
  const normalizedCode = trimmedCode?.toLowerCase();
  if (!normalizedCode) return '추가 확인이 필요합니다.';

  const knownDescription = CODE_DESCRIPTIONS[normalizedCode];
  if (knownDescription) return knownDescription;

  const [prefix, nestedCode] = splitPrefixedCode(normalizedCode);
  if (prefix === 'unknown_risk') {
    return `미확인 위험: ${describeRiskCode(nestedCode)}`;
  }
  if (prefix === 'blocking_risk') {
    return `차단 위험: ${describeRiskCode(nestedCode)}`;
  }

  if (trimmedCode && !looksLikeInternalCode(trimmedCode)) return trimmedCode;
  return '추가 검토가 필요한 항목입니다.';
}

export function resolveCandidateActionAvailability(
  candidate: SourcingDecisionCandidateViewModel,
  canManage: boolean,
): CandidateActionAvailability {
  if (!canManage) {
    const permissionReason = 'Owner 또는 Admin 권한이 필요합니다.';
    return {
      rfq: { enabled: false, reason: permissionReason },
      sample: { enabled: false, reason: permissionReason },
    };
  }

  const rfq = actionState({
    candidate,
    intentType: 'request_rfq',
    capability: candidate.canRequestRfq,
    readyReason: '견적 요청을 만들 수 있습니다.',
    duplicateReason: '이미 제안 상태의 견적 요청이 있습니다.',
    fallbackReason: '현재 후보로는 견적을 요청할 수 없습니다.',
    relevantBlockCodes: [
      'decision_batch_missing',
      'decision_batch_expired',
      'decision_batch_inactive',
      'recommendation_rejected',
      'supplier_offer_missing',
    ],
  });

  const sample = candidate.offer?.sampleAvailable === false
    ? {
        enabled: false,
        reason: describeSourcingCode('supplier_sample_unavailable'),
      }
    : actionState({
        candidate,
        intentType: 'request_sample',
        capability: candidate.canRequestSample,
        readyReason: '샘플 요청을 만들 수 있습니다.',
        duplicateReason: '이미 제안 상태의 샘플 요청이 있습니다.',
        fallbackReason: '현재 후보로는 샘플을 요청할 수 없습니다.',
        relevantBlockCodes: [
          'decision_batch_missing',
          'decision_batch_expired',
          'decision_batch_inactive',
          'recommendation_rejected',
          'supplier_offer_missing',
          'exact_supplier_variant_missing',
          'supplier_sample_unavailable',
        ],
      });

  return { rfq, sample };
}

function actionState(input: {
  candidate: SourcingDecisionCandidateViewModel;
  intentType: 'request_rfq' | 'request_sample';
  capability: boolean;
  readyReason: string;
  duplicateReason: string;
  fallbackReason: string;
  relevantBlockCodes: readonly string[];
}): CandidateActionPresentation {
  const latestIntent = input.candidate.latestIntent;
  if (
    latestIntent?.status === 'proposed'
    && latestIntent.intentType === input.intentType
  ) {
    return { enabled: false, reason: input.duplicateReason };
  }
  if (input.capability) {
    return { enabled: true, reason: input.readyReason };
  }

  const blockCode = input.relevantBlockCodes.find((code) =>
    input.candidate.actionBlockReasons.includes(code),
  );
  return {
    enabled: false,
    reason: blockCode ? describeSourcingCode(blockCode) : input.fallbackReason,
  };
}

function splitPrefixedCode(code: string): [string, string] {
  const separatorIndex = code.indexOf(':');
  if (separatorIndex < 0) return [code, ''];
  return [code.slice(0, separatorIndex), code.slice(separatorIndex + 1)];
}

function describeRiskCode(code: string): string {
  if (!code) return '세부 위험을 확인해야 합니다.';
  return CODE_DESCRIPTIONS[code] ?? '세부 위험을 확인해야 합니다.';
}

function looksLikeInternalCode(value: string): boolean {
  return /^[a-z0-9_:-]+$/i.test(value);
}
