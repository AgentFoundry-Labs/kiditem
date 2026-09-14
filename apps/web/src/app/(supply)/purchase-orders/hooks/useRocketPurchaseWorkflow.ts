'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  isRocketWorkbookBlockingReason,
  ROCKET_CONFIRMATION_REQUEST_STATUSES,
  ROCKET_SHORTAGE_REASONS,
} from '@kiditem/shared/rocket-purchase-preview';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { useRocketPoSource } from '@/hooks/use-rocket-po-source';
import { RocketPoSourceError } from '@/lib/rocket-sales-collection';
import { queryKeys } from '@/lib/query-keys';
import {
  loadSavedRocketCollection,
  previewRocketPurchases,
  rocketPreviewErrorMessage,
} from '../lib/rocket-purchase-preview-api';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import {
  requireFreshRocketPreview,
  RocketInventoryCollectionRequiredError,
} from '../lib/rocket-preview-freshness-recovery';
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
  RocketPurchasePreviewRequest,
  RocketPurchasePreviewResponse,
  RocketPurchasePreviewRow,
  RocketShortageReason,
  RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';

interface CollectionRunSummary {
  sourceImportRunId: string;
  collection: RocketPoCollectionEvidence;
  poCount: number;
  rowCount: number;
  uniqueRowPoCount: number;
  rowsMatchEvidenceVendor: boolean;
}

export type RocketWorkflowStage =
  | 'idle'
  | 'collecting'
  | 'persisting_collection'
  | 'calculating'
  | 'review_required'
  | 'ready'
  | 'inventory_collection_required';

function editFingerprint(quantities: Record<string, number>): string {
  return JSON.stringify(Object.entries(quantities).sort(([left], [right]) =>
    left.localeCompare(right)));
}

export function rocketReviewedQuantity(
  row: RocketPurchasePreviewRow,
  editedQuantity?: number,
): number {
  if (row.reason === 'insufficient_capacity') return 0;
  return editedQuantity ?? row.editedQuantity ?? row.recommendedQuantity ?? 0;
}

export function rocketReviewedQuantityLimit(
  row: RocketPurchasePreviewRow,
): number {
  return row.reason === 'insufficient_capacity'
    ? 0
    : Math.min(row.maxQuantity ?? 0, row.orderQuantity);
}

function visibleReviewQuantities(
  preview: RocketPurchasePreviewReadyResponse,
): Record<string, number> {
  return Object.fromEntries(preview.rows.map((row) => [
    row.poLineId,
    rocketReviewedQuantity(row),
  ]));
}

function operatorEditsForRows(
  operatorEditedLineIds: ReadonlySet<string>,
  editedQuantities: Record<string, number>,
  rows: readonly { poLineId: string }[],
): Record<string, number> {
  return Object.fromEntries(rows.flatMap(({ poLineId }) => (
    operatorEditedLineIds.has(poLineId)
      && Object.hasOwn(editedQuantities, poLineId)
      ? [[poLineId, editedQuantities[poLineId]!]]
      : []
  )));
}

function confirmationRequestedRows(
  rows: readonly RocketPoCatalogRow[],
): RocketPoCatalogRow[] {
  return rows.filter((row) => (
    ['RI', 'RP'].includes(row.poStatusCode?.toUpperCase() ?? '')
    || ROCKET_CONFIRMATION_REQUEST_STATUSES.some(
      (status) => status === (row.confirmation?.poStatus.trim() ?? ''),
    )
  ));
}

function rowsForDeliveryDate<T extends { plannedDeliveryDate: string }>(
  rows: readonly T[],
  selectedDeliveryDate: string | undefined,
): T[] {
  if (!selectedDeliveryDate) return [...rows];
  return rows.filter(({ plannedDeliveryDate }) =>
    plannedDeliveryDate === selectedDeliveryDate);
}

function previewForDeliveryDate(
  preview: RocketPurchasePreviewReadyResponse,
  selectedDeliveryDate: string | undefined,
): RocketPurchasePreviewReadyResponse {
  return {
    ...preview,
    rows: rowsForDeliveryDate(preview.rows, selectedDeliveryDate),
  };
}

