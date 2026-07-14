import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RawDataTab from './RawDataTab';

function renderRawDataTab(rawData: Record<string, unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RawDataTab
        productId="candidate-1"
        rawData={rawData}
        imageUrls={[]}
        thumbnailUrl={null}
      />
    </QueryClientProvider>,
  );
}

describe('RawDataTab', () => {
  it('surfaces nested representative row source fields', () => {
    renderRawDataTab({
      source: 'kiditem-baseline',
      rowNumbers: [1907],
      sourceBarcode: '8806384808919',
      representativeRow: {
        상품명: '쭉쭉붙이는터치등',
        상품코드: '10349-1',
        판매가: 8250,
        재고: 60,
      },
    });

    expect(screen.getAllByText('쭉쭉붙이는터치등').length).toBeGreaterThan(0);
    expect(screen.getByText('상품코드')).toBeInTheDocument();
    expect(screen.getByText('10349-1')).toBeInTheDocument();
    expect(screen.queryByText('기타 원본 데이터')).not.toBeInTheDocument();
    expect(screen.queryByText('sourceBarcode')).not.toBeInTheDocument();
  });

  it('keeps provider raw data read-only', () => {
    renderRawDataTab({ title: '수집 원본' });

    expect(screen.queryByText('원본 데이터 추가')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('항목명 예: 재질')).not.toBeInTheDocument();
  });
});
