import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHANNEL_SKU_COMPONENT_QUANTITY } from '@kiditem/shared/channel-sku-matching';
import {
  useChannelSkuCandidates,
  useReplaceChannelSkuComponents,
} from '../../hooks/useChannelSkuMappings';
import { ChannelSkuComponentDialog } from '../ChannelSkuComponentDialog';
import type {
  ChannelSkuMappingComponent,
  ChannelSkuMappingListItem,
  ChannelSkuMatchCandidate,
} from '@kiditem/shared/channel-sku-matching';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useChannelSkuCandidates: vi.fn(),
  useReplaceChannelSkuComponents: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CHANNEL_SKU_ID = '11111111-1111-4111-8111-111111111111';
const FIRST_MASTER_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_MASTER_ID = '33333333-3333-4333-8333-333333333333';

function component(
  overrides: Partial<ChannelSkuMappingComponent> = {},
): ChannelSkuMappingComponent {
  return {
    masterProductId: FIRST_MASTER_ID,
    code: 'SP-001',
    name: '첫 Sellpia 상품',
    optionName: '분홍',
    barcode: '8801234567890',
    currentStock: 8,
    purchasePrice: 1500,
    quantity: 1,
    mappingSource: 'manual',
    componentCapacity: 8,
    isBottleneck: true,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<ChannelSkuMatchCandidate> = {},
): ChannelSkuMatchCandidate {
  return {
    masterProductId: SECOND_MASTER_ID,
    code: 'SP-002',
    name: '둘째 Sellpia 상품',
    optionName: '파랑',
    barcode: '8809999999999',
    currentStock: 11,
    reason: 'manual_search',
    rank: 0,
    ...overrides,
  };
}

function item(
  overrides: Partial<ChannelSkuMappingListItem> = {},
): ChannelSkuMappingListItem {
  return {
    channelAccount: {
      id: '44444444-4444-4444-8444-444444444444',
      channel: 'coupang',
      name: '쿠팡 Wing',
    },
    product: {
      id: '55555555-5555-4555-8555-555555555555',
      externalProductId: 'product-100',
      registeredName: '등록 상품명',
      displayName: '노출 상품명',
      status: '판매중',
    },
    sku: {
      id: CHANNEL_SKU_ID,
      externalSkuId: 'sku-200',
      sellerSku: 'SELLER-200',
      optionName: '핑크 / 대형',
      barcode: '8801234567890',
      modelNumber: 'MODEL-200',
      salePrice: 12000,
      status: '판매중',
      mappingStatus: 'matched',
      sellableStock: 2,
      updatedAt: '2026-07-11T00:00:00.000Z',
    },
    components: [component({ quantity: 4 })],
    ...overrides,
  };
}

const mutateAsync = vi.fn();

function mockCandidates(items: ChannelSkuMatchCandidate[] = [candidate()]) {
  vi.mocked(useChannelSkuCandidates).mockReturnValue({
    data: { items },
    isLoading: false,
    isFetching: false,
    error: null,
  } as ReturnType<typeof useChannelSkuCandidates>);
}

function renderDialog(target = item()) {
  return render(
    <ChannelSkuComponentDialog
      open
      item={target}
      onOpenChange={vi.fn()}
    />,
  );
}

describe('ChannelSkuComponentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(item());
    mockCandidates();
    vi.mocked(useReplaceChannelSkuComponents).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as ReturnType<typeof useReplaceChannelSkuComponents>);
  });

  it('opens with exact current recipe quantities and identifying product/SKU metadata', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Sellpia 구성 매칭' });
    expect(dialog).toHaveTextContent('등록 상품명');
    expect(dialog).toHaveTextContent('product-100');
    expect(dialog).toHaveTextContent('핑크 / 대형');
    expect(dialog).toHaveTextContent('sku-200');
    expect(screen.getByLabelText('SP-001 수량')).toHaveValue('4');
  });

  it('renders every candidate evidence badge', () => {
    mockCandidates([
      candidate({ reason: 'exact_sellpia_code' }),
      candidate({
        masterProductId: '00000000-0000-4000-8000-000000000002',
        reason: 'unique_barcode',
      }),
      candidate({
        masterProductId: '00000000-0000-4000-8000-000000000003',
        reason: 'ambiguous_identifier',
      }),
      candidate({
        masterProductId: '00000000-0000-4000-8000-000000000006',
        reason: 'exact_normalized_name',
      }),
      candidate({
        masterProductId: '00000000-0000-4000-8000-000000000004',
        reason: 'name_suggestion',
      }),
      candidate({
        masterProductId: '00000000-0000-4000-8000-000000000005',
        reason: 'manual_search',
      }),
    ]);

    renderDialog();

    expect(screen.getByText('상품코드 일치')).toBeInTheDocument();
    expect(screen.getByText('고유 식별자')).toBeInTheDocument();
    expect(screen.getByText('중복 식별자')).toBeInTheDocument();
    expect(screen.getByText('등록상품명 일치')).toBeInTheDocument();
    expect(screen.getByText('이름 제안')).toBeInTheDocument();
    expect(screen.getByText('검색 결과')).toBeInTheDocument();
  });

  it('shows candidate query failure with retry before the empty state', async () => {
    const refetch = vi.fn();
    vi.mocked(useChannelSkuCandidates).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('후보 조회 실패'),
      refetch,
    } as ReturnType<typeof useChannelSkuCandidates>);
    const user = userEvent.setup();

    renderDialog();

    expect(screen.getByRole('alert')).toHaveTextContent('후보 조회 실패');
    expect(
      screen.queryByText('표시할 후보가 없습니다. Sellpia 상품코드나 이름으로 검색해 주세요.'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '후보 다시 불러오기' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows authoritative current stock only as text and never exposes a stock input', () => {
    renderDialog();

    const recipeSection = screen
      .getByRole('heading', { name: '저장할 Sellpia 구성' })
      .closest('section');
    expect(recipeSection).toHaveTextContent('현재 재고 8');
    expect(recipeSection).toHaveTextContent('매입가 1,500원');
    expect(recipeSection).toHaveTextContent('구성 가능 8');
    expect(recipeSection).toHaveTextContent('병목');
    expect(screen.queryByLabelText(/재고.*수정/)).not.toBeInTheDocument();
  });

  it('adds a candidate locally but does not auto-save even for exact evidence', async () => {
    mockCandidates([candidate({ reason: 'exact_sellpia_code' })]);
    const user = userEvent.setup();
    renderDialog(item({ components: [] }));

    await user.click(screen.getByRole('button', { name: 'SP-002 구성에 추가' }));

    expect(screen.getByLabelText('SP-002 수량')).toHaveValue('1');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('does not auto-add or save an exact registered-name candidate', () => {
    mockCandidates([candidate({ reason: 'exact_normalized_name' })]);

    renderDialog(item({ components: [] }));

    expect(screen.queryByLabelText('SP-002 수량')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('prevents adding the same MasterProduct twice', async () => {
    mockCandidates([
      candidate({
        masterProductId: FIRST_MASTER_ID,
        code: 'SP-001',
      }),
    ]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'SP-001 구성에 추가' }));

    expect(screen.getByText('이미 추가한 Sellpia 상품입니다.')).toBeInTheDocument();
    expect(screen.getAllByLabelText('SP-001 수량')).toHaveLength(1);
  });

  it('blocks the 51st component with an inline limit message', async () => {
    const components = Array.from({ length: 50 }, (_, index) =>
      component({
        masterProductId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        code: `SP-${index}`,
      }),
    );
    const user = userEvent.setup();
    renderDialog(item({ components }));

    await user.click(screen.getByRole('button', { name: 'SP-002 구성에 추가' }));

    expect(
      screen.getByText('구성품은 최대 50개까지 추가할 수 있습니다.'),
    ).toBeInTheDocument();
  });

  it('saves a same-SKU bundle quantity of 4', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: '구성 저장' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      channelSkuId: CHANNEL_SKU_ID,
      input: {
        components: [{ masterProductId: FIRST_MASTER_ID, quantity: 4 }],
      },
    });
  });

  it('saves a mixed X×1 + Y×2 recipe in draft order', async () => {
    const user = userEvent.setup();
    renderDialog(item({ components: [component({ quantity: 1 })] }));

    await user.click(screen.getByRole('button', { name: 'SP-002 구성에 추가' }));
    await user.clear(screen.getByLabelText('SP-002 수량'));
    await user.type(screen.getByLabelText('SP-002 수량'), '2');
    await user.click(screen.getByRole('button', { name: '구성 저장' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      channelSkuId: CHANNEL_SKU_ID,
      input: {
        components: [
          { masterProductId: FIRST_MASTER_ID, quantity: 1 },
          { masterProductId: SECOND_MASTER_ID, quantity: 2 },
        ],
      },
    });
  });

  it.each(['', '0', '1.5'])(
    'blocks invalid quantity %j with an inline error',
    async (quantity) => {
      const user = userEvent.setup();
      renderDialog();
      const quantityInput = screen.getByLabelText('SP-001 수량');

      fireEvent.change(quantityInput, { target: { value: quantity } });
      await user.click(screen.getByRole('button', { name: '구성 저장' }));

      expect(
        screen.getByText('수량은 1 이상의 정수여야 합니다.'),
      ).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    },
  );

  it('shows the shared database quantity maximum inline without throwing', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText('SP-001 수량'), {
      target: { value: String(MAX_CHANNEL_SKU_COMPONENT_QUANTITY + 1) },
    });

    await user.click(screen.getByRole('button', { name: '구성 저장' }));

    expect(
      screen.getByText(
        `수량은 1 이상 ${MAX_CHANNEL_SKU_COMPONENT_QUANTITY} 이하의 정수여야 합니다.`,
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('disables normal save for an empty draft', () => {
    renderDialog(item({ components: [] }));

    expect(screen.getByRole('button', { name: '구성 저장' })).toBeDisabled();
  });

  it('unmaps only after a separate confirmation and sends an empty recipe', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: '매칭 해제' }));
    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: '매칭 해제 확인' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      channelSkuId: CHANNEL_SKU_ID,
      input: { components: [] },
    });
  });

  it('discards unsaved draft edits when closed and reopened', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            다시 열기
          </button>
          <ChannelSkuComponentDialog
            open={open}
            item={item()}
            onOpenChange={setOpen}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByLabelText('SP-001 수량'), {
      target: { value: '9' },
    });
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: '다시 열기' }));

    expect(screen.getByLabelText('SP-001 수량')).toHaveValue('4');
  });

  it('submits a trimmed candidate search only when the operator requests it', async () => {
    const user = userEvent.setup();
    renderDialog();
    const callsBeforeTyping = vi.mocked(useChannelSkuCandidates).mock.calls.length;

    await user.type(screen.getByLabelText('Sellpia 후보 검색'), '  SP-NEW  ');

    const callsAfterTyping = vi.mocked(useChannelSkuCandidates).mock.calls.slice(
      callsBeforeTyping,
    );
    expect(callsAfterTyping.every((call) => call[1] === '')).toBe(true);

    await user.click(screen.getByRole('button', { name: '후보 검색' }));
    expect(vi.mocked(useChannelSkuCandidates).mock.lastCall?.[1]).toBe('SP-NEW');
  });

  it('keeps the draft dialog open when replacement fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('저장 실패'));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: '구성 저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(screen.getByRole('dialog', { name: 'Sellpia 구성 매칭' })).toBeInTheDocument();
    expect(screen.getByLabelText('SP-001 수량')).toHaveValue('4');
  });
});
