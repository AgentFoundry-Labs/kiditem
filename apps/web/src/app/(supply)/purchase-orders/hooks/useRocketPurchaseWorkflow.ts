'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isRocketWorkbookBlockingReason,
} from '@kiditem/shared/rocket-purchase-preview';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
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
  fillRocketConfirmationWorkbook,
} from '../lib/rocket-confirmation-workbook';
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
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

function editFingerprint(quantities: Record<string, number>): string {
  return JSON.stringify(Object.entries(quantities).sort(([left], [right]) =>
    left.localeCompare(right)));
}

function visibleReviewQuantities(
  preview: RocketPurchasePreviewResponse,
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

function pruneShortageReasons(
  current: Record<string, RocketShortageReason>,
  preview: RocketPurchasePreviewResponse,
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
  preview: RocketPurchasePreviewResponse | null,
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
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [operatorEditedLineIds, setOperatorEditedLineIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<RocketPurchasePreviewResponse | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [validatedEditFingerprint, setValidatedEditFingerprint] = useState('');
  const [sourceRows, setSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [shortageReasons, setShortageReasons] = useState<Record<string, RocketShortageReason>>({});
  const [exportKey, setExportKey] = useState('');
  const [workbookExport, setWorkbookExport] = useState<RocketWorkbookExportResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandoning, setAbandoning] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setEditedQuantities({});
    setOperatorEditedLineIds(new Set());
    setPreview(null);
    setPreviewDirty(false);
    setValidatedEditFingerprint('');
    setSourceRows([]);
    setCollectionRun(null);
    setShortageReasons({});
    setExportKey('');
    setAbandonReason('');
    setLoading(false);
    setError(null);
  }, [channelAccountId, savedSourceImportRunId]);

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
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      onActivity?.({ status: 'started', message: '저장된 로켓 PO 수집본을 불러오는 중입니다.' });
      try {
        const saved = await loadSavedRocketCollection({
          channelAccountId,
          sourceImportRunId: savedSourceImportRunId,
        });
        const poCount = new Set(saved.rows.map(({ poNumber }) => poNumber)).size;
        const result = await previewRocketPurchases({
          channelAccountId,
          collection: saved.collection,
          rows: saved.rows,
          editedQuantities: {},
          clampEditedQuantities: true,
        });
        if (cancelled || generation !== requestGenerationRef.current) return;
        const effectiveEdits = visibleReviewQuantities(result);
        setCollectionRun({
          collection: saved.collection,
          poCount,
          rowCount: saved.rows.length,
          uniqueRowPoCount: poCount,
          rowsMatchEvidenceVendor: saved.rows.every(
            ({ vendorId }) => vendorId === saved.collection.vendorId,
          ),
        });
        setSourceRows(saved.rows);
        setEditedQuantities(effectiveEdits);
        setOperatorEditedLineIds(new Set());
        setValidatedEditFingerprint(editFingerprint(effectiveEdits));
        setPreviewDirty(false);
        setExportKey(globalThis.crypto.randomUUID());
        setShortageReasons({});
        setAbandonReason('');
        setPreview(result);
        onActivity?.({ status: 'succeeded', message: '저장된 로켓 PO를 최신 재고 기준으로 다시 계산했습니다.' });
      } catch (cause) {
        if (cancelled || generation !== requestGenerationRef.current) return;
        const message = friendlyError(cause) ?? '저장된 로켓 PO를 불러오지 못했습니다.';
        setError(message);
        onActivity?.({ status: 'failed', message });
      } finally {
        if (!cancelled && generation === requestGenerationRef.current) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [channelAccountId, onActivity, savedSourceImportRunId]);

  const recalculate = async () => {
    const generation = requestGenerationRef.current;
    setLoading(true);
    setError(null);
    onActivity?.({ status: 'started', message: '쿠팡에서 로켓 PO를 새로 수집하고 있습니다.' });
    try {
      const collected = await collectRocketPoRowsForConfirmationFromExtension({ from, to });
      if (generation !== requestGenerationRef.current) return;
      const retainedEdits = operatorEditsForRows(
        operatorEditedLineIds,
        editedQuantities,
        collected.rows,
      );
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collected.collection,
        rows: collected.rows,
        editedQuantities: retainedEdits,
        clampEditedQuantities: true,
      });
      if (generation !== requestGenerationRef.current) return;
      if (collected.poCount > 0 && result.catalog === null) {
        const incomplete = result.rows.some(({ reason }) => reason === 'collection_incomplete');
        const message = incomplete
          ? `로켓 PO ${collected.poCount}건 중 ${collected.collection.detailPoCount}건만 수집되어 저장하지 않았습니다.`
          : `로켓 PO ${collected.poCount}건을 수집했지만 검증을 통과하지 못해 저장하지 않았습니다.`;
        setError(message);
        onActivity?.({ status: 'failed', message });
        return;
      }
      const effectiveEdits = visibleReviewQuantities(result);
      const currentLineIds = new Set(result.rows.map(({ poLineId }) => poLineId));
      setCollectionRun({
        collection: collected.collection,
        poCount: collected.poCount,
        rowCount: collected.rows.length,
        uniqueRowPoCount: new Set(collected.rows.map(({ poNumber }) => poNumber)).size,
        rowsMatchEvidenceVendor: collected.rows.every(
          ({ vendorId }) => vendorId === collected.collection.vendorId,
        ),
      });
      setEditedQuantities(effectiveEdits);
      setOperatorEditedLineIds((current) => new Set(
        [...current].filter((poLineId) => currentLineIds.has(poLineId)),
      ));
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setSourceRows(collected.rows);
      setExportKey(globalThis.crypto.randomUUID());
      setShortageReasons((current) => pruneShortageReasons(
        current,
        result,
        effectiveEdits,
      ));
      setPreview(result);
      setAbandonReason('');
      if (result.catalog) onCatalogSaved?.();
      onActivity?.({
        status: 'succeeded',
        message: `로켓 PO ${collected.collection.detailPoCount}/${collected.poCount}건을 수집·저장하고 재고 미리보기를 계산했습니다.`,
      });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      const message = friendlyError(cause) ?? '로켓 발주 미리보기를 계산하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  };

  const revalidateEditedQuantities = async () => {
    if (!collectionRun || sourceRows.length === 0) return;
    const generation = requestGenerationRef.current;
    setLoading(true);
    setError(null);
    onActivity?.({ status: 'started', message: '검토수량을 현재 재고 기준으로 다시 검증하고 있습니다.' });
    try {
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities: operatorEditsForRows(
          operatorEditedLineIds,
          editedQuantities,
          sourceRows,
        ),
        clampEditedQuantities: true,
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
      setShortageReasons((current) => pruneShortageReasons(
        current,
        result,
        effectiveEdits,
      ));
      onActivity?.({ status: 'succeeded', message: '검토수량 재검증을 완료했습니다.' });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      setPreviewDirty(true);
      const message = friendlyError(cause) ?? '수량을 다시 검증하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
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
    sourceRows,
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
    error,
    collectionWarning,
    canExport,
    canRedownload,
    recalculate,
    revalidateEditedQuantities,
    exportAndDownload,
    downloadActiveWorkbook,
    refreshActiveWorkbook,
    abandonActiveWorkbook,
  };
}
