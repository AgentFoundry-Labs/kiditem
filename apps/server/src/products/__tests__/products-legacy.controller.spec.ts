import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ProductsLegacyController } from '../adapter/in/http/products-legacy.controller';
import { ProductCatalogService } from '../application/service/product-catalog.service';
import { MastersService } from '../application/service/masters.service';

describe('ProductsLegacyController (GET-only alias, e2e)', () => {
  let app: INestApplication;
  const catalog = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    detail: vi.fn().mockResolvedValue({ id: 'm1', options: [] }),
    counts: vi.fn().mockResolvedValue({
      total: 0, gradeA: 0, gradeB: 0, gradeC: 0, adCount: 0, noAdCount: 0,
      draftCount: 0, processingCount: 0, processedCount: 0, discontinuedCount: 0,
      temporaryCount: 0,
    }),
  };
  const masters = {
    originalImageBase64: vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,AAAA' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsLegacyController],
      providers: [
        { provide: ProductCatalogService, useValue: catalog },
        { provide: MastersService, useValue: masters },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.use((req: any, _res: any, next: any) => {
      req.authUser = { id: 'test-user', organizationId: 'organization-1' };
      next();
    });
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('GET /products returns Deprecation + Sunset headers and delegates to catalog.list', async () => {
    const res = await request(app.getHttpServer()).get('/products');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
    expect(catalog.list).toHaveBeenCalled();
  });

  it('GET /products/pipeline-stats delegates to catalog.counts', async () => {
    const res = await request(app.getHttpServer()).get('/products/pipeline-stats');
    expect(res.status).toBe(200);
    expect(catalog.counts).toHaveBeenCalled();
  });

  it('GET /products/calculate-grades returns counts with no write', async () => {
    const res = await request(app.getHttpServer()).get('/products/calculate-grades');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(catalog.counts).toHaveBeenCalled();
  });

  it('POST /products/calculate-grades returns counts with no write (action-task caller)', async () => {
    const res = await request(app.getHttpServer()).post('/products/calculate-grades').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(catalog.counts).toHaveBeenCalled();
  });

  it('GET /products/:id with non-UUID returns 400 (ParseUUIDPipe)', async () => {
    const res = await request(app.getHttpServer()).get('/products/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('GET /products/:id with UUID delegates to catalog.detail', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).get(`/products/${id}`);
    expect(res.status).toBe(200);
    expect(catalog.detail).toHaveBeenCalledWith('organization-1', id);
  });

  it('GET /products/:id/original-image-base64 with UUID delegates to masters.originalImageBase64', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).get(`/products/${id}/original-image-base64`);
    expect(res.status).toBe(200);
    expect(masters.originalImageBase64).toHaveBeenCalledWith('organization-1', id);
  });

  it('does NOT register PATCH /products/:id (write path deferred)', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).patch(`/products/${id}`).send({ abcGrade: 'A' });
    expect(res.status).toBe(404);
  });

  it('does NOT register PUT /products/:id (write path deferred)', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await request(app.getHttpServer()).put(`/products/${id}`).send({ sellPrice: 1000 });
    expect(res.status).toBe(404);
  });
});
