import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listSellpiaImportRuns } from '../../_shared/inventory-api';
import SellpiaSyncWorkspace from './SellpiaSyncWorkspace';

vi.mock('../../_shared/inventory-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../_shared/inventory-api')>();
  return { ...actual, listSellpiaImportRuns: vi.fn() };
});

describe('SellpiaSyncWorkspace', () => {
  it('keeps import and completed-file history inside Sellpia 동기화', () => {
    vi.mocked(listSellpiaImportRuns).mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <SellpiaSyncWorkspace />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Sellpia 재고 가져오기')).toBeInTheDocument();
    expect(screen.getByText('Sellpia 가져오기 이력')).toBeInTheDocument();
  });
});
