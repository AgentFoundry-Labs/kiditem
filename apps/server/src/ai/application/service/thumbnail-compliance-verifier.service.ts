import { Injectable, Logger } from '@nestjs/common';
import { GeminiThumbnailVisionAdapter } from '../../adapter/out/gemini/gemini-thumbnail-vision.adapter';
import {
  type RawComplianceEntry,
  TEXT_RELATED_KEYS,
  hasDigitalOverlayEvidence,
  parseAiBoolean,
} from '../../domain/thumbnail-compliance-normalizer';
import {
  analyzeWhiteBackgroundByPixels,
  type ImageBytes,
} from '../../domain/thumbnail-image-spec';

interface ImageContext {
  imageData: ImageBytes;
  productName: string;
}

/**
 * Owns the compliance 2-pass verification pipeline:
 *
 *   text physical-vs-digital  →  white-background pixel mask + LLM fallback
 *                              →  bundle-composition false-positive
 *
 * Each step mutates the `RawComplianceEntry` in place (matching the
 * pre-refactor behavior — later steps read back the corrections from earlier
 * ones). The verify-model calls go through `GeminiThumbnailVisionAdapter`,
 * the pixel-mask check goes through the pure `analyzeWhiteBackgroundByPixels`
 * helper, and final entry normalization (text-related cleanup +
 * `parseComplianceResponse`) is the caller's responsibility.
 */
@Injectable()
export class ThumbnailComplianceVerifierService {
  private readonly logger = new Logger(ThumbnailComplianceVerifierService.name);

  constructor(private readonly adapter: GeminiThumbnailVisionAdapter) {}

  async run(
    entry: RawComplianceEntry,
    ctx: ImageContext,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.applyPhysicalVsDigital(entry, ctx.imageData, signal);
    await this.applyWhiteBackground(entry, ctx, signal);
    await this.applyBundleComposition(entry, ctx, signal);
  }

  // ─── (a) physical printed text vs digital overlay ──────────────────────

  private async applyPhysicalVsDigital(
    entry: RawComplianceEntry,
    imageData: ImageBytes,
    signal?: AbortSignal,
  ): Promise<void> {
    const flaggedKeys: string[] = [];
    for (const key of TEXT_RELATED_KEYS) {
      if (parseAiBoolean(entry.violations?.[key])) flaggedKeys.push(key);
    }
    if (flaggedKeys.length === 0) return;

    const { digital, reasons } = await this.verifyPhysicalVsDigital(
      imageData,
      flaggedKeys,
      signal,
    );
    for (const key of flaggedKeys) {
      if (!digital.has(key) && entry.violations) {
        (entry.violations as Record<string, boolean>)[key] = false;
      }
    }
    if (Object.keys(reasons).length > 0) {
      entry.reasons = { ...(entry.reasons ?? {}), ...reasons };
    }
  }

