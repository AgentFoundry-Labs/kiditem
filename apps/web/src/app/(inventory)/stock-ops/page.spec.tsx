import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StockOpsPage from './page';

vi.mock('./components/DeadStock', () => ({ default: () => <div>Bottlenecks</div> }));
vi.mock('./components/ZeroItems', () => ({ default: () => <div>SellpiaZero</div> }));
vi.mock('./components/OutOfStock', () => ({ default: () => <div>ChannelZero</div> }));
vi.mock('./components/StockRetention', () => ({ default: () => <div>Value</div> }));
vi.mock('./components/StockTransfers', () => ({ default: () => <div>Transfers</div> }));
vi.mock('./components/ReturnTransfers', () => ({ default: () => <div>Returns</div> }));
vi.mock('./components/MappingAttention', () => ({ default: () => <div>Mapping</div> }));
vi.mock('./components/ImportFreshness', () => ({ default: () => <div>Freshness</div> }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('StockOpsPage', () => {
  it('restores the former inventory analysis screen without the replacement inventory shell', () => {
    render(<StockOpsPage />);

    expect(screen.getByRole('heading', { level: 1, name: '재고 분석' })).toBeInTheDocument();
    expect(screen.queryByText('재고 운영')).not.toBeInTheDocument();
    for (const label of [
      'Sellpia 재고 0',
      '채널 판매 가능 0',
      '구성품 병목',
      '매핑 확인',
      '재고자산',
      '가져오기 상태',
      '창고 이관 기록',
      '반품 기록',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });
});
