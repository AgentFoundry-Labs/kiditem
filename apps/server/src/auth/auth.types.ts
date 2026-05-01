/**
 * AuthUser — 요청 컨텍스트에 주입되는 인증된 사용자 표현.
 *
 * organizationId/role 은 활성 OrganizationMembership 에서 온다.
 * 시스템/미배정 사용자처럼 활성 멤버십이 없으면 organizationId 는 null 이며,
 * 대부분의 도메인 엔드포인트는 `OrganizationScopeGuard` 가 이를 차단한다.
 * type 은 Prisma `User.type` 문자열 그대로 (ADR-0001, native enum 금지).
 */
export interface AuthUser {
  id: string;
  organizationId: string | null;
  membershipId: string | null;
  role: string;
  type: string;
  email: string;
}
