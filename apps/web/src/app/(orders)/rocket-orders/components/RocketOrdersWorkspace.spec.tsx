import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';
import type { RocketPoSummary } from '../lib/rocket-confirm-api';

const query = vi.hoisted(() => ({
  refetch: vi.fn(),
  isLoading: false,
  data: [
    {
      poSeq: 101,
      orderedAt: '2026-07-17',
      eta: '2026-07-18',
      status: '거래처확인요청',
      vendorName: '키드아이템',
      centerName: '서울1센터',
      inboundType: '택배',
      firstSkuName: '18일 주문 상품',
      skuCount: 1,
      orderQty: 3,
      orderAmount: 12000,
    },
    {
      poSeq: 202,
      orderedAt: '2026-07-18',
      eta: '2026-07-19',
      status: '발주확정',
      vendorName: '키드아이템',
      centerName: '서울2센터',
      inboundType: '밀크런',
      firstSkuName: '19일 주문 상품',
      skuCount: 2,
      orderQty: 5,
      orderAmount: 34000,
    },
  ] satisfies RocketPoSummary[],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: query.data,
    isLoading: query.isLoading,
    isFetching: false,
    isError: false,
    error: null,
    refetch: query.refetch,
  }),
}));

vi.mock('@/components/ui/PageSkeleton', () => ({
  default: () => <div data-testid="page-skeleton" />,
}));

vi.mock('next/dynamic', () => ({
  default: () => ({ data }: { data: Array<{ date: string; count: number; qty: number; amount: number }> }) => (
    <div data-testid="rocket-orders-chart">
      {data.map((point) => `${point.date}:${point.count}:${point.qty}:${point.amount}`).join('|')}
    </div>
  ),
}));

vi.mock('./RocketConfirmFileList', () => ({
  RocketConfirmFileList: () => <div>기존 생성 파일 이력</div>,
}));

describe('<RocketOrdersWorkspace /> integrated order explorer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T09:00:00+09:00'));
    query.refetch.mockReset();
    query.isLoading = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only the selected date orders and synchronizes the saved preview date', () => {
    const onPreviewDate = vi.fn();
    render(
      <RocketOrdersWorkspace
        decisionWorkspace={({ renderOrderExplorer }) => (
          <section aria-label="상단 통합 달력">
            {renderOrderExplorer({ disabled: false, onSelectDate: onPreviewDate, savedDays: {} })}
          </section>
        )}
      />,
    );

    expect(screen.queryByText('18일 주문 상품')).not.toBeInTheDocument();
    expect(screen.queryByText('19일 주문 상품')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toHaveClass('bg-purple-50');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-white');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).not.toHaveClass('bg-purple-50');

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-18');
    expect(screen.getByText('18일 주문 상품')).toBeInTheDocument();
    expect(screen.queryByText('19일 주문 상품')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2026-07-19 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-19');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-white');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).not.toHaveClass('bg-purple-100');
    expect(screen.queryByText('18일 주문 상품')).not.toBeInTheDocument();
    expect(screen.getByText('19일 주문 상품')).toBeInTheDocument();
  });

  it('uses month as the only calendar view and keeps chart in the upper workspace', () => {
    render(
      <RocketOrdersWorkspace
        decisionWorkspace={({ renderOrderExplorer }) => (
          <section aria-label="상단 통합 달력">
            {renderOrderExplorer({ disabled: false, onSelectDate: vi.fn(), savedDays: {} })}
          </section>
        )}
      />,
    );

    expect(screen.queryByRole('button', { name: '주 달력' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '월 달력' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '차트' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '차트' }));
    expect(screen.getByTestId('rocket-orders-chart')).toHaveTextContent('2026-07-18:1:3:12000');
  });

  it('clears the selected list and preview when the date range changes', () => {
    const onPreviewDate = vi.fn();
    render(
      <RocketOrdersWorkspace
        decisionWorkspace={({ renderOrderExplorer }) => (
          <section aria-label="상단 통합 달력">
            {renderOrderExplorer({ disabled: false, onSelectDate: onPreviewDate, savedDays: {} })}
          </section>
        )}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(screen.getByText('18일 주문 상품')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('입고예정일 시작'), {
      target: { value: '2026-07-20' },
    });
    expect(onPreviewDate).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('18일 주문 상품')).not.toBeInTheDocument();
  });

  it('does not stack a skeleton above an already populated calendar', () => {
    query.isLoading = true;
    render(
      <RocketOrdersWorkspace
        decisionWorkspace={({ renderOrderExplorer }) => (
          <section aria-label="상단 통합 달력">
            {renderOrderExplorer({
              disabled: false,
              onSelectDate: vi.fn(),
              savedDays: {
                '2026-07-18': { count: 1, qty: 3, amount: 12000 },
              },
            })}
          </section>
        )}
      />,
    );

    expect(screen.queryByTestId('page-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toBeInTheDocument();
  });
});
