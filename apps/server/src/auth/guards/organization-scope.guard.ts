import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { KiditemError } from '@kiditem/shared/errors';
import { Reflector } from '@nestjs/core';
import { SKIP_AUTH_KEY } from '../decorators/skip-auth.decorator';
import { SERVICE_AUTH_KEY } from '../decorators/service-auth.decorator';
import type { Request } from 'express';

/**
 * 모든 도메인 라우트에 전역으로 걸리는 가드.
 * - `@SkipAuth()` 또는 전용 credential guard가 있는 `@ServiceAuth()`면 통과
 * - `req.authUser` 가 없으면 401 (auth_required 또는 middleware 분류 reason)
 * - `req.authUser.organizationId` 가 null 이면 401 (no_organization_context)
 *
 * HTTP 컨텍스트가 아닌 경우(예: SSE 구독, WS)는 통과시킨다.
 * SSE 경로는 API root의 미들웨어 규칙과 조합된다.
 */
@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_AUTH_KEY,
      targets,
    );
    const serviceAuth = this.reflector.getAllAndOverride<boolean | undefined>(
      SERVICE_AUTH_KEY,
      targets,
    );
    if (skip || serviceAuth) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.authUser) {
      throw new KiditemError('AUTH_REQUIRED', req.authFailureReason ? { details: { reason: req.authFailureReason } } : {});
    }
    if (!req.authUser.organizationId) throw new KiditemError('NO_ORGANIZATION_CONTEXT');
    return true;
  }
}
