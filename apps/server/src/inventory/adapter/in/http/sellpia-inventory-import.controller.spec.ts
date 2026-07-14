import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { SellpiaInventoryImportController } from './sellpia-inventory-import.controller';
import type { SellpiaInventoryImportPort } from '../../../application/port/in/stock/sellpia-inventory-import.port';

describe('SellpiaInventoryImportController', () => {
  it('exposes exactly POST inventory/sellpia-sync/import', () => {
    expect(Reflect.getMetadata('path', SellpiaInventoryImportController)).toBe(
      'inventory/sellpia-sync',
    );
    const methods = Object.getOwnPropertyNames(SellpiaInventoryImportController.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual(['importWorkbook']);
    expect(Reflect.getMetadata('path', SellpiaInventoryImportController.prototype.importWorkbook))
      .toBe('import');
    expect(Reflect.getMetadata('method', SellpiaInventoryImportController.prototype.importWorkbook))
      .toBe(RequestMethod.POST);
  });

  it('rejects a missing workbook with HTTP 400', () => {
    const controller = new SellpiaInventoryImportController(makePort());

    expect(() => controller.importWorkbook(
      '00000000-0000-4000-8000-000000000001',
      { id: '00000000-0000-4000-8000-000000000002' } as never,
      undefined,
    )).toThrow(BadRequestException);
  });

  it('parses the original buffer, computes lowercase SHA-256, and passes current tenant/user without exportedAt', async () => {
    const port = makePort();
    const controller = new SellpiaInventoryImportController(port);
    const buffer = workbookBuffer([
      ['상품코드', '상품명', '재고'],
      ['SP-001', '상품', 5],
    ]);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const userId = '00000000-0000-4000-8000-000000000002';

    await controller.importWorkbook(
      organizationId,
      { id: userId } as never,
      { buffer, originalname: 'SELLPIA.XLS' },
    );

    expect(port.importInventory).toHaveBeenCalledWith({
      organizationId,
      userId,
      fileName: 'SELLPIA.XLS',
      fileHash: createHash('sha256').update(buffer).digest('hex'),
      headers: ['상품코드', '상품명', '재고'],
      rows: [expect.objectContaining({
        rowNumber: 2,
        sellpiaProductCode: 'SP-001',
        currentStock: 5,
      })],
    });
    const passed = port.importInventory.mock.calls[0]?.[0];
    expect(passed).not.toHaveProperty('effectiveExportedAt');
    expect(passed?.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('caps the multer file interceptor at 10 MiB', () => {
    const source = readFileSync(__filename.replace(/\.spec\.ts$/, '.ts'), 'utf8');
    expect(source).toContain("FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })");
  });
});

function makePort() {
  return {
    importInventory: vi
      .fn<SellpiaInventoryImportPort['importInventory']>()
      .mockResolvedValue({} as never),
  };
}

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}
