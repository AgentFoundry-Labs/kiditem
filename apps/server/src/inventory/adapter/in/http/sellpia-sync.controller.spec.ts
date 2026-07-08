import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaSyncController } from './sellpia-sync.controller';
import type { SellpiaSyncPort } from '../../../application/port/in/stock/sellpia-sync.port';

describe('SellpiaSyncController', () => {
  it('uses the shared Sellpia workbook file support label in missing-file errors', () => {
    const controller = new SellpiaSyncController({
      importRows: vi.fn(),
    } as unknown as SellpiaSyncPort);

    expect(() =>
      controller.importWorkbook(
        '00000000-0000-4000-8000-000000000001',
        { id: 'user-1' } as never,
        undefined,
        { effectiveExportedAt: '2026-06-29T00:00:00.000Z' },
      ),
    ).toThrow(new BadRequestException('Sellpia XLS/XLSX/CSV file is required'));
  });
});
