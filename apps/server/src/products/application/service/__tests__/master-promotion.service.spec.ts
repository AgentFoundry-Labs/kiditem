import { describe, it, expect, vi } from 'vitest';
import { MasterPromotionService } from '../master-promotion.service';
import type { Prisma } from '@prisma/client';

const ORGANIZATION_ID = 'org-1';
const MASTER_ID = 'master-1';
const MASTER_CODE = 'M-00000001';

/**
 * Unit specs for the products-domain composite that owns sourcing-candidate
 * promotion (issue #192 Phase 3). Mocks the three direct collaborators
 * (PrismaService for `$transaction`, MasterCodeService, OptionsService) and
 * pins:
 *   - MasterCodeService.generate(tx) is the only code issuer.
 *   - master row write sets lifecycleState='active' (Phase 1a additive change).
 *   - sourceImages → tx.masterProductImage.createMany with organizationId +
 *     masterId on every row.
 *   - per-option call goes through OptionsService.create with the outerTx
 *     (so SKU generation runs inside the same transaction).
 *   - empty options / empty sourceImages skip the corresponding writes.
 *   - outerTx is honored (no fresh $transaction when caller already owns one).
 */
function buildTxMock(masterId = MASTER_ID): {
  tx: any;
  masterCreate: ReturnType<typeof vi.fn>;
  imageCreateMany: ReturnType<typeof vi.fn>;
} {
  const masterCreate = vi.fn().mockResolvedValue({ id: masterId });
  const imageCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const tx = {
    masterProduct: { create: masterCreate },
    masterProductImage: { createMany: imageCreateMany },
  };
  return { tx, masterCreate, imageCreateMany };
}

function buildInput(overrides: Partial<{
  options: Array<Record<string, unknown>>;
  sourceImages: Array<Record<string, unknown>>;
}> = {}) {
  return {
    candidateSnapshot: {
      name: 'Toy',
      description: 'A toy description',
      category: 'Toys',
      brand: 'KidsCo',
      tags: ['plastic', 'kids'],
      thumbnailUrl: 'https://example.com/thumb.jpg',
      imageUrl: 'https://example.com/main.jpg',
      sourceImages: overrides.sourceImages ?? [
        {
          url: 'https://example.com/0.jpg',
          storageKey: null,
          sortOrder: 0,
          isPrimary: true,
          source: 'sourcing-extension',
          role: 'product',
          label: null,
        },
        {
          url: 'https://example.com/1.jpg',
          storageKey: 'storage/1.jpg',
          sortOrder: 1,
          isPrimary: false,
          source: 'sourcing-extension',
          role: 'product',
          label: null,
        },
      ],
    },
    options: overrides.options ?? [
      { optionName: 'Red', sortOrder: 0 },
      { optionName: 'Blue', legacyCode: 'LC-2', sortOrder: 1 },
    ],
  } as any;
}

