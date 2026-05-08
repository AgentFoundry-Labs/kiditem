import type { DetailPageTemplateId } from './detail-page-ai.types';

/**
 * Helpers for the polymorphic JSON we stash in
 * `ContentGeneration.detailPageHtml`. Both `DetailPageAiService` (producer
 * side) and `DetailPageContentGenerationSinkAdapter` (consumer side) rely
 * on the same shape, so the parse/serialize lives here instead of being
 * duplicated.
 *
 * Shape:
 * ```
 * {
 *   templateId: 'kids-playful' | 'bold-vertical',
 *   result: <DetailPageGeneration | BoldVerticalGeneration | {}>,
 *   imageUrls: string[],
 *   rawInput: { rawTitle, rawCategory, rawDescription, rawOptions,
 *               imageUrls, heroImageMode, templateId, ... },
 * }
 * ```
 *
 * The `result` field is `{}` while the row is `PROCESSING`. The sink
 * replaces it on success.
 */

export interface DetailPageStoredJson {
  templateId: DetailPageTemplateId;
  result: unknown;
  imageUrls: string[];
  rawInput: unknown;
  rawTitle: string | null;
}

export function parseDetailPageStoredJson(raw: string | null): DetailPageStoredJson {
  if (!raw) {
    return {
      templateId: 'kids-playful',
      result: {},
      imageUrls: [],
      rawInput: {},
      rawTitle: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const templateId =
      parsed.templateId === 'bold-vertical' || parsed.templateId === 'simple-vertical'
        ? 'bold-vertical'
        : 'kids-playful';
    const imageUrls = Array.isArray(parsed.imageUrls)
      ? parsed.imageUrls.filter((x): x is string => typeof x === 'string')
      : [];
    const rawInput = parsed.rawInput ?? {};
    const rawTitle =
      rawInput &&
      typeof rawInput === 'object' &&
      typeof (rawInput as { rawTitle?: unknown }).rawTitle === 'string'
        ? (rawInput as { rawTitle: string }).rawTitle
        : null;
    return {
      templateId,
      result: parsed.result ?? parsed,
      imageUrls,
      rawInput,
      rawTitle,
    };
  } catch {
    return {
      templateId: 'kids-playful',
      result: {},
      imageUrls: [],
      rawInput: {},
      rawTitle: null,
    };
  }
}

export function serializeDetailPageStoredJson(input: {
  templateId: DetailPageTemplateId;
  result: unknown;
  imageUrls: string[];
  rawInput: unknown;
}): string {
  return JSON.stringify({
    templateId: input.templateId,
    result: input.result,
    imageUrls: input.imageUrls,
    rawInput: input.rawInput,
  });
}

/**
 * Convention used everywhere the detail-page operation alert is touched:
 * `detail-page:<ContentGeneration.id>`. `DetailPageAiService.generate`
 * starts an alert with this key and the sink calls `succeed()` / `fail()`
 * on the same key. Keeping the format in one place avoids drift.
 */
export function detailPageOperationKey(contentGenerationId: string): string {
  return `detail-page:${contentGenerationId}`;
}

export function detailPageEditorHref(input: {
  productId: string;
  contentGenerationId: string;
  templateId: DetailPageTemplateId;
}): string {
  const queryKey = input.templateId === 'bold-vertical' ? 'boldId' : 'kpId';
  return `/sourcing/${input.productId}/editor?${queryKey}=${input.contentGenerationId}`;
}
