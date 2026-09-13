import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllSellpiaInventorySkus } from '../../_shared/inventory-api';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import {
  downloadSellpiaInventoryExport,
  fetchAllInventoryForExport,
} from './inventory-export';

vi.mock('../../_shared/inventory-api', () => ({
  fetchAllSellpiaInventorySkus: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw: vi.fn() },
}));

vi.mock('@/lib/browser-download', () => ({
  downloadBlob: vi.fn(),
}));

describe('Sellpia inventory export', () => {
  beforeEach(() => {
    vi.mocked(fetchAllSellpiaInventorySkus).mockReset();
    vi.mocked(fetchAllSellpiaInventorySkus).mockResolvedValue([]);
    vi.mocked(apiClient.fetchRaw).mockReset();
    vi.mocked(downloadBlob).mockReset();
  });

  it('uses the visible search, stock, active, and link filters for every exported page', async () => {
    await fetchAllInventoryForExport({
      query: 'SP-1001',
      stockStatus: 'all',
      activeStatus: 'inactive',
      linkStatus: 'unlinked',
    });

    expect(fetchAllSellpiaInventorySkus).toHaveBeenCalledWith({
      query: 'SP-1001',
      stockStatus: 'all',
      activeStatus: 'inactive',
      linkStatus: 'unlinked',
    });
  });

  it('downloads the server workbook with the visible filters and server filename', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response('xlsx', {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''Sellpia_%ED%98%84%EC%9E%AC%EC%9E%AC%EA%B3%A0.xlsx",
      },
    }));

    await downloadSellpiaInventoryExport({
      query: 'SP-1001',
      stockStatus: 'out_of_stock',
      activeStatus: 'active',
      linkStatus: 'unlinked',
    });

    expect(apiClient.fetchRaw).toHaveBeenCalledWith(
      '/api/inventory/sellpia-skus/export?query=SP-1001&stockStatus=out_of_stock&activeStatus=active&linkStatus=unlinked',
    );
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe('Sellpia_현재재고.xlsx');
  });
});
