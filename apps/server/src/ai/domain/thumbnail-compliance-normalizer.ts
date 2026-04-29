import type { ComplianceScores, ThumbnailScores } from '@kiditem/shared/ai';

/**
 * Pure compliance + quality normalization helpers.
 *
 * Owns the violation key allowlist, regex heuristics for physical-vs-digital
 * text, AI-boolean parsing, confidence clamping, and the final
 * `ComplianceScores` projection. No NestJS / Prisma / Gemini imports — these
 * functions only touch plain values so they can be unit-tested directly.
 */

export type ThumbnailGrade = 'S' | 'A' | 'B' | 'C' | 'F';
export type ComplianceGrade = 'PASS' | 'WARN' | 'FAIL';

export type RawComplianceEntry = {
  index?: number;
  violations?: Partial<Record<keyof ComplianceScores['violations'], unknown>>;
  confidence?: Record<string, unknown>;
  reasons?: Record<string, unknown>;
  editSuggestions?: Record<string, unknown>;
  quality?: Partial<Record<keyof ComplianceScores['quality'], unknown>>;
};

export const VIOLATION_KEYS: Array<keyof ComplianceScores['violations']> = [
  'background_not_white',
  'has_text',
  'has_extra_logo',
  'has_discount_text',
  'has_freebie_display',
  'has_overlay_effects',
  'has_gradient_background',
  'has_background_objects',
  'product_fill_low',
  'not_center_aligned',
  'product_cropped',
  'excessive_editing',
];

export const TEXT_RELATED_KEYS = [
  'has_text',
  'has_extra_logo',
  'has_discount_text',
  'has_freebie_display',
] as const;

const PHYSICAL_TEXT_REASON_RE =
  /(상품|제품|패키지|포장|박스|상자|라벨|택|스티커|표면|용기|병|튜브|의류|천|카드|책|종이|각인|인쇄|자수|프린트|실물)/i;

const DIGITAL_OVERLAY_REASON_RE =
  /(오버레이|디지털|포토샵|편집|합성|워터마크|배지|뱃지|리본|말풍선|버스트|배너|커서|아이콘|그래픽|프레임|모서리|여백|우상단|좌상단|우하단|좌하단|상단|하단|떠\s*있|떠있|분리|무관|이탈|허공|레이어|불연속|배경\s*위)/i;

const AFFIRMATIVE_PHYSICAL_REASON_RE =
  /(상품|제품|패키지|포장|박스|상자|라벨|택|스티커|표면|용기|병|튜브|의류|천|카드|책|종이).{0,24}(원래|본래|인쇄|각인|자수|프린트|부착|붙어|적혀|새겨|라벨에|표면에)/i;

const DIGITAL_NEGATION_OF_PHYSICAL_RE =
  /(상품|제품|패키지|라벨|표면).{0,16}(아닌|아니|무관|분리|이탈|떨어|떠\s*있|떠있)|(?:아닌|아니|무관|분리|이탈|떨어|떠\s*있|떠있).{0,16}(상품|제품|패키지|라벨|표면)/i;

export function parseAiBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  return false;
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeConfidence(
  confidence: Record<string, unknown>,
): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const key of VIOLATION_KEYS) {
    normalized[key] = clampNumber(confidence[key], 0, 100, 0);
  }
  return normalized;
}

export function hasDigitalOverlayEvidence(reason: string): boolean {
  const normalized = reason.trim();
  if (!normalized) return false;
  const citesDigitalOverlay = DIGITAL_OVERLAY_REASON_RE.test(normalized);
  if (!citesDigitalOverlay) return false;
  const saysNotOnPhysicalSurface = DIGITAL_NEGATION_OF_PHYSICAL_RE.test(normalized);
  if (saysNotOnPhysicalSurface) return true;
  return !AFFIRMATIVE_PHYSICAL_REASON_RE.test(normalized);
}

/**
 * Mutates `raw` in place: text-related violations whose `reasons[key]` cites
 * physical printed text (and not digital overlay) are flipped to `false` and
 * their reason removed. Low-confidence flags without explicit digital-overlay
 * evidence are also dropped. This stays as a mutation for parity with the
 * pre-refactor behavior where the rest of the 2-pass pipeline reads back
 * from the same entry.
 */
