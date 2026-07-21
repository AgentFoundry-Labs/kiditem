'use client';

import { useEffect, useState } from 'react';
import {
  ROCKET_PO_DETAIL_LIMIT,
  ROCKET_PO_LIST_PAGE_LIMIT,
} from '@kiditem/shared/rocket-purchase-preview';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';
import { collectRocketPoRowsForConfirmationFromExtension } from '@/lib/rocket-sales-collection';
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
import type {
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
  RocketPurchaseConfirmationResponse,
  RocketPurchasePreviewResponse,
  RocketShortageReason,
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

function collectionIsIncomplete(summary: CollectionRunSummary): boolean {
  const { collection } = summary;
  const requiresVendorEvidence = summary.poCount > 0 || summary.rowCount > 0;
  return (requiresVendorEvidence && collection.vendorId.length === 0)
    || collection.truncated
    || collection.failedPoNumbers.length > 0
    || collection.listPagesRead >= ROCKET_PO_LIST_PAGE_LIMIT
    || collection.detailPoCount >= ROCKET_PO_DETAIL_LIMIT
    || collection.totalListPages > collection.listPagesRead
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
  const [preview, setPreview] = useState<RocketPurchasePreviewResponse | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [validatedEditFingerprint, setValidatedEditFingerprint] = useState('');
  const [sourceRows, setSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [collectionRun, setCollectionRun] = useState<CollectionRunSummary | null>(null);
  const [shortageReasons, setShortageReasons] = useState<Record<string, RocketShortageReason>>({});
  const [confirmationKey, setConfirmationKey] = useState('');
  const [confirmation, setConfirmation] = useState<RocketPurchaseConfirmationResponse | null>(null);
  const [confirmationSourceRows, setConfirmationSourceRows] = useState<RocketPoCatalogRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedSourceImportRunId) return;
    setEditedQuantities({});
    setPreview(null);
    setPreviewDirty(false);
    setValidatedEditFingerprint('');
    setSourceRows([]);
    setCollectionRun(null);
    setShortageReasons({});
    setConfirmationKey('');
    setConfirmation(null);
    setConfirmationSourceRows([]);
    setReleaseReason('');
    setError(null);
  }, [channelAccountId, savedSourceImportRunId]);

  useEffect(() => {
    if (!savedSourceImportRunId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPreview(null);
      setConfirmation(null);
      setConfirmationSourceRows([]);
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
        if (cancelled) return;
        const effectiveEdits = Object.fromEntries(result.rows.map((row) => [
          row.poLineId,
          row.editedQuantity ?? row.recommendedQuantity,
        ]));
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
        setValidatedEditFingerprint(editFingerprint(effectiveEdits));
        setPreviewDirty(false);
        setConfirmationKey(globalThis.crypto.randomUUID());
        setShortageReasons({});
        setReleaseReason('');
        setPreview(result);
        onActivity?.({ status: 'succeeded', message: '저장된 로켓 PO를 최신 재고 기준으로 다시 계산했습니다.' });
      } catch (cause) {
        if (cancelled) return;
        const message = friendlyError(cause) ?? '저장된 로켓 PO를 불러오지 못했습니다.';
        setError(message);
        onActivity?.({ status: 'failed', message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [channelAccountId, onActivity, savedSourceImportRunId]);

  const recalculate = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setSourceRows([]);
    setCollectionRun(null);
    setConfirmationKey('');
    setConfirmation(null);
    setConfirmationSourceRows([]);
    setShortageReasons({});
    setReleaseReason('');
    onActivity?.({ status: 'started', message: '쿠팡에서 로켓 PO를 새로 수집하고 있습니다.' });
    try {
      const collected = await collectRocketPoRowsForConfirmationFromExtension({ from, to });
      setCollectionRun({
        collection: collected.collection,
        poCount: collected.poCount,
        rowCount: collected.rows.length,
        uniqueRowPoCount: new Set(collected.rows.map(({ poNumber }) => poNumber)).size,
        rowsMatchEvidenceVendor: collected.rows.every(
          ({ vendorId }) => vendorId === collected.collection.vendorId,
        ),
      });
      const retainedEdits = Object.fromEntries(collected.rows.flatMap((row) => {
        if (!Object.hasOwn(editedQuantities, row.poLineId)) return [];
        return [[row.poLineId, editedQuantities[row.poLineId]!]];
      }));
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collected.collection,
        rows: collected.rows,
        editedQuantities: retainedEdits,
        clampEditedQuantities: true,
      });
      const effectiveEdits = Object.fromEntries(result.rows.map((row) => [
        row.poLineId,
        row.editedQuantity ?? row.recommendedQuantity,
      ]));
      setEditedQuantities(effectiveEdits);
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      setSourceRows(collected.rows);
      setConfirmationKey(globalThis.crypto.randomUUID());
      setShortageReasons({});
      setPreview(result);
      if (result.catalog) onCatalogSaved?.();
      onActivity?.({ status: 'succeeded', message: `로켓 PO ${collected.poCount}건을 수집하고 재고 미리보기를 계산했습니다.` });
    } catch (cause) {
      const message = friendlyError(cause) ?? '로켓 발주 미리보기를 계산하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      setLoading(false);
    }
  };

  const revalidateEditedQuantities = async () => {
    if (!collectionRun || sourceRows.length === 0) return;
    setLoading(true);
    setError(null);
    onActivity?.({ status: 'started', message: '검토수량을 현재 재고 기준으로 다시 검증하고 있습니다.' });
    try {
      const result = await previewRocketPurchases({
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities,
        clampEditedQuantities: true,
      });
      const effectiveEdits = Object.fromEntries(result.rows.map((row) => [
        row.poLineId,
        row.editedQuantity ?? row.recommendedQuantity,
      ]));
      setPreview(result);
      setEditedQuantities(effectiveEdits);
      setValidatedEditFingerprint(editFingerprint(effectiveEdits));
      setPreviewDirty(false);
      onActivity?.({ status: 'succeeded', message: '검토수량 재검증을 완료했습니다.' });
    } catch (cause) {
      setPreviewDirty(true);
      const message = friendlyError(cause) ?? '수량을 다시 검증하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      setLoading(false);
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
  const canConfirm = Boolean(
    preview?.catalog
    && preview.rows.length > 0
    && sourceRows.length === preview.rows.length
    && sourceRows.every((row) => row.confirmation && row.barcode.length > 0)
    && !previewDirty
    && validatedEditFingerprint === editFingerprint(reviewedQuantities)
    && preview.rows.every((row) => (
      (reviewedQuantities[row.poLineId] ?? 0) >= row.orderQuantity
      || Boolean(shortageReasons[row.poLineId])
    ))
    && !collectionWarning
    && confirmationKey
    && confirmation?.status !== 'active',
  );
  const canRedownload = confirmation?.status === 'active';

  const downloadConfirmationWorkbook = async (
    result: RocketPurchaseConfirmationResponse,
    workbookSourceRows: RocketPoCatalogRow[],
  ): Promise<void> => {
    const workbook = templateFile
      ? fillRocketConfirmationWorkbook({
          template: await templateFile.arrayBuffer(),
          templateFileName: templateFile.name,
          sourceRows: workbookSourceRows,
          confirmedRows: result.rows,
        })
      : buildRocketConfirmationWorkbook({
          sourceRows: workbookSourceRows,
          confirmedRows: result.rows,
        });
    downloadBlob(workbook.blob, workbook.fileName);
    try {
      await saveRocketConfirmFile({
        id: `rocket-confirmation-${result.confirmationId}`,
        fileName: workbook.fileName,
        createdAt: Date.now(),
        blob: workbook.blob,
        totalRows: workbook.summary.totalRows,
        fullyConfirmed: workbook.summary.fullyConfirmedRows,
        shortRows: workbook.summary.shortRows,
      });
    } catch {
      setError('엑셀은 다운로드됐지만 로컬 파일 이력에 저장하지 못했습니다.');
    }
  };

  const confirmPurchase = async (): Promise<RocketPurchaseConfirmationResponse | null> => {
    if (!preview || !collectionRun || !canConfirm) return null;
    setConfirming(true);
    setError(null);
    onActivity?.({ status: 'started', message: '검토수량을 확정하고 재고를 예약하고 있습니다.' });
    try {
      const result = await confirmRocketPurchase({
        idempotencyKey: confirmationKey,
        channelAccountId,
        collection: collectionRun.collection,
        rows: sourceRows,
        editedQuantities: reviewedQuantities,
        shortageReasons,
      });
      setConfirmation(result);
      setConfirmationSourceRows(sourceRows);
      onActivity?.({ status: 'succeeded', message: '검토수량을 확정하고 재고를 예약했습니다.' });
      return result;
    } catch (cause) {
      const message = friendlyError(cause) ?? '로켓 발주를 확정하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return null;
    } finally {
      setConfirming(false);
    }
  };

  const downloadActiveConfirmation = async (
    result: RocketPurchaseConfirmationResponse | null = confirmation,
  ): Promise<boolean> => {
    if (result?.status !== 'active') return false;
    setConfirming(true);
    setError(null);
    onActivity?.({ status: 'started', message: '확정 엑셀을 생성하고 있습니다.' });
    try {
      const workbookSourceRows = result.confirmationId === confirmation?.confirmationId
        ? confirmationSourceRows
        : sourceRows;
      await downloadConfirmationWorkbook(result, workbookSourceRows);
      onActivity?.({ status: 'succeeded', message: '쿠팡 발주확정 엑셀을 다운로드했습니다.' });
      return true;
    } catch {
      const message = '확정은 완료됐지만 엑셀 생성에 실패했습니다. 다시 다운로드하거나 확정을 해제해 주세요.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return false;
    } finally {
      setConfirming(false);
    }
  };

  const confirmAndDownload = async () => {
    if (canRedownload) {
      await downloadActiveConfirmation();
      return;
    }
    const result = await confirmPurchase();
    if (result) await downloadActiveConfirmation(result);
  };

  // 셀피아 재고 기준 확정 엑셀(레시피/서버 예약 없이 문서만 생성). 미등록 상품용.
  // 실제 쿠팡 수집 메타(센터·반품주소 등, source.confirmation)가 있어야 유효한 양식이 나온다.
  const exportStockWorkbook = async (
    confirmedRows: RocketPurchaseConfirmationResponse['rows'],
  ): Promise<boolean> => {
    if (sourceRows.length === 0) {
      setError('내보낼 발주 행이 없습니다.');
      return false;
    }
    onActivity?.({ status: 'started', message: '셀피아 재고 기준 발주확정 엑셀을 생성하고 있습니다.' });
    try {
      const workbook = templateFile
        ? fillRocketConfirmationWorkbook({
            template: await templateFile.arrayBuffer(),
            templateFileName: templateFile.name,
            sourceRows,
            confirmedRows,
          })
        : buildRocketConfirmationWorkbook({ sourceRows, confirmedRows });
      downloadBlob(workbook.blob, workbook.fileName);
      onActivity?.({
        status: 'succeeded',
        message: `재고 기준 발주확정 엑셀을 생성했습니다(확정 ${workbook.summary.confirmedQuantity}개).`,
      });
      return true;
    } catch (cause) {
      const message = friendlyError(cause)
        ?? '엑셀을 만들지 못했습니다. 실제 쿠팡 수집(센터·반품주소 등) 데이터가 필요합니다. "이 달 쿠팡에서 수집" 후 다시 시도해 주세요.';
      setError(message);
      onActivity?.({ status: 'failed', message });
      return false;
    }
  };

  const releaseConfirmation = async () => {
    if (confirmation?.status !== 'active' || !releaseReason.trim()) return;
    setReleasing(true);
    setError(null);
    onActivity?.({ status: 'started', message: '로켓 발주 재고 예약을 종료하고 있습니다.' });
    try {
      setConfirmation(await releaseRocketPurchaseConfirmation({
        confirmationId: confirmation.confirmationId,
        reason: releaseReason.trim(),
      }));
      onActivity?.({ status: 'succeeded', message: '로켓 발주 재고 예약을 종료했습니다.' });
    } catch (cause) {
      const message = friendlyError(cause) ?? '로켓 발주 예약을 종료하지 못했습니다.';
      setError(message);
      onActivity?.({ status: 'failed', message });
    } finally {
      setReleasing(false);
    }
  };

  return {
    editedQuantities,
    setEditedQuantities,
    preview,
    sourceRows,
    previewDirty,
    setPreviewDirty,
    collectionRun,
    shortageReasons,
    setShortageReasons,
    confirmation,
    confirming,
    releaseReason,
    setReleaseReason,
    releasing,
    templateFile,
    setTemplateFile,
    loading,
    error,
    collectionWarning,
    canConfirm,
    canRedownload,
    recalculate,
    revalidateEditedQuantities,
    confirmPurchase,
    downloadActiveConfirmation,
    confirmAndDownload,
    exportStockWorkbook,
    releaseConfirmation,
  };
}
