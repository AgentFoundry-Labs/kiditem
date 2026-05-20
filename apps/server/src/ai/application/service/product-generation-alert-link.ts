export type ProductGenerationChildKind = 'detail_page' | 'thumbnail';

export interface ParentProductGenerationAlertLink {
  mode: 'parent';
  batchId: string;
  parentOperationKey: string;
  childKind: ProductGenerationChildKind;
}

export interface StandaloneGenerationAlertLink {
  mode: 'standalone';
}

export type GenerationAlertLink =
  | ParentProductGenerationAlertLink
  | StandaloneGenerationAlertLink;

export const STANDALONE_GENERATION_ALERT: StandaloneGenerationAlertLink = {
  mode: 'standalone',
};

export function isParentProductGenerationAlertLink(
  value: GenerationAlertLink | null | undefined,
): value is ParentProductGenerationAlertLink {
  return value?.mode === 'parent';
}

export function productGenerationOperationKey(batchId: string): string {
  return `product-generation:${batchId}`;
}

export function productGenerationMetadata(
  link: ParentProductGenerationAlertLink,
): {
  productGenerationBatchId: string;
  parentOperationKey: string;
  childKind: ProductGenerationChildKind;
} {
  return {
    productGenerationBatchId: link.batchId,
    parentOperationKey: link.parentOperationKey,
    childKind: link.childKind,
  };
}

export function readProductGenerationAlertLink(
  value: unknown,
): ParentProductGenerationAlertLink | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const productGeneration = raw.productGeneration;
  if (!productGeneration || typeof productGeneration !== 'object') return null;

  const link = productGeneration as Record<string, unknown>;
  if (
    link.mode !== 'parent' ||
    typeof link.productGenerationBatchId !== 'string' ||
    typeof link.parentOperationKey !== 'string' ||
    (link.childKind !== 'detail_page' && link.childKind !== 'thumbnail')
  ) {
    return null;
  }

  return {
    mode: 'parent',
    batchId: link.productGenerationBatchId,
    parentOperationKey: link.parentOperationKey,
    childKind: link.childKind,
  };
}
