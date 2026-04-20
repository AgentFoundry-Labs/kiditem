import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { DevAuthMiddleware } from './middleware/dev-auth.middleware';
import { SupabaseAuthMiddleware } from './middleware/supabase-auth.middleware';

/**
 * AuthModule — Supabase JWT 검증(우선) + Dev 헤더 fallback.
 * `PrismaModule` 이 이미 `@Global()` 이므로 별도 import 불필요.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthMiddleware, DevAuthMiddleware],
  exports: [SupabaseAuthMiddleware, DevAuthMiddleware],
})
export class AuthModule {}
