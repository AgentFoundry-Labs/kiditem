import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { InventoryController } from '../inventory.controller';
import { InventoryService } from '../../services/inventory.service';

// @CurrentCompany / @CurrentUser 데코레이터는 req.authUser 에서 읽음
// (apps/server/src/auth/decorators/current-{company,user}.decorator.ts).
// E2E 에서 middleware 로 req.authUser 를 주입하여 데코레이터가 정상 resolve.

describe('InventoryController (e2e)', () => {
  let app: INestApplication;
  let mockService: any;

  beforeAll(async () => {
    mockService = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, summary: { total: 0, healthy: 0, low: 0, out: 0 } }),
      findById: vi.fn().mockResolvedValue({ id: 'i1' }),
      findByOptionId: vi.fn().mockResolvedValue({ id: 'i1', optionId: 'o1' }),
      updateMetadata: vi.fn().mockResolvedValue({ id: 'i1' }),
      receive: vi.fn().mockResolvedValue({ inventory: { id: 'i1', currentStock: 15 }, transaction: {}, recomputedBundleOptionIds: [] }),
      issue: vi.fn().mockResolvedValue({ inventory: { id: 'i1' }, transaction: {}, recomputedBundleOptionIds: [] }),
      adjust: vi.fn().mockResolvedValue({ inventory: { id: 'i1' }, transaction: {}, recomputedBundleOptionIds: [] }),
      listTransactions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
      getTransactionSummary: vi.fn().mockResolvedValue({ inQty: 0, outQty: 0, adjustQty: 0, inAmount: 0, outAmount: 0 }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: mockService }],
    }).compile();

    app = moduleRef.createNestApplication();
    // 데코레이터가 req.authUser 를 읽으므로 middleware 로 주입.
    // AuthUser shape: { id, email, companyId, role, ... } — 테스트엔 id + companyId 만 필요.
    app.use((req: any, _res: any, next: any) => {
      req.authUser = { id: 'test-user', companyId: 'test-company' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /inventory → list', async () => {
    await request(app.getHttpServer()).get('/inventory').expect(200);
    expect(mockService.list).toHaveBeenCalled();
  });

  it('GET /inventory/transactions → listTransactions (정적 경로 우선)', async () => {
    await request(app.getHttpServer()).get('/inventory/transactions').expect(200);
    expect(mockService.listTransactions).toHaveBeenCalled();
    expect(mockService.findById).not.toHaveBeenCalled();
  });

  it('GET /inventory/transactions/summary', async () => {
    await request(app.getHttpServer()).get('/inventory/transactions/summary').expect(200);
    expect(mockService.getTransactionSummary).toHaveBeenCalled();
  });

  it('GET /inventory/option/:optionId', async () => {
    await request(app.getHttpServer()).get('/inventory/option/550e8400-e29b-41d4-a716-446655440000').expect(200);
    expect(mockService.findByOptionId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'test-company');
  });

  it('GET /inventory/:id', async () => {
    await request(app.getHttpServer()).get('/inventory/550e8400-e29b-41d4-a716-446655440001').expect(200);
    expect(mockService.findById).toHaveBeenCalled();
  });

  it('PATCH /inventory/:id → metadata update', async () => {
    await request(app.getHttpServer())
      .patch('/inventory/i1')
      .send({ safetyStock: 20 })
      .expect(200);
    expect(mockService.updateMetadata).toHaveBeenCalledWith('i1', { safetyStock: 20 }, 'test-company');
  });

  it('POST /inventory/:id/receive', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/receive')
      .send({ quantity: 5, unitCost: 100 })
      .expect(201);
    expect(mockService.receive).toHaveBeenCalledWith('i1', { quantity: 5, unitCost: 100 }, 'test-company', 'test-user');
  });

  it('POST /inventory/:id/issue', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/issue')
      .send({ quantity: 3 })
      .expect(201);
    expect(mockService.issue).toHaveBeenCalled();
  });

  it('POST /inventory/:id/adjust', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/adjust')
      .send({ delta: -2, reason: 'shrinkage' })
      .expect(201);
    expect(mockService.adjust).toHaveBeenCalled();
  });

  it('POST /inventory/:id/receive with invalid body → 400', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/receive')
      .send({ quantity: -1 })
      .expect(400);
  });

  it('POST /inventory/:id/adjust with delta=0 → 400', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/adjust')
      .send({ delta: 0, reason: 'test' })
      .expect(400);
  });
});
