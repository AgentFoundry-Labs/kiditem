'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fetchProductOptionList,
  productOptionListKeyParams,
} from '@/app/(catalog)/products/options/lib/product-options-api';
import { queryKeys } from '@/lib/query-keys';
import type { ReconciliationItem } from '@kiditem/shared/channel-reconciliation';

interface LinkProductOptionModalProps {
  open: boolean;
  item: ReconciliationItem | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (productOptionId: string) => Promise<void>;
}

export function LinkProductOptionModal({
  open,
  item,
  isSubmitting,
  onClose,
  onConfirm,
}: LinkProductOptionModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedId(null);
      return;
    }
    setSearch(item?.legacyCode ?? item?.channelProductName ?? '');
    setSelectedId(null);
  }, [open, item]);

  const params = {
    search: search.trim() || undefined,
    isActive: true,
    isDeleted: false,
    limit: 30,
  } as const;
  const queryKey = queryKeys.productOptions.list(productOptionListKeyParams(params));
  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => fetchProductOptionList(params),
    enabled: open,
  });

  if (!open || !item) return null;

  const items = optionsQuery.data?.items ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-6 w-[640px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">KidItem 옵션 연결</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <div className="text-xs text-slate-500 mb-1">쿠팡 row</div>
          <div className="text-sm text-slate-900 font-medium truncate">
            {item.channelProductName ?? item.externalId}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>externalId: <span className="tabular-nums">{item.externalId}</span></span>
            {item.externalOptionId && (
              <span>
                vendorItemId: <span className="tabular-nums">{item.externalOptionId}</span>
              </span>
            )}
            {item.legacyCode && (
              <span>
                legacyCode: <span className="tabular-nums">{item.legacyCode}</span>
              </span>
            )}
          </div>
        </div>

        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="옵션명 / SKU / legacyCode 로 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 min-h-[240px]">
          {optionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              검색 중...
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              일치하는 옵션이 없습니다
            </div>
          ) : (
            <ul>
              {items.map((opt) => {
                const isSelected = selectedId === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(opt.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50',
                        isSelected && 'bg-purple-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {opt.optionName ?? '(옵션명 없음)'}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex gap-3 tabular-nums">
                            <span>SKU: {opt.sku}</span>
                            {opt.legacyCode && <span>legacy: {opt.legacyCode}</span>}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-xs font-semibold text-purple-600 shrink-0">
                            선택됨
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!selectedId || isSubmitting}
            onClick={async () => {
              if (!selectedId) return;
              try {
                await onConfirm(selectedId);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : '연결 실패',
                );
              }
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700',
              (!selectedId || isSubmitting) && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isSubmitting ? '연결 중...' : '연결'}
          </button>
        </div>
      </div>
    </div>
  );
}
