import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
// NOTE: tsconfig.module='commonjs' + esModuleInterop 미설정 환경에서 sharp 는
// callable 인 module.exports 자체. `import sharp from 'sharp'` 로 default 를
// 받으면 sharp_1.default = undefined → 런타임 TypeError("not a function").
// require 로 받으면 어떤 module 설정에서도 callable 인 본체를 그대로 받음.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');
import type { ComplianceScores, ImageSpec, ImageSpecIssue, ThumbnailScores } from '@kiditem/shared/ai';
import {
  COMPLIANCE_PROMPT,
  COMPLIANCE_REFERENCE_HEADER,
  QUALITY_PROMPT,
} from './thumbnail-prompts';
import { ThumbnailImageFetcherService } from './thumbnail-image-fetcher.service';
import { ThumbnailReferenceImagesService } from './thumbnail-reference-images.service';
import {
  requireGeminiApiKey,
  requireGeminiVerifyModel,
  requireGeminiVisionModel,
} from './thumbnail-gemini-config';

type ThumbnailGrade = 'S' | 'A' | 'B' | 'C' | 'F';
type ComplianceGrade = 'PASS' | 'WARN' | 'FAIL';

export interface ThumbnailAiItem {
  productId: string;
  productName: string;
  imageUrl: string;
  category?: string | null;
}

interface AiAnalysisIssue {
  type: string;
  severity: string;
  message: string;
}

interface AiAnalysisResult {
  overallScore: number;
  grade: ThumbnailGrade;
  scores: ThumbnailScores | null;
  issues: AiAnalysisIssue[];
  suggestions: string[];
  method: 'ai';
}

interface FetchedImage {
  data: string;
  mimeType: string;
}

type RawComplianceEntry = {
  index?: number;
  violations?: Partial<Record<keyof ComplianceScores['violations'], unknown>>;
  confidence?: Record<string, unknown>;
  reasons?: Record<string, unknown>;
  editSuggestions?: Record<string, unknown>;
  quality?: Partial<Record<keyof ComplianceScores['quality'], unknown>>;
};

