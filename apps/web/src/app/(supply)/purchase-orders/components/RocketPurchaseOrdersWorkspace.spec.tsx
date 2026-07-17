import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RocketPurchaseOrdersWorkspace } from './RocketPurchaseOrdersWorkspace';

vi.mock('@/app/(orders)/rocket-orders/components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: () => <div data-testid="full-rocket-operations-shell">로켓 전체 운영 화면</div>,
}));

vi.mock('./RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: ({ from, to }: { from: string; to: string }) => (
    <section>Sellpia 수량 미리보기 {from}~{to}</section>
  ),
}));

describe('<RocketPurchaseOrdersWorkspace>', () => {
  it('owns an additive purchase-order layout instead of duplicating the full Rocket operations shell', () => {
    render(<RocketPurchaseOrdersWorkspace />);

    expect(screen.getByRole('heading', { level: 1, name: '로켓 발주 수량 검토' }))
      .toBeInTheDocument();
    expect(screen.getByText(/Sellpia 수량 미리보기/)).toBeInTheDocument();
    expect(screen.queryByTestId('full-rocket-operations-shell')).not.toBeInTheDocument();
  });

  // 캘린더가 없는 단독 화면이 입고예정일 범위를 소유한다.
  it('initializes the query range from the local calendar day without UTC conversion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 0, 30));
    const isoSpy = vi.spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('1999-01-01T00:00:00.000Z');

    render(<RocketPurchaseOrdersWorkspace />);

    expect(screen.getByLabelText('조회 시작일')).toHaveValue('2026-07-16');
    // 기본 범위는 로켓 캘린더와 동일하게 다음 7일(오늘 +6).
    expect(screen.getByLabelText('조회 종료일')).toHaveValue('2026-07-22');
    isoSpy.mockRestore();
    vi.useRealTimers();
  });

  it('passes the owned range down to the preview section', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 9, 0));

    render(<RocketPurchaseOrdersWorkspace />);

    expect(screen.getByText(/2026-07-16~2026-07-22/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
