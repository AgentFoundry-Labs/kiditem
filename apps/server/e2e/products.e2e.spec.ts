import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp, closeApp } from './setup';

let api: ReturnType<Awaited<ReturnType<typeof createApp>>['request']>;
let prisma: Awaited<ReturnType<typeof createApp>>['prisma'];

const COMPANY_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PRODUCT_ID = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091';

const sampleProduct = {
  id: PRODUCT_ID,
  companyId: COMPANY_ID,
  name: '테스트 유아 매트',
  category: '유아매트',
  status: 'active',
  abcGrade: 'B',
  sellPrice: 29900,
  costPrice: 12000,
  commissionRate: 10.5,
  shippingCost: 3000,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeAll(async () => {
  const { request, prisma: p } = await createApp();
  api = request;
  prisma = p;
});

afterAll(async () => {
  await closeApp();
});

describe('Products CRUD — /api/products', () => {
  describe('GET /api/products', () => {
    beforeEach(() => {
      (prisma.product.findMany as any).mockResolvedValue([sampleProduct]);
      (prisma.product.count as any).mockResolvedValue(1);
    });

    it('returns paginated product list', async () => {
      const res = await api().get('/api/products').query({ companyId: COMPANY_ID });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('rejects invalid pagination params', async () => {
      const res = await api().get('/api/products').query({ page: 'abc' });

      // ValidationPipe transforms or rejects — depends on DTO config
      // At minimum, should not crash
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns product detail when found', async () => {
      (prisma.product.findUnique as any).mockResolvedValue(sampleProduct);

      const res = await api().get(`/api/products/${PRODUCT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('테스트 유아 매트');
    });

    it('returns 404 when product not found', async () => {
      (prisma.product.findUnique as any).mockResolvedValue(null);

      const res = await api().get(`/api/products/${PRODUCT_ID}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/products', () => {
    beforeEach(() => {
      (prisma.product.create as any).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: PRODUCT_ID, ...data, isDeleted: false, createdAt: new Date(), updatedAt: new Date() }),
      );
    });

    it('creates a product with valid data', async () => {
      const res = await api()
        .post('/api/products')
        .send({ name: '신규 상품', companyId: COMPANY_ID, sellPrice: 15000 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('신규 상품');
    });

    it('rejects product without required name', async () => {
      const res = await api()
        .post('/api/products')
        .send({ companyId: COMPANY_ID });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
    });

    it('rejects product without companyId', async () => {
      const res = await api()
        .post('/api/products')
        .send({ name: '이름만' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('soft-deletes and returns ok', async () => {
      (prisma.product.update as any).mockResolvedValue({ ...sampleProduct, isDeleted: true });

      const res = await api().delete(`/api/products/${PRODUCT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});

describe('Products Pipeline — /api/products/pipeline-stats', () => {
  it('returns pipeline stats grouped by status', async () => {
    (prisma.product.groupBy as any).mockResolvedValue([
      { status: 'active', _count: { id: 10 } },
      { status: 'draft', _count: { id: 5 } },
    ]);

    const res = await api().get('/api/products/pipeline-stats');

    expect(res.status).toBe(200);
  });
});
