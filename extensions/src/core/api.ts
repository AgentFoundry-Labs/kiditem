/**
 * KidItem API 호출 창구. 환경(local·office)과 Bearer 토큰은 입구가 묶어서 준다 —
 * core는 어느 환경인지, 토큰이 어디 있는지 모른다. 옛 `authedFetch`에 붙이는 어댑터는
 * `entry/legacy-bridge.ts` 하나뿐이다.
 */
export interface ApiPort {
  /** `path`는 `/api/...` 상대 경로. 응답 상태 검사는 호출자가 한다. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}
