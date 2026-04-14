import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth.types';

/**
 * 내부 factory — 테스트에서 직접 호출 가능.
 */
export function currentUserFactory(ctx: ExecutionContext): AuthUser {
  const req = ctx.switchToHttp().getRequest<Request>();
  const user = req.authUser;
  if (!user) throw new UnauthorizedException('auth_required');
  return user;
}

/**
 * `@CurrentUser()` — 요청의 인증된 사용자를 주입.
 * `req.authUser` 가 없으면 401.
 */
export const CurrentUser = createParamDecorator<void, AuthUser>((_data, ctx) =>
  currentUserFactory(ctx),
);
