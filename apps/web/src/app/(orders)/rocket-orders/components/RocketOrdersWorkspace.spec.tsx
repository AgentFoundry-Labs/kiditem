import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import {
  RocketOrdersWorkspace,
  type RocketDecisionWorkspaceContext,
} from './RocketOrdersWorkspace';
import type { RocketSavedPoSummary } from '@kiditem/shared/rocket-purchase-preview';

const rocketAccountId = '11111111-1111-4111-8111-111111111111';
const rocketPoOperationId = '22222222-2222-4222-8222-222222222222';
const secondRocketPoOperationId = '33333333-3333-4333-8333-333333333333';

const savedOrders: RocketSavedPoSummary[] = [
  {
    rocketPoOperationId,
    poNumber: 'PO-1001',
    orderedAt: '2026-07-17',
    plannedDeliveryDate: '2026-07-18',
    status: '거래명세서확인요청',
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
    rocketPoOperationId,
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
// `complete: false` is an account whose Rocket collection never completed.
const owner = vi.hoisted(() => ({ id: '', complete: true }));
vi.mock('@/hooks/use-rocket-po-source', () => ({
  useRocketPoSource: (accountId: string) => {
    const complete = owner.complete && accountId === '11111111-1111-4111-8111-111111111111';
    return {
      data: { ready: complete, latestAttempt: null, latestComplete: complete ? { attemptId: owner.id } : null },
      refetch: vi.fn(),
    };
  },
}));
const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: '/rocket-orders',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => navigation.params,
}));

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


vi.mock('./RocketAccountBootstrap', () => ({
  RocketAccountBootstrap: ({
    onAccountChange,
  }: {
    onAccountChange: (account: {
      id: string;
      name: string;
      vendorId: string | null;
    } | null) => void;
  }) => {
    useEffect(() => {
      onAccountChange({ id: rocketAccountId, name: '로켓 1호점', vendorId: 'ROCKET' });
    }, [onAccountChange]);
    return (
      <>
        <button
          type="button"
          onClick={() => onAccountChange({
            id: '12121212-1212-4212-8212-121212121212',
            name: '로켓 2호점',
            vendorId: 'ROCKET-2',
          })}
        >
          테스트 로켓 계정 변경
        </button>
        <button type="button" onClick={() => onAccountChange(null)}>
          테스트 로켓 계정 해제
        </button>
      </>
    );
  },
}));

function renderWorkspace(options?: {
  onSelectDate?: (date: string | null) => void;
  onContext?: (context: RocketDecisionWorkspaceContext) => void;
}) {
  return render(
    <RocketOrdersWorkspace
      decisionWorkspace={(context) => {
        options?.onContext?.(context);
        return (
          <section aria-label="상단 통합 달력">
            {context.renderOrderExplorer({
              disabled: false,
              onSelectDate: options?.onSelectDate ?? vi.fn(),
            })}
          </section>
        );
      }}
    />,
  );
}