const VIOLATION_KEYS: Array<keyof ComplianceScores['violations']> = [
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

const TEXT_RELATED_KEYS = [
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

/**
 * Pure-AI vision adapter.
 *
 * Owns Gemini text/vision calls for thumbnail quality, compliance, image-spec
 * probing, and JSON classification. Persistence (Prisma writes) is the
 * caller's responsibility; this service returns plain values and Maps so
 * `ThumbnailAnalysisService` can decide whether to upsert based on scope.
 *
 * Image fetches go through `ThumbnailImageFetcherService` so SSRF / redirect /
 * MIME / size checks are shared with the editor generation path.
 *
 * Reference parts come from `ThumbnailReferenceImagesService` so generation
 * and compliance prompts use the same reference set.
 */
@Injectable()
export class ThumbnailVisionAiService {
  private readonly logger = new Logger(ThumbnailVisionAiService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly imageFetcher: ThumbnailImageFetcherService,
    private readonly references: ThumbnailReferenceImagesService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────

  async analyzeQuality(
    items: ThumbnailAiItem[],
    signal?: AbortSignal,
  ): Promise<Map<string, AiAnalysisResult>> {
    const results = new Map<string, AiAnalysisResult>();
    if (items.length === 0) return results;
    this.throwIfAborted(signal);

    const client = this.getClient();

    const imageDataList = await this.raceWithAbort(
      Promise.all(items.map((item) => this.fetchImageData(item.imageUrl))),
      signal,
    );
    this.throwIfAborted(signal);

    const validItems = items.map((item, i) => ({ item, imageData: imageDataList[i] }));

    const productList = validItems
      .map(
        (v, idx) =>
          `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`,
      )
      .join('\n');

    const imageParts = validItems.map((v) => ({
      inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
    }));

    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVisionModel(),
        contents: [
          {
            role: 'user',
            parts: [
              ...imageParts,
              { text: QUALITY_PROMPT.replace('{productList}', productList) },
            ],
          },
        ],
      }),
      signal,
    );

    const text = response.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new ServiceUnavailableException('thumbnail_ai_invalid_quality_response');
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index?: number;
      overallScore?: number;
      scores?: ThumbnailScores;
      issues?: AiAnalysisIssue[];
      suggestions?: string[];
    }>;
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      const idx = entry.index ?? i;
      if (idx < validItems.length) {
        const overallScore = entry.overallScore ?? 0;
        results.set(validItems[idx].item.productId, {
          overallScore,
          grade: this.scoreToGrade(overallScore),
          scores: entry.scores ?? null,
          issues: entry.issues ?? [],
          suggestions: entry.suggestions ?? [],
          method: 'ai',
        });
      }
    }
    return results;
  }

  async checkCompliance(
    items: ThumbnailAiItem[],
    signal?: AbortSignal,
  ): Promise<Map<string, { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }>> {
    const results = new Map<
      string,
      { complianceGrade: ComplianceGrade; complianceScores: ComplianceScores }
    >();
    if (items.length === 0) return results;
    this.throwIfAborted(signal);

    const client = this.getClient();

    const imageDataList = await this.raceWithAbort(
      Promise.all(items.map((item) => this.fetchImageData(item.imageUrl))),
      signal,
    );
    this.throwIfAborted(signal);

    const validItems = items.map((item, i) => ({ item, imageData: imageDataList[i] }));

    const productList = validItems
      .map(
        (v, idx) =>
          `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`,
      )
      .join('\n');

    const imageParts = validItems.map((v) => ({
      inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
    }));

    // Reference parts help model anchor on compliant exemplars; missing
    // assets resolve to empty, so the call still works.
    const referenceParts = this.references.complianceParts(COMPLIANCE_REFERENCE_HEADER);

    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVisionModel(),
        contents: [
          {
            role: 'user',
            parts: [
              ...referenceParts,
              ...imageParts,
              { text: COMPLIANCE_PROMPT.replace('{productList}', productList) },
            ],
          },
        ],
      }),
      signal,
    );

    const text = response.text ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new ServiceUnavailableException('thumbnail_ai_invalid_compliance_response');
    }
    const parsed = JSON.parse(jsonMatch[0]) as RawComplianceEntry[];
    await Promise.all(
      parsed.map(async (entry, i) => {
        const idx = entry.index ?? i;
        if (idx >= validItems.length) return;
        this.throwIfAborted(signal);

            // (a) text-related 2-pass — physical printed text vs digital overlay.
            const flaggedKeys: string[] = [];
            for (const key of TEXT_RELATED_KEYS) {
              if (this.parseAiBoolean(entry.violations?.[key])) flaggedKeys.push(key);
            }
            if (flaggedKeys.length > 0) {
              const { digital, reasons: verifyReasons } = await this.verifyPhysicalVsDigital(
                validItems[idx].imageData,
                flaggedKeys,
                signal,
              );
              for (const key of flaggedKeys) {
                if (!digital.has(key) && entry.violations) {
                  (entry.violations as Record<string, boolean>)[key] = false;
                }
              }
              if (Object.keys(verifyReasons).length > 0) {
                entry.reasons = { ...(entry.reasons ?? {}), ...verifyReasons };
              }
            }

            // (b) deterministic pixel mask for white background; LLM fallback when
            //     product fills the frame.
            const backgroundFlaggedNotWhite = this.parseAiBoolean(
              entry.violations?.background_not_white,
            );
            const pixelVerdict = await this.analyzeWhiteBackgroundByPixels(
              validItems[idx].imageData,
            );

            let resolvedIsWhite: boolean | null = null;
            let resolvedReason: string | undefined;
            let resolvedEditSuggestion: string | undefined;
            let resolutionSource: 'pixel' | 'pro-fallback' = 'pixel';
            if (pixelVerdict.verdict === 'white') {
              resolvedIsWhite = true;
            } else if (pixelVerdict.verdict === 'not-white') {
              resolvedIsWhite = false;
              resolvedReason = pixelVerdict.reason;
            } else {
              resolutionSource = 'pro-fallback';
              const bgVerdict = await this.verifyWhiteBackground(
                validItems[idx].imageData,
                signal,
              );
              if (bgVerdict) {
                resolvedIsWhite = bgVerdict.isWhite;
                resolvedReason = bgVerdict.reason;
                resolvedEditSuggestion = bgVerdict.editSuggestion;
              }
            }

            if (resolvedIsWhite !== null) {
              if (!backgroundFlaggedNotWhite && !resolvedIsWhite) {
                if (entry.violations) {
                  (entry.violations as Record<string, boolean>).background_not_white = true;
                }
                if (resolvedReason) {
                  entry.reasons = {
                    ...(entry.reasons ?? {}),
                    background_not_white: resolvedReason,
                  };
                }
                if (resolvedEditSuggestion) {
                  entry.editSuggestions = {
                    ...(entry.editSuggestions ?? {}),
                    background_not_white: resolvedEditSuggestion,
                  };
                }
                this.logger.log(
                  `[compliance 2-pass] "${validItems[idx].item.productName}" background_not_white: false → true (${resolutionSource}, coverage=${(pixelVerdict.maskCoverage * 100).toFixed(0)}%)`,
                );
              } else if (backgroundFlaggedNotWhite && resolvedIsWhite) {
                if (entry.violations) {
                  (entry.violations as Record<string, boolean>).background_not_white = false;
                }
                if (entry.reasons && 'background_not_white' in entry.reasons) {
                  delete (entry.reasons as Record<string, unknown>).background_not_white;
                }
                if (entry.editSuggestions && 'background_not_white' in entry.editSuggestions) {
                  delete (entry.editSuggestions as Record<string, unknown>).background_not_white;
                }
                this.logger.log(
                  `[compliance 2-pass] "${validItems[idx].item.productName}" background_not_white: true → false (${resolutionSource}, coverage=${(pixelVerdict.maskCoverage * 100).toFixed(0)}%)`,
                );
              }

              if (resolvedIsWhite) {
                const bgChainedKeys = [
                  'has_gradient_background',
                  'has_background_objects',
                  'has_overlay_effects',
                ] as const;
                for (const key of bgChainedKeys) {
                  if (this.parseAiBoolean(entry.violations?.[key])) {
                    if (entry.violations) {
                      (entry.violations as Record<string, boolean>)[key] = false;
                    }
                    if (entry.reasons && key in entry.reasons) {
                      delete (entry.reasons as Record<string, unknown>)[key];
                    }
                    if (entry.editSuggestions && key in entry.editSuggestions) {
                      delete (entry.editSuggestions as Record<string, unknown>)[key];
                    }
                  }
                }
              }
            }

            // (c) bundle/set false-positive 2-pass.
            const bundleFlagKeys = [
              'has_background_objects',
              'product_cropped',
              'product_fill_low',
            ] as const;
            const bundleFlagged: string[] = [];
            for (const key of bundleFlagKeys) {
              if (this.parseAiBoolean(entry.violations?.[key])) bundleFlagged.push(key);
            }
            if (bundleFlagged.length > 0) {
              const bundleVerdict = await this.verifyBundleComposition(
                validItems[idx].imageData,
                validItems[idx].item.productName,
                bundleFlagged,
                signal,
              );
              if (bundleVerdict) {
                for (const key of bundleFlagged) {
                  if (bundleVerdict.flipsToFalse.has(key) && entry.violations) {
                    (entry.violations as Record<string, boolean>)[key] = false;
                  }
                }
                if (Object.keys(bundleVerdict.reasons).length > 0) {
                  entry.reasons = { ...(entry.reasons ?? {}), ...bundleVerdict.reasons };
                }
              }
            }

            this.normalizeTextRelatedViolations(entry);

        results.set(
          validItems[idx].item.productId,
          this.parseComplianceResponse(entry),
        );
      }),
    );

    return results;
  }

  async checkImageSpec(imageUrl: string): Promise<ImageSpec> {
    const fetched = await this.imageFetcher.fetchTrustedStorageImage(imageUrl);
    const buffer = fetched.buffer;
    const { width, height } = await this.parseImageDimensions(buffer, fetched.mimeType);
    const issues: ImageSpecIssue[] = [];
    if (width < 1000 || height < 1000) {
      issues.push({
        type: 'low_resolution',
        severity: 'fail',
        message: `최소 해상도 미달 (${width}x${height}, 최소 1000x1000)`,
      });
    } else if (width < 2000 || height < 2000) {
      issues.push({
        type: 'low_resolution',
        severity: 'warn',
        message: `권장 해상도 미달 (${width}x${height}, 권장 2000x2000)`,
      });
    }
    if (width > 0 && height > 0 && Math.abs(width / height - 1) > 0.01) {
      issues.push({
        type: 'aspect_ratio',
        severity: 'fail',
        message: `1:1 비율 아님 (${width}x${height})`,
      });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      issues.push({
        type: 'file_too_large',
        severity: 'fail',
        message: `파일 크기 초과 (${Math.round(buffer.length / 1024 / 1024)}MB, 최대 10MB)`,
      });
    }
    return {
      width,
      height,
      aspectRatio: height > 0 ? Math.round((width / height) * 100) / 100 : 0,
      fileSizeKB: Math.round(buffer.length / 1024),
      format: fetched.mimeType,
      issues,
    };
  }

  /**
   * JSON-only image classifier used by recompose service. Wrapper around
   * Gemini so other services don't pull GoogleGenAI directly.
   */
  async classifyImageJson(
    imageUrl: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const client = this.getClient();
    const fetched = await this.imageFetcher.fetchTrustedStorageImage(imageUrl);
    const data = fetched.buffer.toString('base64');
    const response = await this.raceWithAbort(
      client.models.generateContent({
        model: requireGeminiVisionModel(),
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data, mimeType: fetched.mimeType } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT'],
          responseMimeType: 'application/json',
        },
      }),
      signal,
    );
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => p.text)?.text?.trim() ?? null;
    return text;
  }

  // ─── Helpers (some private accessed via `as any` in tests) ───────────────

  scoreToGrade(score: number): ThumbnailGrade {
    if (score >= 90) return 'S';
    if (score >= 75) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'F';
  }

  calculateComplianceGrade(scores: ComplianceScores): { grade: ComplianceGrade } {
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

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = requireGeminiApiKey();
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  private async fetchImageData(imageUrl: string): Promise<FetchedImage> {
    const fetched = await this.imageFetcher.fetchTrustedStorageImage(imageUrl);
    return {
      data: fetched.buffer.toString('base64'),
      mimeType: fetched.mimeType,
    };
  }

  private parseAiBoolean(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 'yes' || normalized === '1';
    }
    return false;
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  private normalizeConfidence(confidence: Record<string, unknown>): Record<string, number> {
    const normalized: Record<string, number> = {};
    for (const key of VIOLATION_KEYS) {
      normalized[key] = this.clampNumber(confidence[key], 0, 100, 0);
    }
    return normalized;
  }

  private hasDigitalOverlayEvidence(reason: string): boolean {
    const normalized = reason.trim();
    if (!normalized) return false;
    const citesDigitalOverlay = DIGITAL_OVERLAY_REASON_RE.test(normalized);
    if (!citesDigitalOverlay) return false;
    const saysNotOnPhysicalSurface = DIGITAL_NEGATION_OF_PHYSICAL_RE.test(normalized);
    if (saysNotOnPhysicalSurface) return true;
    return !AFFIRMATIVE_PHYSICAL_REASON_RE.test(normalized);
  }

  private normalizeTextRelatedViolations(raw: RawComplianceEntry): void {
    if (!raw.violations) return;
    for (const key of TEXT_RELATED_KEYS) {
      if (!this.parseAiBoolean(raw.violations[key])) continue;
      const confidence = this.clampNumber(raw.confidence?.[key], 0, 100, 0);
      const reason = typeof raw.reasons?.[key] === 'string' ? (raw.reasons[key] as string) : '';
      const citesPhysicalSurface = PHYSICAL_TEXT_REASON_RE.test(reason);
      const citesDigitalOverlay = this.hasDigitalOverlayEvidence(reason);
      if (
        (citesPhysicalSurface && !citesDigitalOverlay) ||
        (!citesDigitalOverlay && confidence < 85)
      ) {
        (raw.violations as Record<string, boolean>)[key] = false;
        if (raw.reasons) delete raw.reasons[key];
      }
    }
  }

  private parseComplianceResponse(raw: RawComplianceEntry): {
    complianceGrade: ComplianceGrade;
    complianceScores: ComplianceScores;
  } {
    const rawViolations = raw.violations ?? {};
    const violations = Object.fromEntries(
      VIOLATION_KEYS.map((key) => [key, this.parseAiBoolean(rawViolations[key])]),
    ) as ComplianceScores['violations'];

    const confidence = this.normalizeConfidence(raw.confidence ?? {});
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
        estimatedFillPercent: this.clampNumber(rawQuality.estimatedFillPercent, 0, 100, 0),
        centerOffsetPercent: this.clampNumber(rawQuality.centerOffsetPercent, 0, 100, 0),
        aspectRatioValid: this.parseAiBoolean(rawQuality.aspectRatioValid),
      },
      violationCount: VIOLATION_KEYS.filter((key) => violations[key] === true).length,
    };

    return {
      complianceGrade: this.calculateComplianceGrade(complianceScores).grade,
      complianceScores,
    };
  }

  private async verifyPhysicalVsDigital(
    imageData: FetchedImage,
    flaggedKeys: string[],
    signal?: AbortSignal,
  ): Promise<{ digital: Set<string>; reasons: Record<string, string> }> {
    if (flaggedKeys.length === 0) return { digital: new Set(), reasons: {} };
    const keyLabels: Record<string, string> = {
      has_text: '텍스트/글자',
      has_extra_logo: '로고/인증마크/워터마크',
      has_discount_text: '할인율/프로모션/가격 문구',
      has_freebie_display: '사은품/증정품 표시',
    };
    const keysList = flaggedKeys.map((k) => `- ${k}: ${keyLabels[k] ?? k}`).join('\n');
    const prompt = `이 상품 썸네일에 보이는 요소가 **물리적 인쇄** 인지 **디지털 오버레이** 인지만 판정하세요.

## 1차 판정에서 "위반 가능" 으로 플래그된 항목
${keysList}

## 대원칙 — 기본값은 물리적

쿠팡 상품 이미지는 **거의 대부분 실제 상품/패키지를 촬영한 것**이다. 상품·패키지·라벨·택·스티커에 원래 인쇄된 문구·로고·수치·지시문(OPEN, 사용법, 영양정보, 브랜드, 인증마크, 사이즈, 가격, 증정 표시, 한정판 마크, BEST, NEW 등)은 **전부 물리적 = 위반 아님**. 폰트가 굵고 크고 대문자여도, 색이 빨강/노랑/검정이어도, "할인·프로모션·증정" 같은 단어가 있어도 — **상품·패키지의 일부로 인쇄된 것이면 모두 physical**.

**기본값: is_physical: true.**

## is_physical: false 로 뒤집으려면 — 다음 **3개 이상** 이 동시에 만족되어야 함

1. **프레임-고정 배치**: 텍스트가 상품 표면이 아닌 이미지 프레임의 모서리/상단/하단/여백에 정확히 맞춰 놓여있다.
2. **상품과 독립적인 레이어**: 텍스트의 조명·그림자·해상도·압축률이 상품 표면과 불연속.
3. **편집툴 전형 장식**: 각진 사각 배지, 별표 버스트, 리본, 말풍선, 화살표 스티커, 반투명 워터마크.
4. **상품 표면에서 이탈**: 텍스트가 상품의 어떤 면·라벨·택에도 자리잡지 않고 배경 위에 떠 있다.

## 응답 (JSON only, 다른 텍스트 금지)
{
${flaggedKeys.map((k) => `  "${k}": { "is_physical": true, "reason": "한국어 1문장 — 결정적 시각 신호" }`).join(',\n')}
}`;

    try {
      const client = this.getClient();
      const response = await this.raceWithAbort(
        client.models.generateContent({
          model: requireGeminiVerifyModel(),
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } },
                { text: prompt },
              ],
            },
          ],
        }),
        signal,
      );
      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new ServiceUnavailableException('thumbnail_ai_invalid_physical_text_verify_response');
      }
      const parsed = JSON.parse(jsonMatch[0]) as Record<
        string,
        { is_physical?: boolean; reason?: string }
      >;
      const confirmedDigital = new Set<string>();
      const reasons: Record<string, string> = {};
      for (const key of flaggedKeys) {
        const entry = parsed[key];
        if (
          entry &&
          entry.is_physical === false &&
          this.hasDigitalOverlayEvidence(entry.reason ?? '')
        ) {
          confirmedDigital.add(key);
          if (typeof entry.reason === 'string' && entry.reason.trim()) {
            reasons[key] = entry.reason.trim();
          }
        }
      }
      return { digital: confirmedDigital, reasons };
    } catch (err) {
      this.logger.warn(
        `verifyPhysicalVsDigital 실패: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async verifyWhiteBackground(
    imageData: FetchedImage,
    signal?: AbortSignal,
  ): Promise<{ isWhite: boolean; reason?: string; editSuggestion?: string } | null> {
    this.throwIfAborted(signal);
    const prompt = `당신은 쿠팡 대표이미지 정책 심사관입니다.
이 이미지 단 한 장 에 대해 배경이 순백(#FFFFFF 또는 RGB 240~255 근접)인지 판정하세요.

## 응답 형식 (JSON 1개 객체만 출력, 다른 텍스트 금지)
{
  "isWhite": true|false,
  "reason": "isWhite=false 일 때만 40자 이내로 구체 증거 (색/위치). true 면 생략 가능",
  "editSuggestion": "isWhite=false 일 때만 80자 이내로 배경 교체 동작 (상품은 건드리지 말 것). true 면 생략 가능"
}`;
    try {
      const client = this.getClient();
      const response = await this.raceWithAbort(
        client.models.generateContent({
          model: requireGeminiVerifyModel(),
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } },
                { text: prompt },
              ],
            },
          ],
        }),
        signal,
      );
      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new ServiceUnavailableException('thumbnail_ai_invalid_white_background_response');
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        isWhite?: unknown;
        reason?: unknown;
        editSuggestion?: unknown;
      };
      return {
        isWhite: this.parseAiBoolean(parsed.isWhite),
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        editSuggestion:
          typeof parsed.editSuggestion === 'string' ? parsed.editSuggestion : undefined,
      };
    } catch (err) {
      this.logger.warn(`흰배경 재검증 실패: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  private async verifyBundleComposition(
    imageData: FetchedImage,
    productName: string,
    flaggedKeys: string[],
    signal?: AbortSignal,
  ): Promise<{ flipsToFalse: Set<string>; reasons: Record<string, string> } | null> {
    this.throwIfAborted(signal);
    const keyDescriptions: Record<string, string> = {
      has_background_objects: '배경에 소품/오브젝트가 배치됨',
      product_cropped: '상품 일부가 이미지 밖으로 잘림',
      product_fill_low: '상품이 이미지 면적의 85% 미만 차지',
    };
    const flaggedBlock = flaggedKeys
      .map((k) => `- ${k}: "${keyDescriptions[k] ?? ''}" 로 플래그됨`)
      .join('\n');
    const prompt = `당신은 쿠팡 대표이미지 정책 심사관입니다.
이 이미지 단 한 장에 대해 아래 플래그된 가이드라인 위반이 **실제 위반인지, 아니면 세트/번들 상품의 정상 구성을 오판한 것인지** 판정하세요.

## 상품 정보
- 상품명: "${productName}"

## 플래그된 항목
${flaggedBlock}

## 응답 형식 (JSON 1개 객체만 출력)
{
  "verdicts": {
    ${flaggedKeys.map((k) => `"${k}": true|false`).join(',\n    ')}
  },
  "reasons": {
    ${flaggedKeys.map((k) => `"${k}": "40자 이내 판정 근거"`).join(',\n    ')}
  }
}`;
    try {
      const client = this.getClient();
      const response = await this.raceWithAbort(
        client.models.generateContent({
          model: requireGeminiVerifyModel(),
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: imageData.data, mimeType: imageData.mimeType } },
                { text: prompt },
              ],
            },
          ],
        }),
        signal,
      );
      const text = response.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new ServiceUnavailableException('thumbnail_ai_invalid_bundle_verify_response');
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        verdicts?: Record<string, unknown>;
        reasons?: Record<string, unknown>;
      };
      const flipsToFalse = new Set<string>();
      const reasons: Record<string, string> = {};
      for (const key of flaggedKeys) {
        const verdict = this.parseAiBoolean(parsed.verdicts?.[key]);
        if (!verdict) flipsToFalse.add(key);
        const reason = parsed.reasons?.[key];
        if (typeof reason === 'string' && reason.trim().length > 0) {
          reasons[key] = reason.trim();
        }
      }
      return { flipsToFalse, reasons };
    } catch (err) {
      this.logger.warn(`번들 구성 재검증 실패: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  private async analyzeWhiteBackgroundByPixels(
    imageData: FetchedImage,
  ): Promise<{
    verdict: 'white' | 'not-white' | 'inconclusive';
    maskCoverage: number;
    meanRgb: [number, number, number];
    maxChannelDiff: number;
    stdBrightness: number;
    reason?: string;
  }> {
    const buf = Buffer.from(imageData.data, 'base64');
    const { data, info } = await sharp(buf)
      .removeAlpha()
      .resize({ width: 512, height: 512, fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const W = info.width;
    const H = info.height;
    const C = info.channels;
    const N = W * H;

    const isBgCandidate = (pixelOffset: number): boolean => {
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      const minc = r < g ? (r < b ? r : b) : g < b ? g : b;
      const maxc = r > g ? (r > b ? r : b) : g > b ? g : b;
      return minc >= 230 && maxc - minc < 12;
    };

    const mask = new Uint8Array(N);
    const queue: number[] = [];
    for (let x = 0; x < W; x++) {
      queue.push(x);
      queue.push((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      queue.push(y * W);
      queue.push(y * W + W - 1);
    }

    let head = 0;
    while (head < queue.length) {
      const p = queue[head++];
      if (mask[p]) continue;
      if (!isBgCandidate(p * C)) continue;
      mask[p] = 1;
      const x = p % W;
      const y = (p / W) | 0;
      if (x > 0) queue.push(p - 1);
      if (x < W - 1) queue.push(p + 1);
      if (y > 0) queue.push(p - W);
      if (y < H - 1) queue.push(p + W);
    }

    let cnt = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let minR = 255;
    let minG = 255;
    let minB = 255;
    let sumBri = 0;
    let sumBri2 = 0;
    for (let p = 0; p < N; p++) {
      if (!mask[p]) continue;
      const i = p * C;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      cnt++;
      sumR += r;
      sumG += g;
      sumB += b;
      if (r < minR) minR = r;
      if (g < minG) minG = g;
      if (b < minB) minB = b;
      const bri = (r + g + b) / 3;
      sumBri += bri;
      sumBri2 += bri * bri;
    }

    const coverage = cnt / N;
    if (coverage < 0.05) {
      return {
        verdict: 'inconclusive',
        maskCoverage: coverage,
        meanRgb: [0, 0, 0],
        maxChannelDiff: 0,
        stdBrightness: 0,
        reason: `배경 마스크 면적 ${(coverage * 100).toFixed(1)}% — 상품이 프레임 대부분 차지, LLM fallback`,
      };
    }

    const meanR = sumR / cnt;
    const meanG = sumG / cnt;
    const meanB = sumB / cnt;
    const meanBri = sumBri / cnt;
    const varBri = sumBri2 / cnt - meanBri * meanBri;
    const stdBri = Math.sqrt(Math.max(0, varBri));
    const maxChannelDiff = Math.max(
      Math.abs(meanR - meanG),
      Math.abs(meanG - meanB),
      Math.abs(meanR - meanB),
    );
    const minChannelMean = Math.min(meanR, meanG, meanB);
    const lowestPixelMin = Math.min(minR, minG, minB);

    const isWhite =
      minChannelMean >= 248 && maxChannelDiff < 3 && stdBri < 4 && lowestPixelMin >= 220;

    const reasonParts: string[] = [];
    if (minChannelMean < 248) {
      reasonParts.push(
        `배경 평균 RGB(${meanR.toFixed(0)},${meanG.toFixed(0)},${meanB.toFixed(0)}) 순백 미달`,
      );
    }
    if (maxChannelDiff >= 3) {
      reasonParts.push(`채널 편차 ${maxChannelDiff.toFixed(1)} — 유채색 틴트`);
    }
    if (stdBri >= 4) {
      reasonParts.push(`밝기 std ${stdBri.toFixed(1)} — 그라데이션/명암차`);
    }
    if (lowestPixelMin < 220) {
      reasonParts.push(`배경에 어두운 픽셀 존재 (min 채널 ${lowestPixelMin})`);
    }

    return {
      verdict: isWhite ? 'white' : 'not-white',
      maskCoverage: coverage,
      meanRgb: [meanR, meanG, meanB],
      maxChannelDiff,
      stdBrightness: stdBri,
      reason: isWhite ? undefined : reasonParts.join('; '),
    };
  }

  private async parseImageDimensions(
    buffer: Buffer,
    _mimeType: string,
  ): Promise<{ width: number; height: number }> {
    try {
      const meta = await sharp(buffer).metadata();
      return {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  private raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(this.abortError());
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(this.abortError()), { once: true });
      }),
    ]);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw this.abortError();
  }

  private abortError(): Error {
    return new Error('ABORTED');
  }
}
