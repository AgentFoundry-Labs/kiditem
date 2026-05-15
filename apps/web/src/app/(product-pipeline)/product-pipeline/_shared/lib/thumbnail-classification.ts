import type { ComplianceScores, ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import { VIOLATION_LABELS } from './thumbnail-grade';

interface ViolationEvidence {
  key: string;
  label: string;
  reason: string | null;
  confidence: number | null;
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

export function hasConfirmedComplianceFailure(product: ThumbnailAnalysisResult): boolean {
  return getViolationEvidence(product.complianceScores).length > 0;
}

export function needsThumbnailFix(product: ThumbnailAnalysisResult): boolean {
  if (!product.imageUrl) return false;
  if (hasConfirmedComplianceFailure(product)) return true;
  return product.qualityAnalyzed && (product.grade === 'C' || product.grade === 'F');
}

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
