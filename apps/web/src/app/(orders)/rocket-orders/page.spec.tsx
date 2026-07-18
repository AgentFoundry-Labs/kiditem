import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RocketOrdersPage from './page';

interface MockWorkspaceContext {
  activeMonth: string;
  onOrdersChanged: () => void;
  renderOrderExplorer: (options: {
    disabled: boolean;
    onSelectDate: (date: string | null) => void;
    savedDays: Record<string, { count: number; qty: number; amount: number }>;
  }) => React.ReactNode;
}

vi.mock('./components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: ({
    decisionWorkspace,
  }: {
    decisionWorkspace: (workspace: MockWorkspaceContext) => React.ReactNode;
  }) => (
    <main>
      <h1>쿠팡 로켓 발주</h1>
      <div>달력 · 발주 목록 · 기존 생성 파일 이력</div>
      {decisionWorkspace({
        activeMonth: '2026-07',
        onOrdersChanged: vi.fn(),
        renderOrderExplorer: () => <div>통합 월 달력 · 차트</div>,
      })}
    </main>
  ),
}));

// 판단 슬롯 = orders 도메인 발주확정 패널(재고매칭·품절판정·엑셀생성).
vi.mock('./components/RocketConfirmPanel', () => ({
  RocketConfirmPanel: ({
    onSaved,
    renderOrderExplorer,
  }: {
    onSaved: () => void;
    renderOrderExplorer: MockWorkspaceContext['renderOrderExplorer'];
  }) => (
    <section onClick={onSaved}>
      발주확정 양식 생성
      {renderOrderExplorer({ disabled: false, onSelectDate: vi.fn(), savedDays: {} })}
    </section>
  ),
}));

describe('/rocket-orders', () => {
  it('keeps the operations shell and fills the decision slot with the confirm panel', () => {
    render(<RocketOrdersPage />);

    expect(screen.getByRole('heading', { level: 1, name: '쿠팡 로켓 발주' }))
      .toBeInTheDocument();
    expect(screen.getByText('달력 · 발주 목록 · 기존 생성 파일 이력')).toBeInTheDocument();
    expect(screen.getByText('발주확정 양식 생성')).toBeInTheDocument();
    expect(screen.getByText('통합 월 달력 · 차트')).toBeInTheDocument();
    // supply 도메인 미리보기 화면은 /rocket-orders 에서는 렌더하지 않는다(단독 화면에만 존재).
    expect(screen.queryByRole('heading', { name: '로켓 발주 수량 검토' }))
      .not.toBeInTheDocument();
  });
});
