import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRocketPurchaseWorkflow } from '@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow';
import type {
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import { RocketConfirmPanel } from './RocketConfirmPanel';

vi.mock('@/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow', () => ({
  useRocketPurchaseWorkflow: vi.fn(),
}));
vi.mock('./RocketMatchStatusModal', async (importOriginal) => ({
  ...await importOriginal<typeof import('./RocketMatchStatusModal')>(),
  RocketMatchStatusModal: () => null,
}));
vi.mock('@/app/(supply)/purchase-orders/components/RocketDeterministicMatchingPanel', () => ({
  RocketDeterministicMatchingPanel: () => <div>상품·재고 매칭 상태</div>,
}));

const setReviewedQuantity = vi.fn();
const setPreviewDirty = vi.fn();
const setShortageReasons = vi.fn();
const basePreview: RocketPurchasePreviewResponse = {
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
      isActive: true,
    }],
  }],
};

const baseWorkflow = {
  editedQuantities: {},
  setReviewedQuantity,
  preview: basePreview,
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
  workbookExport: null,
  exporting: false,
  abandonReason: '',
  setAbandonReason: vi.fn(),
  abandoning: false,
  setTemplateFile: vi.fn(),
  loading: false,
  error: null,
  collectionWarning: null,
  canExport: false,
  canRedownload: false,
  recalculate: vi.fn(),
  revalidateEditedQuantities: vi.fn(),
  exportAndDownload: vi.fn(),
  downloadActiveWorkbook: vi.fn(),
  refreshActiveWorkbook: vi.fn(),
  abandonActiveWorkbook: vi.fn(),
};

