import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_AUTH_KEY } from '../decorators/skip-auth.decorator';

/**
 * 모든 도메인 라우트에 전역으로 걸리는 가드.
 * - `@SkipAuth()` 메타데이터가 있으면 통과
 * - `req.authUser` 가 없으면 401 (auth_required)
 * - `req.authUser.companyId` 가 null 이면 401 (no_company_context)
 *
 * HTTP 컨텍스트가 아닌 경우(예: SSE 구독, WS)는 통과시킨다.
 * SSE 경로는 `AppModule` 의 미들웨어 제외 규칙과 조합된다.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.authUser) throw new UnauthorizedException('auth_required');
    if (!req.authUser.companyId) throw new UnauthorizedException('no_company_context');
    return true;
  }
}
