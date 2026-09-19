'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Layers, Link2Off, Package, Search, Store } from 'lucide-react';
import type { SalesProductListQuery } from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { ExternalImagesNotice } from './components/ExternalImagesNotice';
import { MallPriceAdoptionNotice } from './components/MallPriceAdoptionNotice';
import { MallSheetDialog } from '@/components/mall-sheet/MallSheetDialog';
import { SabangnetImportDialog } from './components/SabangnetImportDialog';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import {
  formatWon,
  SALES_PRODUCT_STATUS_LABEL,
  SALES_PRODUCT_STATUS_TONE,
} from './lib/sales-product-labels';

type Focus = SalesProductListQuery['focus'];

const FOCUS_TABS: { value: Focus; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'with_options', label: '옵션 상품' },
  { value: 'unlinked', label: '셀피아 연결 필요' },
];

const PAGE_SIZE = 50;

export default function SalesProductsPage() {
  return (
    <Suspense fallback={null}>
      <SalesProductsContent />
    </Suspense>
  );
}

/**
 * 판매상품 목록(ADR-0014) — 사방넷 상품조회처럼 한 곳에서 찾고, 누르면 한 번에 편집한다.
 * 조건 · 쪽은 주소가 기준이다.
 */
function SalesProductsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const focus = (FOCUS_TABS.some((tab) => tab.value === params.get('focus')) ? params.get('focus') : 'all') as Focus;
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [draft, setDraft] = useState(search);
  const [importing, setImporting] = useState(false);
  const [makingSheet, setMakingSheet] = useState(false);

  const query = { focus, query: search || undefined, page, limit: PAGE_SIZE };
  const list = useQuery({
    queryKey: salesProductKeys.list(query),
    queryFn: () => salesProductApi.list(query),
    placeholderData: (previous) => previous,
  });

  const navigate = (next: { focus?: Focus; q?: string; page?: number }) => {
    const search = new URLSearchParams(params.toString());
    const set = (key: string, value: string | undefined) => {
      if (value) search.set(key, value);
      else search.delete(key);
    };
    if (next.focus !== undefined) set('focus', next.focus === 'all' ? undefined : next.focus);
    if (next.q !== undefined) set('q', next.q.trim() || undefined);
    set('page', next.page && next.page > 1 ? String(next.page) : undefined);
    const text = search.toString();
    router.replace(text ? `${pathname}?${text}` : pathname);
  };

  const data = list.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">판매상품</h1>
          <p className="mt-1 text-sm text-slate-500">
            몰에 보낼 상품을 한 번 편집하고 여러 몰로 보냅니다. 옵션마다 셀피아 상품을 이어 두면 재고 · 품절이 따라갑니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setMakingSheet(true)}>
            <Store size={16} aria-hidden />
            몰 대량등록 엑셀
          </button>
          <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => setImporting(true)}>
            <FileSpreadsheet size={16} aria-hidden />
            사방넷 엑셀 가져오기
          </button>
        </div>
      </header>

      <ExternalImagesNotice />
      <MallPriceAdoptionNotice />

      <section aria-label="판매상품 요약" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={Package} label="판매상품" value={data?.summary.total} active={focus === 'all'} onClick={() => navigate({ focus: 'all' })} />
        <SummaryCard icon={Layers} label="옵션 상품" value={data?.summary.withOptions} active={focus === 'with_options'} onClick={() => navigate({ focus: 'with_options' })} />
        <SummaryCard
          icon={Link2Off}
          label="셀피아 연결 필요"
          value={data?.summary.withUnlinkedOptions}
          tone="warn"
          active={focus === 'unlinked'}
          onClick={() => navigate({ focus: 'unlinked' })}
        />
      </section>

      <section aria-label="판매상품 목록" className="table-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex gap-1" role="tablist" aria-label="보기">
            {FOCUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={focus === tab.value}
                className={cn('tab', focus === tab.value ? 'tab-active' : 'tab-inactive')}
                onClick={() => navigate({ focus: tab.value })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ q: draft });
            }}
          >
            <label className="relative">
              <span className="sr-only">판매상품 찾기</span>
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="상품명 · 판매상품코드 · 모델명 · 단품코드"
                className="w-72 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm"
              />
            </label>
            <button type="submit" className="btn-secondary btn-sm">찾기</button>
          </form>
        </div>

        {list.isError ? (
          <p className="empty-state text-red-600">
            {isApiError(list.error) ? list.error.detail : '판매상품을 불러오지 못했습니다.'}
          </p>
        ) : !data ? (
          <p className="empty-state">불러오는 중</p>
        ) : data.items.length === 0 ? (
          <div className="empty-state">
            {data.summary.total === 0
              ? '아직 판매상품이 없습니다. 사방넷 엑셀을 가져오면 사방넷 상품이 그대로 들어옵니다.'
              : '조건에 맞는 판매상품이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-16 px-4 py-2.5 text-left font-semibold">사진</th>
                  <th className="w-28 px-2 py-2.5 text-left font-semibold">판매상품코드</th>
                  <th className="px-2 py-2.5 text-left font-semibold">상품명</th>
                  <th className="w-40 px-2 py-2.5 text-left font-semibold">옵션</th>
                  <th className="w-28 px-2 py-2.5 text-center font-semibold">셀피아 연결</th>
                  <th className="w-20 px-2 py-2.5 text-center font-semibold">몰별 값</th>
                  <th className="w-24 px-2 py-2.5 text-right font-semibold">판매가</th>
                  <th className="w-24 px-4 py-2.5 text-center font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const linked = item.optionCount - item.unlinkedOptionCount;
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-slate-100" aria-hidden />
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-600">{item.code}</td>
                      <td className="max-w-0 px-2 py-2">
                        <Link
                          href={`/product-hub/sales-products/${item.id}`}
                          className="block truncate font-medium text-slate-900 hover:text-purple-700"
                          title={item.name}
                        >
                          {item.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {item.optionAxes.length === 0
                          ? <span className="text-slate-400">단품</span>
                          : `${item.optionAxes.join(' · ')} ${item.optionCount}개`}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          item.unlinkedOptionCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                        )}
                        >
                          {linked}/{item.optionCount}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                        {item.channelOverrideCount > 0 ? `${item.channelOverrideCount}몰` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-800">{formatWon(item.salePrice)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', SALES_PRODUCT_STATUS_TONE[item.status])}>
                          {SALES_PRODUCT_STATUS_LABEL[item.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > PAGE_SIZE && (
          <nav aria-label="쪽" className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span className="tabular-nums">{data.total.toLocaleString()}개 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>이전</button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <button type="button" className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 })}>다음</button>
            </div>
          </nav>
        )}
      </section>

      {importing && <SabangnetImportDialog onClose={() => setImporting(false)} />}
      {makingSheet && <MallSheetDialog onClose={() => setMakingSheet(false)} />}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
  active,
  onClick,
}: {
  icon: typeof Package;
  label: string;
  value: number | undefined;
  tone?: 'default' | 'warn';
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'card text-left transition hover:border-slate-300',
        active && 'border-purple-300 ring-1 ring-purple-200',
      )}
    >
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        <Icon size={14} aria-hidden />
        {label}
      </div>
      <div className={cn('mt-1 text-xl font-bold tabular-nums', tone === 'warn' && value ? 'text-amber-700' : 'text-slate-900')}>
        {value === undefined ? '—' : `${value.toLocaleString()}개`}
      </div>
    </button>
  );
}
