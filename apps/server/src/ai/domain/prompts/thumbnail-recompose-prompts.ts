import type { RecomposeKind, RecomposeVariantKey } from '@kiditem/shared/ai';
import {
  RECOMPOSE_APPAREL_VARIANT_PROMPT,
  RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT,
  RECOMPOSE_BOX_ONLY_WINDOW_PROMPT,
  RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT,
  RECOMPOSE_LIFESTYLE_PROMPT,
  RECOMPOSE_LIGHTING_LIFESTYLE_PROMPT,
  RECOMPOSE_MIXED_ITEM_SET_PROMPT,
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
 * 의류 카테고리 키워드 — multi-variant-loose 일 때 마네킹 + swatch dots prompt 로 분기.
 * 망토/원피스/티셔츠/후디/코스튬 등 입체감 살리는 의류 형태 적용.
 * head-wearable (모자/머리띠) 은 별도 분기이므로 여기 포함 X.
 */
const APPAREL_KEYWORDS = [
  '망토',
  '원피스',
  '티셔츠',
  'T셔츠',
  '셔츠',
  '후디',
  '후드',
  '맨투맨',
  '코스튬',
  '의상',
  '드레스',
  '자켓',
  '재킷',
  '점퍼',
  '패딩',
  '코트',
  '아우터',
  '의류',
  '치마',
  '스커트',
  '바지',
  '팬츠',
  '레깅스',
  '잠옷',
  '내복',
  'cape',
  'dress',
  't-shirt',
  'tshirt',
  'shirt',
  'hoodie',
  'costume',
  'jacket',
  'coat',
  'apparel',
  'clothing',
] as const;

/**
 * productName 또는 category 에 의류 키워드가 포함되어 있는지 검사.
 * multi-variant 의 색상 variant 일 때 마네킹 + swatch 패턴으로 분기시키는 트리거.
 */
export function isApparelCategory(
  category: string | null | undefined,
  productName?: string | null,
): boolean {
  const haystack = `${category ?? ''} ${productName ?? ''}`.toLowerCase();
  if (!haystack.trim()) return false;
  return APPAREL_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
}

/**
 * (kind, variantKey, category, productName?) → image edit prompt override.
 *
 * This is the prompt-routing part of the legacy ThumbnailRecomposeService, kept as a
 * pure helper so the current ai module can use the prompt pack without reintroducing
 * the old products-domain ThumbnailAiService dependency.
 *
 * Mapping:
 *   - variantKey="with-box"                                    → RECOMPOSE_WITH_BOX_PROMPT (사용자 선택 우선)
 *   - variantKey="no-box"                                      → RECOMPOSE_NO_BOX_PROMPT (사용자 선택 우선)
 *   - kind="single-product"                                    → RECOMPOSE_SINGLE_PRODUCT_PROMPT
 *   - kind="single-with-accessories"                           → RECOMPOSE_SINGLE_WITH_ACCESSORIES_PROMPT
 *   - kind="multi-pack-loose"                                  → RECOMPOSE_MULTI_PACK_PROMPT
 *   - kind="multi-variant-loose" + apparel category/name       → RECOMPOSE_APPAREL_VARIANT_PROMPT (마네킹 + swatch)
 *   - kind="multi-variant-loose" + head-wearable category      → RECOMPOSE_MULTI_VARIANT_WORN_HEAD_PROMPT (모델 착용)
 *   - kind="multi-variant-loose"                               → RECOMPOSE_MULTI_VARIANT_PROMPT (스튜디오 그리드)
 *   - kind="mixed-item-set"                                    → RECOMPOSE_MIXED_ITEM_SET_PROMPT
 *   - kind="box-with-loose-same"                               → RECOMPOSE_WITH_BOX_PROMPT (variantKey 폴백)
 *   - kind="box-with-loose-diff"                               → RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT
 *   - kind="box-only-window"                                   → RECOMPOSE_BOX_ONLY_WINDOW_PROMPT
 *   - kind="box-only-opaque"                                   → RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT
 *   - kind="lifestyle-context"                                 → RECOMPOSE_LIFESTYLE_PROMPT
 *   - kind="lighting-lifestyle"                                → RECOMPOSE_LIGHTING_LIFESTYLE_PROMPT
 *   - kind="text-heavy"                                        → RECOMPOSE_TEXT_HEAVY_PROMPT
 *   - 그 외 / null                                              → null (호출자가 EDIT_PROMPT 등 폴백 사용)
 */
export function getRecomposePromptOverride(
  kind: RecomposeKind | null | undefined,
  variantKey: RecomposeVariantKey | null | undefined,
  category?: string | null,
  productName?: string | null,
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
      // 카테고리 자동 분기 (top-down 우선순위):
      //  1. 의류 (망토/원피스/티셔츠/후디 등) → 마네킹 + 색상 swatch dots (best practice)
      //  2. 머리띠/모자/머리핀 → 아이 착용 hero + 옆 standalone (라이프스타일)
      //  3. 그 외 (장난감/문구/생활용품) → 기존 스튜디오 grid
      if (isApparelCategory(category, productName)) {
        return RECOMPOSE_APPAREL_VARIANT_PROMPT;
      }
      return isHeadWearableCategory(category)
        ? RECOMPOSE_MULTI_VARIANT_WORN_HEAD_PROMPT
        : RECOMPOSE_MULTI_VARIANT_PROMPT;
    case 'mixed-item-set':
      return RECOMPOSE_MIXED_ITEM_SET_PROMPT;
    case 'box-with-loose-same':
      // requiresChoice=true 케이스인데 variantKey 가 비어있으면 추천 (with-box) 으로 폴백.
      return RECOMPOSE_WITH_BOX_PROMPT;
    case 'box-with-loose-diff':
      return RECOMPOSE_BOX_WITH_LOOSE_DIFF_PROMPT;
    case 'box-only-window':
      return RECOMPOSE_BOX_ONLY_WINDOW_PROMPT;
    case 'box-only-opaque':
      return RECOMPOSE_BOX_ONLY_OPAQUE_PROMPT;
    case 'lifestyle-context':
      return RECOMPOSE_LIFESTYLE_PROMPT;
    case 'lighting-lifestyle':
      return RECOMPOSE_LIGHTING_LIFESTYLE_PROMPT;
    case 'text-heavy':
      return RECOMPOSE_TEXT_HEAVY_PROMPT;
    default:
      return null;
  }
}
