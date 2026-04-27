import type { ComplianceScores, ThumbnailAnalysisResult } from '@kiditem/shared';
import { VIOLATION_LABELS } from './grade-constants';

export interface ViolationEvidence {
  key: string;
  label: string;
  reason: string | null;
  confidence: number | null;
}

/**
 * 배경 위반은 reason 길이 / 표현과 무관하게 항상 confirmed 로 본다.
 * Gemini 가 lazy 하게 "배경이 흰색이 아님" 정도로만 적어도 정책상 무조건 재생성 대상.
 * (예전엔 weak-only regex 로 다운그레이드 했으나, 배경색 누수 → needs-fix 누락의 주 원인이라 제거.)
 */
export function isWeakBackgroundOnlyReason(_key: string, _reason: string | null): boolean {
  return false;
}

export function getViolationEvidence(
  scores: ComplianceScores | null | undefined,
): ViolationEvidence[] {
  if (!scores) return [];

  return Object.entries(scores.violations)
    .filter(([, violated]) => violated === true)
    .map(([key]) => {
      const reason = scores.reasons?.[key]?.trim() || null;
      return {
        key,
        label: VIOLATION_LABELS[key] || key,
        reason,
        confidence:
          typeof scores.confidence[key] === 'number'
            ? scores.confidence[key]
            : null,
      };
    });
}

/**
 * Compliance violation 이 하나라도 있으면 confirmed fail.
 *
 * 정책: complianceGrade 가 PASS/WARN 이라도, violations 에 true 가 있으면
 * 사용자 입장에선 "규칙 위반" 이다 (Gemini 가 conf<60 으로 WARN 깔아둬도 마찬가지).
 * 따라서 grade 와 무관하게 violation evidence 만 본다.
 */
export function hasConfirmedComplianceFailure(product: ThumbnailAnalysisResult): boolean {
  return getViolationEvidence(product.complianceScores).length > 0;
}

/**
 * "개선 필요" 자격 판정.
 * - violation 이 하나라도 있으면 무조건 needsFix (grade 무관). 배경 비백색·텍스트 삽입 등
 *   규칙 위반은 품질 점수와 별개로 정책상 재생성 대상.
 * - grade C/F: 품질 자체 미달 (violation 없어도 needsFix)
 */
export function needsThumbnailFix(product: ThumbnailAnalysisResult): boolean {
  if (!product.imageUrl) return false;
  if (hasConfirmedComplianceFailure(product)) return true;
  return product.grade === 'C' || product.grade === 'F';
}

/**
 * UI 노출 grade.
 * - violation 있으면 무조건 FAIL (grade 가 PASS/WARN 이어도 사용자에겐 위반으로 보여야 함)
 * - violation 없는데 FAIL 로 마킹돼 있으면 WARN 으로 다운그레이드 (증거 없는 FAIL 방지)
 */
export function getEffectiveComplianceGrade(
  product: ThumbnailAnalysisResult,
): string | null {
  const hasViolation = getViolationEvidence(product.complianceScores).length > 0;
  if (hasViolation) return 'FAIL';
  if (product.complianceGrade === 'FAIL') return 'WARN';
  return product.complianceGrade;
}

export function getPrimaryViolationSummary(product: ThumbnailAnalysisResult): string | null {
  const [first] = getViolationEvidence(product.complianceScores);
  if (!first) return null;
  return first.reason ? `${first.label}: ${first.reason}` : first.label;
}
