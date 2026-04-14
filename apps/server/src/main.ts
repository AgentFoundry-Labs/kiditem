import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as () => import('express').Express;
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ChatService } from './chat/chat.service';

async function bootstrap() {
  // Express instance 를 먼저 만들어 Nest router 앞에 CopilotKit 미들웨어를 등록.
  // NestFactory 가 만든 default ExpressAdapter 를 쓰면 미들웨어가 Nest router
  // 뒤에 쌓여 `/api/chat/copilot/...` 이 Nest 의 404 에 먼저 잡힘.
  const expressApp = express();

  // ChatService 는 Nest 초기화 후에만 resolve 가능 — lazy ref 로 주입.
  let chatServiceRef: ChatService | null = null;
  expressApp.use('/api/chat/copilot', (req: Request, res: Response) => {
    if (!chatServiceRef) {
      res.status(503).json({ error: 'ChatService not ready' });
      return;
    }
    // Express `app.use(path, ...)` 는 req.url 에서 path prefix 를 strip 해
    // CopilotKit 내부 Hono 라우터가 full URL 을 인식 못 함. originalUrl 로 복원.
    req.url = req.originalUrl;
    void chatServiceRef.handleCopilotRequest(req, res);
  });

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp),
  );
  chatServiceRef = app.get(ChatService);
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
        ],
  });
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 이미지는 S3-호환 스토리지(MinIO/R2/S3)에서 직접 서빙 (StorageService 참조)
  await app.listen(4000);
  console.log('Server running on http://localhost:4000');
}
bootstrap();
