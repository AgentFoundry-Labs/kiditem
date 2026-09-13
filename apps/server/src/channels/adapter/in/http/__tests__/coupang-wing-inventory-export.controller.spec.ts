import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CoupangWingInventoryExportController } from '../coupang-wing-inventory-export.controller';

describe('CoupangWingInventoryExportController', () => {
  it('exposes one authenticated transient Channels export route', () => {
    expect(Reflect.getMetadata('path', CoupangWingInventoryExportController)).toBe(
      'channels/coupang-wing',
    );
    const method = CoupangWingInventoryExportController.prototype.exportInventory;
    expect(Reflect.getMetadata('path', method)).toBe('inventory-export');
    expect(Reflect.getMetadata('method', method)).toBe(RequestMethod.POST);
  });

  it('uses only submitted rows and returns the server-generated file', () => {
    const conversion = {
      buffer: Buffer.from('server-workbook'),
      fileName: 'wing-inventory_2026-07-31_14.05.xls',
      contentType: 'application/vnd.ms-excel;charset=utf-8' as const,
      rowCount: 2,
      columns: ['등록상품ID'],
    };
    const exporter = { convert: vi.fn().mockReturnValue(conversion) };
    const response = { setHeader: vi.fn() };
    const controller = new CoupangWingInventoryExportController(exporter as never);
    const products = [{ 등록상품ID: 'P-1' }, { 등록상품ID: 'P-2' }];

    const file = controller.exportInventory(
      { products },
      'organization-from-session',
      response as never,
    );

    expect(exporter.convert).toHaveBeenCalledWith(products);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="wing-inventory_2026-07-31_14.05.xls"; filename*=UTF-8\'\'wing-inventory_2026-07-31_14.05.xls',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      conversion.contentType,
    );
    expect(file).toBeDefined();
  });
});
