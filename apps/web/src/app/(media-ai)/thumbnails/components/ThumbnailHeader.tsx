import { RefreshCw, ScanSearch, Search, Sparkles } from 'lucide-react';

interface ThumbnailHeaderProps {
  totalCount: number;
  avgScore: number;
  healthGrade: string;
  searchQuery: string;
  onSearch: (q: string) => void;
  onInspect: () => void;
  onRefresh: () => void;
}

export function ThumbnailHeader({
  totalCount,
  avgScore,
  healthGrade,
  searchQuery,
  onSearch,
  onInspect,
  onRefresh,
}: ThumbnailHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--thumb-primary)' }}
        >
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--thumb-text-primary)' }}>
            Thumbnail AI
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--thumb-text-tertiary)' }}>
              {totalCount}개 상품
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--thumb-primary-subtle)', color: 'var(--thumb-primary)' }}
            >
              평균 {avgScore}점 · {healthGrade}등급
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--thumb-text-quaternary)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="상품명 검색..."
            className="pl-8 pr-3 py-2 rounded-xl text-sm w-52"
            style={{
              background: 'var(--thumb-surface-sunken)',
              border: '1px solid var(--thumb-border-subtle)',
              color: 'var(--thumb-text-primary)',
            }}
          />
        </div>
        <button
          onClick={onInspect}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: 'var(--thumb-primary-subtle, #ede9fe)',
            color: 'var(--thumb-primary, #7c3aed)',
          }}
        >
          <ScanSearch size={14} /> 이미지 검수
        </button>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--thumb-surface-sunken)', color: 'var(--thumb-text-secondary)' }}
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>
    </div>
  );
}
