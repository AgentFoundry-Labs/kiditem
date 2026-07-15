import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellpiaImportHistory from './SellpiaImportHistory';

const listSellpiaImportRuns = vi.hoisted(() => vi.fn());

vi.mock('../../_shared/inventory-api', () => ({
  listSellpiaImportRuns,
  sellpiaImportRunKeyParams: (params: Record<string, number>) => params,
}));

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SellpiaImportHistory />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listSellpiaImportRuns.mockReset();
});

describe('SellpiaImportHistory', () => {
  it('shows completed and failed source runs without inventing stock movements', async () => {
    listSellpiaImportRuns.mockResolvedValue({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          fileName: 'ok.xls',
          status: 'completed',
          rowCount: 1964,
          importedAt: '2026-07-11T01:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          fileName: null,
          status: 'failed',
          rowCount: 0,
          importedAt: null,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });

    renderHistory();

    expect(await screen.findByText('ok.xls')).toBeInTheDocument();
    expect(screen.getByText('다운로드 전 실패')).toBeInTheDocument();
    expect(screen.getByText('완료')).toBeInTheDocument();
    expect(screen.getByText('실패')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정/ })).not.toBeInTheDocument();
  });
});
