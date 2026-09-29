/**
 * KidItem API 호출 창구. 환경(local·office)과 Bearer 토큰은 입구가 묶어서 준다 —
 * core의 실행 계약 쪽은 어느 환경인지, 토큰이 어디 있는지 모른다. 구현은 `core/authed-fetch.ts` 하나다.
 */
export interface ApiPort {
  /** `path`는 `/api/...` 상대 경로. 응답 상태 검사는 호출자가 한다. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}
