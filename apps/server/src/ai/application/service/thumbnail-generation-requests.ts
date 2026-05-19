import {
  ThumbnailGenerateAgentInputSchema,
  type ThumbnailGenerateAgentInput,
} from '../../domain/agent-output';
import type {
  ThumbnailEditorEditCase,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';

export type ThumbnailGenerationMode = 'edit' | 'creative';
export type ThumbnailGenerationPurpose = 'compliance' | 'quality';
export type ThumbnailGenerationLayout = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';

export interface ThumbnailEditCaseSource {
  packagingImage?: unknown;
  colorImages?: readonly unknown[] | null;
  bundleImages?: readonly unknown[] | null;
}

export interface BuildThumbnailGenerateAgentInput {
  mode: ThumbnailGenerationMode;
  editCase?: ThumbnailEditorEditCase;
  purpose?: ThumbnailGenerationPurpose;
  productName?: string | null;
  productDescription?: string;
  category?: string | null;
  sceneType?: string;
  styleType?: string;
  supplementaryLabel?: string;
  pieceCount?: number;
  colorCount?: number;
  layout?: ThumbnailGenerationLayout;
  composition?: string;
  userPrompt?: string;
  hasStyleReference?: boolean;
  inputs: ThumbnailEditorInputImage[];
}

export interface BuildThumbnailGenerationInputMeta {
  mode: ThumbnailGenerationMode;
  editCase: ThumbnailEditorEditCase;
  purpose?: ThumbnailGenerationPurpose | null;
  method?: string;
  trigger?: string;
  layout?: ThumbnailGenerationLayout | null;
  sceneType?: string | null;
  styleType?: string | null;
  pieceCount?: number | null;
  colorCount?: number | null;
  productName?: string | null;
  inputs: ThumbnailEditorInputImage[];
}

export function inferThumbnailEditCase(
  input: ThumbnailEditCaseSource,
): ThumbnailEditorEditCase {
  if (input.bundleImages?.length) return 'bundle';
  if (input.colorImages?.length) return 'color-variants';
  if (input.packagingImage) return 'compose';
  return 'single';
}

export function buildThumbnailCompositionText(input: {
  pieceCount?: number;
  colorCount?: number;
}): string | undefined {
  const parts: string[] = [];
  if (input.pieceCount) parts.push(`${input.pieceCount}개입`);
  if (input.colorCount) parts.push(`${input.colorCount}가지 색상`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function buildThumbnailGenerateAgentInput(
  input: BuildThumbnailGenerateAgentInput,
): ThumbnailGenerateAgentInput {
  return ThumbnailGenerateAgentInputSchema.parse(stripUndefined({
    mode: input.mode,
    editCase: input.mode === 'edit' ? input.editCase : undefined,
    purpose: input.mode === 'edit' ? input.purpose : undefined,
    productName: input.productName ?? null,
    productDescription: input.productDescription,
    category: input.category ?? null,
    sceneType: input.sceneType,
    styleType: input.styleType,
    supplementaryLabel: input.supplementaryLabel,
    pieceCount: input.pieceCount,
    colorCount: input.colorCount,
    layout: input.layout,
    composition: input.composition ?? buildThumbnailCompositionText(input),
    userPrompt: input.userPrompt,
    hasStyleReference: input.mode === 'creative' ? input.hasStyleReference : undefined,
    inputs: input.inputs.map((img) => ({
      data: img.data,
      mimeType: img.mimeType,
      label: img.label,
      url: img.url,
      storageKey: img.storageKey,
      role: img.role,
      sortOrder: img.sortOrder,
      source: img.source,
      fileSize: img.fileSize,
    })),
  }));
}

export function buildThumbnailGenerationInputMeta(
  input: BuildThumbnailGenerationInputMeta,
): Record<string, unknown> {
  return stripUndefined({
    mode: input.mode,
    purpose: input.purpose ?? null,
    editCase: input.editCase,
    method: input.method,
    trigger: input.trigger,
    layout: input.layout ?? null,
    sceneType: input.sceneType ?? null,
    styleType: input.styleType ?? null,
    pieceCount: input.pieceCount ?? null,
    colorCount: input.colorCount ?? null,
    productName: input.productName?.trim() || null,
    inputCount: input.inputs.length,
    inputRoles: input.inputs.map((image) => image.role),
    inputLabels: input.inputs.map((image) => image.label),
  });
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
