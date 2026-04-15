/**
 * AuthUser — 요청 컨텍스트에 주입되는 인증된 사용자 표현.
 *
 * companyId 는 시스템/미배정 사용자(`User.companyId = null`)의 경우 null 이다.
 * 대부분의 도메인 엔드포인트는 `CompanyScopeGuard` 가 companyId=null 를 차단한다.
 * role/type 은 Prisma `User.role`/`User.type` 문자열 그대로 (ADR-0001, native enum 금지).
 */
export interface AuthUser {
  id: string;
  companyId: string | null;
  role: string;
  type: string;
  email: string;
}
