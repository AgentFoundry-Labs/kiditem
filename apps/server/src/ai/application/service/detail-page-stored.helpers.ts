import type { DetailImageCount, DetailPageAgeGroup } from '@kiditem/shared/ai';
import type { DetailPageRawInput, DetailPageTemplateId } from './detail-page-ai.types';
import type {
  KcCertificationStatus,
  UsageSectionMode,
} from '../../domain/prompts/detail-page/types';

/**
 * Helpers for the detail-page JSON snapshots stored on ContentGeneration.
 * `generationInput` preserves the request/input snapshot. `generationResult`
 * preserves the validated AI result plus generated media URLs.
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
  processedImages: Record<string, string>;
  rawInput: unknown;
  rawTitle: string | null;
}

export function parseDetailPageStoredJson(raw: string | null): DetailPageStoredJson {
  if (!raw) {
    return {
      templateId: 'kids-playful',
      result: {},
      imageUrls: [],
      processedImages: {},
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
    const processedImages = asStringRecord(parsed.processedImages);
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
      processedImages,
      rawInput,
      rawTitle,
    };
  } catch {
    return {
      templateId: 'kids-playful',
      result: {},
      imageUrls: [],
      processedImages: {},
      rawInput: {},
      rawTitle: null,
    };
  }
}

export function toDetailPageStoredJson(input: {
  templateId: DetailPageTemplateId;
  generationInput: unknown;
  generationResult: unknown;
}): DetailPageStoredJson {
  const resultRecord = asRecord(input.generationResult);
  const inputRecord = asRecord(input.generationInput);
  const rawInput = resultRecord.rawInput ?? input.generationInput ?? {};
  const imageUrls = pickStringArray(resultRecord.imageUrls) ??
    pickStringArray(inputRecord.imageUrls) ??
    [];
  const rawTitle =
    rawInput &&
    typeof rawInput === 'object' &&
    typeof (rawInput as { rawTitle?: unknown }).rawTitle === 'string'
      ? (rawInput as { rawTitle: string }).rawTitle
      : null;
  return {
    templateId: pickTemplateId(resultRecord.templateId ?? input.templateId),
    result: resultRecord.result ?? {},
    imageUrls,
    processedImages: asStringRecord(resultRecord.processedImages),
    rawInput,
    rawTitle,
  };
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

export function normalizeStoredDetailPageRawInput(input: {
  stored: DetailPageStoredJson;
  templateId: DetailPageTemplateId;
  productName: string;
  imageUrls: string[];
}): DetailPageRawInput {
  const rawInput = input.stored.rawInput;
  return {
    rawTitle: pickStoredNonEmptyString(rawInput, 'rawTitle') ?? input.productName,
    rawCategory: pickStoredString(rawInput, 'rawCategory') ?? '',
    rawDescription: pickStoredString(rawInput, 'rawDescription') ?? '',
    rawOptions: pickStoredString(rawInput, 'rawOptions') ?? '',
    imageUrls: input.imageUrls,
    heroImageMode: pickStoredHeroMode(rawInput),
    templateId: input.templateId,
    generationMode: pickStoredGenerationMode(rawInput),
    baseContentGenerationId: pickStoredString(rawInput, 'baseContentGenerationId') ?? undefined,
    ageGroup: pickStoredAgeGroup(rawInput),
    detailImageCount: pickStoredDetailImageCount(rawInput),
    usageSectionMode: pickStoredUsageSectionMode(rawInput),
    kcCertificationStatus: pickStoredKcCertificationStatus(rawInput),
    kcCertificationNumber: pickStoredString(rawInput, 'kcCertificationNumber') ?? '',
  };
}

function pickStoredGenerationMode(rawInput: unknown): 'draft' | 'image' | 'full' {
  if (!rawInput || typeof rawInput !== 'object') return 'full';
  const value = (rawInput as Record<string, unknown>).generationMode;
  if (value === 'draft' || value === 'image') return value;
  return 'full';
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

export function detailPageResultHref(input: {
  productId: string | null;
  sourceCandidateId?: string | null;
  contentGenerationId: string;
  templateId: DetailPageTemplateId;
}): string {
  void input.productId;
  void input.templateId;
  const generationId = encodeURIComponent(input.contentGenerationId);
  if (input.sourceCandidateId) {
    return `/sourcing/${encodeURIComponent(input.sourceCandidateId)}/editor?generationId=${generationId}`;
  }
  return `/sourcing/detail-pages/${generationId}/editor`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
  );
}

function pickStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

function pickTemplateId(value: unknown): DetailPageTemplateId {
  return value === 'bold-vertical' || value === 'simple-vertical'
    ? 'bold-vertical'
    : 'kids-playful';
}

function pickStoredString(rawInput: unknown, key: string): string | null {
  if (!rawInput || typeof rawInput !== 'object') return null;
  const value = (rawInput as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function pickStoredNonEmptyString(rawInput: unknown, key: string): string | null {
  const value = pickStoredString(rawInput, key)?.trim();
  return value ? value : null;
}

function pickStoredHeroMode(rawInput: unknown): 'first' | 'llm-pick' {
  if (!rawInput || typeof rawInput !== 'object') return 'first';
  const value = (rawInput as Record<string, unknown>).heroImageMode;
  return value === 'llm-pick' ? 'llm-pick' : 'first';
}

function pickStoredAgeGroup(rawInput: unknown): DetailPageAgeGroup {
  if (!rawInput || typeof rawInput !== 'object') return 'age-8-plus';
  const value = (rawInput as Record<string, unknown>).ageGroup;
  return value === 'age-14-plus' ? 'age-14-plus' : 'age-8-plus';
}

function pickStoredDetailImageCount(rawInput: unknown): DetailImageCount {
  if (!rawInput || typeof rawInput !== 'object') return 'auto';
  const value = (rawInput as Record<string, unknown>).detailImageCount;
  if (
    value === 'auto' ||
    value === '1' ||
    value === '2' ||
    value === '3' ||
    value === '4' ||
    value === '5' ||
    value === '6'
  ) return value;
  return 'auto';
}

function pickStoredUsageSectionMode(rawInput: unknown): UsageSectionMode {
  if (!rawInput || typeof rawInput !== 'object') return 'include';
  const value = (rawInput as Record<string, unknown>).usageSectionMode;
  return value === 'exclude' ? 'exclude' : 'include';
}

function pickStoredKcCertificationStatus(rawInput: unknown): KcCertificationStatus {
  if (!rawInput || typeof rawInput !== 'object') return 'unknown';
  const value = (rawInput as Record<string, unknown>).kcCertificationStatus;
  if (value === 'none' || value === 'exists') return value;
  return 'unknown';
}
