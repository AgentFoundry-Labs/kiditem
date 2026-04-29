// apps/server/src/products/__tests__/options.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MasterCodeService } from '../services/master-code.service';
import { MastersService } from '../services/masters.service';
import { BundleStockService } from '../services/bundle-stock.service';
import { OptionsService } from '../services/options.service';
import {
  makeTestPrisma, resetDb, seedBaseFixture, TEST_COMPANY_ID, OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('OptionsService integration', () => {
  let prisma: PrismaClient;
  let mastersSvc: MastersService;
  let bundleStockSvc: BundleStockService;
  let svc: OptionsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const codeSvc = new MasterCodeService(prisma as any);
    mastersSvc = new MastersService(prisma as any, codeSvc);
    bundleStockSvc = new BundleStockService(prisma as any);
    svc = new OptionsService(prisma as any, bundleStockSvc);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates an option with auto-generated sku', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M1' } as any);
    const opt = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Red' } as any);
    expect(opt.sku).toBe(`${m.code}-01`);
    expect(opt.availableStock).toBeNull();
    expect(opt.isBundle).toBe(false);
  });

  it('increments counter for subsequent options', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M2' } as any);
    const o1 = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'A' } as any);
    const o2 = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'B' } as any);
    expect(o1.sku).toBe(`${m.code}-01`);
    expect(o2.sku).toBe(`${m.code}-02`);
  });

  it('fails option creation on soft-deleted master (TOCTOU guarded)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M3' } as any);
    await mastersSvc.softDelete(TEST_COMPANY_ID, m.id);
    await expect(
      svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'X' } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('enforces partial-unique index for null optionName (single-option)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M4' } as any);
    await svc.create(TEST_COMPANY_ID, { masterId: m.id } as any);
    await expect(
      svc.create(TEST_COMPANY_ID, { masterId: m.id } as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('race: 10 concurrent creates → 10 distinct sku with no collisions (gaps allowed)', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M5' } as any);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }).map((_, i) =>
        svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: `Opt-${i}` } as any),
      ),
    );
    const fulfilled = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);
    expect(fulfilled.length).toBe(10);
    const skus = new Set(fulfilled.map(o => o.sku));
    expect(skus.size).toBe(10);
  });

  it('searches by seller product code legacyCode', async () => {
    const master = await mastersSvc.create(TEST_COMPANY_ID, { name: 'Legacy Search Master' } as any);
    const match = await svc.create(TEST_COMPANY_ID, {
      masterId: master.id,
      optionName: 'Legacy Search Match',
      legacyCode: '10349-1',
    } as any);
    await svc.create(TEST_COMPANY_ID, {
      masterId: master.id,
      optionName: 'Other Option',
      legacyCode: '10349-2',
    } as any);

    const { items } = await svc.list(TEST_COMPANY_ID, { search: '10349-1', limit: 10 } as any);

    expect(items.map((item) => item.id)).toEqual([match.id]);
  });

  it('does not search option-management rows by barcode data', async () => {
    const master = await mastersSvc.create(TEST_COMPANY_ID, { name: 'Barcode Boundary Master' } as any);
    const barcode = '8801234567890';
    await svc.create(TEST_COMPANY_ID, {
      masterId: master.id,
      optionName: 'Blue / S',
      legacyCode: '10349-1',
      barcode,
    } as any);

    const { items } = await svc.list(TEST_COMPANY_ID, { search: barcode, limit: 10 } as any);

    expect(items).toEqual([]);
  });

  it('prevents isBundle flip true → false when BundleComponent rows exist', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M6' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'Bundle', isBundle: true,
    } as any);
    const comp = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'Comp' } as any);
    await prisma.bundleComponent.create({
      data: {
        bundleOptionId: bundle.id,
        componentOptionId: comp.id,
        companyId: TEST_COMPANY_ID,
        qty: 1,
      },
    });
    await expect(
      svc.update(TEST_COMPANY_ID, bundle.id, { isBundle: false } as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects re-parenting: PATCH with masterId of another master is ignored', async () => {
    const m1 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'A' } as any);
    const m2 = await mastersSvc.create(TEST_COMPANY_ID, { name: 'B' } as any);
    const opt = await svc.create(TEST_COMPANY_ID, { masterId: m1.id, optionName: 'X' } as any);
    const updated = await svc.update(TEST_COMPANY_ID, opt.id, { masterId: m2.id } as any);
    expect(updated.masterId).toBe(m1.id); // NOT reassigned
  });

  it('update returns 404 for another company option id', async () => {
    const otherMaster = await mastersSvc.create(OTHER_COMPANY_ID, { name: 'Other master' } as any);
    const otherOpt = await svc.create(OTHER_COMPANY_ID, {
      masterId: otherMaster.id,
      optionName: 'Other option',
    } as any);

    await expect(
      svc.update(TEST_COMPANY_ID, otherOpt.id, { optionName: 'Leaked update' } as any),
    ).rejects.toMatchObject({ status: 404 });

    const unchanged = await svc.findById(OTHER_COMPANY_ID, otherOpt.id, {});
    expect(unchanged.optionName).toBe('Other option');
  });

  it('triggers recompute on bundles when component option is soft-deleted', async () => {
    const m = await mastersSvc.create(TEST_COMPANY_ID, { name: 'M7' } as any);
    const bundle = await svc.create(TEST_COMPANY_ID, {
      masterId: m.id, optionName: 'B', isBundle: true,
    } as any);
    const comp = await svc.create(TEST_COMPANY_ID, { masterId: m.id, optionName: 'C' } as any);
    await prisma.inventory.create({
      data: { companyId: TEST_COMPANY_ID, optionId: comp.id, currentStock: 10 },
    });
    await prisma.bundleComponent.create({
      data: {
        bundleOptionId: bundle.id,
        componentOptionId: comp.id,
        companyId: TEST_COMPANY_ID,
        qty: 2,
      },
    });
    await bundleStockSvc.recompute(TEST_COMPANY_ID, bundle.id);
    const before = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(before.availableStock).toBe(5);

    await svc.softDelete(TEST_COMPANY_ID, comp.id);
    const after = await prisma.productOption.findUniqueOrThrow({ where: { id: bundle.id } });
    expect(after.availableStock).toBe(0);
  });
});
