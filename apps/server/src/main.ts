import { config } from 'dotenv';
import { resolve } from 'path';

// App-local env is authoritative for the NestJS runtime; root .env is only a
// fallback for shared local tooling values such as DATABASE_URL.
config({ path: resolve(__dirname, '..', '.env') });
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication, ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => import('express').RequestHandler;
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ChatService } from './chat/chat.service';
import { SupabaseAuthMiddleware } from './auth/middleware/supabase-auth.middleware';

async function bootstrap() {
  // Express instance 를 먼저 만들어 Nest router 앞에 CopilotKit 미들웨어를 등록.
  // NestFactory 가 만든 default ExpressAdapter 를 쓰면 미들웨어가 Nest router
  // 뒤에 쌓여 `/api/chat/copilot/...` 이 Nest 의 404 에 먼저 잡힘.
  const expressApp = express();
  // CopilotKit raw route is registered before Nest middleware, so cookie auth
  // must be parsed on the underlying Express app before the chat handler.
  expressApp.use(cookieParser());
  // Pre-parse the JSON body so the CopilotKit v2 single-route handler can
  // rebuild a fresh Web Request via `synthesizeBodyFromParsedBody` instead
  // of trying to stream the IncomingMessage. Streaming-bodied Web Requests
  // hit a Node fetch `clone()/json()` failure inside CopilotKit's helper
  // (`Invalid JSON payload`), even when the underlying body is intact —
  // see node_modules/@copilotkit/runtime/dist/lib/integrations/node-http
  // /request-handler.mjs `synthesizeBodyFromParsedBody`.
  expressApp.use('/api/chat/copilot', express.json({ limit: '25mb' }));

  // ChatService / SupabaseAuthMiddleware 는 Nest 초기화 후에만 resolve 가능 — lazy ref.
  // 이 raw express handler 는 Nest router 앞에 있어 AppModule middleware 와
  // OrganizationScopeGuard 가 적용되지 않으므로, SupabaseAuthMiddleware 를 직접
  // 호출해 `req.authUser` 를 채운 뒤 401/auth_required / no_organization_context 를
  // 손수 처리한다.
  let chatServiceRef: ChatService | null = null;
  let supabaseAuthRef: SupabaseAuthMiddleware | null = null;
  expressApp.use('/api/chat/copilot', async (req: Request, res: Response) => {
    // Browsers reach this route through Next's same-origin rewrite (see
    // `apps/web/next.config.mjs`). There is no cross-origin browser caller,
    // so chat-specific CORS preflight handling is intentionally absent —
    // `app.enableCors` below covers the remaining server→server callers.
    if (!chatServiceRef || !supabaseAuthRef) {
      res.status(503).json({ error: 'service_not_ready' });
      return;
    }
    try {
      await new Promise<void>((resolveStep, rejectStep) => {
        supabaseAuthRef!.use(req, res, (err?: unknown) => {
          if (err) rejectStep(err as Error);
          else resolveStep();
        });
      });
    } catch {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    if (!req.authUser) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    if (!req.authUser.organizationId) {
      res.status(401).json({ error: 'no_organization_context' });
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
  supabaseAuthRef = app.get(SupabaseAuthMiddleware);
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
    // apiClient 가 `credentials: 'include'` 로 fetch 하므로 cross-origin (web:3000 →
    // server:4000) 에서 cookie 전송이 허용되도록 credentials 활성화 필수.
    credentials: true,
  });
  app.useBodyParser('json', { limit: '25mb' });
  // SupabaseAuthMiddleware 가 Supabase SSR auth-token 쿠키를 읽기 위해 필요.
  // `expressApp.use(cookieParser())` above covers both raw chat and Nest routes.
  app.setGlobalPrefix('api');
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
