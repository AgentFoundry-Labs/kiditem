import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { AuthUserPublic } from '@kiditem/shared/auth';
import { CurrentUser } from './decorators/current-user.decorator';
import { SkipAuth } from './decorators/skip-auth.decorator';
import type { AuthUser } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 로그인된 사용자 본인 정보. SupabaseAuthMiddleware 가 채운 req.authUser 기반.
   *
   * `@SkipAuth()` 로 OrganizationScopeGuard bypass — 시스템/미할당 사용자
   * (organizationId === null) 도 본인 정보 조회 가능해야 함. 인증 자체는
   * `@CurrentUser()` 데코레이터가 401 throw 로 강제.
   */
  @SkipAuth()
  @Get('me')
  async me(@CurrentUser() authUser: AuthUser): Promise<AuthUserPublic> {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, name: true, type: true },
    });
    if (!user) throw new NotFoundException('user_not_found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      role: authUser.role,
      organizationId: authUser.organizationId,
      membershipId: authUser.membershipId,
    } satisfies AuthUserPublic;
  }
}
