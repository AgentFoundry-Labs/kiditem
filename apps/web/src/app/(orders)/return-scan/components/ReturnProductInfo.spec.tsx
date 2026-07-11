import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReturnProductInfo from './ReturnProductInfo';

describe('ReturnProductInfo', () => {
  it('records a local scan without implying inventory mutation', () => {
    const onRecovery = vi.fn();
    render(
      <ReturnProductInfo
        product={{ id: 'product-1', name: '반품 상품', sku: 'SKU-1' }}
        processing={false}
        onRecovery={onRecovery}
      />,
    );

    expect(screen.getByText('Sellpia 재고 반영은 별도 처리해야 합니다.')).toBeInTheDocument();
    expect(screen.queryByText(/현재 재고/)).not.toBeInTheDocument();
    expect(screen.queryByText(/재고 \+1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '회수 기록 추가' }));
    expect(onRecovery).toHaveBeenCalledTimes(1);
  });
});
