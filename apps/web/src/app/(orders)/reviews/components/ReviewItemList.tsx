'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Image as ImageIcon, Search, Star, Video, X } from 'lucide-react';
import { ReviewItemListResponseSchema } from '@kiditem/shared/reviews';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDate, formatNumber } from '@/lib/utils';

const PAGE_SIZE = 20;
const RATINGS = [5, 4, 3, 2, 1] as const;

interface Props {
  /** 상품별 테이블에서 넘어온 경우 해당 상품으로 고정된다. */
  listingId?: string | null;
  listingName?: string | null;
  onClearListing?: () => void;
}

export function ReviewItemList({ listingId, listingName, onClearListing }: Props) {
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<number | null>(null);
  const [contentOnly, setContentOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setPage(1);
  }, [listingId, rating, contentOnly, search]);

  const queryParams: Record<string, string> = {
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(listingId ? { listingId } : {}),
    ...(rating ? { rating: String(rating) } : {}),
    ...(contentOnly ? { hasContent: 'true' } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.reviews.items(queryParams),
    queryFn: () =>
      apiClient.getParsed(
        `/api/reviews/items?${new URLSearchParams(queryParams)}`,
        ReviewItemListResponseSchema,
      ),
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const ratingCounts = data?.ratingCounts ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {listingId && (
          <button
            onClick={onClearListing}
            className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
          >
            {listingName || '선택한 상품'}
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => setRating(null)}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium',
              rating === null
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            전체
          </button>
          {RATINGS.map((value) => (
            <button
              key={value}
              onClick={() => setRating(rating === value ? null : value)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
                rating === value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              <Star
                className={cn(
                  'h-3 w-3',
                  rating === value ? 'fill-white text-white' : 'fill-yellow-500 text-yellow-500',
                )}
              />
              {value}
              <span className="text-[10px] opacity-70">
                {formatNumber(ratingCounts[String(value)] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={contentOnly}
            onChange={(event) => setContentOnly(event.target.checked)}
            className="h-3.5 w-3.5 accent-purple-600"
          />
          내용 있는 리뷰만
          {data && (
            <span className="text-[10px] text-slate-400">
              {formatNumber(data.withContentCount)}건
            </span>
          )}
        </label>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="relative ml-auto"
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="리뷰 내용·상품명·작성자 검색"
            className="w-56 rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-purple-300 focus:ring-2 focus:ring-purple-50"
          />
        </form>
      </div>

      <div className="text-xs text-slate-500">총 {formatNumber(total)}건</div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          리뷰를 불러오지 못했어요.
        </div>
      )}

      {isLoading && !data ? (
        <div className="animate-pulse space-y-2 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          조건에 맞는 리뷰가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <RatingStars rating={item.rating} />
                    <span className="text-xs text-slate-400">
                      {formatDate(item.reviewedAt)}
                    </span>
                    {item.reviewerName && (
                      <span className="text-xs text-slate-500">{item.reviewerName}</span>
                    )}
                    {!item.listingId && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        상품 미연결
                      </span>
                    )}
                  </div>

                  {item.title && (
                    <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                  )}
                  {item.content ? (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {item.content}
                    </p>
                  ) : (
                    !item.title && (
                      <p className="mt-1 text-sm text-slate-400">별점만 남긴 리뷰입니다.</p>
                    )
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">{item.productName}</span>
                    {item.optionName && <span className="text-slate-400">· {item.optionName}</span>}
                    {item.imageCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ImageIcon className="h-3 w-3" />
                        {item.imageCount}
                      </span>
                    )}
                    {item.videoCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Video className="h-3 w-3" />
                        {item.videoCount}
                      </span>
                    )}
                  </div>
                </div>

                {item.externalProductId && (
                  <a
                    href={`https://www.coupang.com/vp/products/${item.externalProductId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                  >
                    상품
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`별점 ${rating}점`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            'h-3.5 w-3.5',
            value <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-slate-200',
          )}
        />
      ))}
    </span>
  );
}
