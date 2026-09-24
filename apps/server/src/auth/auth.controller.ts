import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { KiditemError } from '@kiditem/shared/errors';
import type {
  AuthUserPublic,
  ExtensionAuthHandoff,
  LoginResponse,
} from '@kiditem/shared/auth';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { SkipAuth } from './decorators/skip-auth.decorator';
import type { AuthUser } from './auth.types';
import {
  AUTH_SESSION_COOKIE,
  AuthService,
} from './application/auth.service';
import { LoginDto } from './dto/login.dto';
import {
  authSessionCookieOptions,
  clearAuthSessionCookie,
} from './middleware/auth-session-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @SkipAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(input);
    response.cookie(
      AUTH_SESSION_COOKIE,
      result.session.token,
      authSessionCookieOptions(),
    );
    return { user: result.user };
  }

  /**
   * The only browser-JS boundary allowed to reveal an opaque session token.
   * It exists solely so an installed KidItem extension can authenticate its
   * own API calls. Ordinary browser requests remain HttpOnly-cookie only.
   */
  @Post('extension-handoff')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async extensionHandoff(
    @CurrentUser() authUser: AuthUser,
    @Req() request: Request,
  ): Promise<ExtensionAuthHandoff> {
    const token = request.cookies?.[AUTH_SESSION_COOKIE];
    if (typeof token !== 'string' || !request.authSessionId) {
      throw new KiditemError('AUTH_REQUIRED');
    }
    const authenticated = await this.authService.authenticateToken(token);
    if (
      !authenticated ||
      authenticated.sessionId !== request.authSessionId ||
      authenticated.authUser.id !== authUser.id
    ) {
      throw new KiditemError('AUTH_REQUIRED');
    }
    return { token };
  }

  @SkipAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() authUser: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!request.authSessionId) throw new KiditemError('AUTH_REQUIRED');
    await this.authService.logout(request.authSessionId, authUser.id);
    clearAuthSessionCookie(response);
  }

  /**
   * 현재 로그인된 사용자 본인 정보. SessionAuthMiddleware 가 채운 req.authUser 기반.
   *
   * `@SkipAuth()` 로 OrganizationScopeGuard bypass — 시스템/미할당 사용자
   * (organizationId === null) 도 본인 정보 조회 가능해야 함. 인증 자체는
   * `@CurrentUser()` 데코레이터가 401 throw 로 강제.
   */
  @SkipAuth()
  @Get('me')
  async me(@CurrentUser() authUser: AuthUser): Promise<AuthUserPublic> {
    return this.authService.getCurrentUser(authUser);
  }
}
