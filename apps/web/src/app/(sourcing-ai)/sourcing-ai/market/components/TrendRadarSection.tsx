'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Globe2,
  Layers3,
  MessageCircleMore,
  Minus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Youtube,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber, formatPercent } from '@/lib/utils';
import {
  filterTrendOpportunities,
  rankTrendOpportunitiesForChannel,
  rankMovement,
  trendOpportunities,
  type MarketCategory,
  type RankedTrendOpportunity,
  type SnsTrendEvidence,
  type TrendChannelView,
  type TrendDecision,
  type TrendSource,
} from '../lib/market-intelligence';
import { fetchLiveNaverMarket } from '../lib/live-naver-market';
import { fetchLiveSnsMarket } from '../lib/live-sns-market';

const categoryOptions: Array<{ value: MarketCategory; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'toy', label: '완구' },
  { value: 'stationery', label: '문구' },
];

const channelViewMeta: Record<TrendChannelView, {
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  basis: string;
  sourceLabel: string;
  sourceCount: number;
  icon: typeof Layers3;
}> = {
  all: {
    label: '종합',
    shortLabel: '종합',
    title: '종합 급상승 키워드 TOP 20',
    description: '국내 검색·커머스, SNS, 중국 소싱 신호를 함께 보는 전체 기회 순위입니다.',
    basis: '검색·커머스·SNS 종합 모멘텀',
    sourceLabel: 'Naver · Coupang · Wing · Instagram · YouTube · Douyin · 1688',
    sourceCount: 7,
    icon: Layers3,
  },
  domestic: {
    label: '국내 검색·커머스',
    shortLabel: '국내',
    title: '네이버 문구·완구 급상승 후보 TOP 20',
    description: '문구·완구 시드의 네이버 관련어를 월간 검색량과 최근 검색 추이로 재정렬합니다.',
    basis: '최근 검색 상승률 60% · 월간 검색량 40%',
    sourceLabel: 'Naver 검색광고 키워드도구 · DataLab 검색트렌드',
    sourceCount: 1,
    icon: ShoppingBag,
  },
  social: {
    label: 'SNS',
    shortLabel: 'SNS',
    title: 'SNS 급상승 키워드',
    description: 'Instagram·YouTube에서 영상과 게시물 반응이 먼저 움직이는 키워드를 분리합니다.',
    basis: 'SNS지수 80% · 소스커버리지 20%',
    sourceLabel: 'Instagram · YouTube',
    sourceCount: 2,
    icon: MessageCircleMore,
  },
  china: {
    label: '중국 소싱',
    shortLabel: '중국',
    title: '중국 소싱 선행 키워드',
    description: 'Douyin의 콘텐츠 반응과 1688 공급 신호가 있는 키워드만 따로 비교합니다.',
    basis: '중국 SNS 50% · 공급반응 25% · 소스커버리지 25%',
    sourceLabel: 'Douyin · 1688',
    sourceCount: 2,
    icon: Globe2,
  },
};

