import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ActivityEventsController } from '../activity-events.controller';
import { ActivityEventsService } from '../activity-events.service';

const OBJECT_ID = '10000000-0000-4000-8000-000000000058';
const BASE = '/api/activity-events';

describe('Activity event organization isolation over HTTP and PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [ActivityEventsController],
      providers: [{
        provide: ActivityEventsService,
        useValue: new ActivityEventsService(prisma as unknown as PrismaService),
      }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((
      req: { headers: Record<string, string>; authUser?: unknown },
      _res: unknown,
      next: () => void,
    ) => {
      req.authUser = {
        id: TEST_USER_ID,
        organizationId: req.headers['x-test-org'] ?? TEST_ORGANIZATION_ID,
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('returns no events for another organization object even with a forged organization query', async () => {
    await prisma.activityEvent.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        objectType: 'product',
        objectId: OBJECT_ID,
        eventType: 'updated',
        title: 'Other organization event',
      },
    });

    const ownerResponse = await request(app.getHttpServer())
      .get(BASE)
      .set('x-test-org', OTHER_ORGANIZATION_ID)
      .query({ objectType: 'product', objectId: OBJECT_ID })
      .expect(200);
    expect(ownerResponse.body).toEqual([
      expect.objectContaining({ title: 'Other organization event' }),
    ]);

    const foreignResponse = await request(app.getHttpServer())
      .get(BASE)
      .query({
        objectType: 'product',
        objectId: OBJECT_ID,
        organizationId: OTHER_ORGANIZATION_ID,
      })
      .expect(200);
    expect(foreignResponse.body).toEqual([]);
  });

  it('keeps object and event filters, newest-first order and limit inside the current organization', async () => {
    const defaults = {
      organizationId: TEST_ORGANIZATION_ID,
      objectType: 'product',
      objectId: OBJECT_ID,
      eventType: 'updated',
    };
    await prisma.activityEvent.createMany({
      data: [
        { ...defaults, title: 'Old update', createdAt: new Date('2026-09-01T01:00:00Z') },
        { ...defaults, title: 'Middle update', createdAt: new Date('2026-09-01T02:00:00Z') },
        { ...defaults, title: 'Latest update', createdAt: new Date('2026-09-01T03:00:00Z') },
        {
          ...defaults,
          organizationId: OTHER_ORGANIZATION_ID,
          title: 'Foreign update on the same object identity',
          createdAt: new Date('2026-09-01T04:00:00Z'),
        },
        {
          ...defaults,
          eventType: 'created',
          title: 'Different event type',
          createdAt: new Date('2026-09-01T05:00:00Z'),
        },
        {
          ...defaults,
          objectType: 'order',
          title: 'Different object type',
          createdAt: new Date('2026-09-01T06:00:00Z'),
        },
        {
          ...defaults,
          objectId: '20000000-0000-4000-8000-000000000058',
          title: 'Different object ID',
          createdAt: new Date('2026-09-01T07:00:00Z'),
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(BASE)
      .query({ objectType: 'product', objectId: OBJECT_ID, eventType: 'updated', limit: 2 })
      .expect(200);
    expect(response.body).toEqual([
      expect.objectContaining({ title: 'Latest update', organizationId: TEST_ORGANIZATION_ID }),
      expect.objectContaining({ title: 'Middle update', organizationId: TEST_ORGANIZATION_ID }),
    ]);
  });
});
