// apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../adapter/out/prisma/master-code.service';
import { MastersService } from '../application/service/masters.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('MastersService integration', () => {
  let prisma: PrismaClient;
  let codeSvc: MasterCodeService;
  let svc: MastersService;

  // No upload paths exercised in this spec; a typed null stub keeps the
  // constructor signature satisfied without booting MinIO/S3.
  const storageStub = null as unknown as StorageService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    codeSvc = new MasterCodeService(prisma as any);
    svc = new MastersService(prisma as any, codeSvc, storageStub);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a master with auto-generated code', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Apple juice bundle' } as any);
    expect(m.code).toMatch(/^M-\d{8}$/);
    expect(m.companyId).toBe(TEST_COMPANY_ID);
    expect(m.name).toBe('Apple juice bundle');
    expect(m.optionCounter).toBe(0);
  });

  it('lists only own-company masters (cross-tenant isolation)', async () => {
    await svc.create(TEST_COMPANY_ID, { name: 'A' } as any);
    await svc.create(OTHER_COMPANY_ID, { name: 'B' } as any);
    const { items } = await svc.list(TEST_COMPANY_ID, {});
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('A');
  });

  it('returns 404 for cross-tenant by-code lookup', async () => {
    const other = await svc.create(OTHER_COMPANY_ID, { name: 'X' } as any);
    await expect(svc.findByCode(TEST_COMPANY_ID, other.code)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('soft-deletes and restores', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Y' } as any);
    await svc.softDelete(TEST_COMPANY_ID, m.id);
    const after = await svc.findById(TEST_COMPANY_ID, m.id, { includeDeleted: true });
    expect(after.isDeleted).toBe(true);
    expect(after.deletedAt).not.toBeNull();

    await svc.restore(TEST_COMPANY_ID, m.id);
    const restored = await svc.findById(TEST_COMPANY_ID, m.id, {});
    expect(restored.isDeleted).toBe(false);
    expect(restored.deletedAt).toBeNull();
  });

  it('auto-updates healthUpdatedAt when healthScore changes via PATCH', async () => {
    const m = await svc.create(TEST_COMPANY_ID, { name: 'Z' } as any);
    const before = m.healthUpdatedAt;
    const updated = await svc.update(TEST_COMPANY_ID, m.id, { healthScore: 85 } as any);
    expect(updated.healthScore).toBe(85);
    expect(updated.healthUpdatedAt).not.toBe(before);
  });

  it('update returns 404 for another company master id', async () => {
    const other = await svc.create(OTHER_COMPANY_ID, { name: 'Other company master' } as any);

    await expect(
      svc.update(TEST_COMPANY_ID, other.id, { name: 'Leaked update' } as any),
    ).rejects.toMatchObject({ status: 404 });

    const unchanged = await svc.findById(OTHER_COMPANY_ID, other.id, {});
    expect(unchanged.name).toBe('Other company master');
  });

  it('updateImages returns 404 for another company master id', async () => {
    const other = await svc.create(OTHER_COMPANY_ID, { name: 'Other image master' } as any);

    await expect(
      svc.updateImages(TEST_COMPANY_ID, other.id, [{ url: 'https://cdn.example.test/x.jpg' }]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when create references a supplier from another company', async () => {
    const otherSupplier = await prisma.supplier.create({
      data: { companyId: OTHER_COMPANY_ID, name: 'Other co supplier' },
    });
    await expect(
      svc.create(TEST_COMPANY_ID, { name: 'W', supplierId: otherSupplier.id } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when update references a supplier from another company', async () => {
    const master = await svc.create(TEST_COMPANY_ID, { name: 'Own master' } as any);
    const otherSupplier = await prisma.supplier.create({
      data: { companyId: OTHER_COMPANY_ID, name: 'Other co supplier' },
    });

    await expect(
      svc.update(TEST_COMPANY_ID, master.id, { supplierId: otherSupplier.id } as any),
    ).rejects.toMatchObject({ status: 404 });

    const unchanged = await svc.findById(TEST_COMPANY_ID, master.id, {});
    expect(unchanged.supplierId).toBeNull();
  });

  it('returns 404 when update references a missing supplier', async () => {
    const master = await svc.create(TEST_COMPANY_ID, { name: 'Own master' } as any);

    await expect(
      svc.update(
        TEST_COMPANY_ID,
        master.id,
        { supplierId: '00000000-0000-0000-0000-000000000404' } as any,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects restore when duplicate legacyCode is taken', async () => {
    const m1 = await svc.create(TEST_COMPANY_ID, { name: 'L1', legacyCode: 'LC-1' } as any);
    await svc.softDelete(TEST_COMPANY_ID, m1.id);
    await svc.create(TEST_COMPANY_ID, { name: 'L2', legacyCode: 'LC-1' } as any);
    await expect(svc.restore(TEST_COMPANY_ID, m1.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
