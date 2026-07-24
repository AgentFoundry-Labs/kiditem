import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewResponse,
  RocketSavedPoCollection,
} from '@kiditem/shared/rocket-purchase-preview';
import { collectRocketPoRowsForConfirmationFromExtension } from '@/lib/rocket-sales-collection';
import {
  abandonRocketWorkbook,
  downloadRocketWorkbook,
  exportRocketWorkbook,
  getActiveRocketWorkbook,
  loadSavedRocketCollection,
  previewRocketPurchases,
} from '../lib/rocket-purchase-preview-api';
import {
  buildRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import { downloadBlob } from '@/lib/browser-download';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
import { useRocketPurchaseWorkflow } from './useRocketPurchaseWorkflow';

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
vi.mock('../lib/rocket-confirmation-workbook', () => ({
  buildRocketConfirmationWorkbook: vi.fn(),
  fillRocketConfirmationWorkbook: vi.fn(),
}));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/rocket-confirm-file-store', () => ({ saveRocketConfirmFile: vi.fn() }));

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const SOURCE_A = '33333333-3333-4333-8333-333333333333';
const SOURCE_B = '44444444-4444-4444-8444-444444444444';
const COLLECTION_A = '55555555-5555-4555-8555-555555555555';
const COLLECTION_B = '66666666-6666-4666-8666-666666666666';
const OPTION_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const VARIANT_ID = '99999999-9999-4999-8999-999999999999';
const SKU_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SHORTAGE_REASON = '협력사 재고부족 - 수요예측 오류' as const;

describe('useRocketPurchaseWorkflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockRejectedValue(
      new Error('unexpected collection'),
    );
    vi.mocked(getActiveRocketWorkbook).mockResolvedValue(null);
    vi.mocked(exportRocketWorkbook).mockRejectedValue(new Error('unexpected export'));
    vi.mocked(downloadRocketWorkbook).mockRejectedValue(new Error('unexpected download'));
    vi.mocked(abandonRocketWorkbook).mockRejectedValue(new Error('unexpected abandon'));
  });

  it('revalidates the same saved collection without sending an untouched mapping zero', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', 'mapping_required', 0)]))
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 3)]));
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.preview?.rows[0]?.reason)
      .toBe('mapping_required'));
    expect(hook.result.current.editedQuantities['LINE-A']).toBe(0);

    await act(async () => hook.result.current.revalidateEditedQuantities());

    expect(previewRocketPurchases).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channelAccountId: ACCOUNT_A,
      collection: source.collection,
      rows: source.rows,
      editedQuantities: {},
      clampEditedQuantities: true,
    }));
    expect(hook.result.current.editedQuantities['LINE-A']).toBe(3);
    expect(hook.result.current.preview?.rows[0]?.reason).toBeNull();
  });

  it('keeps the saved preview visible while a fresh collection is running', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const freshCollection = deferred<Awaited<ReturnType<
      typeof collectRocketPoRowsForConfirmationFromExtension
    >>>();
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 3)]))
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 2)]));
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension)
      .mockReturnValue(freshCollection.promise);
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.preview?.rows[0]?.recommendedQuantity)
      .toBe(3));

    let collecting!: Promise<void>;
    act(() => {
      collecting = hook.result.current.recalculate();
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(true));

    expect(hook.result.current.preview?.rows[0]?.recommendedQuantity).toBe(3);
    freshCollection.resolve({
      collection: source.collection,
      rows: source.rows,
      poCount: 1,
    });
    await act(async () => collecting);
  });

  it('does not report or refresh an incomplete nonempty collection as saved', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const onCatalogSaved = vi.fn();
    const onActivity = vi.fn();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: { ...source.collection, truncated: true },
      rows: source.rows,
      poCount: 2,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      ...preview(source, [previewRow('LINE-A', 'collection_incomplete', 0)]),
      catalog: null,
      inventoryGeneration: null,
    });
    const hook = renderHook(() => useRocketPurchaseWorkflow({
      channelAccountId: ACCOUNT_A,
      hasConfiguredVendorId: true,
      from: '2026-07-01',
      to: '2026-07-31',
      savedSourceImportRunId: null,
      onCatalogSaved,
      onActivity,
    }));

    await act(async () => hook.result.current.recalculate());

    expect(onCatalogSaved).not.toHaveBeenCalled();
    expect(onActivity).toHaveBeenLastCalledWith({
      status: 'failed',
      message: '로켓 PO 2건 중 1건만 수집되어 저장하지 않았습니다.',
    });
    expect(hook.result.current.error)
      .toBe('로켓 PO 2건 중 1건만 수집되어 저장하지 않았습니다.');
  });

  it('reports a complete fresh collection only after the catalog is saved', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const onCatalogSaved = vi.fn();
    const onActivity = vi.fn();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: source.collection,
      rows: source.rows,
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', null, 3)]),
    );
    const hook = renderHook(() => useRocketPurchaseWorkflow({
      channelAccountId: ACCOUNT_A,
      hasConfiguredVendorId: true,
      from: '2026-07-01',
      to: '2026-07-31',
      savedSourceImportRunId: null,
      onCatalogSaved,
      onActivity,
    }));

    await act(async () => hook.result.current.recalculate());

    expect(onCatalogSaved).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenLastCalledWith({
      status: 'succeeded',
      message: '로켓 PO 1/1건을 수집·저장하고 재고 미리보기를 계산했습니다.',
    });
  });

  it('sends a real operator edit and keeps the server-clamped reviewed value', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 3)]))
      .mockResolvedValueOnce(preview(source, [{
        ...previewRow('LINE-A', 'insufficient_capacity', 1),
        editedQuantity: 1,
        maxQuantity: 1,
      }]));
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.editedQuantities['LINE-A']).toBe(3));

    act(() => hook.result.current.setReviewedQuantity('LINE-A', 2));
    await act(async () => hook.result.current.revalidateEditedQuantities());

    expect(previewRocketPurchases).toHaveBeenNthCalledWith(2, expect.objectContaining({
      editedQuantities: { 'LINE-A': 2 },
    }));
    expect(hook.result.current.editedQuantities['LINE-A']).toBe(1);
    expect(hook.result.current.previewDirty).toBe(false);
  });

  it('ignores an old revalidation response after account and source change', async () => {
    const sourceA = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const sourceB = savedCollection(ACCOUNT_B, SOURCE_B, COLLECTION_B, [sourceRow('LINE-B')]);
    const stale = deferred<RocketPurchasePreviewResponse>();
    vi.mocked(loadSavedRocketCollection).mockImplementation(async ({ sourceImportRunId }) =>
      sourceImportRunId === SOURCE_A ? sourceA : sourceB);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(sourceA, [previewRow('LINE-A', null, 3)]))
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(preview(sourceB, [previewRow('LINE-B', null, 2)]));
    const hook = renderHook(
      ({ channelAccountId, savedSourceImportRunId }) => useRocketPurchaseWorkflow({
        channelAccountId,
        hasConfiguredVendorId: true,
        from: '2026-07-01',
        to: '2026-07-31',
        savedSourceImportRunId,
      }),
      {
        initialProps: {
          channelAccountId: ACCOUNT_A,
          savedSourceImportRunId: SOURCE_A,
        },
      },
    );
    await waitFor(() => expect(hook.result.current.preview?.rows[0]?.poLineId)
      .toBe('LINE-A'));
    let staleRevalidation!: Promise<void>;
    act(() => {
      staleRevalidation = hook.result.current.revalidateEditedQuantities();
    });
    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(2));

    hook.rerender({
      channelAccountId: ACCOUNT_B,
      savedSourceImportRunId: SOURCE_B,
    });
    await waitFor(() => expect(hook.result.current.preview?.rows[0]?.poLineId)
      .toBe('LINE-B'));
    stale.resolve(preview(sourceA, [previewRow('LINE-A', null, 1)]));
    await act(async () => staleRevalidation);

    expect(hook.result.current.preview?.rows[0]?.poLineId).toBe('LINE-B');
    expect(hook.result.current.editedQuantities).toEqual({ 'LINE-B': 2 });
  });

  it('prunes full and blocking shortage reasons while retaining a still-short row', async () => {
    const rows = [sourceRow('LINE-A'), sourceRow('LINE-B'), sourceRow('LINE-C')];
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, rows);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(source, rows.map(({ poLineId }) =>
        previewRow(poLineId, 'insufficient_capacity', 2))))
      .mockResolvedValueOnce(preview(source, [
        previewRow('LINE-A', null, 4),
        previewRow('LINE-B', 'insufficient_capacity', 2),
        previewRow('LINE-C', 'mapping_required', 0),
      ]));
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.preview?.rows).toHaveLength(3));
    act(() => hook.result.current.setShortageReasons({
      'LINE-A': SHORTAGE_REASON,
      'LINE-B': SHORTAGE_REASON,
      'LINE-C': SHORTAGE_REASON,
    }));

    await act(async () => hook.result.current.revalidateEditedQuantities());

    expect(hook.result.current.shortageReasons).toEqual({
      'LINE-B': SHORTAGE_REASON,
    });
  });

  it('exports once and repeatedly downloads the exact server-stored workbook', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', null, 4)]),
    );
    const artifactBlob = new Blob(['stored-workbook']);
    vi.mocked(buildRocketConfirmationWorkbook).mockReturnValue({
      blob: new Blob(['generated-workbook']),
      fileName: '쿠팡_로켓.xlsx',
      summary: {
        totalRows: 1,
        workbookQuantity: 4,
        fullyConfirmedRows: 1,
        shortRows: 0,
      },
    });
    vi.mocked(exportRocketWorkbook).mockResolvedValue(workbookExport());
    vi.mocked(downloadRocketWorkbook).mockResolvedValue({
      blob: artifactBlob,
      fileName: '쿠팡_로켓.xlsx',
    });
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.canExport).toBe(true));

    await act(async () => hook.result.current.exportAndDownload());
    await act(async () => hook.result.current.downloadActiveWorkbook());

    expect(buildRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      sourceRows: source.rows,
      workbookRows: [{
        poLineId: 'LINE-A',
        workbookQuantity: 4,
        shortageReason: null,
      }],
    }));
    expect(exportRocketWorkbook).toHaveBeenCalledTimes(1);
    expect(exportRocketWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        artifactFileName: '쿠팡_로켓.xlsx',
      }),
      expect.any(Blob),
    );
    expect(downloadRocketWorkbook).toHaveBeenCalledTimes(2);
    expect(downloadBlob).toHaveBeenCalledWith(artifactBlob, '쿠팡_로켓.xlsx');
    expect(saveRocketConfirmFile).toHaveBeenCalledWith(expect.objectContaining({
      id: `rocket-workbook-${workbookExport().exportId}`,
      blob: artifactBlob,
    }));
  });
});

