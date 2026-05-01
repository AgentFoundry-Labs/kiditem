import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 내부 factory — 테스트에서 직접 호출 가능.
 * `@CurrentOrganization()` 는 이 factory 를 ParamDecorator 로 감싼 것.
 */
export function currentOrganizationFactory(ctx: ExecutionContext): string {
  const req = ctx.switchToHttp().getRequest<Request>();
  const user = req.authUser;
  if (!user) throw new UnauthorizedException('auth_required');
  if (!user.organizationId) throw new UnauthorizedException('no_organization_context');
  return user.organizationId;
}

/**
 * `@CurrentOrganization()` — 요청 컨텍스트의 organizationId 를 주입.
 * 인증 없거나 organizationId 가 null 이면 401.
 *
 * 대부분의 경우 `OrganizationScopeGuard` 가 먼저 걸리지만, 이 데코레이터만 쓰여도
 * 안전하도록 방어한다.
 */
export const CurrentOrganization = createParamDecorator<void, string>((_data, ctx) =>
  currentOrganizationFactory(ctx),
);
