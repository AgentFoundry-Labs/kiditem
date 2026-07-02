import type {
  NaverDatalabPopularKeywordBoard,
} from '../../recommendations/lib/naver-keyword-api';

export function PopularKeywordCard({
  board,
  disabled,
  isInterestKeyword,
  onTrackKeyword,
  onUseKeyword,
}: {
  board: NaverDatalabPopularKeywordBoard;
  disabled: boolean;
  isInterestKeyword: (keyword: string) => boolean;
  onTrackKeyword: (keyword: string, metrics?: Record<string, number | string | null>) => void;
  onUseKeyword: (keyword: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black">{board.label}</h3>
            <p className="mt-1 truncate text-[11px] font-bold text-[var(--text-tertiary)]">{board.categoryPath}</p>
          </div>
          <span className="rounded-md bg-[#fff4ef] px-2 py-1 text-[11px] font-black text-[#e14b16]">
            TOP {Math.min(board.ranks.length, 20)}
          </span>
        </div>
        <p className="mt-2 truncate text-[11px] font-bold text-[var(--text-secondary)]">
          {board.range || board.datetime || board.date || '최근 집계'}
        </p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {board.error && board.ranks.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs font-black text-amber-700">DataLab 호출 제한</p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[var(--text-tertiary)]">잠시 후 다시 갱신하세요.</p>
          </div>
        ) : board.ranks.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs font-bold text-[var(--text-tertiary)]">표시할 키워드가 없습니다.</div>
        ) : board.ranks.slice(0, 10).map((rank) => {
          const registered = isInterestKeyword(rank.keyword);
          return (
            <div
              key={`${board.key}:${rank.rank}:${rank.keyword}`}
              className="grid w-full grid-cols-[34px_minmax(0,1fr)_72px] items-center gap-2 px-4 py-2 text-left transition hover:bg-[var(--surface-sunken)]"
            >
              <span className="text-xs font-black text-[#ff5a1f]">{rank.rank}</span>
              <button
                type="button"
                onClick={() => onUseKeyword(rank.keyword)}
                disabled={disabled}
                className="min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block truncate text-xs font-black">{rank.keyword}</span>
                {rank.categories.length > 0 && (
                  <span className="block truncate text-[10px] font-bold text-[var(--text-tertiary)]">{rank.categories.slice(0, 2).join(', ')}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onTrackKeyword(rank.keyword, {
                  rank: rank.rank,
                  board: board.label,
                  categoryPath: board.categoryPath,
                })}
                disabled={disabled || registered}
                className="inline-flex h-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {registered ? '등록됨' : '관심'}
              </button>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div className="col-span-full rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-10 text-center text-sm font-bold text-[var(--text-tertiary)]">
      {loading ? 'DataLab 인기검색어를 가져오는 중입니다.' : text}
    </div>
  );
}
