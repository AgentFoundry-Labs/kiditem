import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RocketOrdersPage from './page';

vi.mock('./components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: () => (
    <main>
      <h1>쿠팡 로켓 발주</h1>
      <div>달력 · 최신 발주 · 수량 편집 · 엑셀 다운로드</div>
      <section>Sellpia 수량 미리보기</section>
      <div>통합 월 달력 · 차트</div>
    </main>
  ),
}));

describe('/rocket-orders', () => {
  it('keeps the operations shell with its canonical Supply preview', () => {
    render(<RocketOrdersPage />);

    expect(screen.getByRole('heading', { level: 1, name: '쿠팡 로켓 발주' }))
      .toBeInTheDocument();
    expect(screen.getByText('달력 · 최신 발주 · 수량 편집 · 엑셀 다운로드')).toBeInTheDocument();
    expect(screen.getByText('Sellpia 수량 미리보기')).toBeInTheDocument();
    expect(screen.getByText('통합 월 달력 · 차트')).toBeInTheDocument();
  });
});
