import type {
  CoupangCategorySuggestion,
  CoupangCategorySuggestionResponse,
} from '@kiditem/shared/coupang-category';
import { apiClient } from '@/lib/api-client';

/**
 * WING 등록용 쿠팡 카테고리 해석.
 *
 * 기존에는 모든 상품이 `WING_TOY_WATERGUN_PRESET`(물총)으로 고정 등록됐다.
 *
 * 자동 적용 기준을 high 로만 두면 정답을 찾고도 등록이 막혀 사용자가 아무것도 못 하게 된다.
 * 여기서 채우는 값은 **제출이 아니라 초안**이다 — 확장은 폼만 채우고 제출 버튼은 절대 누르지
 * 않으므로(`wing-registration-fill.js`), 사용자가 WING 화면에서 카테고리를 확인·수정한 뒤
 * 제출한다. 따라서 medium 까지는 채워주고, 근거가 희박한 low/추론실패만 막는다.
 *
 * 실측(leave-one-out, n=300, k-NN 투표): high 74.7% / medium 38% / low 25%.
 * 어떤 임계값도 무인 자동등록에는 충분치 않으므로 "사람이 검토한다"는 전제가 핵심이다.
 */
const AUTO_APPLY_CONFIDENCES: CoupangCategorySuggestion['confidence'][] = ['high', 'medium'];

export interface WingCategoryResolution {
  /** 자동 적용 가능한 카테고리. null 이면 수동 선택이 필요하다. */
  categoryCell: string | null;
  suggestion: CoupangCategorySuggestion | null;
}

/** 상품명 → 카테고리 제안. 이름 기준이므로 동명 상품은 같은 결과를 공유한다. */
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
    const autoApply = !!suggestion && AUTO_APPLY_CONFIDENCES.includes(suggestion.confidence);
    resolved.set(result.name, {
      categoryCell: autoApply ? suggestion.categoryCell : null,
      suggestion,
    });
  }

  return resolved;
}

/**
 * 자동 적용에 실패한 상품명들. 호출부는 이 목록을 사용자에게 그대로 보여주고
 * 카테고리를 직접 고르게 해야 한다 — 임의의 기본 카테고리로 대체하지 않는다.
 */
export function collectUnresolvedNames(
  names: string[],
  resolved: Map<string, WingCategoryResolution>,
): string[] {
  return names.filter((name) => !resolved.get(name.trim())?.categoryCell);
}

/**
 * 수동 선택이 필요한 상품 안내.
 * 근거가 약하더라도 후보가 있으면 함께 보여준다 — "직접 고르세요"만 던지면
 * 사용자가 WING 에서 무엇을 골라야 할지 알 수 없다.
 */
export function buildUnresolvedCategoryError(
  unresolved: string[],
  resolved?: Map<string, WingCategoryResolution>,
): string {
  const lines = unresolved.slice(0, 3).map((name) => {
    const hint = resolved?.get(name.trim())?.suggestion;
    return hint ? `${name} → 후보: ${hint.path}` : name;
  });
  const more = unresolved.length > 3 ? `\n외 ${unresolved.length - 3}건` : '';
  return `카테고리를 자동으로 정하지 못한 상품이 ${unresolved.length}건 있습니다.\n${lines.join('\n')}${more}\nWING 등록 화면에서 카테고리를 직접 선택해 주세요.`;
}
