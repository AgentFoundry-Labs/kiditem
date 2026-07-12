import { describe, expect, it, vi } from 'vitest';
import { MasterProductRepositoryAdapter } from '../master-product.repository.adapter';
import { findMasterById, findMasterListPage } from '../master-product.query';
import { incrementMasterOptionCounter } from '../product-option.persistence';
import { ProductManagementRepositoryAdapter } from '../product-management.repository.adapter';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../../common/legacy-family-master-scope';

const PRODUCTS_MASTER_SCOPE = LEGACY_FAMILY_MASTER_SCOPE;

describe('products-owned MasterProduct scope', () => {
  it('applies the physical-identity exclusion to list and id reads', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await findMasterListPage(prisma as never, 'organization-1', {
      search: 'search must not replace the ownership scope',
    });
    await findMasterById(prisma as never, 'organization-1', 'master-1', {
      includeDeleted: true,
    });

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
  });

  it('applies the same exclusion to delete and restore writes', async () => {
    const prisma = {
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new MasterProductRepositoryAdapter(prisma as never);

    await repository.softDelete('organization-1', 'master-1');
    await repository.restore('organization-1', 'master-2');

    expect(prisma.masterProduct.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
    expect(prisma.masterProduct.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
  });

  it('applies the exclusion before incrementing a Master for option creation', async () => {
    const tx = {
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({
          code: 'M-00000001',
          optionCounter: 1,
        }),
      },
    };

    await incrementMasterOptionCounter(
      tx as never,
      'organization-1',
      'master-1',
    );

    expect(tx.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
  });

  it('applies the exclusion to product-management grade reads and writes', async () => {
    const transactionClient = {
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      alert: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    };
    const repository = new ProductManagementRepositoryAdapter(prisma as never);

    await repository.findGradeMasterRows('organization-1');
    await repository.findStoredGradeMasters('organization-1', ['master-1']);
    await repository.updateStoredGrade({
      organizationId: 'organization-1',
      masterId: 'master-1',
      currentGrade: 'B',
      nextGrade: 'A',
    });
    await repository.updateStoredGradeAndAlert({
      organizationId: 'organization-1',
      masterId: 'master-1',
      masterName: 'Master',
      currentGrade: 'B',
      nextGrade: 'A',
      severity: 'info',
    });

    for (const [call] of prisma.masterProduct.findMany.mock.calls) {
      expect(call.where).toEqual(expect.objectContaining(PRODUCTS_MASTER_SCOPE));
    }
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
    expect(transactionClient.masterProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(PRODUCTS_MASTER_SCOPE),
      }),
    );
  });
});
