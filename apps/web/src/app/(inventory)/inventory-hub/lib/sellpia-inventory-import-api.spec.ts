import { afterEach, describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryImportResponseSchema } from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';
import { importSellpiaInventory } from './sellpia-inventory-import-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importSellpiaInventory', () => {
  it('uploads only the selected file through the typed Sellpia import endpoint', async () => {
    const response = {
      run: {
        id: '00000000-0000-4000-8000-000000000001',
        sourceType: 'sellpia_inventory' as const,
        channelAccountId: null,
        fileName: 'exported-list.xls',
        fileHash: 'a'.repeat(64),
        status: 'completed' as const,
        rowCount: 1964,
        importedAt: '2026-07-11T01:00:00.000Z',
        createdAt: '2026-07-11T01:00:00.000Z',
        updatedAt: '2026-07-11T01:00:00.000Z',
      },
      duplicate: false,
      changes: {
        createdSkuCount: 120,
        updatedSkuCount: 1800,
        zeroedSkuCount: 44,
      },
    };
    const uploadParsed = vi
      .spyOn(apiClient, 'uploadParsed')
      .mockResolvedValueOnce(response);
    const file = new File(['workbook'], 'exported-list.xls', {
      type: 'application/vnd.ms-excel',
    });

    await expect(importSellpiaInventory(file)).resolves.toEqual(response);

    expect(uploadParsed).toHaveBeenCalledWith(
      '/api/inventory/sellpia-sync/import',
      SellpiaInventoryImportResponseSchema,
      expect.any(FormData),
    );
    const form = uploadParsed.mock.calls[0][2];
    expect([...form.entries()]).toEqual([['file', file]]);
    expect(form.has('effectiveExportedAt')).toBe(false);
    expect(form.has('targetCurrentStock')).toBe(false);
    expect(form.has('reason')).toBe(false);
    expect(form.has('organizationId')).toBe(false);
  });
});
