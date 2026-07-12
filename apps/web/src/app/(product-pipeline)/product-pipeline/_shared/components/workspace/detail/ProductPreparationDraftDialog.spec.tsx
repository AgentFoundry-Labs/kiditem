import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductPreparationDraftDialog from './ProductPreparationDraftDialog';

describe('ProductPreparationDraftDialog', () => {
  const accounts = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      channel: 'coupang',
      name: '쿠팡 본계정',
      externalAccountId: 'vendor-main',
      isPrimary: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      channel: 'coupang',
      name: '쿠팡 로켓 계정',
      externalAccountId: 'vendor-rocket',
      isPrimary: false,
    },
  ];

  it('requires the operator to choose an account explicitly', () => {
    const onSubmit = vi.fn();
    render(
      <ProductPreparationDraftDialog
        open
        accounts={accounts}
        isLoading={false}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('등록 채널 계정')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '등록 준비 저장' }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('등록 채널 계정'), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 준비 저장' }));

    expect(onSubmit).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });
});
