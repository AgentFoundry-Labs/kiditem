import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { createMockPrisma, TEST_USER_ID, TEST_ORGANIZATION_ID } from './helpers/mock-prisma';
import request from 'supertest';

let app: INestApplication;
let mockPrisma: ReturnType<typeof createMockPrisma>;

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

  await app.init();

  /**
   * supertest 래퍼 — 모든 요청에 기본 `x-dev-user-id` 헤더를 부착.
   * 개별 테스트가 header 를 override 하려면 `.set('x-dev-user-id', ...)` 재호출.
   */
  const authed = () => {
    const agent = request(app.getHttpServer());
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
    const wrapped = {} as Record<(typeof methods)[number], (url: string) => request.Test>;
    for (const m of methods) {
      wrapped[m] = (url: string) => agent[m](url).set('x-dev-user-id', TEST_USER_ID);
    }
    return wrapped as ReturnType<typeof request>;
  };

  return { app, prisma: mockPrisma, request: authed };
}

export async function closeApp() {
  if (app) await app.close();
}

export { mockPrisma, TEST_USER_ID, TEST_ORGANIZATION_ID };
