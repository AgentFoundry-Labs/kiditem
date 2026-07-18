import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RocketSavedPoSummary } from '@kiditem/shared/rocket-purchase-preview';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';

const rocketAccountId = '11111111-1111-4111-8111-111111111111';
const sourceImportRunId = '22222222-2222-4222-8222-222222222222';
const secondSourceImportRunId = '33333333-3333-4333-8333-333333333333';

const savedOrders: RocketSavedPoSummary[] = [
  {
    sourceImportRunId,
    poNumber: 'PO-1001',
    orderedAt: '2026-07-17',
    plannedDeliveryDate: '2026-07-18',
    status: '거래처확인요청',
    vendorId: 'ROCKET',
    centerName: '고양센터',
    inboundType: '택배',
    firstProductName: '18일 주문 상품',
    skuCount: 1,
    orderQuantity: 3,
    orderAmount: 12_000,
    collectedAt: '2026-07-18T03:00:00.000Z',
  },
  {
    sourceImportRunId: secondSourceImportRunId,
    poNumber: 'PO-1002',
    orderedAt: '2026-07-18',
    plannedDeliveryDate: '2026-07-19',
    status: '발주확정',
    vendorId: 'ROCKET',
    centerName: '서울2센터',
    inboundType: '밀크런',
    firstProductName: '19일 주문 상품',
    skuCount: 2,
    orderQuantity: 5,
    orderAmount: 34_000,
    collectedAt: '2026-07-18T03:00:00.000Z',
  },
];

const query = vi.hoisted(() => ({
  refetch: vi.fn(),
  isLoading: false,
}));
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery: queryMock }));

vi.mock('@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api', () => ({
  listSavedRocketPos: vi.fn(),
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

vi.mock('@/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: ({
    from,
    to,
    savedSourceImportRunId,
    onAccountChange,
  }: {
    from: string;
    to: string;
    savedSourceImportRunId?: string | null;
    onAccountChange?: (account: { id: string; vendorId: string | null }) => void;
  }) => {
    useEffect(() => {
      onAccountChange?.({ id: rocketAccountId, vendorId: 'ROCKET' });
    }, [onAccountChange]);
    return (
      <>
        <output aria-label="미리보기 입고예정일 범위">{from}~{to}</output>
        <output aria-label="선택된 저장 수집본">{savedSourceImportRunId ?? ''}</output>
      </>
    );
  },
}));

function renderWorkspace(options?: {
  onSelectDate?: (date: string | null) => void;
  savedDays?: Record<string, { count: number; qty: number; amount: number }>;
}) {
  return render(
    <RocketOrdersWorkspace
      decisionWorkspace={({ renderOrderExplorer }) => (
        <section aria-label="상단 통합 달력">
          {renderOrderExplorer({
            disabled: false,
            onSelectDate: options?.onSelectDate ?? vi.fn(),
            savedDays: options?.savedDays ?? {},
          })}
        </section>
      )}
    />,
  );
}

describe('<RocketOrdersWorkspace /> integrated order explorer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0, 0));
    query.refetch.mockReset();
    query.isLoading = false;
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? savedOrders : [],
      isLoading: query.isLoading,
      isFetching: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    }));
    vi.mocked(listSavedRocketPos).mockResolvedValue(savedOrders);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows only the selected date orders and synchronizes the saved preview date', () => {
    const onPreviewDate = vi.fn();
    renderWorkspace({ onSelectDate: onPreviewDate });

    expect(screen.queryByText('18일 주문 상품')).not.toBeInTheDocument();
    expect(screen.queryByText('19일 주문 상품')).not.toBeInTheDocument();
    // 달력은 미래 입고예정일만 보라색으로 강조하고 오늘/과거는 흰색으로 남긴다.
    // (오늘 = 2026-07-18 이므로 18일은 흰색, 19일은 미래라 보라색)
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toHaveClass('bg-white');
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).not.toHaveClass('bg-purple-50');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-purple-50');

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-18');
    expect(screen.getByText('18일 주문 상품')).toBeInTheDocument();
    expect(screen.queryByText('19일 주문 상품')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2026-07-19 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-19');
    // 선택된 미래 날짜는 진한 보라(bg-purple-100) + ring 으로 승격된다.
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-purple-100');
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).not.toHaveClass('bg-purple-100');
    expect(screen.queryByText('18일 주문 상품')).not.toBeInTheDocument();
    expect(screen.getByText('19일 주문 상품')).toBeInTheDocument();
  });

  it('uses month as the only calendar view and keeps chart in the upper workspace', () => {
    renderWorkspace();

    expect(screen.queryByRole('button', { name: '주 달력' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '월 달력' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '차트' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '차트' }));
    expect(screen.getByTestId('rocket-orders-chart')).toHaveTextContent('2026-07-18:1:3:12000');
  });

  it('clears the selected list and preview when the date range changes', () => {
    const onPreviewDate = vi.fn();
    renderWorkspace({ onSelectDate: onPreviewDate });

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
    renderWorkspace({
      savedDays: {
        '2026-07-18': { count: 1, qty: 3, amount: 12000 },
      },
    });

    expect(screen.queryByTestId('page-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toBeInTheDocument();
  });
});

describe('<RocketOrdersWorkspace /> saved purchase preview wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 12, 0, 0));
    query.refetch.mockReset();
    query.isLoading = false;
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? savedOrders : [],
      isLoading: query.isLoading,
      isFetching: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    }));
    vi.mocked(listSavedRocketPos).mockResolvedValue(savedOrders);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('passes the calendar-owned date range to the purchase preview', () => {
    renderWorkspace();

    // 기본 범위는 이번 달 전체(월 달력과 동일한 범위)다.
    expect(screen.getByLabelText('미리보기 입고예정일 범위'))
      .toHaveTextContent('2026-07-01~2026-07-31');

    fireEvent.change(screen.getByLabelText('입고예정일 시작'), {
      target: { value: '2026-07-20' },
    });
    fireEvent.change(screen.getByLabelText('입고예정일 종료'), {
      target: { value: '2026-07-27' },
    });

    expect(screen.getByLabelText('미리보기 입고예정일 범위'))
      .toHaveTextContent('2026-07-20~2026-07-27');
  });

  it('loads the saved Rocket PO calendar for the selected account', async () => {
    renderWorkspace();

    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
    }));
    const enabledCall = [...queryMock.mock.calls]
      .reverse()
      .find(([options]) => options.enabled === true);
    await enabledCall?.[0].queryFn();

    expect(listSavedRocketPos).toHaveBeenCalledWith({
      channelAccountId: rocketAccountId,
      from: '2026-07-01',
      to: '2026-07-31',
      status: undefined,
    });
  });

  it('reopens a saved collection in the inventory preview without recollecting it', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    fireEvent.click(screen.getByText('PO-1001'));
    fireEvent.click(screen.getByRole('button', { name: '저장 수집본으로 미리보기' }));

    expect(screen.getByLabelText('선택된 저장 수집본')).toHaveTextContent(sourceImportRunId);
  });

  it('keeps wide purchase rows scrollable instead of clipping or overlapping text', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));

    expect(screen.getByTestId('rocket-po-table-scroll')).toHaveClass('overflow-x-auto');
  });
});