describe('<RocketOrdersWorkspace /> integrated order explorer', () => {
  beforeEach(() => {
    owner.id = rocketPoOperationId;
    owner.complete = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0, 0));
    sessionStorage.clear();
    navigation.params = new URLSearchParams();
    replaceMock.mockReset();
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

  it('synchronizes the saved preview date with the selected calendar day', () => {
    // 일별 발주 목록은 미리보기 표로 흡수했으므로, 날짜 선택의 계약은 미리보기 날짜 동기화다.
    const onPreviewDate = vi.fn();
    renderWorkspace({ onSelectDate: onPreviewDate });
    // 미래 입고예정일은 보라 배경으로 강조하고, 오늘(2026-07-18)은 보라 배경 + inset ring + '오늘' 마커로 구분한다.
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toHaveClass('bg-purple-50');
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toHaveClass('ring-purple-200');
    expect(screen.getByText('오늘')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-purple-50');

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-18', 1);

    fireEvent.click(screen.getByRole('button', { name: '2026-07-19 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-19', 1);
    // 선택된 미래 날짜는 진한 보라(bg-purple-100) + ring 으로 승격된다.
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveClass('bg-purple-100');
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).not.toHaveClass('bg-purple-100');
  });

  it('shows an unconfirmed PO amount as unknown instead of adding it as zero', () => {
    const withUnconfirmedAmount: RocketSavedPoSummary[] = [
      savedOrders[0]!,
      { ...savedOrders[1]!, orderAmount: null },
    ];
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? withUnconfirmedAmount : [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    }));
    renderWorkspace();

    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toHaveTextContent('12,000');
    expect(screen.getByRole('button', { name: '2026-07-19 발주 1건' })).toHaveTextContent('금액 미확정');
    // 조회 범위에 금액을 모르는 발주가 있으면 범위 합계도 모른다.
    expect(screen.getByText('미확정', { selector: 'b' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(screen.getByText('12,000', { selector: 'b' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '차트' }));
    expect(screen.getByTestId('rocket-orders-chart')).toHaveTextContent('2026-07-19:1:5:null');
  });

  /**
   * With no COMPLETE Rocket source nothing was counted, and the status line
   * says 완료된 로켓 수집본 없음. The summary beside it used to read
   * 발주 0건 · 수량 0개 · 금액 0원: zeros no collection measured (ADR-0006).
   */
  it('shows the summary as unknown, not zero, while no collection has completed', () => {
    owner.complete = false;
    renderWorkspace();

    const summary = screen.getByTestId('rocket-order-summary');
    expect(within(summary).getAllByText('—')).toHaveLength(3);
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
    // No day is announced as having zero orders, and the month is not called empty.
    expect(screen.getByRole('button', { name: '2026-07-18' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /발주 0건/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/이 달엔 해당 발주가 없습니다/)).not.toBeInTheDocument();
  });

  it('keeps a measured zero when the completed collection has no orders in the month', () => {
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? [] : undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    }));
    renderWorkspace();

    const summary = screen.getByTestId('rocket-order-summary');
    expect(within(summary).getAllByText('0')).toHaveLength(3);
    expect(within(summary).queryByText('—')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-18 발주 0건' })).toBeDisabled();
    expect(screen.getByText(/이 달엔 해당 발주가 없습니다/)).toBeInTheDocument();
  });

  it('does not count a saved list that failed to load as zero orders', () => {
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: Boolean(enabled),
      error: enabled ? new Error('목록 조회 실패') : null,
      refetch: query.refetch,
    }));
    renderWorkspace();

    expect(screen.getByText('저장된 발주 목록을 불러오지 못했습니다')).toBeInTheDocument();
    const summary = screen.getByTestId('rocket-order-summary');
    expect(within(summary).getAllByText('—')).toHaveLength(3);
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText(/이 달엔 해당 발주가 없습니다/)).not.toBeInTheDocument();
  });

  it('uses month as the only calendar view and keeps chart in the upper workspace', () => {
    renderWorkspace();

    expect(screen.queryByRole('button', { name: '주 달력' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '월 달력' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '차트' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '차트' }));
    expect(screen.getByTestId('rocket-orders-chart')).toHaveTextContent('2026-07-18:1:3:12000');
  });

  it('clears the preview date when the date range changes', () => {
    const onPreviewDate = vi.fn();
    renderWorkspace({ onSelectDate: onPreviewDate });

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(onPreviewDate).toHaveBeenLastCalledWith('2026-07-18', 1);

    fireEvent.change(screen.getByLabelText('입고예정일 시작'), {
      target: { value: '2026-07-20' },
    });
    expect(onPreviewDate).toHaveBeenLastCalledWith(null, 0);
  });

  it('does not stack a skeleton above an already populated calendar', () => {
    query.isLoading = true;
    renderWorkspace();

    expect(screen.queryByTestId('page-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' })).toBeInTheDocument();
  });

  it('restores the calendar range, selected date, status, and view from the URL', () => {
    navigation.params = new URLSearchParams({
      from: '2026-06-01',
      to: '2026-06-30',
      status: '거래명세서확인요청',
      date: '2026-06-20',
      view: 'chart',
    });

    renderWorkspace();

    expect(screen.getByLabelText('입고예정일 시작')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('입고예정일 종료')).toHaveValue('2026-06-30');
    expect(screen.getByLabelText('발주 상태')).toHaveValue('거래처확인요청');
    expect(screen.getByText('06/20 선택')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '차트' })).toHaveClass('bg-purple-50');
  });

  it('restores the last route state from session storage when returning through the bare URL', () => {
    sessionStorage.setItem('kiditem:route-state:rocket-orders:v1', JSON.stringify({
      from: '2026-06-01',
      to: '2026-06-30',
      status: '거래처확인요청',
      date: '2026-06-20',
      view: 'chart',
    }));

    renderWorkspace();

    expect(replaceMock.mock.calls.some(([href]) =>
      typeof href === 'string'
      && href.startsWith('/rocket-orders?')
      && href.includes('from=2026-06-01')
      && href.includes('to=2026-06-30')
      && href.includes('view=chart'))).toBe(true);
  });
});

