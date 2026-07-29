'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  isRocketWorkbookBlockingReason,
} from '@kiditem/shared/rocket-purchase-preview';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
import {
  collectRocketPoRowsForConfirmationFromExtension,
  finalizeRocketPoCollectionSession,
} from '@/lib/rocket-sales-collection';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import {
  abandonRocketWorkbook,
  downloadRocketWorkbook,
  exportRocketWorkbook,
  getActiveRocketWorkbook,
  loadSavedRocketCollection,
  previewRocketPurchases,
  rocketPreviewErrorMessage,
} from '../lib/rocket-purchase-preview-api';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import {
  recoverRocketPreviewFreshness,
  RocketPreviewFreshnessRecoveryError,
} from '../lib/rocket-preview-freshness-recovery';
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
  RocketPurchasePreviewRequest,
  RocketPurchasePreviewResponse,
  RocketShortageReason,
  RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';

interface CollectionRunSummary {
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
  | 'refreshing_inventory'
  | 'calculating'
  | 'review_required'
  | 'ready'
  | 'attention_required';

function editFingerprint(quantities: Record<string, number>): string {
  return JSON.stringify(Object.entries(quantities).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function visibleReviewQuantities(
  preview: RocketPurchasePreviewReadyResponse,
): Record<string, number> {
  return Object.fromEntries(preview.rows.map((row) => [
    row.poLineId,
    row.editedQuantity ?? row.recommendedQuantity,
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
    || ['거래명세서확인요청', '거래처확인요청'].includes(
      row.confirmation?.poStatus.trim() ?? '',
    )
  ));
}

function pruneShortageReasons(
  current: Record<string, RocketShortageReason>,
  preview: RocketPurchasePreviewReadyResponse,
  reviewedQuantities: Record<string, number>,
): Record<string, RocketShortageReason> {
  const rowsByLineId = new Map(preview.rows.map((row) => [row.poLineId, row]));
  return Object.fromEntries(Object.entries(current).filter(([poLineId]) => {
    const row = rowsByLineId.get(poLineId);
    if (!row || isRocketWorkbookBlockingReason(row.reason)) return false;
    return (reviewedQuantities[poLineId] ?? row.recommendedQuantity) < row.orderQuantity;
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
  preview: RocketPurchasePreviewReadyResponse | null,
  hasConfiguredVendorId: boolean,
): string | null {
  if (!summary) return null;
  const previewReasons = new Set(preview?.rows.map(({ reason }) => reason) ?? []);
  if (collectionIsIncomplete(summary) || previewReasons.has('collection_incomplete')) {
    return '수집 범위가 불완전합니다. 누락된 PO를 확인한 뒤 다시 계산해 주세요. 공급사 식별 정보도 확인해 주세요.';
  }
  if (previewReasons.has('vendor_mismatch')) {
    if (!hasConfiguredVendorId) {
      return '선택한 로켓 채널 계정에 공급사 ID가 설정되지 않았습니다. 로켓 계정 설정을 확인해 주세요.';
    }
    return '선택한 로켓 채널 계정과 수집한 PO의 공급사가 일치하지 않습니다.';
  }
  return null;
}

export function useRocketPurchaseWorkflow({
  channelAccountId,
  hasConfiguredVendorId,
  from,
  to,
  savedSourceImportRunId,
  onCatalogSaved,
  onActivity,
}: {
  channelAccountId: string;
  hasConfiguredVendorId: boolean;
  from: string;
  to: string;
  savedSourceImportRunId: string | null;
  onCatalogSaved?: () => void;
  onActivity?: (activity: RocketOrderActivityInput) => void;
}) {
  const queryClient = useQueryClient();
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [operatorEditedLineIds, setOperatorEditedLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<RocketPurchasePreviewReadyResponse | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<
    RocketPurchasePreviewFreshnessPendingResponse | null
  >(null);
  const [stage, setStage] = useState<RocketWorkflowStage>('idle');
  const [previewDirty, setPreviewDirty] = useState(false);
  const [validatedEditFingerprint, setValidatedEditFingerprint] = useState('');
  const [sourceRows, setSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRows, setCollectionRows] = useState<RocketPoCatalogRow[]>([]);
  // 이 계정에서 이미 확정 엑셀로 나간 PO 라인. 수집은 매번 전량 스냅샷이라 제출한 라인이
  // 이후 수집본에도 계속 나온다. 목록에서 "이번에 새로 들어온 것"을 가려내는 기준이다.
  const [exportedPoLineIds, setExportedPoLineIds] = useState<string[]>([]);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [shortageReasons, setShortageReasons] = useState<Record<string, RocketShortageReason>>({});
  const [exportKey, setExportKey] = useState('');
  const [workbookExport, setWorkbookExport] = useState<RocketWorkbookExportResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandoning, setAbandoning] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const activeWaiterRef = useRef<AbortController | null>(null);
  const collectionPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    requestGenerationRef.current += 1;
    activeWaiterRef.current?.abort();
    activeWaiterRef.current = null;
    setEditedQuantities({});
    setOperatorEditedLineIds(new Set());
    setPreview(null);
    setPendingCheckpoint(null);
    setStage('idle');
    setPreviewDirty(false);
    setValidatedEditFingerprint('');
    setSourceRows([]);
    setCollectionRows([]);
    setExportedPoLineIds([]);
    setCollectionRun(null);
    setShortageReasons({});
    setExportKey('');
    setAbandonReason('');
    setLoading(false);
    setCollecting(false);
    setError(null);
  }, [channelAccountId, from, savedSourceImportRunId, to]);

  useEffect(() => () => {
    activeWaiterRef.current?.abort();
  }, []);

  const previewWithFreshnessRecovery = async (input: {
    request: RocketPurchasePreviewRequest;
    generation: number;
    controller: AbortController;
    notifyCatalogSaved: boolean;
    initial?: RocketPurchasePreviewResponse;
  }): Promise<RocketPurchasePreviewReadyResponse> => {
    const isCurrent = () => (
      input.generation === requestGenerationRef.current
      && !input.controller.signal.aborted
    );
    const initial = input.initial ?? await previewRocketPurchases(input.request);
    if (!isCurrent()) {
      throw new Error('Stale Rocket preview response');
    }
    if (input.notifyCatalogSaved && initial.catalog) onCatalogSaved?.();

    return recoverRocketPreviewFreshness(initial, {
      retryPreview: () => previewRocketPurchases(input.request),
      getFreshnessState: sellpiaInventoryFreshnessApi.getState,
      requestRetry: () => sellpiaInventoryFreshnessApi.requestRefresh('retry'),
      publishPending: (checkpoint) => {
        if (!isCurrent()) return;
        setPendingCheckpoint(checkpoint);
        setPreview({
          status: 'ready',
          collectionRunId: checkpoint.collectionRunId,
          catalog: checkpoint.catalog,
          inventoryGeneration: null,
          rows: checkpoint.rows,
        });
        setStage('refreshing_inventory');
      },
      publishFreshnessState: async () => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.inventory.freshness(),
        });
      },
    }, input.controller.signal);
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
    cause instanceof RocketPreviewFreshnessRecoveryError
    && cause.code === 'attention_required'
      ? 'attention_required'
      : 'review_required'
  );

  const recoveryErrorMessage = (cause: unknown, fallback: string): string => (
    cause instanceof RocketPreviewFreshnessRecoveryError
      ? cause.message
      : rocketPreviewErrorMessage(cause, fallback)
  );

  useEffect(() => {
    let cancelled = false;
    const loadActive = async () => {
      try {
        const active = await getActiveRocketWorkbook();
        if (!cancelled) setWorkbookExport(active);
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause) ?? '진행 중인 로켓 워크북을 확인하지 못했습니다.');
      }
    };
    void loadActive();
    return () => {
      cancelled = true;
    };
  }, [channelAccountId]);

