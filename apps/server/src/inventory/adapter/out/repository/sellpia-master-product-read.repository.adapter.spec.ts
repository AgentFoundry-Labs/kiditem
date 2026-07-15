import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { SellpiaMasterProductReadRepositoryAdapter } from './sellpia-master-product-read.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('SellpiaMasterProductReadRepositoryAdapter', () => {
  it('tenant-scopes exact ID reads without discarding inactive identities', async () => {
    const inactive = {
      ...stagedMaster('master-1', 'SP-1', 'Inactive'),
      currentStock: 0,
      isActive: false,
    };
    const findMany = vi.fn().mockResolvedValue([inactive]);
    const repository = new SellpiaMasterProductReadRepositoryAdapter(prismaWith(findMany));

    const rows = await repository.findByIds(organizationId, ['master-1']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        id: { in: ['master-1'] },
      },
      select: expect.objectContaining({
        id: true,
        currentStock: true,
        isActive: true,
      }),
    });
    expect(rows).toEqual([expect.objectContaining({
      id: 'master-1',
      currentStock: 0,
      isActive: false,
    })]);
  });

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
        code: { in: ['SP-1', 'SP-2'] },
        isActive: true,
      },
      select: expect.objectContaining({
        id: true,
        code: true,
        name: true,
        barcode: true,
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
        barcode: { in: ['DUP'] },
        isActive: true,
      }),
    }));
  });

  it('batch-reads active tenant Masters by the strict normalized-name expression', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      stagedMaster('master-1', 'SP-1', '아기 컵+빨대'),
      stagedMaster('master-2', 'SP-2', '아기컵 + 빨대'),
    ]);
    const repository = new SellpiaMasterProductReadRepositoryAdapter({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const rows = await repository.findByNormalizedNames(
      organizationId,
      ['아기컵+빨대'],
    );

    const statement = queryRaw.mock.calls[0]?.[0];
    expect(statement.text).toContain('FROM master_products');
    expect(statement.text).toContain('organization_id =');
    expect(statement.text).toContain('is_active = true');
    expect(statement.text).toContain('normalize(name, NFKC)');
    expect(statement.text).toContain("'[[:space:]]+'");
    expect(statement.values).toEqual([organizationId, '아기컵+빨대']);
    expect(rows.map(({ id }) => id)).toEqual(['master-1', 'master-2']);
  });

  it('keeps manual search tenant-scoped and active-only', async () => {
    const findMany = vi.fn().mockResolvedValue([
      stagedMaster('master-1', 'SP-1', 'Active result'),
    ]);
    const repository = new SellpiaMasterProductReadRepositoryAdapter(prismaWith(findMany));

    await repository.search(organizationId, 'result', 20);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        isActive: true,
      }),
      take: 20,
    }));
  });
});

function stagedMaster(
  id: string,
  code: string,
  name: string,
  barcode: string | null = null,
) {
  return {
    id,
    code,
    name,
    optionName: null,
    barcode,
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
