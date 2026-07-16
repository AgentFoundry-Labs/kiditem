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
vi.mock('./components/ProductOutflow', () => ({ default: () => <div>ProductOutflow</div> }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe('StockOpsPage', () => {
  it('offers only explainable Sellpia and channel capacity projections', () => {
    render(<StockOpsPage />);

    for (const label of [
      'Sellpia 재고 0',
      '채널 판매 가능 0',
      '구성품 병목',
      '매핑 확인',
      '재고자산',
      '가져오기 상태',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: '악성재고' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '미송수량' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '잔존재고' })).not.toBeInTheDocument();
  });
});
