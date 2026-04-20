import { Controller, Get, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUserPublic } from '@kiditem/shared';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 현재 로그인된 사용자 정보. SupabaseAuthMiddleware 가 이미 검증한 req.authUser 기반. */
  @Get('me')
  async me(@CurrentUser() authUser: AuthUser): Promise<AuthUserPublic> {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        companyId: true,
        email: true,
        name: true,
        role: true,
        type: true,
      },
    });
    if (!user) throw new NotFoundException('user_not_found');
    return user;
  }
}
