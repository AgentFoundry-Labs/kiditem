import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_KEY = 'skipAuth';

/**
 * `@SkipAuth()` — `CompanyScopeGuard` 를 우회시킨다.
 * 미들웨어 레벨 skip path 는 별도로 `AppModule.configure()` 에서 처리.
 * 이 데코레이터는 라우트 레벨 예외(헬스체크·공개 엔드포인트)용 예비.
 */
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
