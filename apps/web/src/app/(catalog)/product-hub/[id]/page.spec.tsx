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

describe('/product-hub/[id] preserved product detail', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: product,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useQuery>);
  });

  it('keeps the legacy detail workflow and section hierarchy around Sellpia facts', () => {
    render(<ProductHubDetailPage />);

    expect(screen.getByRole('button', { name: '워크플로우 실행' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1, name: '동물 친구들 블록' })).toBeInTheDocument();
    for (const heading of [
      '상품 정보',
      '재고 현황',
      '상품 진단',
      '분석 기록',
      '속성',
      '링크',
      'Sellpia 가져오기 출처',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('MasterProduct ID')).toBeInTheDocument();
    expect(screen.getByText('채널 SKU 전체 현황')).toBeInTheDocument();
  });

  it('explains that removed analytics and workflow data are unavailable', () => {
    render(<ProductHubDetailPage />);

    expect(screen.getByText(/워크플로우 실행은 현재 Sellpia 읽기 전용 상품에서 지원하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/진단 데이터가 현재 상품 스냅샷에 포함되지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/분석 기록 데이터가 현재 상품 스냅샷에 포함되지 않습니다/)).toBeInTheDocument();
  });
});
