import { RECOMPOSE_KINDS, type RecomposeKind, type RecomposeVariantClassification } from '@kiditem/shared/ai';

/**
 * Pure JSON-classification helper for the Vision-driven recompose flow.
 *
 * The Vision API returns a free-form JSON-ish blob (sometimes wrapped in a
 * fenced ```json``` block). This module unfences it, validates the `kind`
 * against the shared `RECOMPOSE_KINDS` allowlist, and produces the canonical
 * `RecomposeVariantClassification` shape — including the with-box / no-box
 * default options that the legacy service used to inline.
 *
 * Keeping this pure means the service is just orchestration (workspace lookup,
 * vision call) and the parse contract is reusable from tests or future
 * batch-classification callers without spinning up Nest DI.
 */

export const SINGLE_PRODUCT_FALLBACK: RecomposeVariantClassification = {
  kind: 'single-product',
  requiresChoice: false,
  options: [],
  recommended: null,
  reasoning: null,
};

export function singleProductFallback(reasoning: string | null): RecomposeVariantClassification {
  return { ...SINGLE_PRODUCT_FALLBACK, reasoning };
}

export function parseRecomposeClassification(text: string | null): RecomposeVariantClassification {
  if (!text) return SINGLE_PRODUCT_FALLBACK;

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let obj: { kind?: string; requiresChoice?: boolean; reasoning?: string };
  try {
    obj = JSON.parse(cleaned) as typeof obj;
  } catch {
    return SINGLE_PRODUCT_FALLBACK;
  }

  const kind: RecomposeKind = (RECOMPOSE_KINDS as readonly string[]).includes(obj.kind ?? '')
    ? (obj.kind as RecomposeKind)
    : 'single-product';

  if (obj.requiresChoice) {
    return {
      kind,
      requiresChoice: true,
      options: [
        {
          key: 'with-box',
          label: '박스 + 상품',
          description: '박스와 상품을 함께 구성',
          recommended: true,
        },
        {
          key: 'no-box',
          label: '상품만',
          description: '박스 없이 상품만 구성',
        },
      ],
      recommended: 'with-box',
      reasoning: obj.reasoning ?? null,
    };
  }

  return {
    kind,
    requiresChoice: false,
    options: [],
    recommended: null,
    reasoning: obj.reasoning ?? null,
  };
}
