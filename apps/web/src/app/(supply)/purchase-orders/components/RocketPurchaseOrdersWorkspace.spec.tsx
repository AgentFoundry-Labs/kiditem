import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RocketPurchaseOrdersWorkspace } from './RocketPurchaseOrdersWorkspace';

vi.mock('@/app/(orders)/rocket-orders/components/RocketOrdersWorkspace', () => ({
  RocketOrdersWorkspace: () => <div data-testid="full-rocket-operations-shell">로켓 전체 운영 화면</div>,
}));

vi.mock('./RocketPurchasePreviewSection', () => ({
  RocketPurchasePreviewSection: () => <section>Sellpia 수량 미리보기</section>,
}));

describe('<RocketPurchaseOrdersWorkspace>', () => {
  it('owns an additive purchase-order layout instead of duplicating the full Rocket operations shell', () => {
    render(<RocketPurchaseOrdersWorkspace />);

    expect(screen.getByRole('heading', { level: 1, name: '로켓 발주 수량 검토' }))
      .toBeInTheDocument();
    expect(screen.getByText('Sellpia 수량 미리보기')).toBeInTheDocument();
    expect(screen.queryByTestId('full-rocket-operations-shell')).not.toBeInTheDocument();
  });
});
