import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WingRegistrationConfirmDialog from './WingRegistrationConfirmDialog';
import type { WingRegistrationDraft } from '../../lib/wing-registration-flow';

const draft = {
  candidateId: 'candidate-1',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  product: {} as WingRegistrationDraft['product'],
  extensionId: 'ext-1',
  detailImageUrl: 'https://cdn.example.com/detail.jpg',
  overrides: {
    categoryKey: '77390',
    productName: '테스트 노출상품명',
    sellerProductName: '테스트 등록상품명',
    colorValue: '핑크',
    quantityValue: '1개',
    salePrice: 4900,
    origPrice: 5900,
    stock: 100,
  },
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  channelAccounts: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Wing A' },
  ],
  registrationInput: {},
} satisfies WingRegistrationDraft;

describe('WingRegistrationConfirmDialog', () => {
  it('requires a fixed WING category and returns the selected key', () => {
    const onConfirm = vi.fn();
    const missingCategoryDraft = {
      ...draft,
      overrides: { ...draft.overrides, categoryKey: '' as const },
    };
    render(
      <WingRegistrationConfirmDialog
        draft={missingCategoryDraft}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('카테고리를 선택하세요.')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: '확인하고 WING 등록 시작' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('WING 카테고리'), { target: { value: '64687' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ categoryKey: '64687' }),
      false,
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('requires an explicit account selection when multiple WING accounts are available', () => {
    const onConfirm = vi.fn();
    render(
      <WingRegistrationConfirmDialog
        draft={{
          ...draft,
          channelAccountId: '',
          channelAccounts: [
            { id: '11111111-1111-4111-8111-111111111111', name: 'Wing A' },
            { id: '22222222-2222-4222-8222-222222222222', name: 'Wing B' },
          ],
        }}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', { name: '확인하고 WING 등록 시작' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('쿠팡 WING 계정'), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('gives the stock field a hint so the 판매가/정상가/재고 row stays aligned', () => {
    // 회귀: 재고칸만 hint 가 없어 grid-cols-3 한 행에서 입력칸이 위로 붕 떴다.
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('10원 단위')).toBeInTheDocument();
    expect(screen.getByText('0이면 판매가 사용')).toBeInTheDocument();
    expect(screen.getByText('판매 가능 수량')).toBeInTheDocument();
  });

  it('bottom-aligns each field input regardless of hint presence', () => {
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    // Field 가 flex-col + mt-auto 로 입력칸을 바닥에 붙여 hint 유무와 무관하게 정렬된다.
    const stockLabel = screen.getByText('재고수량').closest('label');
    expect(stockLabel).toHaveClass('flex', 'flex-col');
    const stockInputWrapper = stockLabel?.querySelector('input')?.parentElement;
    expect(stockInputWrapper).toHaveClass('mt-auto');
  });

  it('lets the user finish a manual or uncertain WING registration with the issued product id', () => {
    const onConfirmExternal = vi.fn();
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        completion={{ suggestedExternalListingId: '427011919' }}
        onCancel={() => {}}
        onConfirm={() => {}}
        onConfirmExternal={onConfirmExternal}
      />,
    );

    const input = screen.getByLabelText('쿠팡 등록상품ID');
    expect(input).toHaveValue('427011919');
    fireEvent.click(screen.getByRole('button', { name: '등록 완료 확인' }));
    expect(onConfirmExternal).toHaveBeenCalledWith('427011919');
  });
});
