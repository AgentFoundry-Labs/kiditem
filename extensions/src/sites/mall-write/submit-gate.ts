/**
 * 몰 [등록]을 누를지 정하는 한 곳(ADR-0019, KID-256·KID-364). 세 조건이 모두 맞을 때만 누른다:
 *  1. 실행이 [등록]까지 부탁했다(`plan.submit` — 서버 plan이 등록 대상 실행에만 싣는다. 빠른 등록은 false).
 *  2. 그 몰 명세에 등록 버튼·결과 화면을 확인한 누르기(`submit`)가 있다 — 지금은 Wing뿐이다. 몰 17곳은 채우기만 한다.
 *  3. 채우기가 경고·수동 단계를 남기지 않았다 — 하나라도 있으면 폼을 사람에게 남긴다.
 * 옛 `shared/mall-form-submit-gate.js`의 실행 컨텍스트(executionId·payloadHash·leaseToken) 검사는 실행 계약(token·plan)이
 * 대신한다. 누른 것(`submitted`)과 몰이 받은 것·몰에 올라간 것(재조회)은 다른 사실이다.
 */
export type SubmitSkipped = 'no_verified_submit' | 'fill_warnings' | 'manual_steps';

export type SubmitDecision = { press: true } | { press: false; skipped: SubmitSkipped | null };

export function shouldPressRegister(input: {
  submit: boolean;
  verifiedSubmit: boolean;
  warnings: readonly string[];
  manualSteps: readonly string[];
}): SubmitDecision {
  if (input.submit !== true) return { press: false, skipped: null };
  if (!input.verifiedSubmit) return { press: false, skipped: 'no_verified_submit' };
  if (input.warnings.length > 0) return { press: false, skipped: 'fill_warnings' };
  if (input.manualSteps.length > 0) return { press: false, skipped: 'manual_steps' };
  return { press: true };
}
