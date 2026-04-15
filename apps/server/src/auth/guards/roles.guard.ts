import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator';

/**
 * `@Roles(...)` 메타데이터가 설정된 라우트에만 역할 검증.
 * 메타 없으면 pass-through → 다른 가드(CompanyScopeGuard)에만 의존.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.authUser) throw new UnauthorizedException('auth_required');
    if (!required.includes(req.authUser.role)) {
      throw new ForbiddenException('insufficient_role');
    }
    return true;
  }
}
