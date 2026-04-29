import {
  RECOMPOSE_KINDS,
  type EditAnalysisResult,
  type RecomposeKind,
  type RecomposeVariantKey,
} from '@kiditem/shared/ai';
import type {
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from './model/thumbnail-editor';

/**
 * Pure helpers for `ThumbnailGenerationService`. No Prisma client access; only
 * shape transforms and parsing on already-fetched analysis / inputMeta JSON
 * blobs. This is the home for the recompose-kind probe, the per-violation edit
 * suggestion extractor, the analysis → API shape adapter, and the input-role /
 * edit-case classification used when scheduling edit jobs.
 */

export type ThumbnailAnalysisContext = {
  recompose: ThumbnailJsonValue | null;
  complianceGrade: string | null;
  complianceScores: ThumbnailJsonValue | null;
  overallScore: number;
  grade: string;
  qualityAnalyzedAt: Date | null;
  complianceAnalyzedAt: Date | null;
};

export type ThumbnailJsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: ThumbnailJsonValue | undefined }
  | ThumbnailJsonValue[];

function isRecomposeKind(value: unknown): value is RecomposeKind {
  return typeof value === 'string' && (RECOMPOSE_KINDS as readonly string[]).includes(value);
}

/**
 * Probe an arbitrary JSON blob for a `recompose.kind` (nested) or `kind`
 * (direct) field, returning the canonical `RecomposeKind` or `null`. Used to
 * recover prompt-routing context from `inputMeta`, `editAnalysis`, or stored
 * `ThumbnailAnalysis.recompose` payloads when re-editing a job.
 */
export function findRecomposeKindIn(
  value: ThumbnailJsonValue | null | undefined,
): RecomposeKind | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const nested = object.recompose;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedKind = (nested as Record<string, unknown>).kind;
    if (isRecomposeKind(nestedKind)) return nestedKind;
  }
  const directKind = object.kind;
  return isRecomposeKind(directKind) ? directKind : null;
}

export function extractRecomposeKind(value: ThumbnailJsonValue | null): RecomposeKind | null {
  return findRecomposeKindIn(value);
}

/**
 * Pull the per-violation `editSuggestions` map out of a stored
 * `complianceScores` JSON blob, dropping empty / non-string entries. Returns
 * null when nothing usable survived so callers can branch cleanly on absence.
 */
export function extractEditSuggestions(
  complianceScores: ThumbnailJsonValue | null | undefined,
): Record<string, string> | null {
  if (
    !complianceScores ||
    typeof complianceScores !== 'object' ||
    Array.isArray(complianceScores)
  ) {
    return null;
  }
  const obj = complianceScores as Record<string, unknown>;
  const raw = obj.editSuggestions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Build the public `editAnalysis` payload that satisfies
 * `EditAnalysisResultSchema` (non-null grade/score). Returns null when there is
 * no usable analysis context to project.
 */
export function toEditAnalysis(
  analysis: ThumbnailAnalysisContext | null,
): EditAnalysisResult | null {
  if (!analysis) return null;
  return {
    complianceGrade: analysis.complianceGrade ?? 'UNKNOWN',
    complianceScores:
      (analysis.complianceScores as Record<string, unknown> | null) ?? null,
    overallScore: analysis.overallScore,
    grade: analysis.grade,
  };
}

/**
 * Project the analysis context plus the extracted edit-suggestion map into the
 * `inputMeta.analysisContext` blob that future re-edits will read back.
 */
export function toAnalysisContextJson(
  analysis: ThumbnailAnalysisContext | null,
  editSuggestions: Record<string, string> | null,
): ThumbnailJsonValue {
  return {
    complianceGrade: analysis?.complianceGrade ?? null,
    complianceScores: analysis?.complianceScores ?? null,
    overallScore: analysis?.overallScore ?? null,
    grade: analysis?.grade ?? null,
    editSuggestions: editSuggestions ?? null,
  };
}

/**
 * Coerce a stored input-image role string into the canonical
 * `ThumbnailInputRole` union, defaulting to `'product'` for unknown legacy
 * values so re-editing never throws on stale data.
 */
export function toInputRole(role: string): ThumbnailInputRole {
  if (role === 'box') return 'box';
  if (role === 'color_variant') return 'color_variant';
  if (role === 'detail' || role === 'size_chart') return 'detail';
  return 'product';
}

/**
 * Infer the editor `editCase` (single / compose / color-variants / bundle) from
 * the resolved input image roles. Mirrors `ThumbnailEditorController.inferEditCase`
 * but derives the case from already-resolved input rows instead of the raw DTO.
 */
export function inferEditCaseFromInputs(
  inputs: ThumbnailEditorInputImage[],
): ThumbnailEditorEditCase {
  if (inputs.some((img) => img.role === 'color_variant')) return 'color-variants';
  if (inputs.some((img) => img.role === 'box')) return 'compose';
  return inputs.length > 1 ? 'bundle' : 'single';
}

/**
 * Translate the variant choice into a freeform user-prompt instruction. Returns
 * undefined for `'auto'` so the caller falls through to the default prompt
 * resolution path.
 */
export function variantInstruction(variantKey: RecomposeVariantKey | null): string | undefined {
  if (variantKey === 'with-box') {
    return 'Use packaging/box visual context only if it is present in the input; never invent text or claims.';
  }
  if (variantKey === 'no-box') {
    return 'Create a clean product-only hero image without package boxes or extra props.';
  }
  return undefined;
}
