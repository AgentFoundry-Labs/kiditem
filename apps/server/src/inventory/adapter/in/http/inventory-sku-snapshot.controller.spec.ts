import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuSnapshotListPort } from '../../../application/port/in/stock/inventory-sku-snapshot-list.port';
import { ListInventorySkusQueryDto } from './dto/list-inventory-skus-query.dto';
import { ListSellpiaImportRunsQueryDto } from './dto/list-sellpia-import-runs-query.dto';
import { InventorySkuSnapshotController } from './inventory-sku-snapshot.controller';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('InventorySkuSnapshotController', () => {
  it('exposes static snapshot and import-history GET routes', () => {
    expect(Reflect.getMetadata('path', InventorySkuSnapshotController)).toBe('inventory');
    expect(route('listSnapshot')).toEqual(['sellpia-skus', RequestMethod.GET]);
    expect(route('getSnapshot')).toEqual([
      'sellpia-skus/:masterProductId',
      RequestMethod.GET,
    ]);
    expect(route('listImportRuns')).toEqual(['sellpia-sync/import-runs', RequestMethod.GET]);
  });

  it('trims snapshot search and validates paging and stock status', async () => {
    const valid = plainToInstance(ListInventorySkusQueryDto, {
      page: '2',
      limit: '200',
      query: '  SP-001  ',
      stockStatus: 'in_stock',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({
      page: 2,
      limit: 200,
      query: 'SP-001',
      stockStatus: 'in_stock',
    });

    const invalid = plainToInstance(ListInventorySkusQueryDto, {
      limit: '201',
      stockStatus: 'low',
    });
    expect(await validate(invalid)).not.toHaveLength(0);

    const history = plainToInstance(ListSellpiaImportRunsQueryDto, {});
    expect(await validate(history)).toEqual([]);
    expect(history).toMatchObject({ page: 1, limit: 50 });
  });

  it('passes only the current organization and validated query to the port', async () => {
    const port = makePort();
    const controller = new InventorySkuSnapshotController(port);
    const snapshotQuery = { page: 1, limit: 50, stockStatus: 'all' as const };
    const historyQuery = { page: 2, limit: 25 };

    await controller.listSnapshot(organizationId, snapshotQuery);
    await controller.getSnapshot(organizationId, 'master-1');
    await controller.listImportRuns(organizationId, historyQuery);

    expect(port.listSnapshot).toHaveBeenCalledWith(organizationId, snapshotQuery);
    expect(port.getSnapshot).toHaveBeenCalledWith(organizationId, 'master-1');
    expect(port.listImportRuns).toHaveBeenCalledWith(organizationId, historyQuery);
  });
});

function route(method: 'listSnapshot' | 'getSnapshot' | 'listImportRuns') {
  const target = InventorySkuSnapshotController.prototype[method];
  return [Reflect.getMetadata('path', target), Reflect.getMetadata('method', target)];
}

function makePort() {
  return {
    listSnapshot: vi
      .fn<InventorySkuSnapshotListPort['listSnapshot']>()
      .mockResolvedValue({} as never),
    getSnapshot: vi
      .fn<InventorySkuSnapshotListPort['getSnapshot']>()
      .mockResolvedValue({} as never),
    listImportRuns: vi
      .fn<InventorySkuSnapshotListPort['listImportRuns']>()
      .mockResolvedValue({} as never),
  };
}
