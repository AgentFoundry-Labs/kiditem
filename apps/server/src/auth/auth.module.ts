import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './application/auth.service';
import { AUTH_REPOSITORY } from './application/port/out/repository/auth.repository.port';
import { PrismaAuthRepository } from './adapter/out/prisma/prisma-auth.repository';
import { SessionAuthMiddleware } from './middleware/session-auth.middleware';

/**
 * AuthModule — KidItem 로컬 세션 미들웨어 + 로그인/로그아웃/본인 정보 컨트롤러.
 * `PrismaModule` 이 이미 `@Global()` 이므로 별도 import 불필요.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaAuthRepository,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
    SessionAuthMiddleware,
  ],
  exports: [AuthService, SessionAuthMiddleware],
})
export class AuthModule {}
