import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { SellpiaMasterProductReadRepositoryAdapter } from './sellpia-master-product-read.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('SellpiaMasterProductReadRepositoryAdapter', () => {
  it('tenant-scopes identifier reads to active physical Sellpia Masters', async () => {
    const findMany = vi.fn().mockResolvedValue([
      stagedMaster('master-1', 'SP-1', 'First'),
      stagedMaster('master-2', 'SP-2', 'Second'),
    ]);
    const repository = new SellpiaMasterProductReadRepositoryAdapter(prismaWith(findMany));

    const rows = await repository.findByCodes(organizationId, ['SP-1', 'SP-2']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        sellpiaProductCode: { in: ['SP-1', 'SP-2'] },
        isActive: true,
        isDeleted: false,
      },
      select: expect.objectContaining({
        id: true,
        sellpiaProductCode: true,
        sellpiaName: true,
        sellpiaBarcode: true,
        currentStock: true,
        purchasePrice: true,
        isActive: true,
      }),
    });
    expect(rows).toEqual([
      expect.objectContaining({ id: 'master-1', code: 'SP-1', name: 'First' }),
      expect.objectContaining({ id: 'master-2', code: 'SP-2', name: 'Second' }),
    ]);
  });

  it('preserves duplicate active barcodes for ambiguity detection', async () => {
    const findMany = vi.fn().mockResolvedValue([
      stagedMaster('master-1', 'SP-1', 'First', 'DUP'),
      stagedMaster('master-2', 'SP-2', 'Second', 'DUP'),
    ]);
    const repository = new SellpiaMasterProductReadRepositoryAdapter(prismaWith(findMany));

    const rows = await repository.findByBarcodes(organizationId, ['DUP']);

    expect(rows.map(({ id }) => id)).toEqual(['master-1', 'master-2']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        sellpiaBarcode: { in: ['DUP'] },
        isActive: true,
      }),
    }));
  });
});

function stagedMaster(
  id: string,
  sellpiaProductCode: string,
  sellpiaName: string,
  sellpiaBarcode: string | null = null,
) {
  return {
    id,
    sellpiaProductCode,
    sellpiaName,
    optionName: null,
    sellpiaBarcode,
    currentStock: 3,
    purchasePrice: 1_500,
    salePrice: 2_500,
    isActive: true,
    lastImportRunId: null,
  };
}

function prismaWith(findMany: ReturnType<typeof vi.fn>): PrismaService {
  return { masterProduct: { findMany } } as unknown as PrismaService;
}