function renderPanel(options?: {
  preview?: RocketPurchasePreviewResponse | null;
  workflow?: Partial<typeof baseWorkflow>;
}) {
  vi.mocked(useRocketPurchaseWorkflow).mockReturnValue({
    ...baseWorkflow,
    ...options?.workflow,
    preview: options?.preview === undefined ? basePreview : options.preview,
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
    fireEvent.change(screen.getByRole('spinbutton', { name: 'PO-1 엑셀 수량' }), {
      target: { value: '2' },
    });

    const updateReasons = setShortageReasons.mock.calls.at(-1)?.[0] as (
      current: Record<string, string>,
    ) => Record<string, string>;
    expect(updateReasons({})).toEqual({});
    expect(setReviewedQuantity).toHaveBeenCalledWith('PO-1:PRODUCT-1:1', 2);
    expect(screen.getByRole('button', { name: '쿠팡 엑셀 다운로드' })).toBeDisabled();
  });

  it('renders one preview heading and one current-preview matching action', () => {
    renderPanel();
    const heading = screen.getByText(/미리보기 · 편집/);
    expect(heading.textContent?.match(/미리보기 · 편집/g)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /매칭 현황/ })).toHaveLength(1);
  });

  it.each([
    ['mapping_required', '상품 연결 필요'],
    ['configuration_required', '재고 구성 필요'],
    ['review_required', '레시피 검토 필요'],
  ] as const)('blocks quantity review for %s and routes the operator to matching', (reason, label) => {
    renderPanel({ preview: previewWithReason(reason) });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'PO-1 엑셀 수량' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'PO-1 납품부족사유' })).toBeDisabled();
    expect(screen.getByRole('link', { name: `${label} 해결` })).toHaveAttribute(
      'href',
      '/product-hub/matching?channelAccountId=11111111-1111-4111-8111-111111111111&search=PRODUCT-1&focusOptionId=33333333-3333-4333-8333-333333333333',
    );
  });

  it.each([
    ['collection_incomplete', '수집 검증 필요'],
    ['vendor_mismatch', '공급사 검증 필요'],
  ] as const)('blocks quantity and shortage editing for %s', (reason, label) => {
    renderPanel({ preview: previewWithReason(reason) });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'PO-1 엑셀 수량' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'PO-1 납품부족사유' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '전체 납품부족사유' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: `${label} 해결` })).not.toBeInTheDocument();
  });

  it('keeps an insufficient-capacity row editable and shows only physical current stock', () => {
    renderPanel({ preview: previewWithReason('insufficient_capacity') });

    expect(screen.getByText('구성 완료')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'PO-1 엑셀 수량' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'PO-1 납품부족사유' })).toBeEnabled();
    expect(screen.getByRole('columnheader', { name: 'Sellpia 원재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '납품가능' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '엑셀 수량' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '약정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '가용재고' })).not.toBeInTheDocument();
  });

  it('distinguishes Sellpia physical stock from the per-line deliverable limit', () => {
    const preview = previewWithReason('insufficient_capacity');
    renderPanel({
      preview: {
        ...preview,
        rows: preview.rows.map((row) => ({
          ...row,
          orderQuantity: 18,
          recommendedQuantity: 0,
          maxQuantity: 0,
          components: row.components.map((component) => ({
            ...component,
            currentStock: 307,
            quantity: 4,
          })),
        })),
      },
    });

    expect(screen.getByRole('columnheader', { name: 'Sellpia 원재고' })).toBeInTheDocument();
    expect(screen.getByText('구성 ×4')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'PO-1 납품가능 0개' })).toBeInTheDocument();
  });

  it('applies one shortage reason to every eligible short row', () => {
    const secondRow = {
      ...previewWithReason('insufficient_capacity').rows[0]!,
      poLineId: 'PO-2:PRODUCT-2:1',
      poNumber: 'PO-2',
      productNo: 'PRODUCT-2',
      productName: '상품 2',
      channelSkuId: '77777777-7777-4777-8777-777777777777',
    };
    renderPanel({
      preview: {
        ...previewWithReason('insufficient_capacity'),
        rows: [previewWithReason('insufficient_capacity').rows[0]!, secondRow],
      },
    });

    fireEvent.change(screen.getByRole('combobox', { name: '전체 납품부족사유' }), {
      target: { value: '협력사 재고부족 - 수요예측 오류' },
    });
    fireEvent.click(screen.getByRole('button', { name: '부족 행 전체 적용' }));

    const updateReasons = setShortageReasons.mock.calls.at(-1)?.[0] as (
      current: Record<string, string>,
    ) => Record<string, string>;
    expect(updateReasons({ existing: '기존 사유' })).toEqual({
      existing: '기존 사유',
      'PO-1:PRODUCT-1:1': '협력사 재고부족 - 수요예측 오류',
      'PO-2:PRODUCT-2:1': '협력사 재고부족 - 수요예측 오류',
    });
    expect(setPreviewDirty).toHaveBeenCalledWith(true);
  });

  it('recalculates the same saved preview after mapping is reflected', () => {
    const revalidateEditedQuantities = vi.fn();
    renderPanel({
      preview: previewWithReason('mapping_required'),
      workflow: { revalidateEditedQuantities },
    });

    fireEvent.click(screen.getByRole('button', { name: '매핑 반영해 다시 계산' }));
    expect(revalidateEditedQuantities).toHaveBeenCalledTimes(1);
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

  it('keeps exact re-download available while no-match abandonment remains evidence-gated', () => {
    renderPanel({
      preview: null,
      workflow: {
        workbookExport: activeWorkbook(),
        canRedownload: true,
      },
    });

    expect(screen.getByText('쿠팡 업로드·발주확정 대기', { exact: false }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동일 파일 다시 다운로드' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '워크북 사용 안 함' })).toBeDisabled();
    expect(screen.queryByText(/재고 예약|예약 확정|가용재고|약정/)).not.toBeInTheDocument();
  });
});

function previewWithReason(reason: RocketPurchasePreviewReason): RocketPurchasePreviewResponse {
  return {
    ...basePreview,
    rows: basePreview.rows.map((row) => ({
      ...row,
      reason,
      recommendedQuantity: reason === 'insufficient_capacity' ? 2 : 0,
      maxQuantity: reason === 'insufficient_capacity' ? 2 : 0,
      masterProductId: reason === 'mapping_required' ? null : row.masterProductId,
      productVariantId: reason === 'mapping_required' ? null : row.productVariantId,
      components: reason === 'insufficient_capacity' ? row.components : [],
    })),
  };
}

function activeWorkbook() {
  return {
    exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'awaiting_coupang_confirmation' as const,
    duplicate: false,
    canAbandon: false,
    inventoryGeneration: '1',
    generatedAt: '2026-07-23T00:00:00.000Z',
    artifact: {
      fileName: 'rocket.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
      sha256: 'a'.repeat(64),
      byteLength: 10,
    },
    totals: {
      lineCount: 1,
      orderQuantity: 3,
      workbookQuantity: 3,
      componentQuantity: 3,
    },
    rows: [{ poLineId: 'PO-1:PRODUCT-1:1', workbookQuantity: 3, shortageReason: null }],
  };
}
