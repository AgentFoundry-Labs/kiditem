import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WingRegistrationConfirmDialog from './WingRegistrationConfirmDialog';
import type { WingRegistrationDraft } from '../../lib/wing-registration-flow';

const draft = {
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
    unitWeightValue: '',
    salePrice: 4900,
    origPrice: 5900,
    stock: 100,
  },
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  channelAccounts: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Wing A' },
  ],
  sellpiaMatchPreview: {
    status: 'matched',
    reason: '상품명으로 하나의 셀피아 재고를 찾았습니다.',
    sellpiaMatch: {
      masterProductId: '00000000-0000-4000-8000-000000000051',
      code: '10451-1',
      name: '3500꿀사과슬랑이',
      optionName: null,
      currentStock: 13,
      quantity: 1,
    },
    proposals: [],
  },
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
      draft.sellpiaMatchPreview.sellpiaMatch,
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
      draft.sellpiaMatchPreview.sellpiaMatch,
    );
  });

  it('requires a per-unit weight before starting the live slime-category form', () => {
    const onConfirm = vi.fn();
    render(
      <WingRegistrationConfirmDialog
        draft={{
          ...draft,
          overrides: { ...draft.overrides, categoryKey: '103112' },
        }}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('개당 중량을 입력하세요.')).toBeInTheDocument();
    const weight = screen.getByLabelText('옵션 · 개당 중량 (g)');
    const confirm = screen.getByRole('button', { name: '확인하고 WING 등록 시작' });
    expect(confirm).toBeDisabled();

    fireEvent.change(weight, { target: { value: '120' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ unitWeightValue: '120' }),
      false,
      '11111111-1111-4111-8111-111111111111',
      draft.sellpiaMatchPreview.sellpiaMatch,
    );
  });

  it('shows the exact Sellpia SKU and deduction quantity before registration', () => {
    const onConfirm = vi.fn();
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('셀피아 매칭 완료')).toBeInTheDocument();
    expect(screen.getByText('10451-1')).toBeInTheDocument();
    expect(screen.getByText('3500꿀사과슬랑이')).toBeInTheDocument();
    expect(screen.getByText('현재고 13개')).toBeInTheDocument();
    expect(screen.getByLabelText('판매 1개당 셀피아 차감수량')).toHaveValue(1);

    fireEvent.click(screen.getByRole('button', { name: '확인하고 WING 등록 시작' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      draft.channelAccountId,
      draft.sellpiaMatchPreview.sellpiaMatch,
    );
  });

  it('blocks registration until an unmatched product is linked from Sellpia search', async () => {
    const onConfirm = vi.fn();
    const onSearchSellpia = vi.fn().mockResolvedValue([{
      masterProductId: '00000000-0000-4000-8000-000000000099',
      code: 'MANUAL-99',
      name: '직접 선택한 셀피아 상품',
      optionName: '파랑',
      currentStock: 7,
    }]);
    render(
      <WingRegistrationConfirmDialog
        draft={{
          ...draft,
          sellpiaMatchPreview: {
            status: 'selection_required',
            reason: '자동으로 확정할 셀피아 상품이 없습니다.',
            sellpiaMatch: null,
            proposals: [],
          },
        }}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
        onSearchSellpia={onSearchSellpia}
      />,
    );

    const confirm = screen.getByRole('button', { name: '확인하고 WING 등록 시작' });
    expect(screen.getAllByText('셀피아 상품을 연결하세요.')).not.toHaveLength(0);
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('셀피아 재고 검색'), {
      target: { value: '직접 선택' },
    });
    fireEvent.click(screen.getByRole('button', { name: '셀피아 검색' }));
    expect(onSearchSellpia).toHaveBeenLastCalledWith('직접 선택', false);
    await screen.findByRole('button', {
      name: 'MANUAL-99 직접 선택한 셀피아 상품 선택',
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '품절상품 포함' }));
    fireEvent.click(screen.getByRole('button', { name: '셀피아 검색' }));
    expect(onSearchSellpia).toHaveBeenLastCalledWith('직접 선택', true);
    const result = await screen.findByRole('button', {
      name: 'MANUAL-99 직접 선택한 셀피아 상품 선택',
    });
    fireEvent.click(result);

    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.any(Object),
      false,
      draft.channelAccountId,
      expect.objectContaining({
        masterProductId: '00000000-0000-4000-8000-000000000099',
        quantity: 1,
      }),
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

  it('keeps the original pre-fill confirmation as the only dialog step', () => {
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByRole('dialog', { name: '쿠팡 WING 등록 확인' })).toBeInTheDocument();
    expect(screen.queryByText('쿠팡 등록 완료 확인')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('쿠팡 등록상품ID')).not.toBeInTheDocument();
  });

  it('keeps a WING form-fill failure visible in the confirmation dialog', () => {
    render(
      <WingRegistrationConfirmDialog
        draft={draft}
        isSubmitting={false}
        submissionError="쿠팡 WING이 선택한 카테고리 속성을 불러오지 못했습니다."
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '쿠팡 WING이 선택한 카테고리 속성을 불러오지 못했습니다.',
    );
    expect(screen.getByRole('button', { name: '확인하고 WING 등록 시작' })).toBeEnabled();
  });
});
