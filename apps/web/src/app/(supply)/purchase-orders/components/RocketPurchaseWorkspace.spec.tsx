import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRocketPoRowsForConfirmationFromExtension } from '@/lib/rocket-sales-collection';
import {
  getActiveRocketWorkbook,
  loadSavedRocketCollection,
  previewRocketPurchases,
} from '../lib/rocket-purchase-preview-api';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';
import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsForConfirmationFromExtension: vi.fn(),
}));
vi.mock('../lib/rocket-purchase-preview-api', () => ({
  abandonRocketWorkbook: vi.fn(),
  downloadRocketWorkbook: vi.fn(),
  exportRocketWorkbook: vi.fn(),
  getActiveRocketWorkbook: vi.fn(),
  loadSavedRocketCollection: vi.fn(),
  previewRocketPurchases: vi.fn(),
}));
vi.mock('./RocketDeterministicMatchingPanel', () => ({
  RocketDeterministicMatchingPanel: () => <div>결정적 매칭 패널</div>,
}));
vi.mock('../lib/rocket-confirmation-workbook', () => ({
  buildRocketConfirmationWorkbook: vi.fn(),
  fillRocketConfirmationWorkbook: vi.fn(),
}));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/rocket-confirm-file-store', () => ({ saveRocketConfirmFile: vi.fn() }));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_RUN_ID = '55555555-5555-4555-8555-555555555555';
const FROM = '2026-07-16';
const TO = '2026-07-16';

describe('RocketPurchaseWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveRocketWorkbook).mockResolvedValue(null);
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: collectionEvidence(),
      rows: [],
      poCount: 0,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(preview([], []));
  });

  it('keeps the existing shell but exposes workbook language without commitment inventory', () => {
    renderWorkspace();

    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '쿠팡 엑셀 다운로드' })).toBeDisabled();
    expect(screen.getByLabelText('쿠팡 원본 양식')).toBeInTheDocument();
    expect(screen.queryByText(/재고 예약|예약 확정|가용재고|약정/)).not.toBeInTheDocument();
  });

  it('collects source evidence and renders current stock with editable Excel quantity', async () => {
    const row = sourceRow();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: collectionEvidence(),
      rows: [row],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview([row], [previewRow(null, 3)]),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(collectRocketPoRowsForConfirmationFromExtension).toHaveBeenCalledWith({
      from: FROM,
      to: TO,
    });
    expect(screen.getByRole('columnheader', { name: '현재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '엑셀 수량' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '약정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '가용재고' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '1001 엑셀 수량' })).toHaveValue(3);
    expect(screen.getByText('결정적 매칭 패널')).toBeInTheDocument();
  });

  it('loads an exact saved source run and re-previews without recollection', async () => {
    const row = sourceRow();
    vi.mocked(loadSavedRocketCollection).mockResolvedValue({
      sourceImportRunId: SOURCE_RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: collectionEvidence(),
      rows: [row],
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview([row], [previewRow(null, 3)]),
    );

    renderWorkspace(SOURCE_RUN_ID);

    expect(await screen.findByRole('spinbutton', { name: '1001 엑셀 수량' })).toBeEnabled();
    expect(loadSavedRocketCollection).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: SOURCE_RUN_ID,
    });
    expect(collectRocketPoRowsForConfirmationFromExtension).not.toHaveBeenCalled();
  });

  it('shows actionable mapping blockers and keeps their quantity locked', async () => {
    const row = sourceRow();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: collectionEvidence(),
      rows: [row],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview([row], [previewRow('mapping_required', 0)]),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByText('상품 매칭 필요')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '1001 엑셀 수량' })).toBeDisabled();
  });

  it('clamps edited workbook quantities and requires whole-preview revalidation', async () => {
    const row = sourceRow();
    const baseline = preview([row], [previewRow(null, 3)]);
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: collectionEvidence(),
      rows: [row],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce({
        ...baseline,
        rows: [{ ...baseline.rows[0]!, editedQuantity: 2, recommendedQuantity: 2 }],
      });
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const quantity = await screen.findByRole('spinbutton', { name: '1001 엑셀 수량' });

    fireEvent.change(quantity, { target: { value: '9' } });
    expect(quantity).toHaveValue(3);
    fireEvent.change(quantity, { target: { value: '2.9' } });
    expect(quantity).toHaveValue(2);
    expect(screen.getByRole('button', { name: '쿠팡 엑셀 다운로드' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '수량 다시 검증' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(2));
    expect(vi.mocked(previewRocketPurchases).mock.calls[1]?.[0]).toMatchObject({
      editedQuantities: { [row.poLineId]: 2 },
      clampEditedQuantities: true,
    });
  });

  it.each([
    ['collection_incomplete', '수집 범위가 불완전합니다.'],
    ['vendor_mismatch', '선택한 로켓 채널 계정과 수집한 PO의 공급사가 일치하지 않습니다.'],
  ] as const)('aggregates %s into one operator warning', async (reason, warning) => {
    const row = sourceRow();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: collectionEvidence(),
      rows: [row],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview([row], [previewRow(reason, 0)]),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(warning);
  });

  it('shows the parent-owned date range without duplicating date inputs', () => {
    renderWorkspace();

    expect(screen.queryByLabelText('조회 시작일')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('조회 종료일')).not.toBeInTheDocument();
    expect(screen.getByText(`${FROM} ~ ${TO}`)).toBeInTheDocument();
  });
});

