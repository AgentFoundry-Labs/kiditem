import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectRocketPoRowsForConfirmationFromExtension,
  collectRocketPoRowsFromExtension,
} from '@/lib/rocket-sales-collection';
import { downloadBlob } from '@/lib/browser-download';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
import {
  confirmRocketPurchase,
  loadSavedRocketCollection,
  previewRocketPurchases,
  releaseRocketPurchaseConfirmation,
} from '../lib/rocket-purchase-preview-api';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';
import type {
  RocketPoCatalogPublication,
  RocketPurchasePreviewRow,
} from '@kiditem/shared/rocket-purchase-preview';

const collectionMocks = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsFromExtension: collectionMocks.collect,
  collectRocketPoRowsForConfirmationFromExtension: collectionMocks.collect,
}));
vi.mock('../lib/rocket-purchase-preview-api', () => ({
  previewRocketPurchases: vi.fn(),
  confirmRocketPurchase: vi.fn(),
  releaseRocketPurchaseConfirmation: vi.fn(),
  loadSavedRocketCollection: vi.fn(),
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
// 입고예정일 범위는 상위(로켓 발주 캘린더 / 단독 화면)가 소유하고 props 로 내려준다.
const FROM = '2026-07-16';
const TO = '2026-07-16';
const lineA = {
  poLineId: '1001:P-A:8800000000001:1',
  poNumber: '1001',
  vendorId: 'VENDOR-1',
  productNo: 'P-A',
  barcode: '8800000000001',
  productName: '상품 A',
  orderQty: 3,
  plannedDeliveryDate: '2026-07-20',
};
const lineB = {
  ...lineA,
  poLineId: '1002:P-B:8800000000002:1',
  poNumber: '1002',
  productNo: 'P-B',
  barcode: '8800000000002',
  productName: '상품 B',
};
const confirmationLineA = {
  ...lineA,
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
    totalPurchase: 3_960,
    poRegisteredAt: '2026-07-17 09:00:00',
    xdock: 'N',
  },
};

function previewRow(
  row: typeof lineA,
  maxQuantity: number,
): RocketPurchasePreviewRow {
  return {
    poLineId: row.poLineId,
    poNumber: row.poNumber,
    productNo: row.productNo,
    productName: row.productName,
    plannedDeliveryDate: row.plannedDeliveryDate,
    orderQuantity: row.orderQty,
    recommendedQuantity: Math.min(row.orderQty, maxQuantity),
    maxQuantity,
    editedQuantity: null,
    reason: null,
    channelSkuId: null,
    components: [],
  };
}

function catalogPublication(rowCount = 0): RocketPoCatalogPublication {
  return {
    run: {
      id: '55555555-5555-4555-8555-555555555555',
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

describe('RocketPurchaseWorkspace', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
      rows: [],
      poCount: 0,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: catalogPublication(),
      inventoryGeneration: null,
      rows: [],
    });
    vi.mocked(buildRocketConfirmationWorkbook).mockReturnValue({
      blob: new Blob(['workbook']),
      fileName: '발주확정_20260717.xlsx',
      summary: {
        totalRows: 1,
        confirmedQuantity: 2,
        fullyConfirmedRows: 0,
        shortRows: 1,
      },
    });
    vi.mocked(fillRocketConfirmationWorkbook).mockReturnValue({
      blob: new Blob(['filled-workbook']),
      fileName: '쿠팡_원본_확정_20260717.xlsx',
      summary: {
        totalRows: 1,
        confirmedQuantity: 3,
        fullyConfirmedRows: 1,
        shortRows: 0,
      },
    });
    vi.mocked(saveRocketConfirmFile).mockResolvedValue();
  });

  it('keeps confirmation disabled until a complete preview has been reviewed', () => {
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled();
    expect(screen.getByText('미리보기 검토 후 확정할 수 있습니다.')).toBeInTheDocument();
  });

  it('confirms explicit reviewed quantities and downloads the generated workbook', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [confirmationLineA],
      poCount: 1,
    });
    const initialPreview = {
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: catalogPublication(1),
      inventoryGeneration: '12',
      rows: [{
        ...previewRow(lineA, 3),
        channelSkuId: '66666666-6666-4666-8666-666666666666',
        masterProductId: '77777777-7777-4777-8777-777777777777',
        productVariantId: '88888888-8888-4888-8888-888888888888',
        components: [{
          sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          currentStock: 3,
          activeCommitmentQuantity: 0,
          availableStock: 3,
          isActive: true,
        }],
      }],
    };
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(initialPreview)
      .mockResolvedValueOnce({
        ...initialPreview,
        rows: [{
          ...initialPreview.rows[0]!,
          editedQuantity: 2,
          recommendedQuantity: 2,
        }],
      })
      .mockResolvedValueOnce({
        ...initialPreview,
        rows: [{
          ...initialPreview.rows[0]!,
          editedQuantity: 2,
          recommendedQuantity: 2,
        }],
      });
    vi.mocked(confirmRocketPurchase).mockResolvedValue({
      confirmationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active',
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 3,
        confirmedQuantity: 2,
        allocatedQuantity: 2,
      },
      rows: [{
        poLineId: lineA.poLineId,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    expect(collectRocketPoRowsForConfirmationFromExtension).toHaveBeenCalled();
    const quantity = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    await user.clear(quantity);
    await user.type(quantity, '2');
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수량 다시 검증' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '수량 다시 검증' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled());
    await user.selectOptions(
      screen.getByRole('combobox', { name: '1001 납품부족사유' }),
      '협력사 재고부족 - 수요예측 오류',
    );
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수량 다시 검증' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '수량 다시 검증' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' }));

    expect(confirmRocketPurchase).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      editedQuantities: { [lineA.poLineId]: 2 },
      shortageReasons: {
        [lineA.poLineId]: '협력사 재고부족 - 수요예측 오류',
      },
    }));
    expect(buildRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      sourceRows: [confirmationLineA],
    }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), '발주확정_20260717.xlsx');
    expect(saveRocketConfirmFile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rocket-confirmation-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      fileName: '발주확정_20260717.xlsx',
    }));
    expect(screen.getByText(/확정 완료/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveClass('table-fixed');
  });

  it('fills a selected Coupang source workbook instead of replacing its layout', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [confirmationLineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: catalogPublication(1),
      inventoryGeneration: '12',
      rows: [{
        ...previewRow(lineA, 3),
        channelSkuId: '66666666-6666-4666-8666-666666666666',
        productVariantId: '88888888-8888-4888-8888-888888888888',
        components: [{
          sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          currentStock: 3,
          activeCommitmentQuantity: 0,
          availableStock: 3,
          isActive: true,
        }],
      }],
    });
    vi.mocked(confirmRocketPurchase).mockResolvedValue({
      confirmationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active',
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 3,
        confirmedQuantity: 3,
        allocatedQuantity: 3,
      },
      rows: [{
        poLineId: lineA.poLineId,
        confirmedQuantity: 3,
        shortageReason: null,
      }],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    const template = new File(
      [new Uint8Array([1, 2, 3])],
      '쿠팡_원본.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );
    await user.upload(screen.getByLabelText('쿠팡 원본 양식'), template);
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    await user.click(await screen.findByRole('button', { name: '확정 후 엑셀 다운로드' }));

    expect(fillRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      template: expect.any(ArrayBuffer),
      templateFileName: '쿠팡_원본.xlsx',
      sourceRows: [confirmationLineA],
    }));
    expect(buildRocketConfirmationWorkbook).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      '쿠팡_원본_확정_20260717.xlsx',
    );

    await user.click(screen.getByRole('button', { name: '원본 양식 선택 해제' }));
    await user.click(screen.getByRole('button', { name: '엑셀 다시 다운로드' }));

    expect(fillRocketConfirmationWorkbook).toHaveBeenCalledTimes(1);
    expect(buildRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      sourceRows: [confirmationLineA],
    }));
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), '발주확정_20260717.xlsx');
  });

  it('releases an active allocation only with an explicit operator reason', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [confirmationLineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: catalogPublication(1),
      inventoryGeneration: '12',
      rows: [{
        ...previewRow(lineA, 3),
        channelSkuId: '66666666-6666-4666-8666-666666666666',
        productVariantId: '88888888-8888-4888-8888-888888888888',
        components: [{
          sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          currentStock: 3,
          activeCommitmentQuantity: 0,
          availableStock: 3,
          isActive: true,
        }],
      }],
    });
    const activeConfirmation = {
      confirmationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active' as const,
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 3,
        confirmedQuantity: 3,
        allocatedQuantity: 3,
      },
      rows: [{
        poLineId: lineA.poLineId,
        confirmedQuantity: 3,
        shortageReason: null,
      }],
    };
    vi.mocked(confirmRocketPurchase).mockResolvedValue(activeConfirmation);
    vi.mocked(releaseRocketPurchaseConfirmation).mockResolvedValue({
      ...activeConfirmation,
      status: 'released',
      releasedAt: '2026-07-17T01:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    await user.click(await screen.findByRole('button', { name: '확정 후 엑셀 다운로드' }));
    const releaseButton = screen.getByRole('button', { name: '예약 종료' });
    expect(releaseButton).toBeDisabled();
    await user.type(screen.getByLabelText('예약 종료 사유'), 'PO 일정 변경');
    await user.click(releaseButton);

    expect(releaseRocketPurchaseConfirmation).toHaveBeenCalledWith({
      confirmationId: activeConfirmation.confirmationId,
      reason: 'PO 일정 변경',
    });
    expect(await screen.findByText('예약 종료됨 · 다시 계산해 주세요.'))
      .toBeInTheDocument();
  });

  it('keeps a committed allocation visible and allows workbook retry without reconfirming', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [confirmationLineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: catalogPublication(1),
      inventoryGeneration: '12',
      rows: [{
        ...previewRow(lineA, 3),
        channelSkuId: '66666666-6666-4666-8666-666666666666',
        productVariantId: '88888888-8888-4888-8888-888888888888',
        components: [{
          sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          currentStock: 3,
          activeCommitmentQuantity: 0,
          availableStock: 3,
          isActive: true,
        }],
      }],
    });
    vi.mocked(confirmRocketPurchase).mockResolvedValue({
      confirmationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active',
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 3,
        confirmedQuantity: 3,
        allocatedQuantity: 3,
      },
      rows: [{
        poLineId: lineA.poLineId,
        confirmedQuantity: 3,
        shortageReason: null,
      }],
    });
    vi.mocked(buildRocketConfirmationWorkbook)
      .mockImplementationOnce(() => {
        throw new Error('workbook failed');
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    await user.click(await screen.findByRole('button', { name: '확정 후 엑셀 다운로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '확정은 완료됐지만 엑셀 생성에 실패했습니다.',
    );
    expect(screen.getByText(/확정 완료/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '엑셀 다시 다운로드' }));
    expect(confirmRocketPurchase).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });

  it('shows the query range given by the parent instead of owning its own date inputs', () => {
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from="2026-07-16" to="2026-07-22" />);

    // 범위는 상위(캘린더/단독 화면)가 소유한다 — 여기서는 날짜 입력을 두지 않는다.
    expect(screen.queryByLabelText('조회 시작일')).toBeNull();
    expect(screen.queryByLabelText('조회 종료일')).toBeNull();
    expect(screen.getByText('2026-07-16 ~ 2026-07-22')).toBeInTheDocument();
  });

  it('loads a selected saved snapshot and re-previews inventory without extension recollection', async () => {
    const savedRunId = '77777777-7777-4777-8777-777777777777';
    vi.mocked(loadSavedRocketCollection).mockResolvedValue({
      sourceImportRunId: savedRunId,
      channelAccountId: ACCOUNT_ID,
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [confirmationLineA],
    });

    render(
      <RocketPurchaseWorkspace
        channelAccountId={ACCOUNT_ID}
        from={FROM}
        to={TO}
        savedSourceImportRunId={savedRunId}
      />,
    );

    await waitFor(() => expect(loadSavedRocketCollection).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: savedRunId,
    }));
    expect(collectRocketPoRowsForConfirmationFromExtension).not.toHaveBeenCalled();
    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      rows: [confirmationLineA],
    }));
  });

  it('collects evidence then sends only a preview action', async () => {
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(collectRocketPoRowsFromExtension).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      editedQuantities: {},
    }));
    expect(screen.queryByText(/예약 완료|확정 파일 생성|제출 완료/)).not.toBeInTheDocument();
  });

  it('shows a clear no-PO state and collection evidence for a legitimate zero-row run', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: '',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
      rows: [],
      poCount: 0,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByText('해당 기간에 검토할 로켓 PO가 없습니다.'))
      .toBeInTheDocument();
    expect(screen.getByText(
      '거래확인서요청 상태만 검토합니다. 조회 기간을 바꾼 뒤 다시 계산해 보세요.',
    )).toBeInTheDocument();
    expect(screen.getByText(/목록 1\/1페이지/)).toBeInTheDocument();
    expect(screen.getByText(/PO 0건/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    {
      label: '목록 20페이지 제한',
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 20,
        totalListPages: 20,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [lineA],
    },
    {
      label: '상세 40건 제한',
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 40,
        failedPoNumbers: [],
      },
      rows: Array.from({ length: 40 }, (_, index) => ({
        ...lineA,
        poLineId: `${1001 + index}:P-${index}:8800000000001:1`,
        poNumber: `${1001 + index}`,
        productNo: `P-${index}`,
      })),
    },
  ])('warns when collection reaches the server $label hard limit', async ({ collection, rows }) => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection,
      rows,
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: collection.collectionRunId,
      catalog: null,
      inventoryGeneration: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('수집 범위가 불완전합니다.');
  });

  it.each([
    {
      label: 'retained row vendor differs from evidence',
      rows: [{ ...lineA, vendorId: 'OTHER-VENDOR' }],
      detailPoCount: 1,
    },
    {
      label: 'detail count differs from unique retained PO count',
      rows: [lineA, { ...lineB, poNumber: lineA.poNumber }],
      detailPoCount: 2,
    },
  ])('warns when $label', async ({ rows, detailPoCount }) => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount,
        failedPoNumbers: [],
      },
      rows,
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('수집 범위가 불완전합니다.');
  });

  it('warns when the collected list or PO details are incomplete', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 2,
        truncated: true,
        detailPoCount: 1,
        failedPoNumbers: ['1002'],
      },
      rows: [lineA],
      poCount: 2,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [previewRow(lineA, 3)],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '수집 범위가 불완전합니다. 누락된 PO를 확인한 뒤 다시 계산해 주세요.',
    );
    expect(screen.getByText(/목록 1\/2페이지/)).toBeInTheDocument();
    expect(screen.getByText(/상세 1\/2건/)).toBeInTheDocument();
    expect(screen.getByText(/실패 PO 1건/)).toBeInTheDocument();
  });

  it.each([
    ['collection_incomplete', '수집 범위가 불완전합니다.'],
    ['vendor_mismatch', '선택한 로켓 채널 계정과 수집한 PO의 공급사가 일치하지 않습니다.'],
  ] as const)(
    'aggregates the server %s preview reason into an operator warning',
    async (reason, warning) => {
      vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
        collection: {
          collectionRunId: '22222222-2222-4222-8222-222222222222',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 1,
          failedPoNumbers: [],
        },
        rows: [lineA],
        poCount: 1,
      });
      vi.mocked(previewRocketPurchases).mockResolvedValue({
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        catalog: null,
        inventoryGeneration: null,
        rows: [{ ...previewRow(lineA, 0), reason }],
      });
      const user = userEvent.setup();
      render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

      await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(warning);
    },
  );

  it('distinguishes a missing Rocket account vendor ID from an actual vendor mismatch', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [lineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [{ ...previewRow(lineA, 0), reason: 'vendor_mismatch' }],
    });
    const user = userEvent.setup();
    render(
      <RocketPurchaseWorkspace
        channelAccountId={ACCOUNT_ID}
        hasConfiguredVendorId={false}
        from={FROM}
        to={TO}
      />,
    );

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '선택한 로켓 채널 계정에 공급사 ID가 설정되지 않았습니다.',
    );
    expect(screen.getByText('공급사 ID 설정 필요')).toBeInTheDocument();
    expect(screen.queryByText('채널 계정 불일치')).not.toBeInTheDocument();
  });

  it('renders every preview reason as Korean operator guidance', async () => {
    const reasonRows = [
      ['mapping_required', '상품 매칭 필요'],
      ['configuration_required', '구성 필요'],
      ['review_required', '검토 필요'],
      ['insufficient_capacity', 'Sellpia 재고 부족'],
      ['collection_incomplete', '수집 자료 불완전'],
      ['vendor_mismatch', '채널 계정 불일치'],
    ] as const;
    const rows = reasonRows.map(([reason], index) => ({
      ...previewRow({
        ...lineA,
        poLineId: `${lineA.poLineId}-${index}`,
        poNumber: `${1001 + index}`,
        productNo: `P-${index}`,
      }, 0),
      reason,
    }));
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: rows.length,
        failedPoNumbers: [],
      },
      rows: rows.map((row) => ({
        ...lineA,
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productNo: row.productNo,
      })),
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows,
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(screen.getAllByRole('columnheader')).toHaveLength(10);
    expect(screen.getByRole('table').querySelectorAll('col')).toHaveLength(10);
    for (const [, message] of reasonRows) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  });

  it('clamps review quantities to integer values between zero and the row maximum', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [lineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [previewRow(lineA, 3)],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const quantity = await screen.findByRole('spinbutton', { name: '1001 검토수량' });

    expect(quantity).toHaveAttribute('step', '1');
    fireEvent.change(quantity, { target: { value: '2.9' } });
    expect(quantity).toHaveValue(2);
    fireEvent.change(quantity, { target: { value: '9' } });
    expect(quantity).toHaveValue(3);
    fireEvent.change(quantity, { target: { value: '-3' } });
    expect(quantity).toHaveValue(0);
  });

  it('sends retained edits once and lets the server clamp them against fresh capacity', async () => {
    vi.mocked(collectRocketPoRowsFromExtension)
      .mockResolvedValueOnce({
        collection: {
          collectionRunId: '22222222-2222-4222-8222-222222222222',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 2,
          failedPoNumbers: [],
        },
        rows: [lineA, lineB],
        poCount: 2,
      })
      .mockResolvedValueOnce({
        collection: {
          collectionRunId: '33333333-3333-4333-8333-333333333333',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 1,
          failedPoNumbers: [],
        },
        rows: [lineB],
        poCount: 1,
      });
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce({
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        catalog: null,
        inventoryGeneration: null,
        rows: [previewRow(lineA, 3), previewRow(lineB, 4)],
      })
      .mockResolvedValueOnce({
        collectionRunId: '33333333-3333-4333-8333-333333333333',
        catalog: null,
        inventoryGeneration: null,
        rows: [{
          ...previewRow(lineB, 2),
          editedQuantity: 2,
          recommendedQuantity: 2,
        }],
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const editA = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    const editB = screen.getByRole('spinbutton', { name: '1002 검토수량' });
    await user.clear(editA);
    await user.type(editA, '3');
    await user.clear(editB);
    await user.type(editB, '4');
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(2));
    expect(vi.mocked(previewRocketPurchases).mock.calls[1]?.[0]).toMatchObject({
      editedQuantities: { [lineB.poLineId]: 3 },
      clampEditedQuantities: true,
    });
    expect(screen.getByRole('spinbutton', { name: '1002 검토수량' })).toHaveValue(2);
  });

  it('blocks confirmation until the server jointly revalidates edits that share component stock', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 2,
        failedPoNumbers: [],
      },
      rows: [lineA, lineB],
      poCount: 2,
    });
    const baseline = {
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      inventoryGeneration: null,
      rows: [previewRow(lineA, 3), previewRow(lineB, 3)],
    };
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce({
        ...baseline,
        rows: [
          {
            ...previewRow(lineA, 3),
            editedQuantity: 3,
            recommendedQuantity: 3,
          },
          {
            ...previewRow(lineB, 0),
            editedQuantity: 0,
            recommendedQuantity: 0,
          },
        ],
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} from={FROM} to={TO} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const editA = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    const editB = screen.getByRole('spinbutton', { name: '1002 검토수량' });
    await user.clear(editA);
    await user.type(editA, '10');
    await user.clear(editB);
    await user.type(editB, '9');
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '수량 다시 검증' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(2));
    expect(vi.mocked(previewRocketPurchases).mock.calls[1]?.[0]).toMatchObject({
      editedQuantities: {
        [lineA.poLineId]: 3,
        [lineB.poLineId]: 3,
      },
      clampEditedQuantities: true,
    });
    expect(screen.getByRole('spinbutton', { name: '1001 검토수량' })).toHaveValue(3);
    expect(screen.getByRole('spinbutton', { name: '1002 검토수량' })).toHaveValue(0);
    expect(collectRocketPoRowsForConfirmationFromExtension).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears account A in-memory confirmation when switching to B so B is not blocked', async () => {
    const accountB = '12121212-1212-4212-8212-121212121212';
    const savedRunA = '77777777-7777-4777-8777-777777777777';
    const savedRunB = '88888888-8888-4888-8888-888888888888';
    const confirmationLineB = {
      ...confirmationLineA,
      poLineId: '2002:P-B:8800000000002:1',
      poNumber: '2002',
      productNo: 'P-B',
      barcode: '8800000000002',
      productName: '상품 B',
      vendorId: 'VENDOR-2',
    };
    vi.mocked(loadSavedRocketCollection).mockImplementation(async ({
      channelAccountId,
      sourceImportRunId,
    }) => ({
      sourceImportRunId,
      channelAccountId,
      collection: {
        collectionRunId: sourceImportRunId,
        vendorId: channelAccountId === ACCOUNT_ID ? 'VENDOR-1' : 'VENDOR-2',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [channelAccountId === ACCOUNT_ID ? confirmationLineA : confirmationLineB],
    }));
    vi.mocked(previewRocketPurchases).mockImplementation(async ({ rows }) => ({
      collectionRunId: rows[0]!.poNumber === '1001' ? savedRunA : savedRunB,
      catalog: catalogPublication(1),
      inventoryGeneration: '12',
      rows: [{
        ...previewRow(rows[0]!, 3),
        channelSkuId: '66666666-6666-4666-8666-666666666666',
        masterProductId: '77777777-7777-4777-8777-777777777777',
        productVariantId: '88888888-8888-4888-8888-888888888888',
        components: [{
          sellpiaInventorySkuId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          currentStock: 3,
          activeCommitmentQuantity: 0,
          availableStock: 3,
          isActive: true,
        }],
      }],
    }));
    const activeConfirmation = {
      confirmationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'active' as const,
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 3,
        confirmedQuantity: 3,
        allocatedQuantity: 3,
      },
      rows: [{
        poLineId: confirmationLineA.poLineId,
        confirmedQuantity: 3,
        shortageReason: null,
      }],
    };
    vi.mocked(confirmRocketPurchase).mockImplementation(async ({ channelAccountId }) => ({
      ...activeConfirmation,
      confirmationId: channelAccountId === ACCOUNT_ID
        ? activeConfirmation.confirmationId
        : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      rows: [{
        poLineId: channelAccountId === ACCOUNT_ID
          ? confirmationLineA.poLineId
          : confirmationLineB.poLineId,
        confirmedQuantity: 3,
        shortageReason: null,
      }],
    }));
    const user = userEvent.setup();
    const { rerender } = render(
      <RocketPurchaseWorkspace
        channelAccountId={ACCOUNT_ID}
        from={FROM}
        to={TO}
        savedSourceImportRunId={savedRunA}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '확정 후 엑셀 다운로드' }));
    expect(await screen.findByRole('button', { name: '예약 종료' })).toBeInTheDocument();
    vi.mocked(buildRocketConfirmationWorkbook).mockClear();

    rerender(
      <RocketPurchaseWorkspace
        channelAccountId={accountB}
        from={FROM}
        to={TO}
        savedSourceImportRunId={savedRunB}
      />,
    );
    await waitFor(() => expect(loadSavedRocketCollection).toHaveBeenCalledWith({
      channelAccountId: accountB,
      sourceImportRunId: savedRunB,
    }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '예약 종료' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' }));
    expect(confirmRocketPurchase).toHaveBeenCalledTimes(2);
    expect(confirmRocketPurchase).toHaveBeenLastCalledWith(expect.objectContaining({
      channelAccountId: accountB,
    }));
  });
});
