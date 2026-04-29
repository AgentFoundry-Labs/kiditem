// apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
import { BundleStockService } from '../services/bundle-stock.service';
import { BundleComponentsService } from '../services/bundle-components.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('BundleComponentsService integration', () => {
  let prisma: PrismaClient;
  let mastersSvc: MastersService;
  let optionsSvc: OptionsService;
  let bundleStockSvc: BundleStockService;
  let svc: BundleComponentsService;

  // No upload paths exercised in this spec; a typed null stub keeps the
  // MastersService constructor signature satisfied without booting MinIO/S3.
  const storageStub = null as unknown as StorageService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const codeSvc = new MasterCodeService(prisma as any);
    mastersSvc = new MastersService(prisma as any, codeSvc, storageStub);
    bundleStockSvc = new BundleStockService(prisma as any);
    optionsSvc = new OptionsService(prisma as any, bundleStockSvc);
    svc = new BundleComponentsService(prisma as any, bundleStockSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  async function setup(companyId: string) {
    const m = await mastersSvc.create(companyId, { name: 'M' } as any);
    const bundle = await optionsSvc.create(companyId, {
      masterId: m.id, optionName: 'Bundle', isBundle: true,
    } as any);
    const comp = await optionsSvc.create(companyId, {
      masterId: m.id, optionName: 'Comp',
    } as any);
    return { master: m, bundle, comp };
  }

  it('creates a bundle component and triggers recompute', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    expect(bc.companyId).toBe(TEST_COMPANY_ID);
    const updated = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(updated.availableStock).toBe(10);
  });

  it('rejects when bundleOption.isBundle=false', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const notBundle = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'X' } as any);
    const comp = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Y' } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: notBundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects nested bundle (component.isBundle=true)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M' } as any);
    const b1 = await optionsSvc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B1', isBundle: true,
    } as any);
    const b2 = await optionsSvc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B2', isBundle: true,
    } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: b1.id, componentOptionId: b2.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects cross-company component', async () => {
    const { bundle } = await setup(TEST_COMPANY_ID);
    const other = await setup(OTHER_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: other.comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects cross-company bundle option as not found', async () => {
    const { comp } = await setup(TEST_COMPANY_ID);
    const other = await setup(OTHER_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: other.bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects self reference', async () => {
    const { bundle } = await setup(TEST_COMPANY_ID);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: bundle.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects when bundleOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await optionsSvc.softDelete(TEST_COMPANY_ID, bundle.id);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects when componentOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await optionsSvc.softDelete(TEST_COMPANY_ID, comp.id);
    await expect(
      svc.create(TEST_COMPANY_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates qty and re-recomputes', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.update(TEST_COMPANY_ID, bc.id, { qty: 5 });
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(4);
  });

  it('hard-deletes and re-recomputes', async () => {
    const { bundle, comp } = await setup(TEST_COMPANY_ID);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 20 },
    });
    const bc = await svc.create(TEST_COMPANY_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.delete(TEST_COMPANY_ID, bc.id);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(0);
  });

  it('concurrent recompute — final availableStock deterministic', async () => {
    const { bundle, comp: c1 } = await setup(TEST_COMPANY_ID);
    const m2 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'N' } as any);
    const c2 = await optionsSvc.create(TEST_COMPANY_ID, { masterId: m2.id, optionName: 'C2' } as any);
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c1.id, currentStock: 20 } });
    await prisma.inventory.create({ data: { companyId: TEST_COMPANY_ID, optionId: c2.id, currentStock: 30 } });
    await Promise.all([
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c1.id, qty: 2 }),
      svc.create(TEST_COMPANY_ID, { bundleOptionId: bundle.id, componentOptionId: c2.id, qty: 3 }),
    ]);
    const bundleAfter = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(bundleAfter.availableStock).toBe(10);
  });
});
