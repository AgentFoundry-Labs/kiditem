import 'reflect-metadata';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_DEFINITIONS, ErrorResponseSchema } from '@kiditem/shared/errors';
import { GlobalExceptionFilter } from '../../../../../common/filters/global-exception.filter';
import { ProcurementController } from '../procurement.controller';
import { ProcurementService } from '../../../../application/service/procurement.service';
import { PROCUREMENT_REPOSITORY_PORT } from '../../../../application/port/out/repository/procurement.repository.port';
import { PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT } from '../../../../application/port/out/transaction/purchase-order-submission.transaction.port';
import { PURCHASE_ORDER_SUBMISSION_PORT } from '../../../../application/port/in/procurement/purchase-order-submission.port';
import { ROCKET_PURCHASE_PREVIEW_PORT } from '../../../../application/port/in/procurement/rocket-purchase-preview.port';
import { ROCKET_WORKBOOK_EXPORT_PORT } from '../../../../application/port/in/procurement/rocket-purchase-confirmation.port';
import { ROCKET_PO_CATALOG_PORT } from '../../../../../orders/application/port/in/rocket-po-catalog.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

describe('purchase-order HTTP error envelope (KID-343)', () => {
  let app: INestApplication;
  const repository = {
    findScopedStatus: vi.fn().mockResolvedValue({ id: ORDER_ID, status: 'draft' }),
    updateStatusScoped: vi.fn(),
  };

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcurementController],
      providers: [
        ProcurementService,
        { provide: PROCUREMENT_REPOSITORY_PORT, useValue: repository },
        { provide: PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT, useValue: {} },
        { provide: PURCHASE_ORDER_SUBMISSION_PORT, useValue: {} },
        { provide: ROCKET_PURCHASE_PREVIEW_PORT, useValue: {} },
        { provide: ROCKET_WORKBOOK_EXPORT_PORT, useValue: {} },
        { provide: ROCKET_PO_CATALOG_PORT, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: 'user-1', organizationId: ORGANIZATION_ID };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it('answers an illegal purchase-order status move with 409 SUPPLY_PURCHASE_STATUS_INVALID and leaves the order alone', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .send({ action: 'updateStatus', id: ORDER_ID, status: 'received' })
      .expect(409);

    expect(ErrorResponseSchema.parse(response.body)).toEqual({
      statusCode: 409,
      code: 'SUPPLY_PURCHASE_STATUS_INVALID',
      kind: 'conflict',
      message: ERROR_DEFINITIONS.SUPPLY_PURCHASE_STATUS_INVALID.text,
      errors: [],
      // 봉투는 details 중 reason만 싣는다(from·to는 로그 쪽 구조 데이터).
      details: { reason: 'TRANSITION_INVALID' },
    });
    expect(repository.updateStatusScoped).not.toHaveBeenCalled();
  });
});
