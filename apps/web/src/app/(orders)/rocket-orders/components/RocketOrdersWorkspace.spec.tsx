import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSavedRocketPos } from '@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';

const queryMock = vi.hoisted(() => vi.fn());
const rocketAccountId = '11111111-1111-4111-8111-111111111111';
const sourceImportRunId = '22222222-2222-4222-8222-222222222222';
const savedOrders = [{
  sourceImportRunId,
  poNumber: 'PO-1001',
  orderedAt: '2026-07-17',
  plannedDeliveryDate: '2026-07-20',
  status: '거래처확인요청',
  vendorId: 'ROCKET',
  centerName: '고양센터',
  inboundType: '밀크런',
  firstProductName: '테스트 상품',
  skuCount: 2,
  orderQuantity: 12,
  orderAmount: 34_000,
  collectedAt: '2026-07-18T03:00:00.000Z',
}];

vi.mock('@tanstack/react-query', () => ({ useQuery: queryMock }));
vi.mock('@/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api', () => ({
  listSavedRocketPos: vi.fn(),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('./RocketConfirmFileList', () => ({ RocketConfirmFileList: () => null }));
vi.mock('./RocketWeekCalendar', () => ({ RocketWeekCalendar: () => null }));
vi.mock('./RocketMonthCalendar', () => ({ RocketMonthCalendar: () => null }));
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

describe('RocketOrdersWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 12, 0, 0));
    queryMock.mockImplementation(({ enabled }: { enabled?: boolean }) => ({
      data: enabled ? savedOrders : [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));
    vi.mocked(listSavedRocketPos).mockResolvedValue(savedOrders);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('passes the calendar-owned date range to the purchase preview', () => {
    const { container } = render(<RocketOrdersWorkspace />);

    expect(screen.getByLabelText('미리보기 입고예정일 범위'))
      .toHaveTextContent('2026-07-18~2026-07-24');

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[0]!, { target: { value: '2026-07-20' } });
    fireEvent.change(dateInputs[1]!, { target: { value: '2026-07-27' } });

    expect(screen.getByLabelText('미리보기 입고예정일 범위'))
      .toHaveTextContent('2026-07-20~2026-07-27');
  });

  it('loads the saved Rocket PO calendar for the selected account', async () => {
    render(<RocketOrdersWorkspace />);

    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
    }));
    const enabledCall = [...queryMock.mock.calls]
      .reverse()
      .find(([options]) => options.enabled === true);
    await enabledCall?.[0].queryFn();

    expect(listSavedRocketPos).toHaveBeenCalledWith({
      channelAccountId: rocketAccountId,
      from: '2026-07-18',
      to: '2026-07-24',
      status: undefined,
    });
  });

  it('reopens a saved collection in the inventory preview without recollecting it', async () => {
    render(<RocketOrdersWorkspace />);

    fireEvent.click(screen.getByText('PO-1001'));
    fireEvent.click(screen.getByRole('button', { name: '저장 수집본으로 미리보기' }));

    expect(screen.getByLabelText('선택된 저장 수집본')).toHaveTextContent(sourceImportRunId);
  });

  it('keeps wide purchase rows scrollable instead of clipping or overlapping text', async () => {
    render(<RocketOrdersWorkspace />);

    expect(screen.getByTestId('rocket-po-table-scroll')).toHaveClass('overflow-x-auto');
  });
});
