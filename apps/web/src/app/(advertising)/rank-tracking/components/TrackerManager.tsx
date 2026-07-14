'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime } from '@/lib/utils';
import {
  createKeywordTracker,
  deleteKeywordTracker,
  parseVendorItemIdsInput,
  updateKeywordTracker,
  type KeywordTracker,
} from '../lib/rank-api';

const MAX_PAGES_OPTIONS = [1, 2, 3];

/** 추적 키워드 등록 폼 + 트래커 테이블 (활성 토글 / 삭제 / 키워드 선택). */
export default function TrackerManager({
  trackers,
  isLoading,
  selectedKeyword,
  onSelectKeyword,
}: {
  trackers: KeywordTracker[];
  isLoading: boolean;
  selectedKeyword: string | null;
  onSelectKeyword: (keyword: string) => void;
}) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [vendorItemIdsInput, setVendorItemIdsInput] = useState('');
  const [maxPages, setMaxPages] = useState(2);

  const invalidateTrackers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });

  const createMutation = useMutation({
    mutationFn: createKeywordTracker,
    onSuccess: (tracker) => {
      toast.success(`'${tracker.keyword}' 키워드 추적을 등록했습니다.`);
      setKeyword('');
      setVendorItemIdsInput('');
      onSelectKeyword(tracker.keyword);
      invalidateTrackers();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : '키워드 추적 등록 실패'),
  });

  const toggleMutation = useMutation({
    mutationFn: (tracker: KeywordTracker) =>
      updateKeywordTracker(tracker.id, { enabled: !tracker.enabled }),
    onSuccess: invalidateTrackers,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : '트래커 상태 변경 실패'),
  });

  const deleteMutation = useMutation({
    mutationFn: (tracker: KeywordTracker) => deleteKeywordTracker(tracker.id),
    onSuccess: (tracker) => {
      toast.success(`'${tracker.keyword}' 키워드 추적을 삭제했습니다.`);
      invalidateTrackers();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : '트래커 삭제 실패'),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate({
      keyword: trimmed,
      vendorItemIds: parseVendorItemIdsInput(vendorItemIdsInput),
      maxPages,
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-900">추적 키워드</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          키워드별 쿠팡 검색 순위를 매일 기록합니다. 타깃을 비우면 자사 카탈로그(옵션ID)와 자동
          매칭합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 border-b border-slate-100 px-5 py-4">
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="키워드 (예: 슬라임)"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
          <select
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value))}
            aria-label="스캔 페이지 수"
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
          >
            {MAX_PAGES_OPTIONS.map((pages) => (
              <option key={pages} value={pages}>
                {pages}페이지
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            value={vendorItemIdsInput}
            onChange={(event) => setVendorItemIdsInput(event.target.value)}
            placeholder="타깃 옵션ID(vendorItemId) — 쉼표/공백 구분, 비우면 자동매칭"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
          <button
            type="submit"
            disabled={!keyword.trim() || createMutation.isPending}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            추가
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin text-purple-600" />
          트래커 불러오는 중…
        </div>
      ) : trackers.length === 0 ? (
        <div className="empty-state py-10">등록된 추적 키워드가 없습니다</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-2.5 text-left text-[12px] font-semibold text-slate-500">키워드</th>
                <th className="px-2 py-2.5 text-left text-[12px] font-semibold text-slate-500">추적 대상</th>
                <th className="px-2 py-2.5 text-center text-[12px] font-semibold text-slate-500">페이지</th>
                <th className="px-2 py-2.5 text-center text-[12px] font-semibold text-slate-500">활성</th>
                <th className="px-2 py-2.5 text-left text-[12px] font-semibold text-slate-500">마지막 수집</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {trackers.map((tracker) => {
                const selected = tracker.keyword === selectedKeyword;
                return (
                  <tr
                    key={tracker.id}
                    onClick={() => onSelectKeyword(tracker.keyword)}
                    className={cn(
                      'cursor-pointer border-b border-slate-100',
                      selected ? 'bg-purple-50/70' : 'hover:bg-slate-50',
                    )}
                  >
                    <td
                      className={cn(
                        'px-5 py-2.5 font-semibold',
                        selected ? 'text-purple-700' : 'text-slate-800',
                      )}
                    >
                      {tracker.keyword}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {tracker.vendorItemIds.length > 0 ? (
                        <span className="tabular-nums">{tracker.vendorItemIds.length}개 지정</span>
                      ) : (
                        <span className="text-slate-400">자동</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-slate-600">
                      {tracker.maxPages}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMutation.mutate(tracker);
                        }}
                        disabled={toggleMutation.isPending}
                        aria-label={tracker.enabled ? '추적 비활성화' : '추적 활성화'}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
                          tracker.enabled ? 'bg-purple-600' : 'bg-slate-200',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                            tracker.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] tabular-nums text-slate-500">
                      {tracker.lastCapturedAt ? formatDateTime(tracker.lastCapturedAt) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!window.confirm(`'${tracker.keyword}' 키워드 추적을 삭제할까요? 저장된 순위 기록은 유지됩니다.`)) return;
                          deleteMutation.mutate(tracker);
                        }}
                        disabled={deleteMutation.isPending}
                        aria-label="트래커 삭제"
                        className="text-slate-300 transition-colors hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
