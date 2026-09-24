import 'reflect-metadata';
import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorResponseSchema } from '@kiditem/shared/errors';
import { GlobalExceptionFilter } from '../../../../../common/filters/global-exception.filter';
import { REGISTRATION_TARGET_PORT } from '../../../../application/port/in/registration-target.port';
import { RegistrationTargetException } from '../../../../application/exception/registration-target.exception';
import { ChannelBusinessExceptionFilter } from '../channel-business-exception.filter';
import { RegistrationTargetController } from '../registration-target.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ID = '00000000-0000-4000-8000-0000000000aa';

let app: INestApplication | null = null;

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  if (app) await app.close();
  app = null;
  vi.restoreAllMocks();
});

describe('registration target routes answer registry codes through the global filters (KID-341)', () => {
  it('a target conflict reaches the operator as CHANNELS_REGISTRATION_TARGET_CONFLICT, not a local translation', async () => {
    const targets = fakeTargets();
    targets.archive.mockRejectedValue(new RegistrationTargetException('conflict', '진행 중인 제출이 있어 보관할 수 없습니다.'));
    const server = await targetApp(targets);

    const response = await request(server.getHttpServer()).delete(`/api/channels/registration-targets/${TARGET_ID}`).expect(409);

    expect(ErrorResponseSchema.parse(response.body)).toMatchObject({ code: 'CHANNELS_REGISTRATION_TARGET_CONFLICT', kind: 'conflict' });
  });
});

function fakeTargets() {
  return { resolve: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn() };
}

async function targetApp(targets: unknown): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [RegistrationTargetController],
    providers: [{ provide: REGISTRATION_TARGET_PORT, useValue: targets }],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.authUser = { id: 'user-1', organizationId: ORGANIZATION_ID } as Request['authUser'];
    next();
  });
  // main.ts와 같은 전역 등록.
  app.useGlobalFilters(new GlobalExceptionFilter(), new ChannelBusinessExceptionFilter());
  await app.init();
  return app;
}
