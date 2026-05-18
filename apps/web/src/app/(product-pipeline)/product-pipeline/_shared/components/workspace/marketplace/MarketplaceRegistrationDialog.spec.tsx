import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MarketplaceRegistrationDialog from './MarketplaceRegistrationDialog';

describe('MarketplaceRegistrationDialog', () => {
  it('requires a product name and barcode before submitting a marketplace registration', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <MarketplaceRegistrationDialog
        open
        accounts={[{
          id: 'account-1',
          channel: 'coupang',
          name: '쿠팡 본계정',
          externalAccountId: 'vendor-1',
        }]}
        productName="바삭바삭 수제왁스"
        isSubmitting={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByLabelText('마켓 상품번호')).not.toBeInTheDocument();
    expect(screen.getByLabelText('상품명')).toHaveValue('바삭바삭 수제왁스');

    fireEvent.click(screen.getByRole('button', { name: /쿠팡 Wing 등록/ }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('상품 바코드'), { target: { value: '8806384882841' } });
    fireEvent.click(screen.getByRole('button', { name: /쿠팡 로켓 등록/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: 'account-1',
      externalId: '8806384882841',
      productBarcode: '8806384882841',
      channelName: '바삭바삭 수제왁스',
    }));

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('generates a draft set barcode from the action next to the barcode field', () => {
    render(
      <MarketplaceRegistrationDialog
        open
        accounts={[{
          id: 'account-1',
          channel: 'coupang',
          name: '쿠팡 본계정',
          externalAccountId: 'vendor-1',
        }]}
        productName="세트 상품"
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '세트 상품' }));
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    expect((screen.getByLabelText('상품 바코드') as HTMLInputElement).value).toMatch(/^881\d{10}$/);
  });
});
