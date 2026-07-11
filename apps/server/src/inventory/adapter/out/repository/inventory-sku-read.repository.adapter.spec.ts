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
  currentStock: true,
  purchasePrice: true,
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
    const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      if (hasStringFilter(args.where, 'sellpiaProductCode', 'equals')) {
        return [row('exact', 'SP-1', 'Other', null, null)];
      }
      if (hasStringFilter(args.where, 'sellpiaProductCode', 'startsWith')) {
        return [row('prefix', 'SP-100', 'Other', null, null)];
      }
      if (hasStringFilter(args.where, 'name', 'contains')) {
        return [row('name', 'XXX', 'SP-1 product', null, null)];
      }
      if (hasStringFilter(args.where, 'optionName', 'contains')) {
        return [row('option', 'YYY', 'Other', 'SP-1 option', null)];
      }
      if (hasStringFilter(args.where, 'barcode', 'contains')) {
        return [row('barcode', 'ZZZ', 'Other', null, 'SP-1')];
      }
      return [];
    });
    const repository = new InventorySkuReadRepositoryAdapter(prismaWith(findMany));

    const result = await repository.search(organizationId, 'SP-1', 20);

    expect(findMany).toHaveBeenCalledTimes(5);
    for (const [call] of findMany.mock.calls) {
      expect(call.where).toEqual(expect.objectContaining({ organizationId }));
    }
    expect(result.map(({ id }) => id)).toEqual([
      'exact',
      'prefix',
      'name',
      'option',
      'barcode',
    ]);
  });

  it('does not let an unordered low-priority first page exclude exact and prefix codes', async () => {
    const arbitraryLowPriorityPage = [
      row('name-1', 'ZZ-1', 'SP-1 first', null, null),
      row('name-2', 'ZZ-2', 'SP-1 second', null, null),
    ];
    const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      if (Array.isArray(args.where.OR)) return arbitraryLowPriorityPage;
      if (hasStringFilter(args.where, 'sellpiaProductCode', 'equals')) {
        return [row('exact', 'SP-1', 'Exact', null, null)];
      }
      if (hasStringFilter(args.where, 'sellpiaProductCode', 'startsWith')) {
        return [row('prefix', 'SP-100', 'Prefix', null, null)];
      }
      return arbitraryLowPriorityPage;
    });
    const repository = new InventorySkuReadRepositoryAdapter(prismaWith(findMany));

    const result = await repository.search(organizationId, 'SP-1', 2);

    expect(result.map(({ id }) => id)).toEqual(['exact', 'prefix']);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

function row(
  id: string,
  sellpiaProductCode: string,
  name: string,
  optionName: string | null,
  barcode: string | null,
) {
  return {
    id,
    sellpiaProductCode,
    name,
    optionName,
    barcode,
    currentStock: 0,
    purchasePrice: 1_500,
  };
}

function prismaWith(findMany: ReturnType<typeof vi.fn>): PrismaService {
  return { inventorySku: { findMany } } as unknown as PrismaService;
}

function hasStringFilter(
  where: Record<string, unknown>,
  field: string,
  operator: string,
): boolean {
  const filter = where[field];
  return typeof filter === 'object' && filter !== null && operator in filter;
}
