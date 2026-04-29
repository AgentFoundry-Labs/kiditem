import { Injectable, Logger } from '@nestjs/common';
import type { ComplianceScores, ImageSpec, ThumbnailScores } from '@kiditem/shared/ai';
import {
  COMPLIANCE_PROMPT,
  COMPLIANCE_REFERENCE_HEADER,
  QUALITY_PROMPT,
} from './thumbnail-prompts';
import { ThumbnailReferenceImagesService } from './thumbnail-reference-images.service';
import { GeminiThumbnailVisionAdapter } from '../adapters/gemini-thumbnail-vision.adapter';
import { ThumbnailComplianceVerifierService } from './thumbnail-compliance-verifier.service';
import {
  type AiAnalysisResult,
  type ComplianceGrade,
  type RawComplianceEntry,
  calculateComplianceGrade,
  normalizeTextRelatedViolations,
  parseComplianceResponse,
  scoreToGrade,
} from '../domain/thumbnail-compliance-normalizer';
import {
  deriveImageSpec,
  type ImageBytes,
  parseImageDimensions,
} from '../domain/thumbnail-image-spec';

export interface ThumbnailAiItem {
  productId: string;
  productName: string;
  imageUrl: string;
  category?: string | null;
}

type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

/**
 * Pure-AI vision facade for thumbnail quality, compliance, image-spec
 * probing, and JSON classification.
 *
 * Persistence is the caller's responsibility. The service composes:
 *
 * - `GeminiThumbnailVisionAdapter` — Gemini I/O, abort race, image fetching.
 * - `ThumbnailComplianceVerifierService` — 2-pass compliance verifier
 *   (text physical-vs-digital → white background → bundle composition).
 * - `domain/thumbnail-compliance-normalizer` — pure compliance/quality
 *   parsing + violation key allowlist + physical/digital regexes.
 * - `domain/thumbnail-image-spec` — sharp-based pixel mask, dimension probe,
 *   resolution/ratio/size policy.
 */
@Injectable()
export class ThumbnailVisionAiService {
  private readonly logger = new Logger(ThumbnailVisionAiService.name);

  constructor(
    private readonly adapter: GeminiThumbnailVisionAdapter,
    private readonly references: ThumbnailReferenceImagesService,
    private readonly verifier: ThumbnailComplianceVerifierService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────

  async analyzeQuality(
    items: ThumbnailAiItem[],
    signal?: AbortSignal,
  ): Promise<Map<string, AiAnalysisResult>> {
    const results = new Map<string, AiAnalysisResult>();
    if (items.length === 0) return results;
    this.adapter.throwIfAborted(signal);
    this.adapter.assertConfigured();

    const imageDataList = await this.adapter.raceWithAbort(
      Promise.all(items.map((item) => this.adapter.fetchImageBytes(item.imageUrl))),
      signal,
    );
    this.adapter.throwIfAborted(signal);

    const validItems = items.map((item, i) => ({ item, imageData: imageDataList[i] }));
    const productList = formatProductList(validItems);
    const imageParts = imagePartsOf(validItems);

    const parsed = await this.adapter.callVisionForJsonArray<{
      index?: number;
      overallScore?: number;
      scores?: ThumbnailScores;
      issues?: AiAnalysisResult['issues'];
      suggestions?: string[];
    }>(
      {
        contents: [
          {
            role: 'user',
            parts: [
              ...imageParts,
              { text: QUALITY_PROMPT.replace('{productList}', productList) },
            ],
          },
        ],
      },
      'thumbnail_ai_invalid_quality_response',
      signal,
    );

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      const idx = entry.index ?? i;
      if (idx < validItems.length) {
        const overallScore = entry.overallScore ?? 0;
        results.set(validItems[idx].item.productId, {
          overallScore,
          grade: scoreToGrade(overallScore),
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
    this.adapter.throwIfAborted(signal);
    this.adapter.assertConfigured();

    const imageDataList = await this.adapter.raceWithAbort(
      Promise.all(items.map((item) => this.adapter.fetchImageBytes(item.imageUrl))),
      signal,
    );
    this.adapter.throwIfAborted(signal);

    const validItems = items.map((item, i) => ({ item, imageData: imageDataList[i] }));
    const productList = formatProductList(validItems);
    const imageParts = imagePartsOf(validItems);

    // Reference parts help the model anchor on compliant exemplars; missing
    // assets resolve to empty so the call still works.
    const referenceParts = this.references.complianceParts(COMPLIANCE_REFERENCE_HEADER);

    const parsed = await this.adapter.callVisionForJsonArray<RawComplianceEntry>(
      {
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
      },
      'thumbnail_ai_invalid_compliance_response',
      signal,
    );

    await Promise.all(
      parsed.map(async (entry, i) => {
        const idx = entry.index ?? i;
        if (idx >= validItems.length) return;
        this.adapter.throwIfAborted(signal);

        await this.verifier.run(
          entry,
          {
            imageData: validItems[idx].imageData,
            productName: validItems[idx].item.productName,
          },
          signal,
        );
        normalizeTextRelatedViolations(entry);

        results.set(
          validItems[idx].item.productId,
          parseComplianceResponse(entry),
        );
      }),
    );

    return results;
  }

  async checkImageSpec(imageUrl: string): Promise<ImageSpec> {
    const fetched = await this.adapter.fetchTrustedStorageImage(imageUrl);
    const dims = await parseImageDimensions(fetched.buffer);
    return deriveImageSpec({
      width: dims.width,
      height: dims.height,
      byteLength: fetched.buffer.length,
      mimeType: fetched.mimeType,
    });
  }

  /**
   * JSON-only image classifier used by recompose service. Wrapper around the
   * Gemini adapter so other services don't pull GoogleGenAI directly.
   */
  async classifyImageJson(
    imageUrl: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    this.adapter.assertConfigured();
    const fetched = await this.adapter.fetchImageBytes(imageUrl);
    return this.adapter.callVisionForJsonText(
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: fetched.data, mimeType: fetched.mimeType } },
              { text: prompt },
            ],
          },
        ],
      },
      signal,
    );
  }

  // ─── Re-exports for backward compatibility ──────────────────────────────

  scoreToGrade(score: number) {
    return scoreToGrade(score);
  }

  calculateComplianceGrade(scores: ComplianceScores) {
    return calculateComplianceGrade(scores);
  }
}

function formatProductList(
  validItems: ReadonlyArray<{ item: ThumbnailAiItem }>,
): string {
  return validItems
    .map(
      (v, idx) =>
        `이미지 ${idx}: "${v.item.productName}" (카테고리: ${v.item.category ?? '미분류'})`,
    )
    .join('\n');
}

function imagePartsOf(
  validItems: ReadonlyArray<{ imageData: ImageBytes }>,
): Part[] {
  return validItems.map((v) => ({
    inlineData: { data: v.imageData.data, mimeType: v.imageData.mimeType },
  }));
}
