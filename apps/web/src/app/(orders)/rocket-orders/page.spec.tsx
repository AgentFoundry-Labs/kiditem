import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RocketOrdersPage from './page';

vi.mock('./components/RocketOrdersWorkspace', () => ({
  // 캘린더가 소유한 입고예정일 범위를 render prop 으로 내려준다.
  RocketOrdersWorkspace: ({
    decisionWorkspace,
  }: {
    decisionWorkspace: (range: { from: string; to: string }) => React.ReactNode;
  }) => (
    <main>
      <h1>쿠팡 로켓 발주</h1>
      <div>달력 · 발주 목록 · 기존 생성 파일 이력</div>
      {decisionWorkspace({ from: '2026-07-16', to: '2026-07-22' })}
    </main>
  ),
}));

vi.mock('@/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: ({ from, to }: { from: string; to: string }) => (
    <section>Sellpia 수량 미리보기 {from}~{to}</section>
  ),
}));

describe('/rocket-orders', () => {
  it('keeps the full c9 operations shell and fills its decision placeholder with the preview', () => {
    render(<RocketOrdersPage />);

    expect(screen.getByRole('heading', { level: 1, name: '쿠팡 로켓 발주' }))
      .toBeInTheDocument();
    expect(screen.getByText('달력 · 발주 목록 · 기존 생성 파일 이력')).toBeInTheDocument();
    // 미리보기는 캘린더의 범위를 그대로 받는다 — 자체 조회 날짜를 두지 않는다.
    expect(screen.getByText(/Sellpia 수량 미리보기 2026-07-16~2026-07-22/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '로켓 발주 수량 검토' }))
      .not.toBeInTheDocument();
  });
});
