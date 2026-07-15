import {
  BookmarkCheck,
  Boxes,
  Check,
  Database,
  Map,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  keywordSourceLabel,
  mobileShare,
  type ToyClusterId,
  type ToyKeywordCluster,
  type ToyKeywordSignal,
} from '../lib/toy-keyword-intelligence';
import type { NaverKeywordSparklinePoint } from '../lib/toy-trend-api';

const clusterLayout: Record<ToyClusterId, { left: string; top: string; tone: string }> = {
  'new-entry': { left: '2%', top: '7%', tone: 'border-violet-200 bg-violet-50/80' },
  'rank-riser': { left: '35%', top: '2%', tone: 'border-emerald-200 bg-emerald-50/80' },
  'trend-up': { left: '68%', top: '10%', tone: 'border-orange-200 bg-orange-50/80' },
  'mobile-strong': { left: '7%', top: '54%', tone: 'border-sky-200 bg-sky-50/80' },
  tracked: { left: '39%', top: '49%', tone: 'border-amber-200 bg-amber-50/80' },
  popular: { left: '70%', top: '57%', tone: 'border-slate-200 bg-slate-50' },
};

export function ToyKeywordMap({
  clusters,
  selectedIds,
  hasCollectedData,
  onToggleKeyword,
}: {
  clusters: ToyKeywordCluster[];
  selectedIds: Set<string>;
  hasCollectedData: boolean;
  onToggleKeyword: (keywordId: string) => void;
}) {
  if (clusters.length === 0) return <KeywordEmptyState hasCollectedData={hasCollectedData} />;
  const useSpatialLayout = clusters.length >= 4;

  return (
    <div className={cn(
      'grid gap-3 p-4 sm:grid-cols-2',
      useSpatialLayout ? 'xl:relative xl:min-h-[630px] xl:block' : 'xl:grid-cols-3',
    )}>
      {clusters.map((cluster) => {
        const layout = clusterLayout[cluster.id];
        return (
          <article
            key={cluster.id}
            style={useSpatialLayout ? { left: layout.left, top: layout.top } : undefined}
            className={cn(
              'rounded-xl border p-3',
              useSpatialLayout && 'xl:absolute xl:w-[29%]',
              layout.tone,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Map size={15} className="text-[var(--primary)]" />
                  <h3 className="text-sm font-black text-[var(--text-primary)]">{cluster.label}</h3>
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-[var(--text-secondary)]">
                    {cluster.keywords.length}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-bold text-[var(--text-tertiary)]">{cluster.caption}</p>
              </div>
              <div className="text-right">
                <strong className="block text-xs font-black tabular-nums text-[var(--text-primary)]">
                  {cluster.measuredKeywordCount === 0
                    ? '—'
                    : formatCompact(cluster.measuredMonthlySearchTotal)}
                </strong>
                <span className="text-[9px] font-bold text-[var(--text-tertiary)]">실측 월검색 합계</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {cluster.keywords.map((keyword) => {
                const selected = selectedIds.has(keyword.id);
                return (
                  <button
                    key={keyword.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggleKeyword(keyword.id)}
                    className={cn(
                      'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black shadow-sm transition',
                      selected
                        ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                        : 'border-white bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]',
                    )}
                  >
                    {selected ? <Check size={12} /> : <Sparkles size={12} />}
                    {keyword.keyword}
                    <span className={cn('font-bold tabular-nums', selected ? 'text-white/75' : 'text-[var(--text-tertiary)]')}>
                      {keyword.monthlyTotalSearchCount === null
                        ? keyword.boardRank === null ? '—' : `#${keyword.boardRank}`
                        : formatCompact(keyword.monthlyTotalSearchCount)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/5 pt-2 text-[10px] font-bold text-[var(--text-tertiary)]">
              <span>검색량 확보 <b className="text-[var(--text-primary)]">{cluster.measuredKeywordCount}개</b></span>
              <span className="text-right">선택 <b className="text-[var(--primary)]">{cluster.keywords.filter((keyword) => selectedIds.has(keyword.id)).length}</b></span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ToyKeywordTable({
  keywords,
  selectedIds,
  detailed,
  hasCollectedData,
  onToggleKeyword,
  onToggleAll,
}: {
  keywords: ToyKeywordSignal[];
  selectedIds: Set<string>;
  detailed: boolean;
  hasCollectedData: boolean;
  onToggleKeyword: (keywordId: string) => void;
  onToggleAll: () => void;
}) {
  if (keywords.length === 0) return <KeywordEmptyState hasCollectedData={hasCollectedData} />;
  const allSelected = keywords.every((keyword) => selectedIds.has(keyword.id));

  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-left', detailed ? 'min-w-[1450px]' : 'min-w-[930px]')}>
        <thead>
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                aria-label="표시된 키워드 전체 선택"
                checked={allSelected}
                onChange={onToggleAll}
                className="h-4 w-4 accent-violet-600"
              />
            </th>
            <th className="text-right">순위</th>
            <th>키워드</th>
            <th className="text-right">월 검색량</th>
            <th className="text-right">모바일</th>
            <th className="text-right">검색지수 변화</th>
            {detailed && <th className="text-right">PC</th>}
            {detailed && <th className="text-right">모바일 비중</th>}
            {detailed && <th>검색광고 경쟁</th>}
            {detailed && <th className="text-right">평균 광고순위</th>}
            {detailed && <th className="text-right">DataLab 지수</th>}
            {detailed && <th>최근 추이</th>}
            {detailed && <th>기준일</th>}
            {detailed && <th>출처</th>}
          </tr>
        </thead>
        <tbody>
          {keywords.map((keyword) => {
            const selected = selectedIds.has(keyword.id);
            const share = mobileShare(keyword);
            return (
              <tr key={keyword.id} className={cn(selected && 'bg-violet-50/60')}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`${keyword.keyword} 선택`}
                    checked={selected}
                    onChange={() => onToggleKeyword(keyword.id)}
                    className="h-4 w-4 accent-violet-600"
                  />
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-[var(--text-secondary)]">
                  {keyword.boardRank === null ? '—' : `#${keyword.boardRank}`}
                </td>
                <td className="min-w-[230px] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <strong className="truncate text-sm font-black text-[var(--text-primary)]">{keyword.keyword}</strong>
                    <SignalBadge keyword={keyword} />
                  </div>
                </td>
                <NullableNumericCell value={keyword.monthlyTotalSearchCount} />
                <NullableNumericCell value={keyword.monthlyMobileSearchCount} />
                <td className="px-4 py-3 text-right"><DeltaValue value={keyword.trendDelta} /></td>
                {detailed && <NullableNumericCell value={keyword.monthlyPcSearchCount} />}
                {detailed && <NullableNumericCell value={share} suffix={share === null ? undefined : '%'} />}
                {detailed && <td className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">{keyword.competitionIndex ?? '—'}</td>}
                {detailed && <NullableNumericCell value={keyword.averageAdRank} />}
                {detailed && <NullableNumericCell value={keyword.trendRatio} />}
                {detailed && <td className="px-4 py-3"><TrendSparkline points={keyword.sparkline} /></td>}
                {detailed && <td className="px-4 py-3 text-xs font-bold tabular-nums text-[var(--text-secondary)]">{keyword.businessDate ?? '—'}</td>}
                {detailed && <td className="max-w-[190px] px-4 py-3 text-[10px] font-bold text-[var(--text-tertiary)]">{keywordSourceLabel(keyword)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SelectedKeywordQueue({
  selectedKeywords,
  recommendedKeywords,
  onRemove,
  onClear,
}: {
  selectedKeywords: ToyKeywordSignal[];
  recommendedKeywords: ToyKeywordSignal[];
  onRemove: (keywordId: string) => void;
  onClear: () => void;
}) {
  const rows = selectedKeywords.length > 0 ? selectedKeywords : recommendedKeywords.slice(0, 4);
  const isRecommendation = selectedKeywords.length === 0;

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookmarkCheck size={17} className="text-[var(--primary)]" />
            <h3 className="text-sm font-black text-[var(--text-primary)]">키워드 비교 큐</h3>
          </div>
          <span className="rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-black text-[var(--primary)]">
            {selectedKeywords.length}개 선택
          </span>
        </div>
        <p className="mt-2 text-[11px] font-bold leading-5 text-[var(--text-tertiary)]">
          {isRecommendation
            ? '키워드를 선택하면 실측 검색량·순위·추세를 나란히 비교할 수 있습니다.'
            : '표시된 수치는 저장된 네이버 스냅샷만 사용합니다.'}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs font-bold text-[var(--text-tertiary)]">수집된 후보가 없습니다.</div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {rows.map((keyword, index) => (
            <div key={keyword.id} className="p-3">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-sunken)] text-[10px] font-black text-[var(--text-secondary)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-xs font-black text-[var(--text-primary)]">{keyword.keyword}</strong>
                    {!isRecommendation && (
                      <button type="button" aria-label={`${keyword.keyword} 선택 해제`} onClick={() => onRemove(keyword.id)} className="text-[var(--text-muted)] hover:text-red-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-violet-50 px-1.5 py-1 text-[9px] font-black text-violet-700">
                      순위 {keyword.boardRank === null ? '—' : `#${keyword.boardRank}`}
                    </span>
                    <span className="rounded-md bg-sky-50 px-1.5 py-1 text-[9px] font-black text-sky-700">
                      월 {keyword.monthlyTotalSearchCount === null ? '—' : formatCompact(keyword.monthlyTotalSearchCount)}
                    </span>
                    <DeltaValue value={keyword.trendDelta} compact />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-3">
        <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-black text-[var(--text-tertiary)]">
          <span className="rounded-md bg-[var(--surface-sunken)] px-1 py-2">1. 수요 비교</span>
          <span className="rounded-md bg-[var(--surface-sunken)] px-1 py-2">2. 추세 확인</span>
          <span className="rounded-md bg-[var(--surface-sunken)] px-1 py-2">3. 도매 검증</span>
        </div>
        {!isRecommendation && (
          <button type="button" onClick={onClear} className="mt-2 h-9 w-full rounded-lg border border-[var(--border)] text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            선택 모두 해제
          </button>
        )}
      </div>
    </aside>
  );
}

function NullableNumericCell({ value, suffix }: { value: number | null; suffix?: string }) {
  return (
    <td className="px-4 py-3 text-right font-black tabular-nums text-[var(--text-primary)]">
      {value === null ? <span className="text-[var(--text-muted)]">—</span> : `${formatNumber(value)}${suffix ?? ''}`}
    </td>
  );
}

function SignalBadge({ keyword }: { keyword: ToyKeywordSignal }) {
  if (keyword.rankDelta === null) {
    return <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700">신규</span>;
  }
  if (typeof keyword.rankDelta === 'number' && keyword.rankDelta > 0) {
    return <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">▲ {keyword.rankDelta}</span>;
  }
  if (keyword.tracked) {
    return <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-black text-sky-700">추적</span>;
  }
  return null;
}

function DeltaValue({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (value === null) {
    return <span className={cn('font-black text-[var(--text-muted)]', compact ? 'text-[9px]' : 'text-xs')}>—</span>;
  }
  const rising = value > 0;
  const falling = value < 0;
  const Icon = rising ? TrendingUp : falling ? TrendingDown : Database;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md font-black tabular-nums',
      compact ? 'px-1.5 py-1 text-[9px]' : 'text-xs',
      rising ? 'text-emerald-600' : falling ? 'text-rose-600' : 'text-[var(--text-tertiary)]',
    )}>
      <Icon size={compact ? 10 : 13} />{value > 0 ? '+' : ''}{formatNumber(value)}
    </span>
  );
}

function TrendSparkline({ points }: { points: NaverKeywordSparklinePoint[] }) {
  const width = 88;
  const height = 24;
  const total = Math.max(points.length - 1, 1);
  const coords = points
    .map((point, index) => {
      if (point.trendRatio === null) return null;
      const ratio = Math.max(0, Math.min(100, point.trendRatio));
      const x = (index / total) * width + 2;
      const y = height - (ratio / 100) * height + 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((value): value is string => value !== null);

  if (coords.length < 2) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  return (
    <svg viewBox="0 0 92 32" className="h-8 w-[92px]" role="img" aria-label="검색지수 추이">
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
    </svg>
  );
}

function KeywordEmptyState({ hasCollectedData }: { hasCollectedData: boolean }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
      <Boxes size={38} className="text-[var(--text-muted)]" />
      <p className="mt-3 text-sm font-black text-[var(--text-secondary)]">
        {hasCollectedData ? '검색 조건에 맞는 완구 키워드가 없습니다.' : '아직 수집된 완구 키워드가 없습니다.'}
      </p>
      <p className="mt-1 max-w-lg text-xs font-bold leading-5 text-[var(--text-tertiary)]">
        {hasCollectedData
          ? '조건 초기화 후 다시 검색해 보세요.'
          : '상단의 지금 수집을 누르세요. 인기순위는 시드 없이 수집되고, 월·PC·모바일 검색량은 활성 네이버 시드가 있어야 수집됩니다.'}
      </p>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}만`;
  return formatNumber(value);
}