describe('MasterPromotionService.create', () => {
  it('happy path: generates code, creates master, images, and options inside the transaction', async () => {
    const { tx, masterCreate, imageCreateMany } = buildTxMock();
    const prisma = {
      $transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue(MASTER_CODE) };
    const optionsSvc = { create: vi.fn().mockResolvedValue({ id: 'opt' }) };
    const svc = new MasterPromotionService(prisma as any, codeSvc as any, optionsSvc as any);

    const input = buildInput();
    const out = await svc.create(undefined, ORGANIZATION_ID, input);

    // Owned its own $transaction (no outer)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // MasterCodeService.generate called inside the transaction with tx client
    expect(codeSvc.generate).toHaveBeenCalledTimes(1);
    expect(codeSvc.generate).toHaveBeenCalledWith(tx);

    // master row created with lifecycleState='active' + code + organization-scoped
    expect(masterCreate).toHaveBeenCalledTimes(1);
    const createArg = masterCreate.mock.calls[0][0];
    expect(createArg.data.organizationId).toBe(ORGANIZATION_ID);
    expect(createArg.data.code).toBe(MASTER_CODE);
    expect(createArg.data.lifecycleState).toBe('active');
    expect(createArg.data.name).toBe('Toy');
    expect(createArg.data.description).toBe('A toy description');
    expect(createArg.data.category).toBe('Toys');
    expect(createArg.data.brand).toBe('KidsCo');
    expect(createArg.data.tags).toEqual(['plastic', 'kids']);
    expect(createArg.data.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(createArg.data.imageUrl).toBe('https://example.com/main.jpg');

    // image rows: bulk createMany with all rows scoped to org + master
    expect(imageCreateMany).toHaveBeenCalledTimes(1);
    const imageArg = imageCreateMany.mock.calls[0][0];
    expect(imageArg.data).toHaveLength(2);
    for (const row of imageArg.data) {
      expect(row.organizationId).toBe(ORGANIZATION_ID);
      expect(row.masterId).toBe(MASTER_ID);
    }
    expect(imageArg.data[0].url).toBe('https://example.com/0.jpg');
    expect(imageArg.data[0].isPrimary).toBe(true);
    expect(imageArg.data[1].url).toBe('https://example.com/1.jpg');
    expect(imageArg.data[1].isPrimary).toBe(false);
    expect(imageArg.data[1].storageKey).toBe('storage/1.jpg');

    // Options: one OptionsService.create call per option, all sharing tx
    expect(optionsSvc.create).toHaveBeenCalledTimes(2);
    for (const call of optionsSvc.create.mock.calls) {
      expect(call[0]).toBe(ORGANIZATION_ID);
      expect(call[1].masterId).toBe(MASTER_ID);
      // outerTx threaded through
      expect(call[2]).toBe(tx);
    }
    expect(optionsSvc.create.mock.calls[0][1].optionName).toBe('Red');
    expect(optionsSvc.create.mock.calls[1][1].optionName).toBe('Blue');
    expect(optionsSvc.create.mock.calls[1][1].legacyCode).toBe('LC-2');

    expect(out).toEqual({ masterId: MASTER_ID, masterCode: MASTER_CODE });
  });

  it('empty options array: still creates master, no option calls', async () => {
    const { tx, masterCreate, imageCreateMany } = buildTxMock();
    const prisma = {
      $transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue(MASTER_CODE) };
    const optionsSvc = { create: vi.fn() };
    const svc = new MasterPromotionService(prisma as any, codeSvc as any, optionsSvc as any);

    const input = buildInput({ options: [] });
    const result = await svc.create(undefined, ORGANIZATION_ID, input);

    expect(masterCreate).toHaveBeenCalledTimes(1);
    expect(imageCreateMany).toHaveBeenCalledTimes(1);
    expect(optionsSvc.create).not.toHaveBeenCalled();
    expect(result.masterId).toBe(MASTER_ID);
    expect(result.masterCode).toBe(MASTER_CODE);
  });

  it('empty source images: skips masterProductImage.createMany', async () => {
    const { tx, masterCreate, imageCreateMany } = buildTxMock();
    const prisma = {
      $transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue(MASTER_CODE) };
    const optionsSvc = { create: vi.fn().mockResolvedValue({ id: 'opt' }) };
    const svc = new MasterPromotionService(prisma as any, codeSvc as any, optionsSvc as any);

    const input = buildInput({ sourceImages: [] });
    await svc.create(undefined, ORGANIZATION_ID, input);

    expect(masterCreate).toHaveBeenCalledTimes(1);
    expect(imageCreateMany).not.toHaveBeenCalled();
  });

  it('outerTx passed: reuses it instead of prisma.$transaction', async () => {
    const { tx, masterCreate, imageCreateMany } = buildTxMock();
    const prisma = { $transaction: vi.fn() };
    const codeSvc = { generate: vi.fn().mockResolvedValue(MASTER_CODE) };
    const optionsSvc = { create: vi.fn().mockResolvedValue({ id: 'opt' }) };
    const svc = new MasterPromotionService(prisma as any, codeSvc as any, optionsSvc as any);

    const input = buildInput();
    const result = await svc.create(tx as Prisma.TransactionClient, ORGANIZATION_ID, input);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(codeSvc.generate).toHaveBeenCalledWith(tx);
    expect(masterCreate).toHaveBeenCalledTimes(1);
    expect(imageCreateMany).toHaveBeenCalledTimes(1);
    expect(optionsSvc.create).toHaveBeenCalledTimes(2);
    for (const call of optionsSvc.create.mock.calls) {
      expect(call[2]).toBe(tx);
    }
    expect(result).toEqual({ masterId: MASTER_ID, masterCode: MASTER_CODE });
  });
});