describe('<RocketOrdersWorkspace /> saved purchase preview wiring', () => {
  beforeEach(() => {
    owner.id = rocketPoOperationId;
    owner.complete = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 12, 0, 0));
    sessionStorage.clear();
    navigation.params = new URLSearchParams();
    replaceMock.mockReset();
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

  it('filters the calendar by confirmation requests', async () => {
    navigation.params = new URLSearchParams({ status: '거래처확인요청' });
    renderWorkspace();

    expect(screen.getByLabelText('발주 상태')).toHaveValue('거래처확인요청');
    const enabledCall = [...queryMock.mock.calls]
      .reverse()
      .find(([options]) => options.enabled === true);
    await enabledCall?.[0].queryFn();

    expect(listSavedRocketPos).toHaveBeenCalledWith({
      channelAccountId: rocketAccountId,
      from: '2026-07-01',
      to: '2026-07-31',
      status: '거래처확인요청',
    });
  });

  it('opens the latest saved collection without requiring a date click', () => {
    let latestContext: RocketDecisionWorkspaceContext | null = null;

    renderWorkspace({ onContext: (context) => { latestContext = context; } });

    expect(latestContext?.selectedRocketPoOperationId).toBe(rocketPoOperationId);
  });

  it('keeps the latest collection preview open when the selected day has no rows', () => {
    navigation.params = new URLSearchParams({ date: '2026-07-31' });
    let latestContext: RocketDecisionWorkspaceContext | null = null;

    renderWorkspace({ onContext: (context) => { latestContext = context; } });

    expect(latestContext?.selectedDateSourceRunCount).toBe(0);
    expect(latestContext?.selectedRocketPoOperationId).toBe(rocketPoOperationId);
  });

  it('clears the previous source while switching Rocket accounts', () => {
    let latestContext: RocketDecisionWorkspaceContext | null = null;
    renderWorkspace({ onContext: (context) => { latestContext = context; } });

    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(latestContext?.selectedRocketPoOperationId).toBe(rocketPoOperationId);

    fireEvent.click(screen.getByRole('button', { name: '테스트 로켓 계정 변경' }));
    expect(latestContext?.channelAccountId).toBe('12121212-1212-4212-8212-121212121212');
    expect(latestContext?.selectedRocketPoOperationId).toBeNull();
  });

  it('clears account and source context when the account selector reports no valid selection', () => {
    let latestContext: RocketDecisionWorkspaceContext | null = null;
    renderWorkspace({ onContext: (context) => { latestContext = context; } });
    fireEvent.click(screen.getByRole('button', { name: '2026-07-18 발주 1건' }));
    expect(latestContext?.selectedRocketPoOperationId).toBe(rocketPoOperationId);

    fireEvent.click(screen.getByRole('button', { name: '테스트 로켓 계정 해제' }));
    expect(latestContext?.channelAccountId).toBe('');
    expect(latestContext?.selectedRocketPoOperationId).toBeNull();
  });

  it('selects the authoritative owner source instead of inferring identity from repeated rows', () => {
    owner.id = secondRocketPoOperationId;
    const repeatedRuns: RocketSavedPoSummary[] = [
      {
        ...savedOrders[0]!,
        rocketPoOperationId: secondRocketPoOperationId,
        collectedAt: '2026-07-18T04:00:00.000Z',
      },
      {
        ...savedOrders[0]!,
        rocketPoOperationId,
        collectedAt: '2026-07-18T03:00:00.000Z',
      },
    ];
    navigation.params = new URLSearchParams({ date: '2026-07-18' });
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? repeatedRuns : [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    }));
    let latestContext: RocketDecisionWorkspaceContext | null = null;

    renderWorkspace({ onContext: (context) => { latestContext = context; } });

    expect(screen.getByRole('button', { name: '2026-07-18 발주 1건' }))
      .toBeInTheDocument();
    expect(latestContext?.selectedRocketPoOperationId).toBe(secondRocketPoOperationId);
  });
});
