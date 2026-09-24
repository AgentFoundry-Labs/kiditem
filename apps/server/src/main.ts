/* eslint-disable import/order -- dotenv must load before modules that read runtime env */
import { resolve } from 'path';
import { config } from 'dotenv';

// App-local env is authoritative for the NestJS runtime; root .env is only a
// fallback for shared local tooling values such as DATABASE_URL.
config({ path: resolve(__dirname, '..', '.env') });
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => import('express').RequestHandler;
import { ApiApplicationModule } from './api-application.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { createGlobalValidationPipe } from './common/validation/validation-pipe';
import { ChannelBusinessExceptionFilter } from './channels/adapter/in/web/channel-business-exception.filter';
import { requireWebOrigin } from './common/config/web-origin';
import { configureAgentRuntimeBodyParsers } from './common/http/agent-runtime-body-parser';
import { configureApiGlobalPrefix } from './common/http/agent-runtime-route';

async function bootstrap() {
  requireWebOrigin();

  const app = await NestFactory.create<NestExpressApplication>(ApiApplicationModule, {
    bodyParser: false,
  });
  app.enableShutdownHooks();
  app.use(cookieParser());
  configureAgentRuntimeBodyParsers(app);
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
          // 같은 LAN 의 폰/노트북이 이 맥의 사설 IP 로 dev 웹을 열면 web:3000 과
          // server:4000 이 같은 호스트를 쓰므로 세션 쿠키가 그대로 붙는다.
          /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/,
          /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/,
          /^http:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:\d+$/,
        ],
    // apiClient 가 `credentials: 'include'` 로 fetch 하므로 cross-origin (web:3000 →
    // server:4000) 에서 cookie 전송이 허용되도록 credentials 활성화 필수.
    credentials: true,
  });
  // SessionAuthMiddleware 가 KidItem HttpOnly 세션 쿠키를 읽기 위해 필요.
  configureApiGlobalPrefix(app);
  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter(), new ChannelBusinessExceptionFilter());

  // 이미지는 S3-호환 스토리지(MinIO/R2/S3)에서 직접 서빙 (StorageService 참조)
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