  useEffect(() => {
    if (!savedSourceImportRunId) return;
    const generation = requestGenerationRef.current;
    const controller = beginWaiter();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      setPendingCheckpoint(null);
      setStage('calculating');
      onActivity?.({ status: 'started', message: '저장된 로켓 PO 수집본을 불러오는 중입니다.' });
      try {
        const saved = await loadSavedRocketCollection({
          channelAccountId,
          sourceImportRunId: savedSourceImportRunId,
        });
        if (cancelled || generation !== requestGenerationRef.current) return;
        const reviewRows = confirmationRequestedRows(saved.rows);
        const poCount = new Set(saved.rows.map(({ poNumber }) => poNumber)).size;
        setCollectionRun({
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
        setExportedPoLineIds(saved.exportedPoLineIds);
        const result = await previewWithFreshnessRecovery({
          request: {
          channelAccountId,
          collection: saved.collection,
          rows: saved.rows,
          editedQuantities: {},
          clampEditedQuantities: true,
          previewScope: 'confirmation_requested',
          },
          generation,
          controller,
          notifyCatalogSaved: false,
        });
        if (cancelled || generation !== requestGenerationRef.current) return;
        const effectiveEdits = visibleReviewQuantities(result);
        setEditedQuantities(effectiveEdits);
        setOperatorEditedLineIds(new Set());
        setValidatedEditFingerprint(editFingerprint(effectiveEdits));
        setPreviewDirty(false);
        setExportKey(globalThis.crypto.randomUUID());
        setShortageReasons({});
        setAbandonReason('');
        setPreview(result);
        setPendingCheckpoint(null);
        setStage('ready');
        onActivity?.({ status: 'succeeded', message: '저장된 로켓 PO를 최신 재고 기준으로 다시 계산했습니다.' });
      } catch (cause) {
        if (cancelled || generation !== requestGenerationRef.current) return;
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
  }, [channelAccountId, from, onActivity, savedSourceImportRunId, to]);

  const performRecalculation = async () => {
    const generation = requestGenerationRef.current;
    // This controller intentionally outlives the route. A client-side route
    // transition must not cancel collection persistence.
    const controller = new AbortController();
    let collectedRun: Awaited<ReturnType<
      typeof collectRocketPoRowsForConfirmationFromExtension
    >> | null = null;
    let collectionSessionTerminal = false;
    setLoading(true);
    setCollecting(true);
    setStage('collecting');
    setError(null);
    onActivity?.({ status: 'started', message: '쿠팡에서 로켓 PO를 새로 수집하고 있습니다.' });
    try {
      const collected = await collectRocketPoRowsForConfirmationFromExtension({ from, to });
      collectedRun = collected;
      const reviewRows = confirmationRequestedRows(collected.rows);
      const retainedEdits = operatorEditsForRows(
        operatorEditedLineIds,
        editedQuantities,
        reviewRows,
      );
      setCollectionRun({
        collection: collected.collection,
        poCount: collected.poCount,
        rowCount: collected.rows.length,
        uniqueRowPoCount: new Set(collected.rows.map(({ poNumber }) => poNumber)).size,
        rowsMatchEvidenceVendor: collected.rows.every(
          ({ vendorId }) => vendorId === collected.collection.vendorId,
        ),
      });
      setSourceRows(reviewRows);
      setCollectionRows(collected.rows);
      setExportedPoLineIds([]);
      setPendingCheckpoint(null);
      setStage('persisting_collection');
      const request: RocketPurchasePreviewRequest = {
          channelAccountId,
          collection: collected.collection,
          rows: collected.rows,
          editedQuantities: retainedEdits,
          clampEditedQuantities: true,
          previewScope: 'confirmation_requested',
      };
      const initial = await previewRocketPurchases(request);
      if (initial.catalog) onCatalogSaved?.();
      if (collected.poCount > 0 && initial.catalog === null) {
        const incomplete = initial.status === 'ready'
          && initial.rows.some(({ reason }) => reason === 'collection_incomplete');
        const message = incomplete
          ? `로켓 PO ${collected.poCount}건 중 ${collected.collection.detailPoCount}건만 수집되어 저장하지 않았습니다.`
          : `로켓 PO ${collected.poCount}건을 수집했지만 검증을 통과하지 못해 저장하지 않았습니다.`;
        await finalizeRocketPoCollectionSession({
          ...(collected.extensionId ? { extensionId: collected.extensionId } : {}),
          runId: collected.collection.collectionRunId,
          status: 'failed',
          message,
        }).catch(() => undefined);
        collectionSessionTerminal = true;
        onActivity?.({ status: 'failed', message });
        if (generation === requestGenerationRef.current) {
          setError(message);
          setStage('review_required');
        }
        return;
      }
      await finalizeRocketPoCollectionSession({
        ...(collected.extensionId ? { extensionId: collected.extensionId } : {}),
        runId: collected.collection.collectionRunId,
        status: 'succeeded',
        message: '로켓 PO 수집본 저장을 완료했습니다.',
      }).catch(() => undefined);
      collectionSessionTerminal = true;
      const result = await previewWithFreshnessRecovery({
        request,
        generation,
        controller,
        notifyCatalogSaved: false,
        initial,
      });
      if (generation !== requestGenerationRef.current) return;
      const effectiveEdits = visibleReviewQuantities(result);
      const currentLineIds = new Set(result.rows.map(({ poLineId }) => poLineId));
      setEditedQuantities(effectiveEdits);
      setOperatorEditedLineIds((current) => new Set(
        [...current].filter((poLineId) => currentLineIds.has(poLineId)),
      ));
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      // 새로 수집한 결과에는 제출 이력을 조회하지 않았다. 근거 없이 행을 숨기지 않도록 비운다.
      setExportKey(globalThis.crypto.randomUUID());
      setShortageReasons((current) => pruneShortageReasons(
        current,
        result,
        effectiveEdits,
      ));
      setPreview(result);
      setPendingCheckpoint(null);
      setStage('ready');
      setAbandonReason('');
      onActivity?.({
        status: 'succeeded',
        message: `로켓 PO ${collected.collection.detailPoCount}/${collected.poCount}건을 수집·저장하고 거래확인요청 ${new Set(result.rows.map(({ poNumber }) => poNumber)).size}건의 재고 미리보기를 계산했습니다.`,
      });
    } catch (cause) {
      if (collectedRun && !collectionSessionTerminal) {
        await finalizeRocketPoCollectionSession({
          ...(collectedRun.extensionId
            ? { extensionId: collectedRun.extensionId }
            : {}),
          runId: collectedRun.collection.collectionRunId,
          status: 'failed',
          message: rocketPreviewErrorMessage(
            cause,
            '로켓 PO 수집본을 서버에 저장하지 못했습니다.',
          ),
        }).catch(() => undefined);
      }
      if (generation !== requestGenerationRef.current) return;
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
    const generation = requestGenerationRef.current;
    const controller = beginWaiter();
    setLoading(true);
    setStage('calculating');
    setError(null);
    onActivity?.({ status: 'started', message: '검토수량을 현재 재고 기준으로 다시 검증하고 있습니다.' });
    try {
      const result = await previewWithFreshnessRecovery({
        request: {
          channelAccountId,
          collection: collectionRun.collection,
          rows: collectionRows,
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
      const effectiveEdits = visibleReviewQuantities(result);
      const currentLineIds = new Set(result.rows.map(({ poLineId }) => poLineId));
      setPreview(result);
      setEditedQuantities(effectiveEdits);
      setOperatorEditedLineIds((current) => new Set(
        [...current].filter((poLineId) => currentLineIds.has(poLineId)),
      ));
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setPendingCheckpoint(null);
      setStage('ready');
      setShortageReasons((current) => pruneShortageReasons(
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

  const collectionWarning = aggregateCollectionWarning(
    collectionRun,
    preview,
    hasConfiguredVendorId,
  );
  const reviewedQuantities = preview
    ? Object.fromEntries(preview.rows.map((row) => [
        row.poLineId,
        editedQuantities[row.poLineId] ?? row.recommendedQuantity,
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
    && !collectionWarning
    && exportKey
    && (!workbookExport || workbookExport.status === 'completed'),
  );
  const canRedownload = Boolean(workbookExport);

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

  const workbookRows = sourceRows.map((row) => {
    const workbookQuantity = reviewedQuantities[row.poLineId] ?? 0;
    return {
      poLineId: row.poLineId,
      workbookQuantity,
      shortageReason: workbookQuantity < row.orderQty
        ? shortageReasons[row.poLineId] ?? null
        : null,
    };
  });

  const buildReviewedWorkbook = async () => {
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

  const downloadStoredWorkbook = async (
    result: RocketWorkbookExportResponse,
    summary?: {
      totalRows: number;
      fullyConfirmedRows: number;
      shortRows: number;
    },
  ): Promise<void> => {
    const artifact = await downloadRocketWorkbook(result.exportId);
    downloadBlob(artifact.blob, artifact.fileName);
    try {
      const shortRows = summary?.shortRows
        ?? result.rows.filter(({ shortageReason }) => shortageReason !== null).length;
      await saveRocketConfirmFile({
        id: `rocket-workbook-${result.exportId}`,
        fileName: artifact.fileName,
        createdAt: Date.now(),
        blob: artifact.blob,
        totalRows: summary?.totalRows ?? result.totals.lineCount,
        fullyConfirmed: summary?.fullyConfirmedRows ?? result.totals.lineCount - shortRows,
        shortRows,
      });
    } catch {
      setError('엑셀은 다운로드됐지만 로컬 파일 이력에 저장하지 못했습니다.');
    }
  };

  const exportAndDownload = async (): Promise<RocketWorkbookExportResponse | null> => {
    if (!preview || !collectionRun || !canExport) return null;
    setExporting(true);
    setError(null);
    onActivity?.({ status: 'started', message: '쿠팡 제출용 엑셀을 저장하고 있습니다.' });
    try {
      const workbook = await buildReviewedWorkbook();
      const result = await exportRocketWorkbook({
        idempotencyKey: exportKey,
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities: reviewedQuantities,
        shortageReasons,
        artifactFileName: workbook.fileName,
        artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }, workbook.blob);
      setWorkbookExport(result);
      await downloadStoredWorkbook(result, workbook.summary);
      onActivity?.({ status: 'succeeded', message: '쿠팡 제출용 엑셀을 다운로드했습니다.' });
      return result;
    } catch (cause) {
      const message = friendlyError(cause) ?? '쿠팡 제출용 엑셀을 만들지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return null;
    } finally {
      setExporting(false);
    }
  };

  const downloadActiveWorkbook = async (
    result: RocketWorkbookExportResponse | null = workbookExport,
  ): Promise<boolean> => {
    if (!result) return false;
    setExporting(true);
    setError(null);
    onActivity?.({ status: 'started', message: '저장된 동일 엑셀을 다운로드하고 있습니다.' });
    try {
      await downloadStoredWorkbook(result);
      onActivity?.({ status: 'succeeded', message: '저장된 동일 엑셀을 다운로드했습니다.' });
      return true;
    } catch (cause) {
      const message = friendlyError(cause) ?? '저장된 로켓 엑셀을 다운로드하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return false;
    } finally {
      setExporting(false);
    }
  };

  const refreshActiveWorkbook = async () => {
    setError(null);
    try {
      setWorkbookExport(await getActiveRocketWorkbook());
    } catch (cause) {
      setError(friendlyError(cause) ?? '로켓 워크북 진행 상태를 확인하지 못했습니다.');
    }
  };

  const abandonActiveWorkbook = async () => {
    if (
      workbookExport?.status !== 'awaiting_coupang_confirmation'
      || !workbookExport.canAbandon
      || !abandonReason.trim()
    ) return;
    setAbandoning(true);
    setError(null);
    onActivity?.({ status: 'started', message: '사용하지 않는 로켓 워크북을 종료하고 있습니다.' });
    try {
      setWorkbookExport(await abandonRocketWorkbook({
        exportId: workbookExport.exportId,
        reason: abandonReason.trim(),
      }));
      onActivity?.({ status: 'succeeded', message: '사용하지 않는 로켓 워크북을 종료했습니다.' });
    } catch (cause) {
      const message = friendlyError(cause) ?? '로켓 워크북을 종료하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      setAbandoning(false);
    }
  };

  return {
    editedQuantities,
    setReviewedQuantity,
    preview,
    pendingCheckpoint,
    stage,
    sourceRows,
    exportedPoLineIds,
    previewDirty,
    setPreviewDirty,
    collectionRun,
    shortageReasons,
    setShortageReasons,
    workbookExport,
    exporting,
    abandonReason,
    setAbandonReason,
    abandoning,
    templateFile,
    setTemplateFile,
    loading,
    collecting,
    error,
    collectionWarning,
    canExport,
    canRedownload,
    recalculate,
    retryInventoryAndPreview: revalidateEditedQuantities,
    revalidateEditedQuantities,
    exportAndDownload,
    downloadActiveWorkbook,
    refreshActiveWorkbook,
    abandonActiveWorkbook,
  };
}
