/* eslint-disable import/order -- dotenv must load before modules that read runtime env */
import { resolve } from 'path';
import { config } from 'dotenv';

// App-local env is authoritative for the NestJS runtime; root .env is only a
// fallback for shared local tooling values such as DATABASE_URL.
config({ path: resolve(__dirname, '..', '.env') });
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => import('express').RequestHandler;
import { ApiApplicationModule } from './api-application.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { requireWebOrigin } from './common/config/web-origin';
import { configureCopilotKitBodyParser } from './common/http/copilotkit-body-parser';

async function bootstrap() {
  requireWebOrigin();

  const app = await NestFactory.create<NestExpressApplication>(ApiApplicationModule, {
    bodyParser: false,
  });
  app.enableShutdownHooks();
  app.use(cookieParser());
  // 프로덕션은 CORS_ORIGINS(쉼표 구분) 화이트리스트 필수. 미지정이면 전부 차단.
  const isProd = process.env.NODE_ENV === 'production';
  const prodOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: isProd
      ? prodOrigins
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          /^http:\/\/localhost:\d+$/,
          /^http:\/\/127\.0\.0\.1:\d+$/,
          /^http:\/\/0\.0\.0\.0:\d+$/,
          /^http:\/\/\[::1\]:\d+$/,
        ],
    // apiClient 가 `credentials: 'include'` 로 fetch 하므로 cross-origin (web:3000 →
    // server:4000) 에서 cookie 전송이 허용되도록 credentials 활성화 필수.
    credentials: true,
  });
  configureCopilotKitBodyParser(app);
  // SessionAuthMiddleware 가 KidItem HttpOnly 세션 쿠키를 읽기 위해 필요.
  // Native Host Runner control is a sibling loopback-only surface, not part
  // of the public /api contract that nginx proxies to LAN clients.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'internal/agent-runtime/*path', method: RequestMethod.ALL }],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 이미지는 S3-호환 스토리지(MinIO/R2/S3)에서 직접 서빙 (StorageService 참조)
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
