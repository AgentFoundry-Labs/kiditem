import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MarketplaceRegistrationDialog from './MarketplaceRegistrationDialog';

describe('MarketplaceRegistrationDialog', () => {
  it('requires separate marketplace product number and product barcode before submitting', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <MarketplaceRegistrationDialog
        open
        accounts={[
          {
            id: 'account-1',
            channel: 'coupang',
            name: '쿠팡 본계정',
            externalAccountId: 'vendor-1',
          },
          {
            id: 'account-2',
            channel: 'coupang',
            name: '쿠팡 보조계정',
            externalAccountId: 'vendor-2',
          },
        ]}
        productName="바삭바삭 수제왁스"
        isSubmitting={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('마켓 계정'), { target: { value: 'account-2' } });
    expect(screen.getByLabelText('상품명')).toHaveValue('바삭바삭 수제왁스');

    fireEvent.click(screen.getByRole('button', { name: /쿠팡 Wing 등록/ }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('마켓 상품번호'), { target: { value: 'COUPANG-720445' } });
    fireEvent.click(screen.getByRole('button', { name: /쿠팡 로켓 등록/ }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('상품 바코드'), { target: { value: '8806384882841' } });
    fireEvent.click(screen.getByRole('button', { name: /쿠팡 로켓 등록/ }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: 'account-2',
      externalId: 'COUPANG-720445',
      productBarcode: '8806384882841',
      channelName: '바삭바삭 수제왁스',
    }));

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('generates a draft set barcode without changing the marketplace product number', () => {
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

    expect(screen.getByLabelText('마켓 상품번호')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('마켓 상품번호'), { target: { value: 'COUPANG-SET-1' } });
    fireEvent.click(screen.getByRole('button', { name: '세트 상품' }));
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    expect(screen.getByLabelText('마켓 상품번호')).toHaveValue('COUPANG-SET-1');
    expect((screen.getByLabelText('상품 바코드') as HTMLInputElement).value).toMatch(/^881\d{10}$/);
  });
});
