import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, Search, Send, Trash2 } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/utils';
import {
  buildGeneratedFileMallOptions,
  filterAndSortGeneratedFiles,
  paginateGeneratedFiles,
  type GeneratedFileSendFilter,
  type GeneratedFileSortKey,
} from '../lib/generated-file-view-model';
import {
  countLabel,
  groupHistoryByDay,
  type ConversionHistoryItem,
} from '../lib/order-collection-page-model';

const PAGE_SIZE = 20;

export type GeneratedFilesBulkAction = 'send' | 'download' | 'delete' | null;

interface GeneratedFilesSectionProps {
  items: ConversionHistoryItem[];
  sellpiaSendingId: string | null;
  bulkAction: GeneratedFilesBulkAction;
  onSendToSellpia: (item: ConversionHistoryItem) => void;
  onSendSelectedToSellpia: (items: ConversionHistoryItem[]) => void;
  onPreview: (id: string) => void;
  onDownload: (item: ConversionHistoryItem) => void;
  onDownloadSelected: (items: ConversionHistoryItem[]) => void;
  onDelete: (item: ConversionHistoryItem) => void;
  onDeleteSelected: (items: ConversionHistoryItem[]) => void;
}

export function GeneratedFilesSection({
  items,
  sellpiaSendingId,
  bulkAction,
  onSendToSellpia,
  onSendSelectedToSellpia,
  onPreview,
  onDownload,
  onDownloadSelected,
  onDelete,
  onDeleteSelected,
}: GeneratedFilesSectionProps) {
  const [search, setSearch] = useState('');
  const [sendFilter, setSendFilter] = useState<GeneratedFileSendFilter>('all');
  const [sortKey, setSortKey] = useState<GeneratedFileSortKey>('newest');
  const [mallKey, setMallKey] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectPageRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search);

  const mallOptions = useMemo(() => buildGeneratedFileMallOptions(items), [items]);
  const filteredItems = useMemo(
    () =>
      filterAndSortGeneratedFiles(items, {
        search: deferredSearch,
        mallKey,
        sendFilter,
        sortKey,
      }),
    [deferredSearch, items, mallKey, sendFilter, sortKey],
  );
  const pageData = useMemo(
    () => paginateGeneratedFiles(filteredItems, page, PAGE_SIZE),
    [filteredItems, page],
  );
  const groups = useMemo(() => groupHistoryByDay(pageData.items), [pageData.items]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const selectedUnsentItems = useMemo(
    () => selectedItems.filter((item) => !item.sentAt),
    [selectedItems],
  );
  const allPageSelected =
    pageData.items.length > 0 && pageData.items.every((item) => selectedIds.has(item.id));
  const somePageSelected = pageData.items.some((item) => selectedIds.has(item.id));
  const sendBusy = sellpiaSendingId !== null || bulkAction !== null;

  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);

  useEffect(() => {
    if (selectPageRef.current) {
      selectPageRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [allPageSelected, somePageSelected]);

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const resetPage = () => setPage(1);
  const toggleItem = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const togglePage = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of pageData.items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">생성 파일</div>
            <div className="mt-0.5 text-xs tabular-nums text-slate-400">
              {formatNumber(pageData.total)} / {formatNumber(items.length)}개
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pageData.items.length > 0 ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <input
                  ref={selectPageRef}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(event) => togglePage(event.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-purple-600"
                />
                현재 페이지 선택
              </label>
            ) : null}
            {selectedItems.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => onSendSelectedToSellpia(selectedUnsentItems)}
                  disabled={sendBusy || selectedUnsentItems.length === 0 || bulkAction !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkAction === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  선택 전송 ({formatNumber(selectedUnsentItems.length)})
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadSelected(selectedItems)}
                  disabled={sendBusy || bulkAction !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkAction === 'download' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  선택 다운로드 ({formatNumber(selectedItems.length)})
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSelected(selectedItems)}
                  disabled={sendBusy || bulkAction !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkAction === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  선택 삭제 ({formatNumber(selectedItems.length)})
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1 sm:max-w-[420px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              aria-label="생성 파일 검색"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="파일명, 주문번호, 수령인 검색"
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-purple-300 focus:ring-2 focus:ring-purple-50"
            />
          </label>
          <select
            value={sendFilter}
            onChange={(event) => {
              setSendFilter(event.target.value as GeneratedFileSendFilter);
              resetPage();
            }}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="전송 상태 필터"
          >
            <option value="all">전체 상태</option>
            <option value="unsent">미전송만</option>
            <option value="sent">전송됨만</option>
          </select>
          <select
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value as GeneratedFileSortKey);
              resetPage();
            }}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="생성 파일 정렬"
          >
            <option value="newest">최근 생성순</option>
            <option value="oldest">오래된 순</option>
            <option value="orders-desc">주문 많은 순</option>
            <option value="products-desc">상품 많은 순</option>
          </select>
          <select
            value={mallKey}
            onChange={(event) => {
              setMallKey(event.target.value);
              resetPage();
            }}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="몰 필터"
          >
            <option value="">전체 몰</option>
            {mallOptions.map((mall) => (
              <option key={mall.key} value={mall.key}>
                {mall.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {items.length > 0 ? '조건에 맞는 생성 파일이 없습니다.' : '생성된 파일이 없습니다.'}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
                <div className="text-xs font-semibold text-slate-600">{group.label}</div>
                <div className="text-xs tabular-nums text-slate-400">{formatNumber(group.items.length)}개</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[44px]" />
                    <col className="w-[190px]" />
                    <col />
                    <col className="w-[110px]" />
                    <col className="w-[64px]" />
                    <col className="w-[64px]" />
                    <col className="w-[180px]" />
                    <col className="w-[330px]" />
                  </colgroup>
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3" />
                      <th className="px-4 py-3 text-left font-medium">몰/원본</th>
                      <th className="px-4 py-3 text-left font-medium">파일명</th>
                      <th className="px-4 py-3 text-left font-medium">전송상태</th>
                      <th className="px-4 py-3 text-right font-medium">상품</th>
                      <th className="px-4 py-3 text-right font-medium">출력</th>
                      <th className="px-4 py-3 text-left font-medium">생성시각</th>
                      <th className="px-4 py-3 text-right font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedIds.has(item.id) ? 'border-t border-slate-100 bg-purple-50/50' : 'border-t border-slate-100'}
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`${item.fileName} 선택`}
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => toggleItem(item.id, event.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-purple-600"
                          />
                        </td>
                        <td className="truncate px-4 py-3 text-slate-700" title={item.sourceName}>
                          {item.mallName ?? item.sourceName}
                        </td>
                        <td className="truncate px-4 py-3 font-medium text-slate-900" title={item.fileName}>
                          {item.fileName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {item.sentAt ? (
                            <span
                              className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              title={formatDateTime(item.sentAt)}
                            >
                              전송 완료
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              전송 대기
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {countLabel(item.productRows)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {countLabel(item.outputRows)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDateTime(item.convertedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onSendToSellpia(item)}
                              disabled={sendBusy}
                              className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {sellpiaSendingId === item.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Send size={13} />
                              )}
                              {sellpiaSendingId === item.id
                                ? '전송 중'
                                : item.sentAt
                                  ? '다시 전송'
                                  : '셀피아 전송'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreview(item.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Eye size={13} />
                              미리보기
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownload(item)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Download size={13} />
                              다운로드
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item)}
                              disabled={sendBusy || bulkAction !== null}
                              aria-label={`${item.fileName} 삭제`}
                              title="삭제"
                              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {pageData.total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={pageData.page === 1}
            aria-label="이전 페이지"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs tabular-nums text-slate-500">
            {formatNumber(pageData.page)} / {formatNumber(pageData.pageCount)} 페이지
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageData.pageCount, current + 1))}
            disabled={pageData.page === pageData.pageCount}
            aria-label="다음 페이지"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
