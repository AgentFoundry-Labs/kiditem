import type {
  CoupangCategorySuggestion,
  CoupangCategorySuggestionResponse,
} from '@kiditem/shared/coupang-category';
import { apiClient } from '@/lib/api-client';

const AUTO_APPLY_CONFIDENCES: CoupangCategorySuggestion['confidence'][] = [
  'high',
  'medium',
];

export interface WingCategoryResolution {
  categoryCell: string | null;
  suggestion: CoupangCategorySuggestion | null;
}

/** 상품명별 카테고리를 기존 쿠팡 등록상품 코퍼스에서 추천한다. */
export async function resolveWingCategories(
  names: string[],
): Promise<Map<string, WingCategoryResolution>> {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const resolved = new Map<string, WingCategoryResolution>();
  if (unique.length === 0) return resolved;

  const response = await apiClient.post<CoupangCategorySuggestionResponse>(
    '/api/categories/coupang-suggestions',
    { names: unique },
  );

  for (const result of response.results) {
    const suggestion = result.suggestion;
    resolved.set(result.name, {
      categoryCell:
        suggestion && AUTO_APPLY_CONFIDENCES.includes(suggestion.confidence)
          ? suggestion.categoryCell
          : null,
      suggestion,
    });
  }

  return resolved;
}

export function collectUnresolvedNames(
  names: string[],
  resolved: Map<string, WingCategoryResolution>,
): string[] {
  return names.filter((name) => !resolved.get(name.trim())?.categoryCell);
}

export function buildUnresolvedCategoryError(
  unresolved: string[],
  resolved?: Map<string, WingCategoryResolution>,
): string {
  const lines = unresolved.slice(0, 3).map((name) => {
    const hint = resolved?.get(name.trim())?.suggestion;
    return hint ? `${name} → 후보: ${hint.path}` : name;
  });
  const more = unresolved.length > 3 ? `\n외 ${unresolved.length - 3}건` : '';
  return (
    `카테고리를 자동으로 정하지 못한 상품이 ${unresolved.length}건 있습니다.\n`
    + `${lines.join('\n')}${more}\nWING 등록 확인에서 카테고리를 직접 선택해 주세요.`
  );
}
