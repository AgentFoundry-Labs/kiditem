// 몰 자동 로그인의 거절 판정(KID-380 실기기 R5). 확장(로그인 뒤 몰이 남긴 알림 창)과 웹(차단 규칙·로그인 시험)이 같은 목록을 쓴다.
/**
 * 몰이 알림 창으로 남긴 답 중 "이 아이디·비밀번호로는 못 들어온다"는 뜻의 문장들. 이 말을 들으면
 * 더 두드리지 않는다 — 같은 비밀번호로 다시 넣으면 계정이 잠긴다. 그 밖의 문장(점검 중 · 세션
 * 만료 · 캡차)은 자격증명 문제가 아니므로 막지 않고 사장님께 그대로 보여 주기만 한다.
 */
export const MALL_CREDENTIAL_REJECTIONS = [
  '비밀번호가 일치하지',
  '비밀번호를 확인',
  '비밀번호가 올바르지',
  '아이디 또는 비밀번호',
  '아이디와 비밀번호',
  '등록되지 않은 아이디',
  '존재하지 않는 아이디',
  '일치하는 회원',
  '가입되지 않은',
  'incorrect password',
  'invalid password',
  'password does not match',
] as const;

/** 몰이 아이디·비밀번호를 거부했다고 말했는가. */
export function mallRejectedCredentials(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  if (!text) return false;
  return MALL_CREDENTIAL_REJECTIONS.some((phrase) => text.includes(phrase.toLowerCase()));
}
