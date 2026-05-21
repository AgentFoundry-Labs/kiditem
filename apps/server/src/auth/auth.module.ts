import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthMiddleware } from './middleware/supabase-auth.middleware';
import { SourcingExtensionAuthMiddleware } from './middleware/sourcing-extension-auth.middleware';
import { SourcingExtensionTokenService } from './sourcing-extension-token.service';

/**
 * AuthModule — Supabase JWT 검증 미들웨어 + 본인 정보 조회 컨트롤러.
 * `PrismaModule` 이 이미 `@Global()` 이므로 별도 import 불필요.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SupabaseAuthMiddleware,
    SourcingExtensionAuthMiddleware,
    SourcingExtensionTokenService,
  ],
  exports: [
    SupabaseAuthMiddleware,
    SourcingExtensionAuthMiddleware,
    SourcingExtensionTokenService,
  ],
})
export class AuthModule {}
