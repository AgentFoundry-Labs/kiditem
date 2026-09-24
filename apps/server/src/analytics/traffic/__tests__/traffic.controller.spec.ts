import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrafficController } from '../traffic.controller';
import { TrafficService } from '../traffic.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

let app: INestApplication | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

/**
 * 트래픽 CSV 업로드 lane 은 없다(KID-110, 결정 c) — 리스팅-일 트래픽을 쓰는 곳은 Advertising 의 Wing 수집
 * 하나다. 트래픽 조회(summary · monthly)는 남는다.
 */
describe('TrafficController', () => {
  it('serves only the summary and monthly reads — no upload handler', async () => {
    const traffic = {
      getTrafficSummary: vi.fn().mockResolvedValue({ days: [] }),
      getMonthlyRevenue: vi.fn().mockResolvedValue({ days: [] }),
    };
    const server = await trafficApp(traffic);

    expect(Object.getOwnPropertyNames(TrafficController.prototype).sort())
      .toEqual(['constructor', 'monthly', 'summary']);
    await request(server.getHttpServer()).get('/api/traffic/summary?days=7').expect(200);
    await request(server.getHttpServer()).get('/api/traffic/monthly?year=2026&month=9').expect(200);
    expect(traffic.getTrafficSummary).toHaveBeenCalledWith(7, ORGANIZATION_ID);
    expect(traffic.getMonthlyRevenue).toHaveBeenCalledWith(2026, 9, ORGANIZATION_ID);
  });
});

async function trafficApp(traffic: unknown): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [TrafficController],
    providers: [{ provide: TrafficService, useValue: traffic }],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.authUser = { id: 'user-1', organizationId: ORGANIZATION_ID } as Request['authUser'];
    next();
  });
  await app.init();
  return app;
}
