import { isApiError } from './api-error';

/** Shown when another screen changed a channel option recipe after this one loaded it. */
export const RECIPE_CHANGED_ELSEWHERE_MESSAGE = '다른 곳에서 구성이 바뀌었습니다. 새로고침 후 다시 적용하세요.';

/** A recipe replacement answers 409 only when the recipe it was loaded from changed since. */
export function recipeConflictMessage(error: unknown): string | null {
  return isApiError(error) && error.status === 409 ? RECIPE_CHANGED_ELSEWHERE_MESSAGE : null;
}
