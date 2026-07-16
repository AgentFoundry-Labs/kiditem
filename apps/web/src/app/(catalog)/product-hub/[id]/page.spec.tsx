import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductHubDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

vi.mock('../components/ChannelSkuInventorySummary', () => ({
  ChannelSkuInventorySummary: () => <section>채널 SKU 전체 현황</section>,
}));

const product = {
  masterProductId: '11111111-1111-4111-8111-111111111111',
  code: 'SP-100',
  name: '동물 친구들 블록',
  optionName: '분홍',
  barcode: '8801234567890',
  currentStock: 12,
  purchasePrice: 4000,
  salePrice: 7900,
  isActive: true,
  stockValue: 48000,
  lastImportRunId: '22222222-2222-4222-8222-222222222222',
  lastImportedAt: '2026-07-16T00:00:00.000Z',
};

describe('/product-hub/[id] c9 Sellpia detail', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: product,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useQuery>);
  });

  it('renders the compact Sellpia read-only detail structure', () => {
    render(<ProductHubDetailPage />);

    expect(screen.queryByRole('button', { name: '워크플로우 실행' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '동물 친구들 블록' })).toBeInTheDocument();
    for (const heading of [
      'Sellpia 상품 식별자',
      '현재 재고',
      '가격',
      '동기화 출처',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('MasterProduct ID')).toBeInTheDocument();
    expect(screen.getByText('채널 SKU 전체 현황')).toBeInTheDocument();
  });

  it('does not render removed workflow and analytics placeholders', () => {
    render(<ProductHubDetailPage />);

    expect(screen.queryByText(/워크플로우 실행은/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '상품 진단' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '분석 기록' })).not.toBeInTheDocument();
  });
});
