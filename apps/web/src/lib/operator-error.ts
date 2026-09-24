import { operatorErrorText, resolveErrorCode } from '@kiditem/shared/errors';
import { COLLECTION_STOPPED_MESSAGE } from './collection-source-status-query';

export { describeOperatorError, operatorErrorText, sourceLabel } from '@kiditem/shared/errors';

const HANGUL = /[가-힣]/;

/**
 * 확장·서버가 넘긴 사유 하나(코드 또는 문장)를 운영자 문장으로: 등록 코드(alias 포함)면 레지스트리 문장,
 * 한국어 문장이면 그대로, 그 밖(영어 원문·빈 값)은 호출부의 `fallback`.
 */
export function operatorReason(reason: unknown, fallback: string): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  const code = resolveErrorCode(text);
  if (code) return operatorErrorText({ code });
  return HANGUL.test(text) ? text : fallback;
}

/**
 * 수집 시도(attempt) 실패를 운영자 문장 하나로(ADR-0023 웹 presenter). 화면은 `errorCode`·`errorMessage`를
 * 직접 렌더링하지 않고 이 함수를 쓴다.
 *
 *   - 실패 코드도 문장도 없으면 null (문장만 있으면 한국어는 그대로, 영어는 원천별 일반 문장)
 *   - `*_CANCELLED`는 실패가 아니라 중단 → `COLLECTION_STOPPED_MESSAGE`
 *   - 저장 문장이 한국어면 그것(원천이 남긴 문맥)
 *   - 아니면 등록 코드(확장 소문자 철자·옛 코드 alias 포함)의 레지스트리 문장, 모르는 코드는 원천별 일반
 *     문장 — 영어 원문은 버린다
 */
export function attemptFailureText(
  attempt: Readonly<{ errorCode?: string | null; errorMessage?: string | null }> | null | undefined,
  source?: string | null,
): string | null {
  const code = attempt?.errorCode?.trim();
  if (!code) {
    // 코드 없이 문장만 남긴 실패(옛 행·확장 제출): 한국어면 그대로, 아니면 원천별 일반 문장.
    const message = attempt?.errorMessage?.trim();
    if (!message) return null;
    return HANGUL.test(message) ? message : operatorErrorText({ code: null, source });
  }
  if (code.endsWith('_CANCELLED')) return COLLECTION_STOPPED_MESSAGE;
  // 원천이 남긴 한국어 문장은 몰 이름 등 문맥을 더 담고 있어 그대로 쓴다. 영어·빈 문장만 코드 문장으로.
  if (attempt?.errorMessage && HANGUL.test(attempt.errorMessage)) return attempt.errorMessage.trim();
  return operatorErrorText({ code, source });
}
