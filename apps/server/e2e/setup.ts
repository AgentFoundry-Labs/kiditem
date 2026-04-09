import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { createMockPrisma } from './helpers/mock-prisma';
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

  return { app, prisma: mockPrisma, request: () => request(app.getHttpServer()) };
}

export async function closeApp() {
  if (app) await app.close();
}

export { mockPrisma };
