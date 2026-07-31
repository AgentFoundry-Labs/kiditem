import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewReadyResponse,
  RocketPurchasePreviewResponse,
  RocketSavedPoCollection,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  collectRocketPoRowsForConfirmationFromExtension,
  finalizeRocketPoCollectionSession,
} from '@/lib/rocket-sales-collection';
import {
  loadSavedRocketCollection,
  previewRocketPurchases,
} from '../lib/rocket-purchase-preview-api';
import {
  buildRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import { downloadBlob } from '@/lib/browser-download';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { useRocketPurchaseWorkflow } from './useRocketPurchaseWorkflow';

vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsForConfirmationFromExtension: vi.fn(),
  finalizeRocketPoCollectionSession: vi.fn(),
}));
vi.mock('../lib/rocket-purchase-preview-api', () => ({
  loadSavedRocketCollection: vi.fn(),
  previewRocketPurchases: vi.fn(),
  rocketPreviewErrorMessage: (_cause: unknown, fallback: string) => fallback,
}));
vi.mock('../lib/rocket-confirmation-workbook', () => ({
  buildRocketConfirmationWorkbook: vi.fn(),
  fillRocketConfirmationWorkbook: vi.fn(),
}));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));
vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: {
    getState: vi.fn(),
    requestRefresh: vi.fn(),
  },
}));

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
    vi.mocked(finalizeRocketPoCollectionSession).mockResolvedValue(undefined);
    vi.mocked(sellpiaInventoryFreshnessApi.getState).mockResolvedValue(
      freshnessState({ status: 'fresh', verifiedGeneration: '12' }),
    );
    vi.mocked(sellpiaInventoryFreshnessApi.requestRefresh).mockResolvedValue(
      freshnessState({ status: 'refresh_required', requestedGeneration: '13' }),
    );
  });

  it('shows collected rows immediately when the server already has fresh inventory', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const events: string[] = [];
    const onCatalogSaved = vi.fn();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension)
      .mockImplementation(async () => {
        events.push('extension.collect');
        return { collection: source.collection, rows: source.rows, poCount: 1 };
      });
    vi.mocked(previewRocketPurchases).mockImplementationOnce(async () => {
      events.push('server.preview.fresh');
      return preview(source, [previewRow('LINE-A', null, 3)]);
    });
    const hook = renderHook(() => useRocketPurchaseWorkflow({
      channelAccountId: ACCOUNT_A,
      hasConfiguredVendorId: true,
      from: '2026-07-01',
      to: '2026-07-31',
      savedSourceImportRunId: null,
      onCatalogSaved,
    }), { wrapper: queryWrapper() });

    await act(async () => hook.result.current.recalculate());

    expect(events).toEqual([
      'extension.collect',
      'server.preview.fresh',
    ]);
    expect(collectRocketPoRowsForConfirmationFromExtension).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledWith(
      expect.objectContaining({ rows: source.rows, collection: source.collection }),
    );
    expect(sellpiaInventoryFreshnessApi.getState).not.toHaveBeenCalled();
    expect(sellpiaInventoryFreshnessApi.requestRefresh).not.toHaveBeenCalled();
    expect(onCatalogSaved).toHaveBeenCalledTimes(1);
    expect(finalizeRocketPoCollectionSession).toHaveBeenCalledWith({
      runId: source.collection.collectionRunId,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    });
    expect(hook.result.current.sourceRows).toEqual(source.rows);
    expect(hook.result.current.stage).toBe('ready');
  });

  it('persists and finalizes a collection after the route unmounts', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const collection = deferred<Awaited<ReturnType<
      typeof collectRocketPoRowsForConfirmationFromExtension
    >>>();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension)
      .mockReturnValue(collection.promise);
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', null, 3)]),
    );
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: null,
    });

    let collecting!: Promise<void>;
    act(() => {
      collecting = hook.result.current.recalculate();
    });
    hook.unmount();
    collection.resolve({
      collection: source.collection,
      rows: source.rows,
      poCount: 1,
    });
    await collecting;

    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_A,
      collection: source.collection,
      rows: source.rows,
    }));
    expect(finalizeRocketPoCollectionSession).toHaveBeenCalledWith({
      runId: source.collection.collectionRunId,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    });
  });

  it('keeps collected rows visible while waiting for fresh inventory despite an unresolved file', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const onCatalogSaved = vi.fn();
    const inventoryState = deferred<ReturnType<typeof freshnessState>>();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension).mockResolvedValue({
      collection: source.collection,
      rows: source.rows,
      poCount: 1,
    });
    const advisoryRows = [previewRow('LINE-A', null, 2)];
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce({
        status: 'freshness_pending',
        collectionRunId: source.collection.collectionRunId,
        catalog: catalogPublication(ACCOUNT_A, SOURCE_A, 1),
        requestedGeneration: '12',
        rows: advisoryRows,
      })
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 3)]));
    vi.mocked(sellpiaInventoryFreshnessApi.getState).mockReturnValue(inventoryState.promise);
    const hook = renderHook(() => useRocketPurchaseWorkflow({
      channelAccountId: ACCOUNT_A,
      hasConfiguredVendorId: true,
      from: '2026-07-01',
      to: '2026-07-31',
      savedSourceImportRunId: null,
      onCatalogSaved,
    }), { wrapper: queryWrapper() });

    let recalculating!: Promise<void>;
    act(() => {
      recalculating = hook.result.current.recalculate();
    });

    await waitFor(() => expect(hook.result.current.stage).toBe('refreshing_inventory'));
    expect(hook.result.current.preview?.rows).toEqual(advisoryRows);
    expect(hook.result.current.sourceRows).toEqual(source.rows);
    expect(hook.result.current.collectionRun?.collection).toEqual(source.collection);
    expect(onCatalogSaved).toHaveBeenCalledTimes(1);
    inventoryState.resolve(freshnessState({
      status: 'fresh',
      verifiedGeneration: '12',
      unresolvedOrderTransmissionIntents: [{
        intentKey: 'other-file',
        preparedAt: '2026-07-28T00:00:00.000Z',
      }],
    }));
    await act(async () => recalculating);
    expect(hook.result.current.stage).toBe('ready');
    expect(hook.result.current.preview?.rows[0]?.recommendedQuantity).toBe(3);
  });

  it('reuses the loaded source when only the delivery date changes', async () => {
    // 날짜만 바꾸는 건 같은 수집본을 다시 자르는 일이다. 서버를 다시 타면 1,900행짜리
    // 수집본을 재다운로드하고 그 전량을 다시 계산하게 되어 클릭이 눈에 띄게 느려진다.
    const rowA = { ...sourceRow('LINE-A'), plannedDeliveryDate: '2026-07-10' };
    const rowB = { ...sourceRow('LINE-B'), plannedDeliveryDate: '2026-07-20' };
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [rowA, rowB]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases).mockResolvedValue(preview(source, [
      { ...previewRow('LINE-A', null, 3), plannedDeliveryDate: '2026-07-10' },
      { ...previewRow('LINE-B', null, 2), plannedDeliveryDate: '2026-07-20' },
    ]));

    const hook = renderHook(
      ({ selectedDeliveryDate }) => useRocketPurchaseWorkflow({
        channelAccountId: ACCOUNT_A,
        hasConfiguredVendorId: true,
        from: '2026-07-01',
        to: '2026-07-31',
        savedSourceImportRunId: SOURCE_A,
        selectedDeliveryDate,
      } as never),
      { initialProps: { selectedDeliveryDate: '2026-07-10' }, wrapper: queryWrapper() },
    );

    await waitFor(() => expect(hook.result.current.displayPreview?.rows).toHaveLength(1));
    expect(hook.result.current.displayPreview?.rows[0]?.poLineId).toBe('LINE-A');
    expect(loadSavedRocketCollection).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledTimes(1);

    hook.rerender({ selectedDeliveryDate: '2026-07-20' });

    await waitFor(() => expect(hook.result.current.displayPreview?.rows[0]?.poLineId)
      .toBe('LINE-B'));
    // 날짜만 바뀌었으니 서버 왕복은 늘지 않아야 한다.
    expect(loadSavedRocketCollection).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledTimes(1);
  });

  it('revalidates the same saved collection without sending an untouched mapping zero', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    source.exportedPoLineIds = ['LINE-A'];
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
    expect(hook.result.current.preview?.rows).toHaveLength(1);
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
    }), { wrapper: queryWrapper() });

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
    }), { wrapper: queryWrapper() });

    await act(async () => hook.result.current.recalculate());

    expect(onCatalogSaved).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenLastCalledWith({
      status: 'succeeded',
      message: '로켓 PO 1/1건을 수집·저장하고 거래확인요청 1건의 재고 미리보기를 계산했습니다.',
    });
  });

  it('keeps completed rows in the saved archive while reviewing only confirmation requests', async () => {
    const confirmationRow = {
      ...sourceRow('LINE-A'),
      poStatusCode: 'RI',
      confirmation: {
        ...sourceRow('LINE-A').confirmation!,
        poStatus: '거래명세서확인요청',
      },
    };
    const completedRow = {
      ...sourceRow('LINE-B'),
      poStatusCode: 'CI',
      confirmation: {
        ...sourceRow('LINE-B').confirmation!,
        poStatus: '입고완료',
      },
    };
    const source = savedCollection(
      ACCOUNT_A,
      SOURCE_A,
      COLLECTION_A,
      [confirmationRow, completedRow],
    );
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    // 서버는 전체 행을 돌려주고, 훅이 표시본과 검토본으로 나눈다.
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', null, 3), previewRow('LINE-B', null, 5)]),
    );
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });

    await waitFor(() => expect(hook.result.current.preview?.rows).toHaveLength(1));

    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      rows: [confirmationRow, completedRow],
      previewScope: 'all_rows',
    }));
    // 표에는 발주확정 행까지 모두 보여준다(달력 건수와 어긋나지 않게).
    expect(hook.result.current.displayPreview?.rows.map(({ poLineId }) => poLineId))
      .toEqual(['LINE-A', 'LINE-B']);
    // 엑셀 대상은 거래처확인요청 행만 유지한다.
    expect(hook.result.current.preview?.rows.map(({ poLineId }) => poLineId))
      .toEqual(['LINE-A']);
    expect(hook.result.current.sourceRows).toEqual([confirmationRow]);
  });

  it('defaults saved insufficient-capacity rows to the inventory-shortage reason', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', 'insufficient_capacity', 2)]),
    );
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });

    await waitFor(() => expect(hook.result.current.stage).toBe('ready'));

    expect(hook.result.current.shortageReasons).toEqual({
      'LINE-A': SHORTAGE_REASON,
    });
    expect(hook.result.current.editedQuantities['LINE-A']).toBe(0);
  });

  it('shows only the selected delivery date while calculating from the complete saved snapshot', async () => {
    const lineA = sourceRow('LINE-A');
    const lineB = {
      ...sourceRow('LINE-B'),
      plannedDeliveryDate: '2026-07-21',
    };
    const source = savedCollection(
      ACCOUNT_A,
      SOURCE_A,
      COLLECTION_A,
      [lineA, lineB],
    );
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [
        previewRow('LINE-A', null, 4),
        { ...previewRow('LINE-B', null, 4), plannedDeliveryDate: '2026-07-21' },
      ]),
    );

    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
      selectedDeliveryDate: '2026-07-21',
    });

    await waitFor(() => expect(hook.result.current.preview?.rows).toHaveLength(1));
    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      rows: [lineA, lineB],
    }));
    expect(hook.result.current.preview?.rows[0]?.poLineId).toBe('LINE-B');
    expect(hook.result.current.sourceRows).toEqual([lineB]);
  });

  it('forces a server-clamped insufficient-capacity value to zero', async () => {
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
    expect(hook.result.current.editedQuantities['LINE-A']).toBe(0);
    expect(hook.result.current.previewDirty).toBe(false);
  });

  it('closes the loading activity when a newer date supersedes the load', async () => {
    // 날짜를 바꾸면 이전 불러오기가 밀려난다. 그때 시작 기록을 닫지 않으면 활동 패널에
    // "불러오는 중"이 영원히 남아 화면이 멈춘 것처럼 보인다.
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    const stale = deferred<RocketPurchasePreviewResponse>();
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(preview(source, [previewRow('LINE-A', null, 3)]));
    const onActivity = vi.fn();
    const hook = renderHook(
      ({ selectedDeliveryDate }) => useRocketPurchaseWorkflow({
        channelAccountId: ACCOUNT_A,
        hasConfiguredVendorId: true,
        from: '2026-07-01',
        to: '2026-07-31',
        savedSourceImportRunId: SOURCE_A,
        selectedDeliveryDate,
        onActivity,
      }),
      { initialProps: { selectedDeliveryDate: '2026-07-28' }, wrapper: queryWrapper() },
    );

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(1));
    hook.rerender({ selectedDeliveryDate: '2026-07-31' });
    await act(async () => {
      stale.resolve(preview(source, [previewRow('LINE-A', null, 3)]));
    });

    await waitFor(() => {
      const started = onActivity.mock.calls.filter(([a]) => a.status === 'started').length;
      const settled = onActivity.mock.calls
        .filter(([a]) => a.status === 'succeeded' || a.status === 'failed').length;
      // 시작한 만큼 종료 기록이 남아야 "불러오는 중"이 걸려 있지 않다.
      expect(settled).toBeGreaterThanOrEqual(started);
    });
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
        wrapper: queryWrapper(),
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

  it('downloads the reviewed workbook directly without starting a post-download workflow', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases).mockResolvedValue(
      preview(source, [previewRow('LINE-A', null, 4)]),
    );
    const generatedBlob = new Blob(['generated-workbook']);
    vi.mocked(buildRocketConfirmationWorkbook).mockReturnValue({
      blob: generatedBlob,
      fileName: '쿠팡_로켓.xlsx',
      summary: {
        totalRows: 1,
        workbookQuantity: 4,
        fullyConfirmedRows: 1,
        shortRows: 0,
      },
    });
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.canExport).toBe(true));

    await act(async () => hook.result.current.exportAndDownload());

    expect(buildRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      sourceRows: source.rows,
      workbookRows: [{
        poLineId: 'LINE-A',
        workbookQuantity: 4,
        shortageReason: null,
      }],
    }));
    expect(downloadBlob).toHaveBeenCalledWith(generatedBlob, '쿠팡_로켓.xlsx');
  });

  it('forces a fresh insufficient-capacity workbook quantity to zero', async () => {
    const source = savedCollection(ACCOUNT_A, SOURCE_A, COLLECTION_A, [sourceRow('LINE-A')]);
    vi.mocked(loadSavedRocketCollection).mockResolvedValue(source);
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(preview(source, [previewRow('LINE-A', null, 4)]))
      .mockResolvedValueOnce(preview(source, [
        previewRow('LINE-A', 'insufficient_capacity', 2),
      ]));
    vi.mocked(buildRocketConfirmationWorkbook).mockReturnValue({
      blob: new Blob(['fresh-workbook']),
      fileName: '쿠팡_로켓.xlsx',
      summary: {
        totalRows: 1,
        workbookQuantity: 0,
        fullyConfirmedRows: 0,
        shortRows: 1,
      },
    });
    const hook = renderWorkflow({
      channelAccountId: ACCOUNT_A,
      savedSourceImportRunId: SOURCE_A,
    });
    await waitFor(() => expect(hook.result.current.canExport).toBe(true));

    await act(async () => hook.result.current.exportAndDownload());

    expect(previewRocketPurchases).toHaveBeenNthCalledWith(2, expect.objectContaining({
      editedQuantities: { 'LINE-A': 4 },
      clampEditedQuantities: true,
      previewScope: 'confirmation_requested',
    }), { inventoryRequirement: 'fresh' });
    expect(buildRocketConfirmationWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      workbookRows: [{
        poLineId: 'LINE-A',
        workbookQuantity: 0,
        shortageReason: SHORTAGE_REASON,
      }],
    }));
  });
});