  private async verifyPhysicalVsDigital(
    imageData: ImageBytes,
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
      const parsed = await this.adapter.callVerifyForJsonObject<
        Record<string, { is_physical?: boolean; reason?: string }>
      >(
        singleImageContents(imageData, prompt),
        'thumbnail_ai_invalid_physical_text_verify_response',
        signal,
      );
      const confirmedDigital = new Set<string>();
      const reasons: Record<string, string> = {};
      for (const key of flaggedKeys) {
        const entry = parsed[key];
        if (
          entry &&
          entry.is_physical === false &&
          hasDigitalOverlayEvidence(entry.reason ?? '')
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

  // ─── (b) white-background pixel mask + LLM fallback ────────────────────

  private async applyWhiteBackground(
    entry: RawComplianceEntry,
    ctx: ImageContext,
    signal?: AbortSignal,
  ): Promise<void> {
    const backgroundFlaggedNotWhite = parseAiBoolean(entry.violations?.background_not_white);
    const pixelVerdict = await analyzeWhiteBackgroundByPixels(ctx.imageData);

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
      const bgVerdict = await this.verifyWhiteBackground(ctx.imageData, signal);
      if (bgVerdict) {
        resolvedIsWhite = bgVerdict.isWhite;
        resolvedReason = bgVerdict.reason;
        resolvedEditSuggestion = bgVerdict.editSuggestion;
      }
    }

    if (resolvedIsWhite === null) return;

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
        `[compliance 2-pass] "${ctx.productName}" background_not_white: false → true (${resolutionSource}, coverage=${(pixelVerdict.maskCoverage * 100).toFixed(0)}%)`,
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
        `[compliance 2-pass] "${ctx.productName}" background_not_white: true → false (${resolutionSource}, coverage=${(pixelVerdict.maskCoverage * 100).toFixed(0)}%)`,
      );
    }

    if (resolvedIsWhite) {
      const bgChainedKeys = [
        'has_gradient_background',
        'has_background_objects',
        'has_overlay_effects',
      ] as const;
      for (const key of bgChainedKeys) {
        if (parseAiBoolean(entry.violations?.[key])) {
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

  private async verifyWhiteBackground(
    imageData: ImageBytes,
    signal?: AbortSignal,
  ): Promise<{ isWhite: boolean; reason?: string; editSuggestion?: string } | null> {
    this.adapter.throwIfAborted(signal);
    const prompt = `당신은 쿠팡 대표이미지 정책 심사관입니다.
이 이미지 단 한 장 에 대해 배경이 순백(#FFFFFF 또는 RGB 240~255 근접)인지 판정하세요.

## 응답 형식 (JSON 1개 객체만 출력, 다른 텍스트 금지)
{
  "isWhite": true|false,
  "reason": "isWhite=false 일 때만 40자 이내로 구체 증거 (색/위치). true 면 생략 가능",
  "editSuggestion": "isWhite=false 일 때만 80자 이내로 배경 교체 동작 (상품은 건드리지 말 것). true 면 생략 가능"
}`;
    try {
      const parsed = await this.adapter.callVerifyForJsonObject<{
        isWhite?: unknown;
        reason?: unknown;
        editSuggestion?: unknown;
      }>(
        singleImageContents(imageData, prompt),
        'thumbnail_ai_invalid_white_background_response',
        signal,
      );
      return {
        isWhite: parseAiBoolean(parsed.isWhite),
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
        editSuggestion:
          typeof parsed.editSuggestion === 'string' ? parsed.editSuggestion : undefined,
      };
    } catch (err) {
      this.logger.warn(`흰배경 재검증 실패: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  // ─── (c) bundle/set false-positive ─────────────────────────────────────

  private async applyBundleComposition(
    entry: RawComplianceEntry,
    ctx: ImageContext,
    signal?: AbortSignal,
  ): Promise<void> {
    const bundleFlagKeys = [
      'has_background_objects',
      'product_cropped',
      'product_fill_low',
    ] as const;
    const flagged: string[] = [];
    for (const key of bundleFlagKeys) {
      if (parseAiBoolean(entry.violations?.[key])) flagged.push(key);
    }
    if (flagged.length === 0) return;

    const verdict = await this.verifyBundleComposition(
      ctx.imageData,
      ctx.productName,
      flagged,
      signal,
    );
    if (!verdict) return;

    for (const key of flagged) {
      if (verdict.flipsToFalse.has(key) && entry.violations) {
        (entry.violations as Record<string, boolean>)[key] = false;
      }
    }
    if (Object.keys(verdict.reasons).length > 0) {
      entry.reasons = { ...(entry.reasons ?? {}), ...verdict.reasons };
    }
  }

  private async verifyBundleComposition(
    imageData: ImageBytes,
    productName: string,
    flaggedKeys: string[],
    signal?: AbortSignal,
  ): Promise<{ flipsToFalse: Set<string>; reasons: Record<string, string> } | null> {
    this.adapter.throwIfAborted(signal);
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
      const parsed = await this.adapter.callVerifyForJsonObject<{
        verdicts?: Record<string, unknown>;
        reasons?: Record<string, unknown>;
      }>(
        singleImageContents(imageData, prompt),
        'thumbnail_ai_invalid_bundle_verify_response',
        signal,
      );
      const flipsToFalse = new Set<string>();
      const reasons: Record<string, string> = {};
      for (const key of flaggedKeys) {
        const verdict = parseAiBoolean(parsed.verdicts?.[key]);
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
}

type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

function singleImageContents(
  imageData: ImageBytes,
  prompt: string,
): { contents: Array<{ role: 'user'; parts: Part[] }> } {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: imageData.data, mimeType: imageData.mimeType } },
          { text: prompt },
        ],
      },
    ],
  };
}
