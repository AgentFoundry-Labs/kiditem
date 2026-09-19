'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import type { ProductRecipeComponentCandidate } from '@kiditem/shared/product-operations';
import { salesProductApi, salesProductKeys } from '../lib/sales-product-api';

/**
 * 셀피아 상품 하나를 고른다. 재고 관리 화면과 같은 검색(상품코드 · 이름 · 바코드)을 쓰고, 고른 것은
 * 단품의 셀피아 구성 한 줄이 된다 — 재고는 셀피아가 가진 숫자를 읽기만 한다.
 */
export function SellpiaSkuPicker({
  initialSearch,
  title,
  onPick,
  onClose,
}: {
  initialSearch: string;
  /** 어느 줄을 고르는지(예: '103070-0001 포테이토'). */
  title?: string;
  onPick: (candidate: ProductRecipeComponentCandidate) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const candidates = useQuery({
    queryKey: salesProductKeys.skuSearch(search),
    queryFn: () => salesProductApi.searchSellpiaSkus(search),
    enabled: search.length >= 2,
  });

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="셀피아 상품 고르기"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
    <div className="w-[520px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-slate-800">셀피아 상품 고르기{title ? ` — ${title}` : ''}</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(draft.trim());
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">셀피아 상품 찾기</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="셀피아 상품코드 · 이름 · 바코드"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm"
          />
        </label>
        <button type="submit" className="btn-secondary btn-sm">찾기</button>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
          <X size={16} />
        </button>
      </form>
      <div className="mt-2 max-h-[420px] overflow-y-auto">
        {search.length < 2 ? (
          <p className="px-1 py-3 text-xs text-slate-400">두 글자 이상 넣고 찾으세요.</p>
        ) : candidates.isLoading ? (
          <p className="px-1 py-3 text-xs text-slate-400">찾는 중</p>
        ) : candidates.isError ? (
          <p className="px-1 py-3 text-xs text-red-600">셀피아 상품을 찾지 못했습니다.</p>
        ) : (candidates.data ?? []).length === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-400">맞는 셀피아 상품이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(candidates.data ?? []).map((candidate) => (
              <li key={candidate.sellpiaInventorySkuId}>
                <button
                  type="button"
                  onClick={() => onPick(candidate)}
                  className="flex w-full items-center gap-3 px-1 py-2 text-left text-sm hover:bg-purple-50"
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{candidate.code}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800" title={candidate.name}>
                    {candidate.name}
                    {candidate.optionName ? <span className="text-slate-500"> · {candidate.optionName}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-slate-500">
                    {candidate.currentStock === null ? '재고 —' : `재고 ${candidate.currentStock}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    </div>
  );
}