function renderWorkflow(input: {
  channelAccountId: string;
  savedSourceImportRunId: string;
}) {
  return renderHook(() => useRocketPurchaseWorkflow({
    ...input,
    hasConfiguredVendorId: true,
    from: '2026-07-01',
    to: '2026-07-31',
  }));
}

function sourceRow(poLineId: string): RocketPoCatalogRow {
  return {
    poLineId,
    poNumber: `PO-${poLineId}`,
    vendorId: 'VENDOR-1',
    productNo: `PRODUCT-${poLineId}`,
    barcode: '8801234567890',
    productName: `상품 ${poLineId}`,
    orderQty: 4,
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
      totalPurchase: 3_960,
      poRegisteredAt: '2026-07-17 09:00:00',
      xdock: 'N',
    },
  };
}

function savedCollection(
  channelAccountId: string,
  sourceImportRunId: string,
  collectionRunId: string,
  rows: RocketPoCatalogRow[],
): RocketSavedPoCollection {
  return {
    sourceImportRunId,
    channelAccountId,
    collection: {
      collectionRunId,
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: new Set(rows.map(({ poNumber }) => poNumber)).size,
      failedPoNumbers: [],
    },
    rows,
  };
}

function preview(
  saved: RocketSavedPoCollection,
  rows: RocketPurchasePreviewResponse['rows'],
): RocketPurchasePreviewResponse {
  return {
    collectionRunId: saved.collection.collectionRunId,
    catalog: catalogPublication(saved.channelAccountId, saved.sourceImportRunId, rows.length),
    inventoryGeneration: '12',
    rows,
  };
}

