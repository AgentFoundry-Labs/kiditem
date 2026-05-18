// apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MastersService } from '../application/service/masters.service';
import { MasterCodeRepositoryAdapter } from '../adapter/out/repository/master-code.repository.adapter';
import { createProductsTestServices } from './products-test-services';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('MastersService integration', () => {
  let prisma: PrismaClient;
  let codeSvc: MasterCodeRepositoryAdapter;
  let svc: MastersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const services = createProductsTestServices(prisma);
    codeSvc = services.codeRepo;
    svc = services.mastersSvc;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a master with auto-generated code', async () => {
    const m = await svc.create(TEST_ORGANIZATION_ID, { name: 'Apple juice bundle' } as any);
    expect(m.code).toMatch(/^M-\d{8}$/);
    expect(m.organizationId).toBe(TEST_ORGANIZATION_ID);
    expect(m.name).toBe('Apple juice bundle');
    expect(m.optionCounter).toBe(0);
  });

  it('lists only own-organization masters (cross-tenant isolation)', async () => {
    await svc.create(TEST_ORGANIZATION_ID, { name: 'A' } as any);
    await svc.create(OTHER_ORGANIZATION_ID, { name: 'B' } as any);
    const { items } = await svc.list(TEST_ORGANIZATION_ID, {});
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('A');
  });

  it('returns 404 for cross-tenant by-code lookup', async () => {
    const other = await svc.create(OTHER_ORGANIZATION_ID, { name: 'X' } as any);
    await expect(svc.findByCode(TEST_ORGANIZATION_ID, other.code)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('soft-deletes and restores', async () => {
    const m = await svc.create(TEST_ORGANIZATION_ID, { name: 'Y' } as any);
    await svc.softDelete(TEST_ORGANIZATION_ID, m.id);
    const after = await svc.findById(TEST_ORGANIZATION_ID, m.id, { includeDeleted: true });
    expect(after.isDeleted).toBe(true);
    expect(after.deletedAt).not.toBeNull();

    await svc.restore(TEST_ORGANIZATION_ID, m.id);
    const restored = await svc.findById(TEST_ORGANIZATION_ID, m.id, {});
    expect(restored.isDeleted).toBe(false);
    expect(restored.deletedAt).toBeNull();
  });

  it('auto-updates healthUpdatedAt when healthScore changes via PATCH', async () => {
    const m = await svc.create(TEST_ORGANIZATION_ID, { name: 'Z' } as any);
    const before = m.healthUpdatedAt;
    const updated = await svc.update(TEST_ORGANIZATION_ID, m.id, { healthScore: 85 } as any);
    expect(updated.healthScore).toBe(85);
    expect(updated.healthUpdatedAt).not.toBe(before);
  });

  it('update returns 404 for another organization master id', async () => {
    const other = await svc.create(OTHER_ORGANIZATION_ID, { name: 'Other organization master' } as any);

    await expect(
      svc.update(TEST_ORGANIZATION_ID, other.id, { name: 'Leaked update' } as any),
    ).rejects.toMatchObject({ status: 404 });

    const unchanged = await svc.findById(OTHER_ORGANIZATION_ID, other.id, {});
    expect(unchanged.name).toBe('Other organization master');
  });

  it('updateImages returns 404 for another organization master id', async () => {
    const other = await svc.create(OTHER_ORGANIZATION_ID, { name: 'Other image master' } as any);

    await expect(
      svc.updateImages(TEST_ORGANIZATION_ID, other.id, [{ url: 'https://cdn.example.test/x.jpg' }]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects restore when duplicate legacyCode is taken', async () => {
    const m1 = await svc.create(TEST_ORGANIZATION_ID, { name: 'L1', legacyCode: 'LC-1' } as any);
    await svc.softDelete(TEST_ORGANIZATION_ID, m1.id);
    await svc.create(TEST_ORGANIZATION_ID, { name: 'L2', legacyCode: 'LC-1' } as any);
    await expect(svc.restore(TEST_ORGANIZATION_ID, m1.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