function renderWorkspace(savedSourceImportRunId: string | null = null) {
  return render(
    <RocketPurchaseWorkspace
      channelAccountId={ACCOUNT_ID}
      from={FROM}
      to={TO}
      savedSourceImportRunId={savedSourceImportRunId}
    />,
  );
}

function collectionEvidence() {
  return {
    collectionRunId: '22222222-2222-4222-8222-222222222222',
    vendorId: 'VENDOR-1',
    listPagesRead: 1,
    totalListPages: 1,
    truncated: false,
    detailPoCount: 1,
    failedPoNumbers: [],
  };
}

function sourceRow(): RocketPoCatalogRow {
  return {
    poLineId: '1001:P-A:8800000000001:1',
    poNumber: '1001',
    vendorId: 'VENDOR-1',
    productNo: 'P-A',
    barcode: '8800000000001',
    productName: '상품 A',
    orderQty: 3,
    plannedDeliveryDate: '2026-07-20',
    confirmation: {
      center: '덕평1센터',
      inboundType: '택배',
      poStatus: '거래처확인요청',
      returnManager: '담당자',
      returnContact: '010-0000-0000',
      returnAddress: '서울시',
      purchasePrice: 1_000,
      supplyPrice: 900,
      vat: 90,
      totalPurchase: 3_000,
      poRegisteredAt: '2026-07-17 09:00:00',
      xdock: 'N',
    },
  };
}

function previewRow(
  reason: RocketPurchasePreviewReason | null,
  recommendedQuantity: number,
): RocketPurchasePreviewResponse['rows'][number] {
  const blocked = reason === 'mapping_required'
    || reason === 'configuration_required'
    || reason === 'review_required';
  return {
    poLineId: sourceRow().poLineId,
    poNumber: '1001',
    productNo: 'P-A',
    productName: '상품 A',
    plannedDeliveryDate: '2026-07-20',
    orderQuantity: 3,
    recommendedQuantity,
    maxQuantity: recommendedQuantity,
    editedQuantity: null,
    reason,
    channelSkuId: blocked ? null : '66666666-6666-4666-8666-666666666666',
    masterProductId: blocked ? null : '77777777-7777-4777-8777-777777777777',
    productVariantId: blocked ? null : '88888888-8888-4888-8888-888888888888',
    components: blocked ? [] : [{
      sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
      quantity: 1,
      currentStock: 3,
      isActive: true,
    }],
  };
}

function preview(
  sourceRows: RocketPoCatalogRow[],
  rows: RocketPurchasePreviewResponse['rows'],
): RocketPurchasePreviewResponse {
  return {
    collectionRunId: collectionEvidence().collectionRunId,
    catalog: catalogPublication(sourceRows.length),
    inventoryGeneration: sourceRows.length > 0 ? '12' : null,
    rows,
  };
}

function catalogPublication(rowCount: number): RocketPoCatalogPublication {
  return {
    run: {
      id: SOURCE_RUN_ID,
      sourceType: 'coupang_rocket_po_catalog',
      channelAccountId: ACCOUNT_ID,
      fileName: 'rocket-po-catalog.json',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount,
      importedAt: '2026-07-16T00:00:00.000Z',
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    },
    duplicate: false,
    changes: {
      createdProductCount: 0,
      updatedProductCount: 0,
      createdSkuCount: 0,
      updatedSkuCount: 0,
    },
    recipeAutomation: {
      evaluatedProducts: 0,
      appliedProducts: 0,
      appliedVariants: 0,
      affectedOptions: 0,
      operatorReviewProducts: 0,
      blockedProducts: 0,
      alreadyConfiguredProducts: 0,
      skippedExistingVariants: 0,
    },
  };
}
