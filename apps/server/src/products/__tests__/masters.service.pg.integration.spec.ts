// apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MastersService } from '../application/service/masters.service';
import { MasterCodeRepositoryAdapter } from '../adapter/out/repository/master-code.repository.adapter';
import { MastersController } from '../adapter/in/http/masters.controller';
import { createProductsTestServices } from './products-test-services';
import {
  makeTestPrisma, resetDb, seedBaseFixture,
  TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('MastersService integration', () => {
  let prisma: PrismaClient;
  let codeSvc: MasterCodeRepositoryAdapter;
  let svc: MastersService;
  let controller: MastersController;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const services = createProductsTestServices(prisma);
    codeSvc = services.codeRepo;
    svc = services.mastersSvc;
    controller = new MastersController(
      services.mastersSvc,
      services.optionsSvc,
      {} as never,
    );
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

  it('keeps staged physical identities out of ordinary controller reads without hiding legacy temporary families', async () => {
    const legacyFamily = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'M-LEGACY-TEMP',
        name: 'Legacy temporary family',
        isTemporary: true,
        temporaryReason: 'sourcing_candidate',
        lifecycleState: 'active',
      },
    });
    const staged = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-STAGED',
        name: 'Sellpia staged identity',
        sellpiaProductCode: 'SP-STAGED',
        isTemporary: true,
        temporaryReason: 'sellpia_master_cutover',
        lifecycleState: 'inventory_staged',
      },
    });
    await prisma.masterProduct.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'M-CUTOVER-MARKER',
          name: 'Cutover marker only',
          temporaryReason: 'sellpia_master_cutover',
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'M-STAGED-LIFECYCLE',
          name: 'Staged lifecycle only',
          lifecycleState: 'inventory_staged',
        },
      ],
    });

    const listed = await controller.list(TEST_ORGANIZATION_ID, {});

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ id: legacyFamily.id, name: 'Legacy temporary family' });
    await expect(controller.findById(TEST_ORGANIZATION_ID, staged.id, 'true'))
      .rejects.toMatchObject({ status: 404 });
    await expect(controller.findByCode(TEST_ORGANIZATION_ID, staged.code))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rejects ordinary update and delete commands for a staged physical identity', async () => {
    const staged = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-MUTATION',
        name: 'Original Sellpia name',
        sellpiaProductCode: 'SP-MUTATION',
        isTemporary: true,
        temporaryReason: 'sellpia_master_cutover',
        lifecycleState: 'inventory_staged',
      },
    });

    await expect(controller.update(
      TEST_ORGANIZATION_ID,
      staged.id,
      { name: 'Forbidden edit' },
    )).rejects.toMatchObject({ status: 404 });
    await expect(controller.softDelete(TEST_ORGANIZATION_ID, staged.id))
      .rejects.toMatchObject({ status: 404 });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: staged.id } }))
      .toMatchObject({ name: 'Original Sellpia name', isDeleted: false, deletedAt: null });
  });

  it('rejects ordinary restore for a soft-deleted staged physical identity', async () => {
    const staged = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SELLPIA-RESTORE',
        name: 'Deleted staged identity',
        sellpiaProductCode: 'SP-RESTORE',
        isTemporary: true,
        temporaryReason: 'sellpia_master_cutover',
        lifecycleState: 'inventory_staged',
        isDeleted: true,
        deletedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });

    await expect(controller.restore(TEST_ORGANIZATION_ID, staged.id))
      .rejects.toMatchObject({ status: 404 });
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: staged.id } })).isDeleted)
      .toBe(true);
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
