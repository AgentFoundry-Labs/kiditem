import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductVariantPanel from './ProductVariantPanel';

vi.mock('./VariantRecipeDialog', () => ({
  VariantRecipeDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">구성 레시피 편집</div> : null,
}));

describe('<ProductVariantPanel>', () => {
  it('shows capacity, bottleneck identity, and warning-centered recipe actions', () => {
    const { container } = render(<ProductVariantPanel variants={[
      {
        id: '22222222-2222-4222-8222-222222222222',
        code: 'CP-SKU-22222222-2222-4222-8222-222222222222',
        displayReference: {
          type: 'channel_option',
          label: 'Coupang Wing 옵션번호',
          value: '13684204503001',
        },
        name: '분홍',
        optionLabel: '색상: 분홍',
        isDefault: false,
        isActive: true,
        capacity: 6,
        warningState: 'review_required',
        components: [{
          id: '33333333-3333-4333-8333-333333333333',
          sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444',
          code: 'SP-100',
          name: '블록 본품',
          optionName: '분홍',
          barcode: null,
          currentStock: 6,
          isActive: false,
          quantity: 1,
          source: 'manual',
          confirmedBy: null,
          confirmedAt: '2026-07-16T00:00:00.000Z',
        }],
      },
    ]} />);

    expect(screen.getByText('판매 가능 6개')).toBeInTheDocument();
    expect(screen.getByText('검토 필요')).toBeInTheDocument();
    expect(screen.getByText(/Coupang Wing 옵션번호 13684204503001/)).toBeInTheDocument();
    expect(screen.queryByText(/CP-SKU-/)).not.toBeInTheDocument();
    expect(screen.getByText(/SP-100/)).toBeInTheDocument();
    expect(screen.getByText(/병목/)).toBeInTheDocument();
    expect(container.querySelector('#variants')).toBeInTheDocument();
    expect(container.querySelector('#variant-22222222-2222-4222-8222-222222222222')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '레시피 편집' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('구성 레시피 편집');
  });
});
