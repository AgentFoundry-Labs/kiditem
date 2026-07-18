'use client';

import { useState } from 'react';
import type { RocketPurchaseCommitmentListItem } from '@kiditem/shared/inventory-commitment';
import { friendlyError } from '@/lib/api-error';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { useRocketInventoryCommitments } from '../hooks/use-rocket-inventory-commitments';
import { releaseRocketPurchaseConfirmation } from '../lib/rocket-purchase-preview-api';

const STATUS_LABELS = {
  active: '활성',
  released: '종료',
  settled: '정산 완료',
} as const;

export function RocketInventoryCommitmentList({
  channelAccountId,
}: {
  channelAccountId: string;
}) {
  const { query, settle, release, invalidate } =
    useRocketInventoryCommitments(channelAccountId);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const actionableItems = (query.data?.items ?? []).filter((row) =>
    (row.finalOrderCommitment ?? row.requestCommitment)?.status === 'active');

  const perform = async (
    row: RocketPurchaseCommitmentListItem,
    action: 'settle' | 'release',
  ) => {
    const current = row.finalOrderCommitment ?? row.requestCommitment;
    if (!current) return;
    const reason = reasons[current.id]?.trim();
    if (!reason) return;
    setError(null);
    try {
      if (action === 'settle') {
        await settle.mutateAsync({ commitmentIds: [current.id], reason });
      } else if (current.kind === 'rocket_request') {
        await releaseRocketPurchaseConfirmation({
          confirmationId: row.confirmationId,
          reason,
        });
        await invalidate();
      } else {
        await release.mutateAsync({ commitmentIds: [current.id], reason });
      }
      setReasons((value) => ({ ...value, [current.id]: '' }));
    } catch (cause) {
      setError(friendlyError(cause) ?? '재고 약정을 처리하지 못했습니다.');
    }
  };

  if (query.isLoading || (!query.isError && actionableItems.length === 0)) {
    return null;
  }

  return (
    <section aria-label="로켓 재고 약정" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="font-bold text-slate-900">처리 필요한 재고 약정</h3>
        <p className="text-xs text-slate-500">
          새로고침 후에도 유지되는 활성 약정입니다. 실제 출고가 반영된 새 Sellpia 재고를 수집한 뒤 정산하거나, 취소 사유를 남겨 종료하세요.
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {query.isError ? (
        <button type="button" onClick={() => void query.refetch()} className="text-sm font-semibold text-violet-700">약정 다시 불러오기</button>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1420px] table-fixed text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="w-36 px-3 py-2">PO</th>
                <th className="w-72 px-3 py-2">상품</th>
                <th className="w-28 px-3 py-2">상태</th>
                <th className="w-32 px-3 py-2 text-right">요청 / 확정</th>
                <th className="w-80 px-3 py-2">현재고 / 약정 / 가용재고</th>
                <th className="w-44 px-3 py-2">처리 이력</th>
                <th className="w-80 px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody>
              {actionableItems.map((row) => (
                <CommitmentRow
                  key={row.confirmationLineId}
                  row={row}
                  reason={reasons[(row.finalOrderCommitment ?? row.requestCommitment)?.id ?? ''] ?? ''}
                  onReason={(commitmentId, value) =>
                    setReasons((current) => ({ ...current, [commitmentId]: value }))}
                  onSettle={() => void perform(row, 'settle')}
                  onRelease={() => void perform(row, 'release')}
                  pending={settle.isPending || release.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CommitmentRow({
  row,
  reason,
  onReason,
  onSettle,
  onRelease,
  pending,
}: {
  row: RocketPurchaseCommitmentListItem;
  reason: string;
  onReason: (commitmentId: string, value: string) => void;
  onSettle: () => void;
  onRelease: () => void;
  pending: boolean;
}) {
  const current = row.finalOrderCommitment ?? row.requestCommitment;
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.poNumber}</td>
      <td className="px-3 py-3">
        <p className="truncate font-semibold text-slate-900" title={row.productName}>{row.productName}</p>
        <p className="truncate text-xs text-slate-500" title={`${row.productNo} · ${row.barcode ?? '바코드 없음'}`}>{row.productNo} · {row.barcode ?? '바코드 없음'}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        {current ? `${current.kind === 'rocket_request' ? '요청' : 'PA 주문'} · ${STATUS_LABELS[current.status]}` : '약정 없음'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatNumber(row.orderQuantity)} / {formatNumber(row.confirmedQuantity)}</td>
      <td className="px-3 py-3">
        {current?.allocations.map((allocation) => (
          <p key={allocation.sellpiaInventorySkuId} className="truncate whitespace-nowrap text-xs" title={`${allocation.code} ${allocation.name}`}>
            {allocation.code}: {formatNumber(allocation.currentStock)} / {formatNumber(allocation.activeCommitmentQuantity)} / <strong>{formatNumber(allocation.availableStock)}</strong>
          </p>
        )) ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        <p>{formatDateTime(current?.settledAt ?? current?.releasedAt ?? current?.createdAt ?? row.confirmedAt)}</p>
        <p className="truncate" title={current?.settlementReason ?? current?.releaseReason ?? undefined}>{current?.settlementReason ?? current?.releaseReason ?? current?.createdBy.name ?? '—'}</p>
      </td>
      <td className="px-3 py-3">
        {current?.status === 'active' ? (
          <div className="flex min-w-0 items-center gap-2">
            <input
              aria-label={`${row.poNumber} 약정 처리 사유`}
              value={reason}
              onChange={(event) => onReason(current.id, event.target.value)}
              maxLength={500}
              placeholder={current.kind === 'rocket_final_order' ? '정산 또는 취소 사유' : '요청 취소 사유'}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            {row.canSettle ? <button type="button" disabled={!reason.trim() || pending} onClick={onSettle} className="whitespace-nowrap rounded bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-40">정산</button> : null}
            {row.canRelease ? <button type="button" disabled={!reason.trim() || pending} onClick={onRelease} className="whitespace-nowrap rounded border border-rose-300 px-2 py-1 text-xs font-bold text-rose-700 disabled:opacity-40">취소</button> : null}
          </div>
        ) : <span className="text-xs text-slate-400">처리 완료</span>}
      </td>
    </tr>
  );
}
