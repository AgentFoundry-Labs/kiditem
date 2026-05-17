import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MarketplaceRegistrationDialog from './MarketplaceRegistrationDialog';

describe('MarketplaceRegistrationDialog', () => {
  it('requires a selected account and confirmed market product id', () => {
    const onSubmit = vi.fn();
    render(
      <MarketplaceRegistrationDialog
        open
        accounts={[{
          id: 'account-1',
          channel: 'coupang',
          name: '쿠팡 본계정',
          externalAccountId: 'vendor-1',
        }]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '마켓 등록 완료 처리' }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('마켓 상품번호'), { target: { value: '720445' } });
    fireEvent.click(screen.getByRole('button', { name: '마켓 등록 완료 처리' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: 'account-1',
      externalId: '720445',
    }));
  });
});
