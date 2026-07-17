import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RocketOrdersPage from './page';

vi.mock('./components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: ({ decisionWorkspace }: { decisionWorkspace: React.ReactNode }) => (
    <main>
      <h1>쿠팡 로켓 발주</h1>
      <div>달력 · 발주 목록 · 기존 생성 파일 이력</div>
      {decisionWorkspace}
    </main>
  ),
}));

// 판단 슬롯 = orders 도메인 발주확정 패널(재고매칭·품절판정·엑셀생성).
vi.mock('./components/RocketConfirmPanel', () => ({
  RocketConfirmPanel: ({ onSaved }: { onSaved: () => void }) => (
    <section onClick={onSaved}>발주확정 양식 생성</section>
  ),
}));

describe('/rocket-orders', () => {
  it('keeps the operations shell and fills the decision slot with the confirm panel', () => {
    render(<RocketOrdersPage />);

    expect(screen.getByRole('heading', { level: 1, name: '쿠팡 로켓 발주' }))
      .toBeInTheDocument();
    expect(screen.getByText('달력 · 발주 목록 · 기존 생성 파일 이력')).toBeInTheDocument();
    expect(screen.getByText('발주확정 양식 생성')).toBeInTheDocument();
    // supply 도메인 미리보기 화면은 /rocket-orders 에서는 렌더하지 않는다(단독 화면에만 존재).
    expect(screen.queryByRole('heading', { name: '로켓 발주 수량 검토' }))
      .not.toBeInTheDocument();
  });
});
