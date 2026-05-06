'use client';

import { ExternalLink, Slash, Link2, Loader2 } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { ReconciliationStatusBadge } from './StatusBadge';
import type { ReconciliationItem } from '@kiditem/shared/channel-reconciliation';

interface ItemsTableProps {
  items: ReconciliationItem[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  emptyMessage: string;
  pendingActionId: string | null;
  onPageChange: (page: number) => void;
  onLink: (item: ReconciliationItem) => void;
  onIgnore: (item: ReconciliationItem) => void;
}

const MATCH_REASON_LABEL: Record<string, string> = {
  external_id: 'externalId 일치',
  legacy_code_exact: 'legacyCode 정확 매치',
  manual: '수동 연결',
  conflict: '충돌',
  none: '매칭 후보 없음',
};

export function ItemsTable({
  items,
  total,
  page,
  limit,
  loading,
  emptyMessage,
  pendingActionId,
  onPageChange,
  onLink,
  onIgnore,
}: ItemsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                KidItem 상품
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                쿠팡 상품
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider tabular-nums">
                legacyCode
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                매칭 사유
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                상태
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                액션
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  <Loader2 size={16} className="inline-block animate-spin mr-2" />
                  불러오는 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const isBusy = pendingActionId === row.id;
                const isCatalogOption = row.itemType === 'kiditem_option';
                const kidItemPrimary =
                  row.linked.masterProductName ??
                  (row.linked.masterProductId
                    ? `(이름 미상 / ${row.linked.masterProductId.slice(0, 8)})`
                    : '—');
                const kidItemOption =
                  row.linked.productOptionName ??
                  row.linked.productOptionSku ??
                  null;
                return (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm text-slate-900 max-w-[260px] truncate">
                        {kidItemPrimary}
                      </div>
                      {kidItemOption && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[260px]">
                          {kidItemOption}
                        </div>
                      )}
                      {row.linked.productOptionLegacyCode && (
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          legacy: {row.linked.productOptionLegacyCode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {row.channelImageUrl ? (
                          // Channel image is informational only — fetched directly from
                          // the channel CDN. Wrapping in <img> keeps it dependency-free.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.channelImageUrl}
                            alt=""
                            className="w-10 h-10 rounded-md object-cover bg-slate-100 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-slate-100 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 max-w-[260px] truncate">
                            {row.channelProductName ??
                              (isCatalogOption ? '쿠팡 상품 없음' : '(이름 없음)')}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums truncate max-w-[260px]">
                            {row.externalId
                              ? `ext: ${row.externalId}${
                                  row.externalOptionId
                                    ? ` / ${row.externalOptionId}`
                                    : isCatalogOption
                                      ? ' / 옵션 매핑 없음'
                                      : ''
                                }`
                              : isCatalogOption
                                ? '쿠팡 listing/옵션 매핑 없음'
                                : 'ext: —'}
                          </div>
                          {row.channelUrl && (
                            <a
                              href={row.channelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              열기 <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-sm tabular-nums text-slate-700">
                        {row.legacyCode ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm text-slate-700">
                        {row.matchReason
                          ? MATCH_REASON_LABEL[row.matchReason] ?? row.matchReason
                          : '—'}
                      </div>
                      {row.confidence != null && (
                        <div className="text-xs text-slate-400 tabular-nums mt-0.5">
                          신뢰도 {row.confidence}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ReconciliationStatusBadge
                        status={row.status}
                        resolutionSource={row.resolutionSource}
                      />
                      {row.status === 'ignored' && row.ignoredReason && (
                        <div className="text-xs text-slate-400 mt-1 max-w-[180px] truncate">
                          {row.ignoredReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      {isCatalogOption && row.status === 'linked' ? (
                        <span className="text-xs text-slate-400">연결됨</span>
                      ) : isCatalogOption && row.status === 'ignored' ? (
                        <span className="text-xs text-slate-400">제외됨</span>
                      ) : isCatalogOption ? (
                        <button
                          type="button"
                          onClick={() => onIgnore(row)}
                          disabled={isBusy}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Slash size={12} />
                          제외
                        </button>
                      ) : row.status === 'ignored' ? (
                        <button
                          type="button"
                          onClick={() => onLink(row)}
                          disabled={isBusy}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {isBusy ? '...' : '다시 연결'}
                        </button>
                      ) : (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => onLink(row)}
                            disabled={isBusy}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <Link2 size={12} />
                            {row.status === 'linked' ? '다른 옵션 선택' : '연결'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onIgnore(row)}
                            disabled={isBusy}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <Slash size={12} />
                            제외
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        limit={limit}
        total={total}
        onPageChange={onPageChange}
      />
    </div>
  );
}
