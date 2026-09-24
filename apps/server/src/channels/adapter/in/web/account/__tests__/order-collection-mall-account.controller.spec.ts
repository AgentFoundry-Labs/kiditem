import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../../../auth/decorators/roles.decorator';
import { CHANNEL_ACCOUNT_PORT } from '../../../../../application/port/in/account/channel-account.port';
import { ChannelAccountException } from '../../../../../application/exception/channel-account.exception';
import { OrderCollectionMallAccountController } from '../order-collection-mall-account.controller';
import { GlobalExceptionFilter } from '../../../../../../common/filters/global-exception.filter';
import { ChannelBusinessExceptionFilter } from '../../channel-business-exception.filter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

let app: INestApplication | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('OrderCollectionMallAccountController listing profile route (KID-235)', () => {
  it('routes PATCH …/:mallKey/listing-profile to the listing profile writer with the session organization', async () => {
    const accounts = fakeAccounts();
    accounts.updateListingProfile.mockResolvedValue({ key: 'onch', listingProfile: { categoryCode: '12' } });
    const server = await mallAccountApp(accounts);

    const response = await request(server.getHttpServer())
      .patch('/api/orders/collection/malls/onch/listing-profile')
      .send({ categoryCode: '12', organizationId: 'browser-must-not-choose' })
      .expect(200);

    expect(response.body).toEqual({ key: 'onch', listingProfile: { categoryCode: '12' } });
    expect(accounts.updateListingProfile).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'onch',
      { categoryCode: '12', organizationId: 'browser-must-not-choose' },
    );
    expect(accounts.update).not.toHaveBeenCalled();
  });

  it('answers the writer exceptions with 400 and 404', async () => {
    const accounts = fakeAccounts();
    accounts.updateListingProfile
      .mockRejectedValueOnce(new ChannelAccountException('invalid', '등록 기본값 입력이 올바르지 않습니다'))
      .mockRejectedValueOnce(new ChannelAccountException('not_found', '계정이 없습니다'));
    const server = await mallAccountApp(accounts);

    await request(server.getHttpServer()).patch('/api/orders/collection/malls/onch/listing-profile').send({ x: 1 }).expect(400);
    await request(server.getHttpServer()).patch('/api/orders/collection/malls/onch/listing-profile').send({}).expect(404);
  });

  it('is restricted to owner and admin like the other account writes', () => {
    const handler = OrderCollectionMallAccountController.prototype.updateListingProfile;
    expect(Reflect.getMetadata(ROLES_METADATA_KEY, handler)).toEqual(['owner', 'admin']);
  });
});

function fakeAccounts() {
  return {
    list: vi.fn(),
    reorder: vi.fn(),
    update: vi.fn(),
    updateListingProfile: vi.fn(),
    getPassword: vi.fn(),
  };
}

async function mallAccountApp(accounts: unknown): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [OrderCollectionMallAccountController],
    providers: [{ provide: CHANNEL_ACCOUNT_PORT, useValue: accounts }],
  }).compile();
  app = moduleRef.createNestApplication();
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
