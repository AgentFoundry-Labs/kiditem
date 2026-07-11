// apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MastersService } from '../application/service/masters.service';
import { OptionsService } from '../application/service/options.service';
import { BundleComponentsService } from '../application/service/bundle-components.service';
import { createProductsTestServices } from './products-test-services';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('BundleComponentsService integration', () => {
  let prisma: PrismaClient;
  let mastersSvc: MastersService;
  let optionsSvc: OptionsService;
  let svc: BundleComponentsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const services = createProductsTestServices(prisma);
    mastersSvc = services.mastersSvc;
    optionsSvc = services.optionsSvc;
    svc = services.bundleComponentsSvc;
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  async function setup(organizationId: string) {
    const m = await mastersSvc.create(organizationId, { name: 'M' } as any);
    const bundle = await optionsSvc.create(organizationId, {
      masterId: m.id, optionName: 'Bundle', isBundle: true,
    } as any);
    const comp = await optionsSvc.create(organizationId, {
      masterId: m.id, optionName: 'Comp',
    } as any);
    return { master: m, bundle, comp };
  }

  it('creates and lists a bundle component recipe', async () => {
    const { bundle, comp } = await setup(TEST_ORGANIZATION_ID);
    const bc = await svc.create(TEST_ORGANIZATION_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    expect(bc.organizationId).toBe(TEST_ORGANIZATION_ID);
    await expect(svc.list(TEST_ORGANIZATION_ID, { bundleOptionId: bundle.id }))
      .resolves.toEqual([expect.objectContaining({ id: bc.id, qty: 2 })]);
  });

  it('rejects when bundleOption.isBundle=false', async () => {
    const m = await mastersSvc.create(TEST_ORGANIZATION_ID, { name: 'M' } as any);
    const notBundle = await optionsSvc.create(TEST_ORGANIZATION_ID, { masterId: m.id, optionName: 'X' } as any);
    const comp = await optionsSvc.create(TEST_ORGANIZATION_ID, { masterId: m.id, optionName: 'Y' } as any);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: notBundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects nested bundle (component.isBundle=true)', async () => {
    const m = await mastersSvc.create(TEST_ORGANIZATION_ID, { name: 'M' } as any);
    const b1 = await optionsSvc.create(TEST_ORGANIZATION_ID, {
      masterId: m.id, optionName: 'B1', isBundle: true,
    } as any);
    const b2 = await optionsSvc.create(TEST_ORGANIZATION_ID, {
      masterId: m.id, optionName: 'B2', isBundle: true,
    } as any);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: b1.id, componentOptionId: b2.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects cross-organization component', async () => {
    const { bundle } = await setup(TEST_ORGANIZATION_ID);
    const other = await setup(OTHER_ORGANIZATION_ID);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: bundle.id, componentOptionId: other.comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects cross-organization bundle option as not found', async () => {
    const { comp } = await setup(TEST_ORGANIZATION_ID);
    const other = await setup(OTHER_ORGANIZATION_ID);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: other.bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects self reference', async () => {
    const { bundle } = await setup(TEST_ORGANIZATION_ID);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: bundle.id, componentOptionId: bundle.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects when bundleOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_ORGANIZATION_ID);
    await optionsSvc.softDelete(TEST_ORGANIZATION_ID, bundle.id);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects when componentOption is soft-deleted', async () => {
    const { bundle, comp } = await setup(TEST_ORGANIZATION_ID);
    await optionsSvc.softDelete(TEST_ORGANIZATION_ID, comp.id);
    await expect(
      svc.create(TEST_ORGANIZATION_ID, {
        bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates recipe quantity', async () => {
    const { bundle, comp } = await setup(TEST_ORGANIZATION_ID);
    const bc = await svc.create(TEST_ORGANIZATION_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    const updated = await svc.update(TEST_ORGANIZATION_ID, bc.id, { qty: 5 });
    expect(updated.qty).toBe(5);
  });

  it('hard-deletes a recipe row', async () => {
    const { bundle, comp } = await setup(TEST_ORGANIZATION_ID);
    const bc = await svc.create(TEST_ORGANIZATION_ID, {
      bundleOptionId: bundle.id, componentOptionId: comp.id, qty: 2,
    });
    await svc.delete(TEST_ORGANIZATION_ID, bc.id);
    await expect(svc.list(TEST_ORGANIZATION_ID, { bundleOptionId: bundle.id }))
      .resolves.toEqual([]);
  });

  it('serializes concurrent recipe additions for one bundle', async () => {
    const { bundle, comp: c1 } = await setup(TEST_ORGANIZATION_ID);
    const m2 = await mastersSvc.create(TEST_ORGANIZATION_ID, { name: 'N' } as any);
    const c2 = await optionsSvc.create(TEST_ORGANIZATION_ID, { masterId: m2.id, optionName: 'C2' } as any);
    await Promise.all([
      svc.create(TEST_ORGANIZATION_ID, { bundleOptionId: bundle.id, componentOptionId: c1.id, qty: 2 }),
      svc.create(TEST_ORGANIZATION_ID, { bundleOptionId: bundle.id, componentOptionId: c2.id, qty: 3 }),
    ]);
    await expect(svc.list(TEST_ORGANIZATION_ID, { bundleOptionId: bundle.id }))
      .resolves.toHaveLength(2);
  });
});
