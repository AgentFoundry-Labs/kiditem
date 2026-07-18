import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RocketOrdersWorkspace } from './RocketOrdersWorkspace';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery: queryMock }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('./RocketConfirmFileList', () => ({ RocketConfirmFileList: () => null }));
vi.mock('./RocketWeekCalendar', () => ({ RocketWeekCalendar: () => null }));
vi.mock('./RocketMonthCalendar', () => ({ RocketMonthCalendar: () => null }));
vi.mock('@/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: ({ from, to }: { from: string; to: string }) => (
    <output aria-label="미리보기 입고예정일 범위">{from}~{to}</output>
  ),
}));

describe('RocketOrdersWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 12, 0, 0));
    queryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
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
});