function renderWorkflow(input: {
  channelAccountId: string;
  savedSourceImportRunId: string | null;
  selectedDeliveryDate?: string;
}) {
  return renderHook(() => useRocketPurchaseWorkflow({
    ...input,
    hasConfiguredVendorId: true,
    from: '2026-07-01',
    to: '2026-07-31',
  } as never), { wrapper: queryWrapper() });
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
    exportedPoLineIds: [],
  };
}

function preview(
  saved: RocketSavedPoCollection,
  rows: RocketPurchasePreviewReadyResponse['rows'],
): RocketPurchasePreviewReadyResponse {
  return {
    status: 'ready',
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
): RocketPurchasePreviewReadyResponse['rows'][number] {
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

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function freshnessState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'syncing' as const,
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com' as const,
      accountKey: 'kiditem' as const,
      confirmed: true as const,
    },
    lastVerifiedAt: null,
    expiresAt: null,
    requestedGeneration: '12',
    verifiedGeneration: '11',
    refreshRequestedAt: null,
    refreshReason: 'purchase_preflight' as const,
    syncNotBefore: null,
    activeSync: null,
    lastAttempt: null,
    unresolvedOrderTransmissionIntents: [],
    hasMoreUnresolvedOrderTransmissionIntents: false,
    ...overrides,
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
