import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const listSellpiaImportRuns = vi.hoisted(() => vi.fn());
vi.mock('../../_shared/inventory-api', () => ({
  listSellpiaImportRuns,
  sellpiaImportRunKeyParams: (params: Record<string, number>) => params,
}));

import ImportFreshness from './ImportFreshness';

describe('ImportFreshness', () => {
  it('labels a pre-download failure instead of assuming file details exist', async () => {
    listSellpiaImportRuns.mockResolvedValue({
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        fileName: null,
        fileHash: null,
        status: 'failed',
        rowCount: 0,
        importedAt: null,
        updatedAt: '2026-07-16T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      limit: 20,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ImportFreshness />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('다운로드 전 실패')).toBeInTheDocument();
  });
});
