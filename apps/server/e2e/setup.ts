import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { createMockPrisma, TEST_USER_ID, TEST_ORGANIZATION_ID } from './helpers/mock-prisma';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

let app: INestApplication;
let mockPrisma: ReturnType<typeof createMockPrisma>;

const TEST_MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';

/**
 * E2E 용 인증 패스스루 — `req.authUser` 를 고정 값으로 채운다.
 * Nest 의 SupabaseAuthMiddleware 는 토큰이 없으면 silent pass 하므로,
 * 그 앞단에 raw express middleware 로 한 번 채워두면 그대로 통과한다.
 */
function e2eAuthPassthrough(req: Request, _res: Response, next: NextFunction): void {
  req.authUser = {
    id: TEST_USER_ID,
    organizationId: TEST_ORGANIZATION_ID,
    membershipId: TEST_MEMBERSHIP_ID,
    role: 'admin',
    type: 'human',
    email: 'test@kiditem.local',
  };
  next();
}

export async function createApp() {
  mockPrisma = createMockPrisma();

  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .compile();

  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  // SupabaseAuthMiddleware 보다 먼저 등록 — raw express middleware 가 req.authUser 를
  // 채우면, SupabaseAuthMiddleware 는 토큰 없을 때 그대로 next() 하므로 보존된다.
  app.use(e2eAuthPassthrough);

  await app.init();

  const authed = () => request(app.getHttpServer());

  return { app, prisma: mockPrisma, request: authed };
}

export async function closeApp() {
  if (app) await app.close();
}

export { mockPrisma, TEST_USER_ID, TEST_ORGANIZATION_ID };