function previewRow(
  poLineId: string,
  reason: RocketPurchasePreviewReason | null,
  recommendedQuantity: number,
): RocketPurchasePreviewResponse['rows'][number] {
  const blocked = reason === 'mapping_required'
    || reason === 'configuration_required'
    || reason === 'review_required';
  return {
    poLineId,
    poNumber: `PO-${poLineId}`,
    productNo: `PRODUCT-${poLineId}`,
    productName: `상품 ${poLineId}`,
    plannedDeliveryDate: '2026-07-20',
    orderQuantity: 4,
    recommendedQuantity,
    maxQuantity: recommendedQuantity,
    editedQuantity: null,
    reason,
    channelSkuId: blocked ? null : OPTION_ID,
    masterProductId: blocked ? null : PRODUCT_ID,
    productVariantId: blocked ? null : VARIANT_ID,
    components: blocked ? [] : [{
      sellpiaInventorySkuId: SKU_ID,
      quantity: 1,
      currentStock: 4,
      isActive: true,
    }],
  };
}

function workbookExport() {
  return {
    exportId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    status: 'awaiting_coupang_confirmation' as const,
    duplicate: false,
    canAbandon: false,
    inventoryGeneration: '12',
    generatedAt: '2026-07-23T00:00:00.000Z',
    artifact: {
      fileName: '쿠팡_로켓.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
      sha256: 'a'.repeat(64),
      byteLength: 15,
    },
    totals: {
      lineCount: 1,
      orderQuantity: 4,
      workbookQuantity: 4,
      componentQuantity: 4,
    },
    rows: [{ poLineId: 'LINE-A', workbookQuantity: 4, shortageReason: null }],
  };
}

function catalogPublication(
  channelAccountId: string,
  sourceImportRunId: string,
  rowCount: number,
): RocketPoCatalogPublication {
  return {
    run: {
      id: sourceImportRunId,
      sourceType: 'coupang_rocket_po_catalog',
      channelAccountId,
      fileName: 'rocket-po-catalog.json',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount,
      importedAt: '2026-07-20T00:00:00.000Z',
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
