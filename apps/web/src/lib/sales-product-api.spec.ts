import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { salesProductApi } from '@/lib/sales-product-api';
import type { SabangnetImportPreview, SabangnetImportSelection } from '@kiditem/shared/sales-product';

vi.mock('@/lib/api-client', () => ({
  apiClient: { uploadParsed: vi.fn() },
}));

const preview = {} as SabangnetImportPreview;
const file = new File(['workbook'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('salesProductApi.importSabangnet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends selected existing product ids with the preview versions', async () => {
    const selections: SabangnetImportSelection = [{
      salesProductId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 4,
    }];
    vi.mocked(apiClient.uploadParsed).mockResolvedValue(preview);

    await expect(salesProductApi.importSabangnet([file], false, selections)).resolves.toBe(preview);

    const [path, , form] = vi.mocked(apiClient.uploadParsed).mock.calls[0]!;
    const query = new URLSearchParams({
      dryRun: 'false',
      applyExisting: JSON.stringify(selections),
    });
    expect(path).toBe(`/api/products/sales-products/imports/sabangnet?${query.toString()}`);
    expect(form.get('files')).toBe(file);
  });

  it('sends an empty selection for the default new-product import', async () => {
    vi.mocked(apiClient.uploadParsed).mockResolvedValue(preview);

    await salesProductApi.importSabangnet([file], true);

    const [path] = vi.mocked(apiClient.uploadParsed).mock.calls[0]!;
    const query = new URLSearchParams({ dryRun: 'true', applyExisting: '[]' });
    expect(path).toBe(`/api/products/sales-products/imports/sabangnet?${query.toString()}`);
  });
});
