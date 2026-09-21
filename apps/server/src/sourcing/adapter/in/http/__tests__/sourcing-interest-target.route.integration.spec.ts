import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcingPromotionService } from '../../../../application/service/sourcing-promotion.service';
import { SourcingInterestTargetService } from '../../../../application/service/sourcing-interest-target.service';
import { SourcingService } from '../../../../application/service/sourcing.service';
import { SourcingWorkspaceArchiveService } from '../../../../application/service/sourcing-workspace-archive.service';
import { ProductPreparationService } from '../../../../application/service/product-preparation.service';
import { SourcingCandidateWorkspaceController } from '../sourcing-candidate-workspace.controller';
import { SourcingInterestTargetController } from '../sourcing-interest-target.controller';

const ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('SourcingInterestTargetController route', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('serves interests through a two-segment route instead of the candidate id route', async () => {
    const interests = { list: vi.fn().mockResolvedValue([]) };
    const sourcing = { getProduct: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [SourcingCandidateWorkspaceController, SourcingInterestTargetController],
      providers: [
        { provide: SourcingService, useValue: sourcing },
        { provide: SourcingPromotionService, useValue: {} },
        { provide: SourcingWorkspaceArchiveService, useValue: {} },
        { provide: ProductPreparationService, useValue: {} },
        { provide: SourcingInterestTargetService, useValue: interests },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: Request & { authUser?: { id: string; organizationId: string } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.authUser = { id: USER_ID, organizationId: ORGANIZATION_ID };
        next();
      },
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/api/sourcing/workspace/interests')
      .expect(200);

    expect(response.body).toEqual([]);
    expect(interests.list).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(sourcing.getProduct).not.toHaveBeenCalled();
  });
});
