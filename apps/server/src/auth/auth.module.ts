import { Global, Module } from '@nestjs/common';
import { DevAuthMiddleware } from './middleware/dev-auth.middleware';

/**
 * AuthModule — DevAuthMiddleware 제공자 + (향후) 실인증 서비스 자리.
 * `PrismaModule` 이 이미 `@Global()` 이므로 별도 import 불필요.
 */
@Global()
@Module({
  providers: [DevAuthMiddleware],
  exports: [DevAuthMiddleware],
})
export class AuthModule {}
