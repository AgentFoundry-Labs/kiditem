import { describe, expect, it } from 'vitest';
import type { ComplianceScores, ThumbnailAnalysisResult } from '@kiditem/shared/ai';
import {
  getPrimaryViolationSummary,
  getViolationEvidence,
  hasConfirmedComplianceFailure,
  getEffectiveComplianceGrade,
  needsThumbnailFix,
} from '../../../_shared/lib/thumbnail-classification';

const emptyViolations: ComplianceScores['violations'] = {
  background_not_white: false,
  has_text: false,
  has_extra_logo: false,
  has_discount_text: false,
  has_freebie_display: false,
  has_overlay_effects: false,
  has_gradient_background: false,
  has_background_objects: false,
  product_fill_low: false,
  not_center_aligned: false,
  product_cropped: false,
  excessive_editing: false,
};

function product(
  input: Partial<ThumbnailAnalysisResult>,
): ThumbnailAnalysisResult {
  return {
    id: 'analysis-1',
    productId: 'product-1',
    productName: '테스트 상품',
    imageUrl: 'https://example.com/image.jpg',
    overallScore: 80,
    grade: 'A',
    scores: null,
    issues: [],
    suggestions: [],
    method: 'ai',
    analyzed: true,
    qualityAnalyzed: true,
    complianceAnalyzed: true,
    complianceGrade: 'PASS',
    complianceScores: null,
    imageSpec: null,
    ...input,
  };
}

function complianceScores(
  input: Partial<ComplianceScores> = {},
): ComplianceScores {
  return {
    violations: { ...emptyViolations },
    confidence: {},
    quality: {
      estimatedFillPercent: 90,
      centerOffsetPercent: 0,
      aspectRatioValid: true,
    },
    violationCount: 0,
    ...input,
  };
}

describe('thumbnail classification helpers', () => {
  it('does not send B grade or WARN-only (violation-free) products to needs-fix', () => {
    expect(needsThumbnailFix(product({ grade: 'B' }))).toBe(false);
    expect(needsThumbnailFix(product({ complianceGrade: 'WARN' }))).toBe(false);
  });

  it('treats any violation as needs-fix regardless of compliance grade', () => {
    const passWithViolation = product({
      grade: 'A',
      complianceGrade: 'PASS',
      complianceScores: complianceScores({
        violations: { ...emptyViolations, background_not_white: true },
        confidence: { background_not_white: 55 },
        reasons: { background_not_white: '배경이 주황색이라 흰색 아님' },
        violationCount: 1,
      }),
    });
    expect(hasConfirmedComplianceFailure(passWithViolation)).toBe(true);
    expect(needsThumbnailFix(passWithViolation)).toBe(true);
    expect(getEffectiveComplianceGrade(passWithViolation)).toBe('FAIL');

    const failWithEvidence = product({
      complianceGrade: 'FAIL',
      complianceScores: complianceScores({
        violations: { ...emptyViolations, background_not_white: true },
        confidence: { background_not_white: 96 },
        reasons: { background_not_white: '배경이 파란색 그라데이션' },
        violationCount: 1,
      }),
    });
    expect(hasConfirmedComplianceFailure(failWithEvidence)).toBe(true);
    expect(needsThumbnailFix(failWithEvidence)).toBe(true);
    expect(getEffectiveComplianceGrade(failWithEvidence)).toBe('FAIL');
    expect(getPrimaryViolationSummary(failWithEvidence)).toBe('배경 비백색: 배경이 파란색 그라데이션');
  });

  it('downgrades evidence-less FAIL to WARN', () => {
    const noEvidence = product({
      complianceGrade: 'FAIL',
      complianceScores: complianceScores({ violationCount: 0 }),
    });
    expect(hasConfirmedComplianceFailure(noEvidence)).toBe(false);
    expect(needsThumbnailFix(noEvidence)).toBe(false);
    expect(getEffectiveComplianceGrade(noEvidence)).toBe('WARN');
  });

  it('treats even generic-text background violation as confirmed (배경 누수 방지)', () => {
    // 정책: Gemini 가 "배경이 순백색이 아님" 정도로 lazy 하게 적어도 violation==true 면 needs-fix.
    // 예전엔 weak-only regex 로 다운그레이드 했으나, 배경색 누수의 주 원인이라 제거됨.
    const lazy = product({
      complianceGrade: 'FAIL',
      complianceScores: complianceScores({
        violations: { ...emptyViolations, background_not_white: true },
        confidence: { background_not_white: 95 },
        reasons: { background_not_white: '배경이 순백색이 아님.' },
        violationCount: 1,
      }),
    });

    expect(getViolationEvidence(lazy.complianceScores)).toHaveLength(1);
    expect(hasConfirmedComplianceFailure(lazy)).toBe(true);
    expect(needsThumbnailFix(lazy)).toBe(true);
    expect(getEffectiveComplianceGrade(lazy)).toBe('FAIL');
  });

  it('keeps C/F quality products in needs-fix even without compliance failure', () => {
    expect(needsThumbnailFix(product({ grade: 'C' }))).toBe(true);
    expect(needsThumbnailFix(product({ grade: 'F' }))).toBe(true);
  });

  it('does not treat a structural F grade as needs-fix before quality analysis', () => {
    expect(
      needsThumbnailFix(product({ grade: 'F', analyzed: false, qualityAnalyzed: false })),
    ).toBe(false);
  });

  it('surfaces missing reason as evidence with null reason', () => {
    const scores = complianceScores({
      violations: { ...emptyViolations, has_text: true },
      confidence: { has_text: 82 },
      violationCount: 1,
    });
    expect(getViolationEvidence(scores)).toEqual([
      {
        key: 'has_text',
        label: '텍스트/카피 삽입',
        reason: null,
        confidence: 82,
      },
    ]);
  });
});