export function normalizeTextRelatedViolations(raw: RawComplianceEntry): void {
  if (!raw.violations) return;
  for (const key of TEXT_RELATED_KEYS) {
    if (!parseAiBoolean(raw.violations[key])) continue;
    const confidence = clampNumber(raw.confidence?.[key], 0, 100, 0);
    const reason = typeof raw.reasons?.[key] === 'string' ? (raw.reasons[key] as string) : '';
    const citesPhysicalSurface = PHYSICAL_TEXT_REASON_RE.test(reason);
    const citesDigitalOverlay = hasDigitalOverlayEvidence(reason);
    if (
      (citesPhysicalSurface && !citesDigitalOverlay) ||
      (!citesDigitalOverlay && confidence < 85)
    ) {
      (raw.violations as Record<string, boolean>)[key] = false;
      if (raw.reasons) delete raw.reasons[key];
    }
  }
}

export function scoreToGrade(score: number): ThumbnailGrade {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'F';
}

export function calculateComplianceGrade(scores: ComplianceScores): {
  grade: ComplianceGrade;
} {
  const { violations, confidence, quality } = scores;
  const violationKeys = Object.keys(violations) as Array<keyof typeof violations>;
  const hasConfirmedViolation = violationKeys.some(
    (key) => violations[key] === true && (confidence[key] ?? 0) >= 60,
  );
  if (hasConfirmedViolation) return { grade: 'FAIL' };

  const fillPercent = quality.estimatedFillPercent;
  const isBorderlineFill = fillPercent >= 80 && fillPercent < 85;
  const isBorderlineOffset = quality.centerOffsetPercent > 5;
  const hasLowConfidenceFlag = violationKeys.some(
    (key) => violations[key] === true && (confidence[key] ?? 0) < 60,
  );
  if (isBorderlineFill || isBorderlineOffset || hasLowConfidenceFlag) {
    return { grade: 'WARN' };
  }
  return { grade: 'PASS' };
}

export function parseComplianceResponse(raw: RawComplianceEntry): {
  complianceGrade: ComplianceGrade;
  complianceScores: ComplianceScores;
} {
  const rawViolations = raw.violations ?? {};
  const violations = Object.fromEntries(
    VIOLATION_KEYS.map((key) => [key, parseAiBoolean(rawViolations[key])]),
  ) as ComplianceScores['violations'];

  const confidence = normalizeConfidence(raw.confidence ?? {});
  const rawQuality = raw.quality ?? {};

  const rawReasons = raw.reasons ?? {};
  const rawSuggestions = raw.editSuggestions ?? {};
  const reasons: Record<string, string> = {};
  const editSuggestions: Record<string, string> = {};
  for (const key of VIOLATION_KEYS) {
    if (violations[key] === true) {
      const r = rawReasons[key];
      if (typeof r === 'string' && r.trim()) reasons[key] = r.trim();
      const s = rawSuggestions[key];
      if (typeof s === 'string' && s.trim()) editSuggestions[key] = s.trim();
    }
  }

  const complianceScores: ComplianceScores = {
    violations,
    confidence,
    reasons: Object.keys(reasons).length > 0 ? reasons : undefined,
    editSuggestions: Object.keys(editSuggestions).length > 0 ? editSuggestions : undefined,
    quality: {
      estimatedFillPercent: clampNumber(rawQuality.estimatedFillPercent, 0, 100, 0),
      centerOffsetPercent: clampNumber(rawQuality.centerOffsetPercent, 0, 100, 0),
      aspectRatioValid: parseAiBoolean(rawQuality.aspectRatioValid),
    },
    violationCount: VIOLATION_KEYS.filter((key) => violations[key] === true).length,
  };

  return {
    complianceGrade: calculateComplianceGrade(complianceScores).grade,
    complianceScores,
  };
}

export type AiQualityIssue = {
  type: string;
  severity: string;
  message: string;
};

export interface AiAnalysisResult {
  overallScore: number;
  grade: ThumbnailGrade;
  scores: ThumbnailScores | null;
  issues: AiQualityIssue[];
  suggestions: string[];
  method: 'ai';
}
