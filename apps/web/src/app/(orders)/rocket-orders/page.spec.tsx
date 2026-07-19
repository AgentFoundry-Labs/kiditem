import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RocketOrdersPage from './page';

vi.mock('./components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: () => (
    <main>
      <h1>쿠팡 로켓 발주</h1>
      <div>달력 · 발주 목록 · 기존 생성 파일 이력</div>
      <section>Sellpia 수량 미리보기</section>
    </main>
  ),
}));

describe('/rocket-orders', () => {
  it('keeps the full c9 operations shell and fills its decision placeholder with the preview', () => {
    render(<RocketOrdersPage />);

    expect(screen.getByRole('heading', { level: 1, name: '쿠팡 로켓 발주' }))
      .toBeInTheDocument();
    expect(screen.getByText('달력 · 발주 목록 · 기존 생성 파일 이력')).toBeInTheDocument();
    expect(screen.getByText('Sellpia 수량 미리보기')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '로켓 발주 수량 검토' }))
      .not.toBeInTheDocument();
  });
});