const decisionMeta: Record<TrendDecision, { label: string; className: string }> = {
  focus: { label: '집중 검증', className: 'bg-purple-50 text-purple-700 ring-purple-200' },
  seasonal: { label: '시즌 단기', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  test: { label: '소량 테스트', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  licensed: { label: '권리 확인', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const sourceMeta: Record<TrendSource, { label: string; className: string }> = {
  NAVER: { label: 'Naver', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  COUPANG: { label: 'Coupang', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  WING: { label: 'Wing', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  INSTAGRAM: { label: 'Instagram', className: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
  DOUYIN: { label: 'Douyin', className: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  YOUTUBE: { label: 'YouTube', className: 'bg-red-50 text-red-700 ring-red-200' },
  '1688': { label: '1688', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

const pressable = 'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

export function TrendRadarSection() {
  const [channelView, setChannelView] = useState<TrendChannelView>('domestic');
  const [category, setCategory] = useState<MarketCategory>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(trendOpportunities[0].id);

  const liveNaverQuery = useQuery({
    queryKey: queryKeys.sourcing.liveNaverMarket(),
    queryFn: fetchLiveNaverMarket,
    enabled: channelView === 'domestic',
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const liveSnsQuery = useQuery({
    queryKey: ['sourcing', 'live-sns-market'] as const,
    queryFn: fetchLiveSnsMarket,
    enabled: channelView === 'social',
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const liveDomestic = channelView === 'domestic';
  const liveSns = channelView === 'social';
  const isLive = liveDomestic || liveSns;

  // 두 라이브 쿼리의 공통값을 스칼라로 뽑아 union 타입 이슈 없이 재사용한다.
  const liveGeneratedAt = liveDomestic ? liveNaverQuery.data?.generatedAt : liveSnsQuery.data?.generatedAt;
  const liveFetching = liveDomestic ? liveNaverQuery.isFetching : liveSnsQuery.isFetching;
  const liveLoading = liveDomestic ? liveNaverQuery.isLoading : liveSnsQuery.isLoading;
  const liveError = liveDomestic ? liveNaverQuery.isError : liveSnsQuery.isError;
  const liveErrorObj = liveDomestic ? liveNaverQuery.error : liveSnsQuery.error;
  const liveWarnings = (liveDomestic ? liveNaverQuery.data?.warnings : liveSnsQuery.data?.warnings) ?? [];
  const refetchLive = () => {
    if (liveDomestic) void liveNaverQuery.refetch();
    else if (liveSns) void liveSnsQuery.refetch();
  };

  const rankedOpportunities = useMemo(() => {
    if (liveDomestic) {
      return (liveNaverQuery.data?.opportunities ?? []).map((opportunity, index) => ({
        opportunity,
        channelRank: index + 1,
        channelScore: opportunity.score,
        channelSources: ['NAVER'] as TrendSource[],
      }));
    }
    if (liveSns) {
      return (liveSnsQuery.data?.opportunities ?? []).map((opportunity, index) => ({
        opportunity,
        channelRank: index + 1,
        channelScore: opportunity.score,
        channelSources: ['YOUTUBE'] as TrendSource[],
      }));
    }
    return rankTrendOpportunitiesForChannel(trendOpportunities, channelView);
  }, [channelView, liveDomestic, liveSns, liveNaverQuery.data?.opportunities, liveSnsQuery.data?.opportunities]);

  const filteredOpportunities = useMemo(() => {
    const matchingIds = new Set(
      filterTrendOpportunities(
        rankedOpportunities.map((row) => row.opportunity),
        category,
        query,
      ).map((opportunity) => opportunity.id),
    );

    return rankedOpportunities.filter((row) => matchingIds.has(row.opportunity.id));
  }, [category, query, rankedOpportunities]);

  const selectedRow = filteredOpportunities.find((row) => row.opportunity.id === selectedId)
    ?? filteredOpportunities[0]
    ?? rankedOpportunities[0]
    ?? null;
  const selected = selectedRow?.opportunity ?? null;
  const activeViewMeta = channelViewMeta[channelView];

  const categoryCounts = useMemo(() => ({
    toy: rankedOpportunities.filter((row) => row.opportunity.category === 'toy').length,
    stationery: rankedOpportunities.filter((row) => row.opportunity.category === 'stationery').length,
  }), [rankedOpportunities]);

  return (
    <div className="space-y-5">
      <section className="overflow-visible rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="trend-ranking-title">
        <div className="border-b border-[var(--border)] px-5 py-4 lg:px-6">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">
                  <Sparkles size={13} />
                  {isLive
                    ? liveGeneratedAt
                      ? `${liveDomestic ? 'Naver' : '유튜브 쇼츠'} 최신 · ${formatDateTime(liveGeneratedAt)}`
                      : `${liveDomestic ? 'Naver' : '유튜브 쇼츠'} 실데이터 불러오는 중`
                    : '7월 12일 리서치 스냅샷'}
                </span>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                  {rankedOpportunities.length}개 후보
                </span>
              </div>
              <h2 id="trend-ranking-title" className="mt-2 text-lg font-bold text-[var(--text-primary)]">
                {activeViewMeta.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                {activeViewMeta.description}{' '}
                {isLive
                  ? liveDomestic
                    ? '네이버 원천의 최신 제공값이며 화면이 열려 있는 동안 10분마다 갱신합니다.'
                    : '유튜브 쇼츠(shortstrend) 실데이터이며 화면이 열려 있는 동안 10분마다 갱신합니다.'
                  : '판매량 확정 순위가 아니며, 현재는 리서치 스냅샷 산식입니다.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--text-tertiary)]">
                <span>후보 <strong className="font-bold tabular-nums text-[var(--text-primary)]">{rankedOpportunities.length}</strong></span>
                <span>완구 <strong className="font-bold tabular-nums text-[var(--text-primary)]">{categoryCounts.toy}</strong></span>
                <span>문구 <strong className="font-bold tabular-nums text-[var(--text-primary)]">{categoryCounts.stationery}</strong></span>
                <span>포함 소스 <strong className="font-bold tabular-nums text-[var(--text-primary)]">{activeViewMeta.sourceCount}</strong></span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {isLive && (
                <button
                  type="button"
                  onClick={refetchLive}
                  disabled={liveFetching}
                  className={cn(
                    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] hover:border-purple-200 hover:text-purple-700 disabled:opacity-50',
                    pressable,
                  )}
                >
                  <RefreshCw size={13} className={liveFetching ? 'animate-spin' : ''} />
                  지금 갱신
                </button>
              )}
              <div role="group" aria-label="카테고리 필터" className="flex items-center rounded-lg bg-[var(--surface-sunken)] p-1">
                {categoryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={category === option.value}
                    onClick={() => setCategory(option.value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                      pressable,
                      category === option.value
                        ? 'bg-white text-[var(--primary)] shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="relative block min-w-0 sm:w-64">
                <span className="sr-only">급상승 키워드 검색</span>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="키워드 또는 근거 검색"
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)] focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                />
              </label>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="급상승 키워드 채널 보기"
            className="mt-4 flex gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1"
          >
            {(Object.entries(channelViewMeta) as Array<[TrendChannelView, typeof activeViewMeta]>).map(([view, meta]) => {
              const Icon = meta.icon;
              const selectedView = channelView === view;
              return (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={selectedView}
                  onClick={() => setChannelView(view)}
                  className={cn(
                    'flex min-w-[154px] flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                    pressable,
                    selectedView
                      ? 'bg-white text-[var(--primary)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-white/70 hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon size={14} />
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-col gap-1 rounded-lg border border-purple-100 bg-purple-50 px-3.5 py-2.5 text-[11px] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
            <span className="text-purple-900"><strong className="font-semibold">순위 기준</strong> · {liveSns ? '유튜브 쇼츠 조회량 70% · 조회 속도 30% · 모멘텀=주간 성장' : activeViewMeta.basis}</span>
            <span className="text-purple-800"><strong className="font-semibold">포함 소스</strong> · {liveSns ? 'YouTube 쇼츠 (shortstrend)' : activeViewMeta.sourceLabel}</span>
            <span className={cn('font-semibold sm:ml-auto', isLive ? 'text-emerald-700' : 'text-rose-700')}>
              {isLive ? '실연동 · 화면 10분 갱신' : '실시간 플랫폼 공식 순위 아님'}
            </span>
          </div>
        </div>

        <div className="grid items-start xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]">
          <div className="min-w-0 overflow-x-auto xl:border-r xl:border-[var(--border)]">
            <table className="min-w-[980px] w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 w-24 bg-slate-50 px-3 py-2.5">{channelView === 'all' ? '종합 순위' : '채널 순위'}</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5">키워드</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5">카테고리</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5">{activeViewMeta.label} 근거</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-right">{liveSns ? '총 조회수' : '검색량 참고'}</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-right">{activeViewMeta.shortLabel} 지수</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-right">7일 모멘텀</th>
                  <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5">판단</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpportunities.map((row) => (
                  <OpportunityRow
                    key={row.opportunity.id}
                    row={row}
                    channelView={channelView}
                    selected={selected?.id === row.opportunity.id}
                    onSelect={() => setSelectedId(row.opportunity.id)}
                  />
                ))}
              </tbody>
            </table>

            {isLive && liveLoading && (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--text-secondary)]">
                <RefreshCw size={16} className="animate-spin text-purple-600" />
                {liveDomestic
                  ? '네이버 문구·완구 최신 키워드를 수집하고 있습니다…'
                  : '유튜브 쇼츠 최신 트렌드를 불러오고 있습니다…'}
              </div>
            )}

            {isLive && liveError && (
              <div className="px-5 py-12 text-center">
                <AlertCircle size={30} className="mx-auto text-rose-400" />
                <p className="mt-3 text-sm font-semibold text-rose-700">
                  {liveDomestic ? '네이버' : '유튜브 쇼츠'} 실데이터를 가져오지 못했습니다.
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {liveErrorObj instanceof Error ? liveErrorObj.message : '연동 상태를 확인해주세요.'}
                </p>
                <button
                  type="button"
                  onClick={refetchLive}
                  className={cn('mt-3 text-sm font-semibold text-[var(--primary)] hover:text-purple-700', pressable)}
                >
                  다시 수집
                </button>
              </div>
            )}

            {filteredOpportunities.length === 0 && (
              !isLive || (!liveLoading && !liveError)
            ) && (
              <div className="px-5 py-12 text-center">
                <Search size={32} className="mx-auto text-[var(--text-quaternary)]" />
                <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">조건에 맞는 급상승 키워드가 없습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCategory('all');
                    setQuery('');
                  }}
                  className={cn('mt-3 text-sm font-semibold text-[var(--primary)] hover:text-purple-700', pressable)}
                >
                  필터 초기화
                </button>
              </div>
            )}
          </div>

          {selectedRow && (
            <TrendDetailPanel row={selectedRow} channelView={channelView} liveData={isLive} />
          )}
        </div>
      </section>

      {isLive && liveWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>일부 보조 지표가 누락되었습니다: {liveWarnings.join(' · ')}</p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-900">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p>검색량과 SNS 반응은 판매 보장이 아닙니다. KC·라이선스·도착원가를 통과한 상품만 실제 소싱 후보로 승격하세요.</p>
      </div>
    </div>
  );
}

function OpportunityRow({
  row,
  channelView,
  selected,
  onSelect,
}: {
  row: RankedTrendOpportunity;
  channelView: TrendChannelView;
  selected: boolean;
  onSelect: () => void;
}) {
  const { opportunity, channelRank, channelScore, channelSources } = row;

  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors',
        selected ? 'bg-purple-50/80 hover:bg-purple-50' : 'hover:bg-[var(--surface-sunken)]',
      )}
      onClick={onSelect}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex h-7 min-w-7 items-center justify-center rounded-md text-sm font-bold tabular-nums',
            channelRank <= 3
              ? 'bg-purple-600 text-white'
              : 'bg-[var(--surface-sunken)] text-[var(--text-primary)]',
          )}>
            {channelRank}
          </span>
          {channelView === 'all' ? (
            <RankMovement currentRank={opportunity.trendRank} previousRank={opportunity.previousTrendRank} />
          ) : (
            <span className="text-[9px] font-semibold tabular-nums text-[var(--text-tertiary)]">종합 {opportunity.trendRank}위</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onSelect}
          className="text-left font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          {opportunity.keyword}
        </button>
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">{opportunity.category === 'toy' ? '완구' : '문구'}</td>
      <td className="px-3 py-2">
        <div className="flex max-w-[270px] flex-wrap gap-1">
          {channelSources.map((source) => (
            <SourceBadge key={source} source={source} />
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text-primary)]">
        {opportunity.snsEvidence ? (
          formatNumber(opportunity.snsEvidence.totalViews)
        ) : opportunity.monthlySearches === null ? (
          <span className="font-medium text-[var(--text-tertiary)]">수집 중</span>
        ) : formatNumber(opportunity.monthlySearches)}
      </td>
      <td className="px-3 py-2 text-right">
        <span className="inline-flex min-w-10 items-center justify-center rounded-md bg-[var(--primary-soft)] px-2 py-1 font-bold tabular-nums text-[var(--primary)]">
          {channelScore}
        </span>
      </td>
      <td className="px-3 py-2 text-right"><MomentumValue value={opportunity.momentum} /></td>
      <td className="px-3 py-2"><DecisionBadge decision={opportunity.decision} /></td>
    </tr>
  );
}

function TrendDetailPanel({
  row,
  channelView,
  liveData,
}: {
  row: RankedTrendOpportunity;
  channelView: TrendChannelView;
  liveData: boolean;
}) {
  const { opportunity, channelRank, channelScore, channelSources } = row;
  const sns = opportunity.snsEvidence;
  const viewMeta = channelViewMeta[channelView];
  const showSearch = channelView === 'all' || channelView === 'domestic';
  const showCommerce = channelView === 'all' || channelView === 'domestic' || channelView === 'china';
  const showSocial = channelView === 'all' || channelView === 'social' || channelView === 'china';
  const channelEvidence = liveData
    ? opportunity.evidence
    : channelView === 'all'
    ? opportunity.evidence
    : `${channelSources.map((source) => sourceMeta[source].label).join(' · ')} 신호를 기준으로 ${viewMeta.label} ${channelRank}위입니다.`;

  return (
    <aside className="border-t border-[var(--border)] bg-[var(--surface)] xl:sticky xl:top-5 xl:border-t-0" aria-labelledby="selected-keyword-title">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--primary)]">선택 키워드 · {viewMeta.label} {channelRank}위</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h3 id="selected-keyword-title" className="text-lg font-bold text-[var(--text-primary)]">{opportunity.keyword}</h3>
              <DecisionBadge decision={opportunity.decision} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)]">{viewMeta.shortLabel} 지수</p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-[var(--primary)]">{channelScore}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{channelEvidence}</p>
        {channelView !== 'all' && !liveData && (
          <p className="mt-2 rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
            전체 참고 · {opportunity.evidence}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 divide-x divide-[var(--border-subtle)] border-b border-[var(--border)] bg-[var(--surface-sunken)]">
        <DetailMetric
          label={sns ? '총 조회수' : '월간 검색'}
          value={sns
            ? formatNumber(sns.totalViews)
            : opportunity.monthlySearches === null ? '수집 중' : formatNumber(opportunity.monthlySearches)}
        />
        <DetailMetric
          label={liveData ? '급상승 후보순위' : channelView === 'all' ? '쇼핑 순위' : '종합 순위'}
          value={liveData
            ? `${formatNumber(channelRank)}위`
            : channelView === 'all'
            ? opportunity.shoppingRank ? `${formatNumber(opportunity.shoppingRank)}위` : '-'
            : `${formatNumber(opportunity.trendRank)}위`}
        />
        <DetailMetric
          label={sns ? '쇼츠 수' : '경쟁 강도'}
          value={sns ? `${formatNumber(sns.videoCount)}개` : opportunity.competition}
        />
      </dl>

      {sns ? (
        <SnsVideoEvidence sns={sns} momentum={opportunity.momentum} />
      ) : (
      <div className="px-3 pb-2 pt-4 sm:px-5">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">7일 {viewMeta.label} 모멘텀</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              {liveData ? 'Naver DataLab 검색지수 · 월간 검색량 규모 환산값' : '리서치 스냅샷을 0~100으로 정규화'}
            </p>
          </div>
          <MomentumValue value={opportunity.momentum} />
        </div>
        <div className="mt-2 h-[230px]">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 360, height: 230 }}>
            <LineChart data={opportunity.points} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 10 }}
                dy={7}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                width={34}
              />
              <Tooltip
                cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                contentStyle={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  `${formatNumber(Number(value))}점`,
                  name === 'search' ? '검색' : name === 'commerce' ? '커머스' : 'SNS',
                ]}
              />
              {showSearch && <Line type="monotone" dataKey="search" stroke="#7c3aed" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />}
              {showCommerce && <Line type="monotone" dataKey="commerce" stroke="#16a34a" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />}
              {showSocial && <Line type="monotone" dataKey="social" stroke="#f59e0b" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border-subtle)] px-1 pt-3 text-[10px] font-medium text-[var(--text-secondary)]">
          {showSearch && <Legend color="bg-purple-600" label="검색" />}
          {showCommerce && <Legend color="bg-green-600" label={liveData ? '월간 검색량 규모' : channelView === 'china' ? '1688 공급' : '커머스'} />}
          {showSocial && <Legend color="bg-amber-500" label={channelView === 'china' ? 'Douyin' : 'SNS'} />}
        </div>
      </div>
      )}

      <div className="border-t border-[var(--border)] px-5 py-4">
        <p className="text-xs font-semibold text-[var(--text-tertiary)]">{viewMeta.label} 포함 근거</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {channelSources.map((source) => <SourceBadge key={source} source={source} />)}
        </div>
        <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50 px-4 py-3">
          <p className="text-xs font-semibold text-purple-700">추천 다음 행동</p>
          <p className="mt-1 text-xs font-medium leading-5 text-purple-950">{opportunity.nextAction}</p>
        </div>
        <Link
          href="/sourcing-ai/keywords"
          className={cn(
            'mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
            pressable,
          )}
        >
          키워드 상세 분석
          <ArrowRight size={14} />
        </Link>
      </div>
    </aside>
  );
}

function RankMovement({ currentRank, previousRank }: { currentRank: number; previousRank: number | null }) {
  if (previousRank === null) {
    return <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">신규</span>;
  }

  const movement = rankMovement(currentRank, previousRank);
  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums text-green-600" aria-label={`${movement}계단 상승`}>
        <ArrowUp size={11} />{movement}
      </span>
    );
  }
  if (movement < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums text-rose-600" aria-label={`${Math.abs(movement)}계단 하락`}>
        <ArrowDown size={11} />{Math.abs(movement)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[var(--text-quaternary)]" aria-label="순위 유지">
      <Minus size={12} />
    </span>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <dt className="text-[10px] font-semibold text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: TrendDecision }) {
  const meta = decisionMeta[decision];
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', meta.className)}>
      {meta.label}
    </span>
  );
}

function SourceBadge({ source }: { source: TrendSource }) {
  const meta = sourceMeta[source];
  return (
    <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset', meta.className)}>
      {meta.label}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}

function SnsVideoEvidence({ sns, momentum }: { sns: SnsTrendEvidence; momentum: number }) {
  return (
    <div className="px-3 pb-3 pt-4 sm:px-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold text-[var(--text-primary)]">7일 SNS 모멘텀</p>
          <p className="mt-0.5 text-[10px] leading-4 text-[var(--text-tertiary)]">
            유튜브 쇼츠 조회 속도 기준 주간 성장 추정 · 최근 7일 신작 조회 {sns.freshShare}%
          </p>
        </div>
        <MomentumValue value={momentum} />
      </div>
      <p className="mt-3 px-1 text-[10px] font-semibold text-[var(--text-tertiary)]">조회수 상위 쇼츠</p>
      <ul className="mt-1.5 space-y-1.5">
        {sns.topVideos.length === 0 ? (
          <li className="px-1 text-[11px] text-[var(--text-tertiary)]">표시할 쇼츠가 없습니다.</li>
        ) : sns.topVideos.map((video, index) => (
          <li key={`${video.videoUrl ?? video.title}-${index}`}>
            <a
              href={video.videoUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-[11px] hover:border-red-200 hover:bg-red-50/40',
                pressable,
              )}
            >
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-red-50 text-[10px] font-bold text-red-600">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{video.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--text-secondary)]">{formatNumber(video.viewCount ?? 0)}회</span>
              <Youtube size={13} className="shrink-0 text-red-500" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-[10px] text-[var(--text-tertiary)]">클릭 시 유튜브에서 열립니다</p>
    </div>
  );
}

function MomentumValue({ value }: { value: number }) {
  const prefix = value > 0 ? '+' : '';
  return (
    <span className={cn(
      'font-bold tabular-nums',
      value > 0 ? 'text-green-600' : value < 0 ? 'text-rose-600' : 'text-[var(--text-tertiary)]',
    )}>
      {prefix}{formatPercent(value)}
    </span>
  );
}
