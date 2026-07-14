import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RebuildReadinessBanner from '../RebuildReadinessBanner';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockApiGet },
}));

describe('RebuildReadinessBanner', () => {
  it('shows non-dismissible Sellpia then Wing import guidance while snapshot is required', async () => {
    mockApiGet.mockResolvedValue({
      state: 'snapshot_required',
      target: 'staging',
      requiredImports: ['sellpia', 'wing'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <RebuildReadinessBanner />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('재고 기준 데이터 가져오기가 필요합니다')).toBeInTheDocument();
    expect(screen.getByText(/셀피아 재고를 먼저 가져온 뒤 Wing 상품을 가져오세요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '셀피아 재고 가져오기' }))
      .toHaveAttribute('href', '/inventory-hub?tab=sellpia-sync');
    expect(screen.queryByRole('button', { name: /닫기/ })).not.toBeInTheDocument();
  });
});
