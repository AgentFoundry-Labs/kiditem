import type { RecomposeKind, RecomposeVariantKey } from '@kiditem/shared/ai';
import {
  RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT,
  RECOMPOSE_BOX_ONLY_WINDOW_PROMPT,
  RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT,
  RECOMPOSE_LIFESTYLE_PROMPT,
  RECOMPOSE_MULTI_PACK_PROMPT,
  RECOMPOSE_MULTI_VARIANT_PROMPT,
  RECOMPOSE_MULTI_VARIANT_WORN_HEAD_PROMPT,
  RECOMPOSE_NO_BOX_PROMPT,
  RECOMPOSE_SINGLE_PRODUCT_PROMPT,
  RECOMPOSE_SINGLE_WITH_ACCESSORIES_PROMPT,
  RECOMPOSE_TEXT_HEAVY_PROMPT,
  RECOMPOSE_WITH_BOX_PROMPT,
} from './thumbnail-prompts';

/**
 * Head-wearable 카테고리 키워드 — multi-variant-loose 일 때 자동으로
 * "아이가 착용한 hero + 나머지 standalone" prompt 로 분기시키는 트리거.
 */
const HEAD_WEARABLE_KEYWORDS = [
  '머리띠',
  '헤어밴드',
  '머리밴드',
  '모자',
  '캡',
  '비니',
  '머리핀',
  '헤어핀',
  '헤어액세서리',
  'headband',
  'hair band',
  'hat',
  'cap',
  'beanie',
] as const;

export function isHeadWearableCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return HEAD_WEARABLE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * (kind, variantKey, category) → image edit prompt override.
 *
 * This is the prompt-routing part of the legacy ThumbnailRecomposeService, kept as a
 * pure helper so the current ai module can use the prompt pack without reintroducing
 * the old products-domain ThumbnailAiService dependency.
 */
export function getRecomposePromptOverride(
  kind: RecomposeKind | null | undefined,
  variantKey: RecomposeVariantKey | null | undefined,
  category?: string | null,
): string | null {
  if (variantKey === 'with-box') return RECOMPOSE_WITH_BOX_PROMPT;
  if (variantKey === 'no-box') return RECOMPOSE_NO_BOX_PROMPT;

  switch (kind) {
    case 'single-product':
      return RECOMPOSE_SINGLE_PRODUCT_PROMPT;
    case 'single-with-accessories':
      return RECOMPOSE_SINGLE_WITH_ACCESSORIES_PROMPT;
    case 'multi-pack-loose':
      return RECOMPOSE_MULTI_PACK_PROMPT;
    case 'multi-variant-loose':
      return isHeadWearableCategory(category)
        ? RECOMPOSE_MULTI_VARIANT_WORN_HEAD_PROMPT
        : RECOMPOSE_MULTI_VARIANT_PROMPT;
    case 'box-with-loose-same':
      return RECOMPOSE_WITH_BOX_PROMPT;
    case 'box-with-loose-diff':
      return RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT;
    case 'box-only-window':
      return RECOMPOSE_BOX_ONLY_WINDOW_PROMPT;
    case 'box-only-opaque':
      return RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT;
    case 'lifestyle-context':
      return RECOMPOSE_LIFESTYLE_PROMPT;
    case 'text-heavy':
      return RECOMPOSE_TEXT_HEAVY_PROMPT;
    default:
      return null;
  }
}