/**
 * 재계산 결과(검토 대상만)를 표시본에 덮어쓴다. 검토 대상이 아닌 행은 그대로 남겨
 * "42건인데 표가 5행"으로 다시 줄어드는 일이 없게 한다.
 */
function mergeDisplayPreview(
  base: RocketPurchasePreviewReadyResponse | null,
  refreshed: RocketPurchasePreviewReadyResponse,
): RocketPurchasePreviewReadyResponse {
  if (!base) return refreshed;
  const byLineId = new Map(refreshed.rows.map((row) => [row.poLineId, row]));
  return {
    ...refreshed,
    rows: base.rows.map((row) => byLineId.get(row.poLineId) ?? row),
  };
}

function reconcileShortageReasons(
  current: Record<string, RocketShortageReason>,
  preview: RocketPurchasePreviewReadyResponse,
  reviewedQuantities: Record<string, number>,
): Record<string, RocketShortageReason> {
  return Object.fromEntries(preview.rows.flatMap((row) => {
    if (isRocketWorkbookBlockingReason(row.reason)) return [];
    const reviewedQuantity = rocketReviewedQuantity(
      row,
      reviewedQuantities[row.poLineId],
    );
    if (reviewedQuantity >= row.orderQuantity) return [];
    return [[
      row.poLineId,
      current[row.poLineId] ?? ROCKET_SHORTAGE_REASONS[0],
    ]];
  }));
}

function collectionIsIncomplete(summary: CollectionRunSummary): boolean {
  const { collection } = summary;
  const requiresVendorEvidence = summary.poCount > 0 || summary.rowCount > 0;
  return (requiresVendorEvidence && collection.vendorId.length === 0)
    || collection.truncated
    || collection.failedPoNumbers.length > 0
    || collection.totalListPages !== collection.listPagesRead
    || collection.detailPoCount !== summary.uniqueRowPoCount
    || !summary.rowsMatchEvidenceVendor;
}

function aggregateCollectionWarning(
  summary: CollectionRunSummary | null,
): string | null {
  if (!summary) return null;
  if (collectionIsIncomplete(summary)) {
    return '수집 범위가 불완전합니다. 누락된 PO를 확인한 뒤 다시 계산해 주세요. 공급사 식별 정보도 확인해 주세요.';
  }
  return null;
}

