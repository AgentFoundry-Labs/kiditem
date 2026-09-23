import {
  RECOMPOSE_KINDS,
  type RecomposeKind,
  type RecomposeVariantKey,
} from '@kiditem/shared/ai';
import type {
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from './model/thumbnail-editor';

/**
 * Pure helpers for thumbnail re-edit jobs. No Prisma client access; only
 * parsing of already-fetched `inputMeta` JSON: the recompose-kind probe and the
 * input-role / edit-case classification used when scheduling edit jobs.
 */

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
 * recover prompt-routing context from `inputMeta` or its edit analysis when
 * re-editing a job.
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
