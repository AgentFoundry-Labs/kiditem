'use client';

import { useState } from 'react';
import { ExternalLink, Star, Trash2 } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { EntryRecommendation } from '../lib/entry-recommendation-api';

export interface EntryRecommendationTableProps {
  items: EntryRecommendation[];
  selectedIds: Set<string>;
  activeId: string | null;
  isSaving?: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRemove: (id: string) => void;
  onSelectRow: (id: string) => void;
}

const GRADE_STYLES: Record<EntryRecommendation['grade'], string> = {
  A: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  B: 'bg-blue-50 text-blue-700 ring-blue-200',
  C: 'bg-amber-50 text-amber-700 ring-amber-200',
  WATCH: 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ring-[var(--border)]',
};

export function EntryRecommendationTable({
  items,
  selectedIds,
  activeId,
  isSaving = false,
  onToggle,
  onToggleAll,
  onRemove,
  onSelectRow,
}: EntryRecommendationTableProps) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    // 열이 많아 좁은 화면에서는 가로 스크롤이 불가피하다. 페이지 전체가 아니라
    // 이 컨테이너 안에서만 스크롤되게 가둔다.
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[1100px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-sunken)]">
            <Th className="w-12 text-center">No</Th>
            <Th className="w-10 text-center">
              <input
                type="checkbox"
                aria-label="전체 선택"
                checked={allSelected}
                disabled={isSaving}
                onChange={onToggleAll}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Th>
            <Th className="w-24">키워드</Th>
            {/*
              참고 화면에는 국내(쿠팡) 이미지 컬럼도 있었지만, 스냅샷의 `matchedCoupang`
              에 이미지 경로가 없어서 항상 빈칸이 된다. 영구히 비는 컬럼을 두느니 뺀다 —
              매칭 데이터가 이미지를 실어 오게 되면 그때 되살린다.
            */}
            <Th className="w-20 whitespace-nowrap text-center">해외 이미지</Th>
            <Th className="w-20">해외몰</Th>
            <Th className="w-12 text-center">삭제</Th>
            <Th className="min-w-[280px]">상품명</Th>
            <Th className="w-24 text-right">해외 가격</Th>
            <Th className="w-24 text-right">가격</Th>
            <Th className="w-24">배송비</Th>
            <Th className="w-16 text-center">평점</Th>
            <Th className="min-w-[160px]">태그</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <tr
                key={item.id}
                onClick={() => onSelectRow(item.id)}
                className={cn(
                  'cursor-pointer border-b border-[var(--border)] align-middle transition-colors last:border-b-0',
                  isActive ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--surface-sunken)]',
                )}
              >
                <Td className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-black text-[var(--text-primary)]">{item.rank}</span>
                    <span
                      className={cn(
                        'rounded px-1 py-px text-[9px] font-black ring-1 ring-inset',
                        GRADE_STYLES[item.grade],
                      )}
                    >
                      {item.grade}
                    </span>
                  </div>
                </Td>

                <Td className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`${item.title} 선택`}
                    checked={selectedIds.has(item.id)}
                    disabled={isSaving}
                    onChange={() => onToggle(item.id)}
                    onClick={(event) => event.stopPropagation()}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </Td>

                <Td>
                  {item.keyword ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                        item.isNewKeyword
                          ? 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200'
                          : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
                      )}
                    >
                      {item.isNewKeyword && <span className="text-[9px] font-black">NEW</span>}
                      {item.keyword}
                    </span>
                  ) : (
                    <Muted />
                  )}
                  {item.interest && (
                    <span
                      title={`관심 키워드: ${item.interest.keywords.join(', ')}`}
                      className={cn(
                        'mt-1 flex w-fit items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-black ring-1 ring-inset',
                        item.interest.tier === 'exact'
                          ? 'bg-violet-50 text-violet-700 ring-violet-200'
                          : 'bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ring-[var(--border)]',
                      )}
                    >
                      <Star size={8} className="fill-current" aria-hidden="true" />
                      {item.interest.tier === 'exact' ? '관심' : '관심 연관'}
                    </span>
                  )}
                </Td>

                <Td className="text-center">
                  <Thumb src={item.imageUrl} alt="해외몰 상품 이미지" />
                </Td>

                <Td>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline"
                    >
                      {item.overseasMall}
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-[var(--text-secondary)]">{item.overseasMall}</span>
                  )}
                </Td>

                <Td className="text-center">
                  <button
                    type="button"
                    aria-label={`${item.title} 목록에서 제거`}
                    disabled={isSaving}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="rounded p-1 text-[var(--text-quaternary)] transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </Td>

                <Td>
                  <p className="line-clamp-2 text-xs font-semibold leading-4 text-[var(--text-primary)]">
                    {item.title}
                  </p>
                  {item.coupang?.productName && (
                    <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[var(--text-tertiary)]">
                      쿠팡: {item.coupang.productName}
                    </p>
                  )}
                </Td>

                <Td className="text-right">
                  <Price value={item.overseasPriceKrw} />
                  {item.overseasPriceCny != null && (
                    <p className="text-[10px] font-medium text-[var(--text-quaternary)]">
                      ¥{item.overseasPriceCny}
                    </p>
                  )}
                </Td>

                <Td className="text-right">
                  <Price value={item.salePriceKrw} strong />
                  {item.estimatedMarginRate != null && (
                    <p className="text-[10px] font-bold text-emerald-600">
                      마진 {item.estimatedMarginRate}%
                    </p>
                  )}
                </Td>

                <Td>
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    {item.shippingLabel}
                  </span>
                </Td>

                <Td className="text-center">
                  {item.rating != null ? (
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[var(--text-primary)]">
                      <Star size={11} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                      {item.rating}
                    </span>
                  ) : (
                    <Muted />
                  )}
                </Td>

                <Td>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="text-[10px] font-bold text-[var(--text-quaternary)]">
                        +{item.tags.length - 3}
                      </span>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-2.5 py-2.5 text-[11px] font-black uppercase tracking-wide text-[var(--text-tertiary)]',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-2.5 py-2.5', className)}>{children}</td>;
}

/**
 * 썸네일. 1688/쿠팡 CDN 은 핫링크를 막는 일이 잦다.
 *
 * 실패했을 때 요소를 숨기면 칸이 그냥 비어 보여서 "이미지가 원래 없는 것"과 구분이
 * 안 된다. 자리표시자로 바꿔 실패를 드러내고, 원본은 새 탭으로 열 수 있게 둔다.
 */
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        title={src ?? undefined}
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-[var(--surface-sunken)] text-[9px] font-bold text-[var(--text-quaternary)]"
      >
        {src ? '차단' : '없음'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 도메인 이미지라 next/image 최적화 대상이 아니다.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="mx-auto h-11 w-11 rounded-md object-cover ring-1 ring-inset ring-[var(--border)]"
    />
  );
}

function Price({ value, strong }: { value: number | null; strong?: boolean }) {
  if (value == null) return <Muted />;
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        strong ? 'font-black text-[var(--text-primary)]' : 'font-semibold text-[var(--text-secondary)]',
      )}
    >
      {formatNumber(value)}원
    </span>
  );
}

function Muted() {
  return <span className="text-[11px] font-medium text-[var(--text-quaternary)]">-</span>;
}
