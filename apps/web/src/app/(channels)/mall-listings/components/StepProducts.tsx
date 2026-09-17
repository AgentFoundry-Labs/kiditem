'use client';

import { cn, formatNumber } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import type { MallPublishItem } from '../../_shared/mall-publish-adapter';

interface StepProductsProps {
  items: MallPublishItem[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  selected: ReadonlySet<string>;
  onPageChange: (page: number) => void;
  onToggle: (candidateId: string) => void;
  onToggleAll: () => void;
}

/**
 * 1단계 — 등록할 상품.
 *
 * 몰을 고르기 전에 상품을 먼저 고른다. 순서가 반대면(몰 먼저) 몰마다 상품을 다시
 * 고르게 되고, 그게 지금까지 몰별 버튼이 하나씩 늘어난 이유다.
 */
export function StepProducts({
  items,
  total,
  page,
  limit,
  loading,
  selected,
  onPageChange,
  onToggle,
  onToggleAll,
}: StepProductsProps) {
  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(item.candidateId));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          등록할 상품
          <span className="ml-2 text-xs font-normal text-slate-400">
            수집 상품 {formatNumber(total)}건
          </span>
        </h2>
        <p className="text-xs text-slate-400">
          선택은 페이지를 넘겨도 유지됩니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={onToggleAll}
                  aria-label="이 페이지 전체 선택"
                  className="h-4 w-4 accent-purple-600"
                />
              </th>
              <th className="px-3 py-2 font-medium">상품</th>
              <th className="w-32 px-3 py-2 text-right font-medium">판매가</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                  불러오는 중
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                  수집 상품이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const checked = selected.has(item.candidateId);
                return (
                  <tr
                    key={item.candidateId}
                    className={cn('cursor-pointer hover:bg-slate-50', checked && 'bg-purple-50/50')}
                    onClick={() => onToggle(item.candidateId)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(item.candidateId)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${item.name} 선택`}
                        className="h-4 w-4 accent-purple-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {item.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 몰·수집처 CDN 은 next/image 허용 호스트가 아니다
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-9 w-9 flex-none rounded border border-slate-200 object-cover"
                          />
                        ) : (
                          <span className="h-9 w-9 flex-none rounded border border-slate-200 bg-slate-50" />
                        )}
                        <span className="line-clamp-2 text-slate-800">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.salePrice && item.salePrice > 0 ? (
                        <span className="text-slate-800">{formatNumber(item.salePrice)}원</span>
                      ) : (
                        <span className="text-amber-600">판매가 없음</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={limit} total={total} onPageChange={onPageChange} />
      </div>
    </section>
  );
}
