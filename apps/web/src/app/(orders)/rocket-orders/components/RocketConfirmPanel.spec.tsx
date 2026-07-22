import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRocketPurchaseWorkflow } from '@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow';
import { RocketConfirmPanel } from './RocketConfirmPanel';

const commitmentList = vi.hoisted(() => vi.fn());

vi.mock('@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow', () => ({
  useRocketPurchaseWorkflow: vi.fn(),
}));
vi.mock('./RocketMatchStatusModal', () => ({
  RocketMatchStatusModal: () => null,
}));
vi.mock('@/app/(supply)/purchase-orders/components/RocketInventoryCommitmentList', () => ({
  RocketInventoryCommitmentList: (props: {
    channelAccountId: string;
    channelAccountLabel: string;
  }) => {
    commitmentList(props);
    return <div>durable 약정 · {props.channelAccountLabel}</div>;
  },
}));

const setReviewedQuantity = vi.fn();
const setPreviewDirty = vi.fn();
const setShortageReasons = vi.fn();
const baseWorkflow = {
  editedQuantities: {},
  setReviewedQuantity,
  preview: {
    collectionRunId: '22222222-2222-4222-8222-222222222222',
    catalog: null,
    inventoryGeneration: '1',
    rows: [{
      poLineId: 'PO-1:PRODUCT-1:1',
      poNumber: 'PO-1',
      productNo: 'PRODUCT-1',
      productName: '상품 1',
      plannedDeliveryDate: '2026-07-20',
      orderQuantity: 3,
      recommendedQuantity: 3,
      maxQuantity: 3,
      editedQuantity: null,
      reason: null,
      channelSkuId: '33333333-3333-4333-8333-333333333333',
      masterProductId: '44444444-4444-4444-8444-444444444444',
      productVariantId: '55555555-5555-4555-8555-555555555555',
      components: [{
        sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666',
        quantity: 1,
        currentStock: 3,
        activeCommitmentQuantity: 0,
        availableStock: 3,
        isActive: true,
      }],
    }],
  },
  sourceRows: [{
    poLineId: 'PO-1:PRODUCT-1:1',
    poNumber: 'PO-1',
    vendorId: 'VENDOR-1',
    productNo: 'PRODUCT-1',
    barcode: '8800000000001',
    productName: '상품 1',
    orderQty: 3,
    plannedDeliveryDate: '2026-07-20',
  }],
  previewDirty: false,
  setPreviewDirty,
  shortageReasons: {},
  setShortageReasons,
  confirmation: null,
  confirming: false,
  releaseReason: '',
  setReleaseReason: vi.fn(),
  releasing: false,
  setTemplateFile: vi.fn(),
  loading: false,
  error: null,
  collectionWarning: null,
  canConfirm: false,
  canRedownload: false,
  recalculate: vi.fn(),
  revalidateEditedQuantities: vi.fn(),
  confirmPurchase: vi.fn(),
  downloadActiveConfirmation: vi.fn(),
  releaseConfirmation: vi.fn(),
};

function renderPanel(options?: { preview?: typeof baseWorkflow.preview | null }) {
  vi.mocked(useRocketPurchaseWorkflow).mockReturnValue({
    ...baseWorkflow,
    preview: options?.preview === undefined ? baseWorkflow.preview : options.preview,
  } as ReturnType<typeof useRocketPurchaseWorkflow>);
  return render(
    <RocketConfirmPanel
      onSaved={vi.fn()}
      activeMonth="2026-07"
      channelAccountId="11111111-1111-4111-8111-111111111111"
      channelAccountName="로켓 1호점"
      hasConfiguredVendorId
      from="2026-07-01"
      to="2026-07-31"
      selectedSourceImportRunId={null}
      onActivity={vi.fn()}
      onOrdersChanged={vi.fn()}
      renderOrderExplorer={({ onSelectDate }) => (
        <>
          <button type="button" onClick={() => onSelectDate('2026-07-21', 0)}>빈 날짜</button>
          <button type="button" onClick={() => onSelectDate('2026-07-22', 2)}>여러 수집본 날짜</button>
        </>
      )}
    />,
  );
}

describe('<RocketConfirmPanel />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an explicit shortage reason without choosing the first option for the operator', () => {
    renderPanel();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'PO-1 검토수량' }), {
      target: { value: '2' },
    });

    const updateReasons = setShortageReasons.mock.calls.at(-1)?.[0] as (
      current: Record<string, string>,
    ) => Record<string, string>;
    expect(updateReasons({})).toEqual({});
    expect(setReviewedQuantity).toHaveBeenCalledWith('PO-1:PRODUCT-1:1', 2);
    expect(screen.getByRole('button', { name: '예약 확정' })).toBeDisabled();
  });

  it('renders one preview heading and one current-preview matching action', () => {
    renderPanel();
    const heading = screen.getByText(/미리보기 · 편집/);
    expect(heading.textContent?.match(/미리보기 · 편집/g)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /매칭 현황/ })).toHaveLength(1);
  });

  it('distinguishes an empty selected day from a day requiring source choice', () => {
    renderPanel({ preview: null });
    fireEvent.click(screen.getByRole('button', { name: '빈 날짜' }));
    expect(screen.getByText('선택한 날짜에 저장된 발주가 없습니다. 쿠팡에서 새로 수집해 주세요.'))
      .toBeInTheDocument();
    expect(screen.queryByText(/이 수집본으로 납품 판단/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '여러 수집본 날짜' }));
    expect(screen.getByText(/이 수집본으로 납품 판단/)).toBeInTheDocument();
  });

  it('rehydrates a labeled account-scoped durable release surface after remount', () => {
    const firstRender = renderPanel({ preview: null });
    expect(screen.getByText('durable 약정 · 로켓 1호점')).toBeInTheDocument();
    expect(commitmentList).toHaveBeenLastCalledWith(expect.objectContaining({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      channelAccountLabel: '로켓 1호점',
    }));
    firstRender.unmount();

    renderPanel({ preview: null });
    expect(commitmentList).toHaveBeenCalledTimes(2);
  });
});
