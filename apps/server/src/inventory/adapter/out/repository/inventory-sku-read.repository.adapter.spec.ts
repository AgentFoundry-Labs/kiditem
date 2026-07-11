import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { InventorySkuReadRepositoryAdapter } from './inventory-sku-read.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const select = {
  id: true,
  sellpiaProductCode: true,
  name: true,
  optionName: true,
  barcode: true,
  reportedStock: true,
};

describe('InventorySkuReadRepositoryAdapter', () => {
  it('tenant-scopes every direct identifier read and preserves duplicate barcodes', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
      row('1', 'SP-1', 'First', null, '8801234567890'),
      row('2', 'SP-2', 'Second', null, '8801234567890'),
    ]);
    const repository = new InventorySkuReadRepositoryAdapter(prismaWith(findMany));

    await repository.findByIds(organizationId, ['id-1']);
    await repository.findBySellpiaCodes(organizationId, ['001-ABC']);
    const duplicateBarcodeRows = await repository.findByBarcodes(
      organizationId,
      ['8801234567890'],
    );

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { organizationId, id: { in: ['id-1'] } },
      select,
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { organizationId, sellpiaProductCode: { in: ['001-ABC'] } },
      select,
    });
    expect(findMany).toHaveBeenNthCalledWith(3, {
      where: { organizationId, barcode: { in: ['8801234567890'] } },
      select,
    });
    expect(duplicateBarcodeRows.map(({ id }) => id)).toEqual(['1', '2']);
  });

  it('sorts exact code before prefix code, name, option, and barcode matches', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row('barcode', 'ZZZ', 'Other', null, 'SP-1'),
      row('option', 'YYY', 'Other', 'SP-1 option', null),
      row('name', 'XXX', 'SP-1 product', null, null),
      row('prefix', 'SP-100', 'Other', null, null),
      row('exact', 'SP-1', 'Other', null, null),
    ]);
    const repository = new InventorySkuReadRepositoryAdapter(prismaWith(findMany));

    const result = await repository.search(organizationId, 'SP-1', 20);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        OR: [
          { sellpiaProductCode: { contains: 'SP-1', mode: 'insensitive' } },
          { name: { contains: 'SP-1', mode: 'insensitive' } },
          { optionName: { contains: 'SP-1', mode: 'insensitive' } },
          { barcode: { contains: 'SP-1', mode: 'insensitive' } },
        ],
      },
      select,
      take: 20,
    });
    expect(result.map(({ id }) => id)).toEqual([
      'exact',
      'prefix',
      'name',
      'option',
      'barcode',
    ]);
  });
});

function row(
  id: string,
  sellpiaProductCode: string,
  name: string,
  optionName: string | null,
  barcode: string | null,
) {
  return { id, sellpiaProductCode, name, optionName, barcode, reportedStock: 0 };
}

function prismaWith(findMany: ReturnType<typeof vi.fn>): PrismaService {
  return { inventorySku: { findMany } } as unknown as PrismaService;
}