export function useRocketPurchaseWorkflow({
  channelAccountId,
  from,
  to,
  savedSourceImportRunId,
  selectedDeliveryDate,
  onCatalogSaved,
  onActivity,
}: {
  channelAccountId: string;
  from: string;
  to: string;
  savedSourceImportRunId: string | null;
  selectedDeliveryDate?: string;
  onCatalogSaved?: () => void;
  onActivity?: (activity: RocketOrderActivityInput) => void;
}) {
  const queryClient = useQueryClient();
  const rocketSource = useRocketPoSource(channelAccountId);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [operatorEditedLineIds, setOperatorEditedLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<RocketPurchasePreviewReadyResponse | null>(null);
  /**
   * 화면 표시용 전체 행. `preview` 는 거래처확인요청(엑셀 대상)만 담아 내보내기 게이트를
   * 그대로 지키고, 표에는 선택한 날짜의 발주를 상태와 무관하게 모두 보여준다.
   * 달력이 42건이라고 알려줬는데 표가 비어 보이던 문제를 없애기 위한 분리다.
   */
  const [displayPreview, setDisplayPreview] = useState<RocketPurchasePreviewReadyResponse | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<
    RocketPurchasePreviewFreshnessPendingResponse | null
  >(null);
  const [stage, setStage] = useState<RocketWorkflowStage>('idle');
  const [previewDirty, setPreviewDirty] = useState(false);
  const [validatedEditFingerprint, setValidatedEditFingerprint] = useState('');
  const [sourceRows, setSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRows, setCollectionRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [shortageReasons, setShortageReasons] = useState<Record<string, RocketShortageReason>>({});
  const [exporting, setExporting] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const requestGenerationRef = useRef(0);
  /**
   * 같은 수집본 안에서 날짜만 바꿀 때 재사용하는 원본.
   *
   * 수집본과 전체 미리보기는 날짜와 무관한 값인데, 날짜를 누를 때마다 1,900행짜리 수집본을
   * 다시 받고 그 전량을 다시 서버로 보내 계산하고 있었다. 계정/수집본이 그대로면 이미 받은
   * 결과를 날짜로 다시 자르기만 한다. 재고를 다시 봐야 하는 경로(수집·재계산·재검증)는
   * 이 캐시를 비워 항상 서버를 다시 탄다.
   */
  const loadedSourceRef = useRef<{
    key: string;
    saved: Awaited<ReturnType<typeof loadSavedRocketCollection>>;
    complete: RocketPurchasePreviewReadyResponse;
  } | null>(null);
  const activeWaiterRef = useRef<AbortController | null>(null);
  const collectionPromiseRef = useRef<Promise<void> | null>(null);
  const reviewScope = JSON.stringify([channelAccountId, from, to, selectedDeliveryDate]);
  // An owner read acknowledging this view's collection must not reopen it and erase edits.
  const collectedReviewRef = useRef<{ sourceId: string; scope: string } | null>(null);

  useEffect(() => {
    if (collectedReviewRef.current?.sourceId === savedSourceImportRunId
      && collectedReviewRef.current.scope === reviewScope) return;
    collectedReviewRef.current = null;
    requestGenerationRef.current += 1;
    activeWaiterRef.current?.abort();
    activeWaiterRef.current = null;
    setEditedQuantities({});
    setOperatorEditedLineIds(new Set());
    setPreview(null);
    setDisplayPreview(null);
    setPendingCheckpoint(null);
    setStage('idle');
    setPreviewDirty(false);
    setValidatedEditFingerprint('');
    setSourceRows([]);
    setCollectionRows([]);
    setCollectionRun(null);
    setShortageReasons({});
    setLoading(false);
    setCollecting(false);
    setError(null);
  }, [channelAccountId, from, savedSourceImportRunId, selectedDeliveryDate, to, reviewScope]);

  useEffect(() => () => {
    activeWaiterRef.current?.abort();
  }, []);

  const previewWithInventoryGate = async (input: {
    request: RocketPurchasePreviewRequest;
    generation: number;
    controller: AbortController;
    notifyCatalogSaved: boolean;
    initial?: RocketPurchasePreviewResponse;
    inventoryRequirement?: 'advisory' | 'fresh';
  }): Promise<RocketPurchasePreviewReadyResponse> => {
    const isCurrent = () => (
      input.generation === requestGenerationRef.current
      && !input.controller.signal.aborted
    );
    const requestPreview = () => input.inventoryRequirement
      ? previewRocketPurchases(input.request, {
          inventoryRequirement: input.inventoryRequirement,
        })
      : previewRocketPurchases(input.request);
    const initial = input.initial ?? await requestPreview();
    if (!isCurrent()) {
      throw new Error('Stale Rocket preview response');
    }
    if (input.notifyCatalogSaved && initial.catalog) onCatalogSaved?.();

    return requireFreshRocketPreview(initial, (checkpoint) => {
      if (!isCurrent()) return;
      setPendingCheckpoint(checkpoint);
      setPreview(previewForDeliveryDate({
        status: 'ready',
        collectionRunId: checkpoint.collectionRunId,
        catalog: checkpoint.catalog,
        inventoryGeneration: null,
        rows: checkpoint.rows,
      }, selectedDeliveryDate));
      setStage('inventory_collection_required');
    });
  };

  const beginWaiter = (): AbortController => {
    activeWaiterRef.current?.abort();
    const controller = new AbortController();
    activeWaiterRef.current = controller;
    return controller;
  };

  const finishWaiter = (controller: AbortController): void => {
    if (activeWaiterRef.current === controller) activeWaiterRef.current = null;
  };

  const stageForRecoveryFailure = (cause: unknown): RocketWorkflowStage => (
    cause instanceof RocketInventoryCollectionRequiredError
      ? 'inventory_collection_required'
      : 'review_required'
  );

  const recoveryErrorMessage = (cause: unknown, fallback: string): string => (
    cause instanceof RocketInventoryCollectionRequiredError
      || cause instanceof RocketPoSourceError
      ? cause.message
      : rocketPreviewErrorMessage(cause, fallback)
  );

  useEffect(() => {
    if (!savedSourceImportRunId) return;
    if (collectedReviewRef.current?.sourceId === savedSourceImportRunId
      && collectedReviewRef.current.scope === reviewScope) return;
    const generation = requestGenerationRef.current;
    const controller = beginWaiter();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      setDisplayPreview(null);
      setPendingCheckpoint(null);
      setStage('calculating');
      onActivity?.({ status: 'started', message: '저장된 로켓 PO 수집본을 불러오는 중입니다.' });
      // 날짜/계정이 바뀌어 이 실행이 밀려나면 결과는 버리지만, 시작 기록은 반드시 닫아야 한다.
      // 닫지 않으면 활동 패널에 "불러오는 중"이 영원히 남아 멈춘 것처럼 보인다.
      const supersededDuringLoad = () => {
        if (!cancelled && generation === requestGenerationRef.current) return false;
        onActivity?.({
          status: 'succeeded',
          message: '이전 수집본 불러오기를 최신 요청으로 대체했습니다.',
        });
        return true;
      };
      try {
        // 계정/수집본이 그대로면 날짜만 바뀐 것이므로 서버를 다시 타지 않는다.
        const cacheKey = `${channelAccountId}:${savedSourceImportRunId}`;
        const cached = loadedSourceRef.current?.key === cacheKey
          ? loadedSourceRef.current
          : null;
        const saved = cached?.saved ?? await loadSavedRocketCollection({
          channelAccountId,
          sourceImportRunId: savedSourceImportRunId,
        });
        if (supersededDuringLoad()) return;
        const reviewRows = rowsForDeliveryDate(
          confirmationRequestedRows(saved.rows),
          selectedDeliveryDate,
        );
        const poCount = new Set(saved.rows.map(({ poNumber }) => poNumber)).size;
        setCollectionRun({
          sourceImportRunId: saved.sourceImportRunId,
          collection: saved.collection,
          poCount,
          rowCount: saved.rows.length,
          uniqueRowPoCount: poCount,
          rowsMatchEvidenceVendor: saved.rows.every(
            ({ vendorId }) => vendorId === saved.collection.vendorId,
          ),
        });
        setSourceRows(reviewRows);
        setCollectionRows(saved.rows);
        const completeResult = cached?.complete ?? await previewWithInventoryGate({
          request: {
          channelAccountId,
          sourceImportRunId: saved.sourceImportRunId,
          editedQuantities: {},
          clampEditedQuantities: true,
          // 표에는 선택한 날짜의 발주를 상태와 무관하게 모두 보여준다. 엑셀 대상은 아래에서
          // 거래처확인요청 행만 추려 `preview` 로 넘기므로 내보내기 범위는 그대로다.
          previewScope: 'all_rows',
          },
          generation,
          controller,
          notifyCatalogSaved: false,
        });
        if (supersededDuringLoad()) return;
        loadedSourceRef.current = { key: cacheKey, saved, complete: completeResult };
        const dateScoped = previewForDeliveryDate(completeResult, selectedDeliveryDate);
        setDisplayPreview(dateScoped);
        const reviewLineIds = new Set(reviewRows.map(({ poLineId }) => poLineId));
        const result = {
          ...dateScoped,
          rows: dateScoped.rows.filter(({ poLineId }) => reviewLineIds.has(poLineId)),
        };
        const effectiveEdits = visibleReviewQuantities(result);
        setEditedQuantities(effectiveEdits);
        setOperatorEditedLineIds(new Set());
        setValidatedEditFingerprint(editFingerprint(effectiveEdits));
        setPreviewDirty(false);
        setShortageReasons((current) => reconcileShortageReasons(
          current,
          result,
          effectiveEdits,
        ));
        setPreview(result);
        setPendingCheckpoint(null);
        setStage('ready');
        onActivity?.({ status: 'succeeded', message: '저장된 로켓 PO를 최신 재고 기준으로 다시 계산했습니다.' });
      } catch (cause) {
        if (supersededDuringLoad()) return;
        setStage(stageForRecoveryFailure(cause));
        const message = recoveryErrorMessage(cause, '저장된 로켓 PO를 불러오지 못했습니다.');
        setError(message);
        onActivity?.({ status: 'failed', message });
      } finally {
        finishWaiter(controller);
        if (!cancelled && generation === requestGenerationRef.current) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    channelAccountId,
    from,
    onActivity,
    reloadNonce,
    savedSourceImportRunId,
    selectedDeliveryDate,
    to,
    reviewScope,
  ]);

  const performRecalculation = async () => {
    // 새 수집본이 생기므로 날짜 전환용 캐시는 버린다.
    loadedSourceRef.current = null;
    const generation = requestGenerationRef.current;
    // This controller intentionally outlives the route. A client-side route
    // transition must not cancel collection persistence.
    const controller = new AbortController();
    setLoading(true);
    setCollecting(true);
    setStage('collecting');
    setError(null);
    onActivity?.({ status: 'started', message: '쿠팡에서 로켓 PO를 새로 수집하고 있습니다.' });
    try {
      const { collected, request, initialPreview } = await rocketSource.collect({
        from,
        to,
        onCatalogSaved,
        createPreviewRequest: (current) => {
          collectedReviewRef.current = { sourceId: current.sourceImportRunId, scope: reviewScope };
          const reviewRows = rowsForDeliveryDate(
            confirmationRequestedRows(current.rows),
            selectedDeliveryDate,
          );
          const retainedEdits = operatorEditsForRows(
            operatorEditedLineIds,
            editedQuantities,
            reviewRows,
          );
          setCollectionRun({
            sourceImportRunId: current.sourceImportRunId,
            collection: current.collection,
            poCount: current.poCount,
            rowCount: current.rows.length,
            uniqueRowPoCount: new Set(current.rows.map(({ poNumber }) => poNumber)).size,
            rowsMatchEvidenceVendor: current.rows.every(
              ({ vendorId }) => vendorId === current.collection.vendorId,
            ),
          });
          setSourceRows(reviewRows);
          setCollectionRows(current.rows);
          setPendingCheckpoint(null);
          setStage('persisting_collection');
          return {
            channelAccountId,
            sourceImportRunId: current.sourceImportRunId,
            editedQuantities: retainedEdits,
            clampEditedQuantities: true,
            previewScope: 'confirmation_requested',
          } satisfies RocketPurchasePreviewRequest;
        },
      });
      const completeResult = await previewWithInventoryGate({
        request,
        generation,
        controller,
        notifyCatalogSaved: false,
        initial: initialPreview,
      });
      if (generation !== requestGenerationRef.current) return;
      const result = previewForDeliveryDate(completeResult, selectedDeliveryDate);
      const effectiveEdits = visibleReviewQuantities(result);
      const currentLineIds = new Set(result.rows.map(({ poLineId }) => poLineId));
      setEditedQuantities(effectiveEdits);
      setOperatorEditedLineIds((current) => new Set(
        [...current].filter((poLineId) => currentLineIds.has(poLineId)),
      ));
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setShortageReasons((current) => reconcileShortageReasons(
        current,
        result,
        effectiveEdits,
      ));
      setPreview(result);
      setDisplayPreview(result);
      setPendingCheckpoint(null);
      setStage('ready');
      onActivity?.({
        status: 'succeeded',
        message: `로켓 PO ${collected.collection.detailPoCount}/${collected.poCount}건을 수집·저장하고 거래확인요청 ${new Set(result.rows.map(({ poNumber }) => poNumber)).size}건의 재고 미리보기를 계산했습니다.`,
      });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      if (cause instanceof RocketPoSourceError && cause.attempt.state === 'RUNNING') {
        // The owner read supplies progress and expiry; a lost callback is not a failed collection.
        setStage('idle');
        return;
      }
      setStage(stageForRecoveryFailure(cause));
      const message = recoveryErrorMessage(cause, '로켓 발주 미리보기를 계산하지 못했습니다.');
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      if (generation === requestGenerationRef.current) {
        setLoading(false);
        setCollecting(false);
      }
    }
  };

  const recalculate = (): Promise<void> => {
    if (collectionPromiseRef.current) return collectionPromiseRef.current;
    const promise = performRecalculation().finally(() => {
      if (collectionPromiseRef.current === promise) {
        collectionPromiseRef.current = null;
      }
    });
    collectionPromiseRef.current = promise;
    return promise;
  };

  const revalidateEditedQuantities = async () => {
    if (!collectionRun || sourceRows.length === 0 || collectionRows.length === 0) return;
    // 재고 기준이 갱신되므로 날짜 전환용 캐시는 버린다.
    loadedSourceRef.current = null;
    const generation = requestGenerationRef.current;
    const controller = beginWaiter();
    setLoading(true);
    setStage('calculating');
    setError(null);
    onActivity?.({ status: 'started', message: '검토수량을 현재 재고 기준으로 다시 검증하고 있습니다.' });
    try {
      const completeResult = await previewWithInventoryGate({
        request: {
          channelAccountId,
          sourceImportRunId: collectionRun.sourceImportRunId,
          editedQuantities: operatorEditsForRows(
            operatorEditedLineIds,
            editedQuantities,
            sourceRows,
          ),
          clampEditedQuantities: true,
          previewScope: 'confirmation_requested',
        },
        generation,
        controller,
        notifyCatalogSaved: false,
      });
      if (generation !== requestGenerationRef.current) return;
      const result = previewForDeliveryDate(completeResult, selectedDeliveryDate);
      const effectiveEdits = visibleReviewQuantities(result);
      const currentLineIds = new Set(result.rows.map(({ poLineId }) => poLineId));
      setPreview(result);
      setDisplayPreview((current) => mergeDisplayPreview(current, result));
      setEditedQuantities(effectiveEdits);
      setOperatorEditedLineIds((current) => new Set(
        [...current].filter((poLineId) => currentLineIds.has(poLineId)),
      ));
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setPendingCheckpoint(null);
      setStage('ready');
      setShortageReasons((current) => reconcileShortageReasons(
        current,
        result,
        effectiveEdits,
      ));
      onActivity?.({ status: 'succeeded', message: '검토수량 재검증을 완료했습니다.' });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      setPreviewDirty(true);
      setStage(stageForRecoveryFailure(cause));
      const message = recoveryErrorMessage(cause, '수량을 다시 검증하지 못했습니다.');
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      finishWaiter(controller);
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  };

  // After the operator collected inventory: a saved load that stopped reloads
  // its source, and a loaded preview revalidates the reviewed quantities.
  const retryInventoryAndPreview = (): void => {
    if (displayPreview || !savedSourceImportRunId) {
      void revalidateEditedQuantities();
      return;
    }
    loadedSourceRef.current = null;
    setReloadNonce((value) => value + 1);
  };

  const collectionWarning = aggregateCollectionWarning(collectionRun);
  const reviewedQuantities = preview
    ? Object.fromEntries(preview.rows.map((row) => [
        row.poLineId,
        rocketReviewedQuantity(row, editedQuantities[row.poLineId]),
      ]))
    : {};
  const canExport = Boolean(
    preview?.catalog
    && preview.rows.length > 0
    && sourceRows.length === preview.rows.length
    && sourceRows.every((row) => row.confirmation && row.barcode.length > 0)
    && !previewDirty
    && validatedEditFingerprint === editFingerprint(reviewedQuantities)
    && preview.rows.every((row) => !isRocketWorkbookBlockingReason(row.reason))
    && preview.rows.every((row) => (
      (reviewedQuantities[row.poLineId] ?? 0) < row.orderQuantity
        ? Boolean(shortageReasons[row.poLineId])
        : !shortageReasons[row.poLineId]
    ))
    && !collectionWarning,
  );

  const setReviewedQuantity = (poLineId: string, quantity: number): void => {
    setOperatorEditedLineIds((current) => {
      if (current.has(poLineId)) return current;
      const next = new Set(current);
      next.add(poLineId);
      return next;
    });
    setEditedQuantities((current) => ({ ...current, [poLineId]: quantity }));
    setPreviewDirty(true);
  };

  const buildReviewedWorkbook = async (
    workbookRows: RocketWorkbookExportResponse['rows'],
  ) => {
    const workbook = templateFile
      ? fillRocketConfirmationWorkbook({
          template: await templateFile.arrayBuffer(),
          templateFileName: templateFile.name,
          sourceRows,
          workbookRows,
        })
      : buildRocketConfirmationWorkbook({
          sourceRows,
          workbookRows,
        });
    return workbook;
  };

  const exportAndDownload = async () => {
    if (!preview || !collectionRun || !canExport) return null;
    const generation = requestGenerationRef.current;
    const controller = beginWaiter();
    setExporting(true);
    setError(null);
    onActivity?.({ status: 'started', message: '쿠팡 제출용 엑셀을 저장하고 있습니다.' });
    try {
      const completeResult = await previewWithInventoryGate({
        request: {
          channelAccountId,
          sourceImportRunId: collectionRun.sourceImportRunId,
          editedQuantities: reviewedQuantities,
          clampEditedQuantities: true,
          previewScope: 'confirmation_requested',
        },
        generation,
        controller,
        notifyCatalogSaved: false,
        inventoryRequirement: 'fresh',
      });
      if (generation !== requestGenerationRef.current) return null;

      const freshPreview = previewForDeliveryDate(completeResult, selectedDeliveryDate);
      const freshQuantities = visibleReviewQuantities(freshPreview);
      const freshShortageReasons = reconcileShortageReasons(
        shortageReasons,
        freshPreview,
        freshQuantities,
      );
      setPreview(freshPreview);
      setDisplayPreview((current) => mergeDisplayPreview(current, freshPreview));
      setEditedQuantities(freshQuantities);
      setValidatedEditFingerprint(editFingerprint(freshQuantities));
      setPreviewDirty(false);
      setPendingCheckpoint(null);
      setShortageReasons(freshShortageReasons);

      if (freshPreview.rows.some((row) => isRocketWorkbookBlockingReason(row.reason))) {
        const message = '최신 Sellpia 재고 기준으로 재고 연결 검토가 필요한 항목이 생겼습니다.';
        setStage('review_required');
        setError(message);
        onActivity?.({ status: 'failed', message });
        return null;
      }

      setStage('ready');
      const freshWorkbookRows = sourceRows.map((row) => {
        const workbookQuantity = freshQuantities[row.poLineId] ?? 0;
        return {
          poLineId: row.poLineId,
          workbookQuantity,
          shortageReason: workbookQuantity < row.orderQty
            ? freshShortageReasons[row.poLineId] ?? null
            : null,
        };
      });
      const workbook = await buildReviewedWorkbook(freshWorkbookRows);
      downloadBlob(workbook.blob, workbook.fileName);
      onActivity?.({ status: 'succeeded', message: '쿠팡 제출용 엑셀을 다운로드했습니다.' });
      return {
        totals: {
          workbookQuantity: workbook.summary.workbookQuantity,
        },
      };
    } catch (cause) {
      const message = friendlyError(cause) ?? '쿠팡 제출용 엑셀을 만들지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return null;
    } finally {
      finishWaiter(controller);
      setExporting(false);
    }
  };

  return {
    editedQuantities,
    setReviewedQuantity,
    preview,
    /** 표에 그릴 전체 행(선택 날짜의 모든 상태). 엑셀 게이트는 `preview` 가 담당한다. */
    displayPreview,
    pendingCheckpoint,
    stage: rocketSource.isCollecting ? 'collecting' as const : stage,
    sourceRows,
    /** 선택 날짜의 전체 수집 행. 매입단가처럼 검토 대상 밖 행에도 필요한 값을 여기서 읽는다. */
    collectionRows,
    previewDirty,
    setPreviewDirty,
    collectionRun,
    shortageReasons,
    setShortageReasons,
    exporting,
    templateFile,
    setTemplateFile,
    loading: loading || rocketSource.isCollecting,
    collecting: collecting || rocketSource.isCollecting,
    error,
    inventoryCollectionRequired: stage === 'inventory_collection_required',
    collectionWarning,
    canExport,
    recalculate,
    retryInventoryAndPreview,
    revalidateEditedQuantities,
    exportAndDownload,
  };
}
