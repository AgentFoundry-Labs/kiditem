'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  Clock3,
  Database,
  Eye,
  Factory,
  Globe2,
  Loader2,
  PlaySquare,
  RefreshCw,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { fetchLiveNaverMarket } from '../lib/live-naver-market';
import {
  buildCrossMarketTopics,
  type CrossMarketTopicOpportunity,
} from '../lib/cross-market-opportunities';
import {
  GLOBAL_SOURCING_NEXT_CONNECTORS,
  GLOBAL_SOURCING_STAGES,
  sourcesForStage,
  type GlobalSourcingSource,
  type GlobalSourcingStageId,
} from '../lib/global-sourcing-sources';
import {
  fetch1688HotProducts,
  fetchShortsTrends,
  type Hot1688OfferView,
  type ShortsTrendView,
} from '../lib/trend-collection-api';

const SNAPSHOT_DAYS = 7;
const pressable =
  'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none';

interface GlobalSourcingOverviewProps {
  onOpenCollection: () => void;
}

export function GlobalSourcingOverview({ onOpenCollection }: GlobalSourcingOverviewProps) {
  const naverQuery = useQuery({
    queryKey: queryKeys.sourcing.liveNaverMarket(),
    queryFn: fetchLiveNaverMarket,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
  const chinaQuery = useQuery({
    queryKey: queryKeys.sourcing.trend1688Hot(SNAPSHOT_DAYS),
    queryFn: () => fetch1688HotProducts(SNAPSHOT_DAYS),
    staleTime: 5 * 60 * 1000,
  });
  const globalQuery = useQuery({
    queryKey: queryKeys.sourcing.trendShorts(SNAPSHOT_DAYS),
    queryFn: () => fetchShortsTrends(SNAPSHOT_DAYS),
    staleTime: 5 * 60 * 1000,
  });

  const chinaOffers = chinaQuery.data?.offers ?? [];
  const globalVideos = globalQuery.data?.items ?? [];
  const koreaKeywords = naverQuery.data?.opportunities ?? [];
  const topics = useMemo(
    () =>
      buildCrossMarketTopics({
        china: chinaOffers,
        global: globalVideos,
        korea: koreaKeywords.map((keyword) => ({
          id: keyword.id,
          keyword: keyword.keyword,
          monthlySearches: keyword.monthlySearches,
          rightsCheckRequired: keyword.decision === 'licensed',
        })),
        limit: 10,
      }),
    [chinaOffers, globalVideos, koreaKeywords],
  );
  const stageWithDataCount = [chinaOffers.length, globalVideos.length, koreaKeywords.length].filter(
    (count) => count > 0,
  ).length;

  const sourceContext: SourceContext = {
    chinaCount: chinaOffers.length,
    globalCount: globalVideos.length,
    koreaCount: koreaKeywords.length,
    naverLoading: naverQuery.isLoading,
    naverError: naverQuery.isError,
    naverReady: naverQuery.isSuccess,
    naverWarning: (naverQuery.data?.warnings.length ?? 0) > 0,
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                현재 데이터 {stageWithDataCount}/3단계
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-[var(--text-primary)]">
              중국 공급 → 글로벌 반응 → 한국 수요 순으로 확인합니다
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--text-secondary)]">
              플랫폼별 상품 ID를 동일 상품으로 묶지 않고 키워드·주제로 연결합니다. 확인된 수치만
              표시하고 미연동 소스는 제외합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCollection}
            className={cn(
              'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2',
              pressable,
            )}
          >
            <RefreshCw size={15} />
            수집 화면 열기
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {GLOBAL_SOURCING_STAGES.map((stage, index) => (
            <div key={stage.id} className="relative">
              <article className="h-full rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-purple-600 px-2 text-xs font-bold text-white">
                    {stage.step}
                  </span>
                  <StageCount stage={stage.id} context={sourceContext} />
                </div>
                <h3 className="mt-3 text-sm font-bold text-[var(--text-primary)]">{stage.label}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{stage.description}</p>
                <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[11px] font-semibold text-purple-700">
                  판단: {stage.decision}
                </p>
              </article>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <Clock3 size={15} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-semibold">네이버</strong>는 공식 API 실시간 조회(10분 갱신),{' '}
            <strong className="font-semibold">YouTube·1688</strong>은 수집 버튼으로 저장한 스냅샷입니다.
            1688 수집은 로그인·슬라이더 인증이 필요할 수 있습니다.
          </p>
        </div>
      </section>

      <CrossMarketTable
        topics={topics}
        loading={naverQuery.isLoading || chinaQuery.isLoading || globalQuery.isLoading}
        errors={[
          naverQuery.isError ? '네이버' : null,
          chinaQuery.isError ? '1688' : null,
          globalQuery.isError ? 'YouTube' : null,
        ].filter((value): value is string => value !== null)}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <ChinaSignals offers={chinaOffers} capturedAt={chinaQuery.data?.capturedAt ?? null} />
        <GlobalSignals items={globalVideos} capturedAt={globalQuery.data?.capturedAt ?? null} />
        <KoreaSignals
          items={koreaKeywords}
          generatedAt={naverQuery.data?.generatedAt ?? null}
          loading={naverQuery.isLoading}
          error={naverQuery.isError}
          warnings={naverQuery.data?.warnings ?? []}
        />
      </div>

      <SourceCoverage context={sourceContext} />
      <NextConnectorQueue />
    </div>
  );
}

function CrossMarketTable({
  topics,
  loading,
  errors,
}: {
  topics: CrossMarketTopicOpportunity[];
  loading: boolean;
  errors: string[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">시장별 후보</h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            동일 SKU가 아닌 키워드·주제 기준 연결 · 확인된 단계가 많은 순
          </p>
        </div>
        <span className="self-start rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
          {topics.length}개 주제
        </span>
      </div>
      {loading && topics.length === 0 ? (
        <PanelState icon={<Loader2 size={18} className="animate-spin" />} text="수집한 데이터를 연결하는 중입니다." />
      ) : topics.length === 0 ? (
        <PanelState icon={<Database size={18} />} text="아직 연결할 수집 데이터가 없습니다. 먼저 데이터를 수집해 주세요." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">주제</th>
                <th className="px-4 py-3 text-left">중국 공급</th>
                <th className="px-4 py-3 text-left">글로벌 콘텐츠</th>
                <th className="px-4 py-3 text-left">한국 수요</th>
                <th className="px-4 py-3 text-center">확인 단계</th>
                <th className="px-5 py-3 text-left">다음 판단</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.id}>
                  <td className="px-5 py-3 font-semibold text-[var(--text-primary)]">{topic.label}</td>
                  <td className="px-4 py-3"><EvidenceCell count={topic.chinaOfferCount} detail={topic.chinaTopTradeSignal === null ? null : `거래 표시 상위 ${formatNumber(topic.chinaTopTradeSignal)}`} unit="오퍼" /></td>
                  <td className="px-4 py-3"><EvidenceCell count={topic.globalVideoCount} detail={topic.globalTotalViews === null ? null : `조회 합계 ${formatNumber(topic.globalTotalViews)}`} unit="영상" /></td>
                  <td className="px-4 py-3"><EvidenceCell count={topic.koreaKeywordCount} detail={topic.koreaTopMonthlySearches === null ? null : `월 검색 상위 ${formatNumber(topic.koreaTopMonthlySearches)}`} unit="키워드" /></td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex rounded-md px-2 py-1 text-xs font-bold tabular-nums ring-1 ring-inset',
                      topic.confirmedStageCount === 3 ? 'bg-purple-50 text-purple-700 ring-purple-200' : 'bg-slate-100 text-slate-600 ring-slate-200',
                    )}>
                      {topic.confirmedStageCount}/3
                    </span>
                  </td>
                  <td className={cn('px-5 py-3 font-semibold', topic.rightsCheckRequired ? 'text-rose-700' : 'text-[var(--text-primary)]')}>{topic.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errors.length > 0 && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
          <AlertCircle size={14} />
          {errors.join('·')} 조회에 실패해 나머지 소스만 표시합니다.
        </div>
      )}
    </section>
  );
}

function EvidenceCell({ count, detail, unit }: { count: number; detail: string | null; unit: string }) {
  if (count === 0) return <span className="text-xs text-[var(--text-quaternary)]">검증 대기</span>;
  return (
    <div>
      <p className="font-semibold tabular-nums text-[var(--text-primary)]">{formatNumber(count)}개 {unit}</p>
      {detail && <p className="mt-0.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">{detail}</p>}
    </div>
  );
}

function ChinaSignals({ offers, capturedAt }: { offers: Hot1688OfferView[]; capturedAt: string | null }) {
  return (
    <SignalCard icon={Factory} title="중국 공급" subtitle="1688 검색 스냅샷" badge={capturedAt ? `저장 ${formatDateTime(capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '수집 대기'}>
      {offers.length === 0 ? (
        <CompactEmpty text="저장된 결과가 없습니다. 트렌드 수집에서 로그인·슬라이더 인증 또는 검색 결과를 확인하세요." />
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {offers.slice(0, 5).map((offer) => (
            <li key={offer.offerId} className="flex items-center gap-3 px-4 py-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--surface-sunken)]">
                {offer.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={offer.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : <Factory size={15} className="m-3.5 text-[var(--text-quaternary)]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{offer.title ?? offer.offerId}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">{offer.sourceKeyword} · 거래 표시 {offer.monthlySales === null ? '—' : formatNumber(offer.monthlySales)}</p>
              </div>
              {offer.sourceUrl && <a href={offer.sourceUrl} target="_blank" rel="noreferrer noopener" aria-label="1688 상품 열기" className="text-purple-600"><ArrowUpRight size={14} /></a>}
            </li>
          ))}
        </ul>
      )}
    </SignalCard>
  );
}

function GlobalSignals({ items, capturedAt }: { items: ShortsTrendView[]; capturedAt: string | null }) {
  return (
    <SignalCard icon={Globe2} title="글로벌 반응" subtitle="YouTube 최근 48시간 문구·완구 스냅샷" badge={capturedAt ? `저장 ${formatDateTime(capturedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '수집 대기'}>
      {items.length === 0 ? <CompactEmpty text="최근 수집분에 문구·완구 관련 영상이 없습니다." /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {items.slice(0, 5).map((item) => (
            <li key={item.videoKey} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600"><PlaySquare size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{item.title ?? item.videoKey}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">{item.keyword ?? '문구·완구'} · {item.channelName ?? '채널 미상'}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]"><Eye size={12} />{item.viewCount === null ? '—' : formatNumber(item.viewCount)}</span>
            </li>
          ))}
        </ul>
      )}
    </SignalCard>
  );
}

function KoreaSignals({ items, generatedAt, loading, error, warnings }: { items: Awaited<ReturnType<typeof fetchLiveNaverMarket>>['opportunities']; generatedAt: string | null; loading: boolean; error: boolean; warnings: string[] }) {
  return (
    <SignalCard icon={ShoppingBag} title="한국 수요" subtitle={warnings.length > 0 ? '검색광고 직접 조회 · DataLab 일부 실패' : '네이버 검색광고·DataLab 직접 조회'} badge={generatedAt ? `조회 ${formatDateTime(generatedAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '10분 갱신'}>
      {loading ? <CompactEmpty text="네이버 데이터를 불러오는 중입니다." loading /> : error ? <CompactEmpty text="네이버 연동을 확인해 주세요." error /> : (
        <>
          <ol className="divide-y divide-[var(--border-subtle)]">
            {items.slice(0, 5).map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{item.keyword}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">월 검색 {item.monthlySearches === null ? '—' : formatNumber(item.monthlySearches)} · 경쟁 {item.competition}</p>
                </div>
                {warnings.length === 0 && <span className={cn('text-[11px] font-bold tabular-nums', item.momentum > 0 ? 'text-emerald-600' : 'text-slate-500')}>{item.momentum > 0 ? '+' : ''}{item.momentum}%</span>}
              </li>
            ))}
          </ol>
          {warnings.length > 0 && (
            <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
              <AlertCircle size={13} className="shrink-0" />
              검색량 기준 후보입니다. 검색 상승률은 DataLab 복구 후 표시됩니다.
            </div>
          )}
        </>
      )}
    </SignalCard>
  );
}

function SourceCoverage({ context }: { context: SourceContext }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">데이터 소스 커버리지</h3>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">수집 방식과 제약을 소스별로 분리해 표시합니다.</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {GLOBAL_SOURCING_STAGES.map((stage) => (
          <div key={stage.id} className="rounded-lg border border-[var(--border)]">
            <p className="border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]">{stage.step}. {stage.label}</p>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {sourcesForStage(stage.id).map((source) => <SourceRow key={source.id} source={source} context={context} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceRow({ source, context }: { source: GlobalSourcingSource; context: SourceContext }) {
  const status = sourceStatus(source, context);
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--text-primary)]">{source.label}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-tertiary)]">{source.signal}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-quaternary)]">
          <span>{source.accessNote}</span>
          {source.evidenceUrl && (
            <a
              href={source.evidenceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-0.5 font-semibold text-purple-600 hover:text-purple-800"
            >
              {source.evidenceLabel ?? '공식 문서'} <ArrowUpRight size={10} />
            </a>
          )}
        </p>
      </div>
      <span className={cn('shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ring-1 ring-inset', status.className)}>{status.label}</span>
    </li>
  );
}

function NextConnectorQueue() {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">다음 실데이터 연동 순서</h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">공식성·자동화 가능성·문구·완구 관련성을 기준으로 정렬했습니다.</p>
        </div>
        <span className="self-start rounded-md bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700">연동 예정</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {GLOBAL_SOURCING_NEXT_CONNECTORS.map((connector) => (
          <article key={connector.id} className="rounded-lg border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-purple-700">우선순위 {connector.priority}</span>
              <Clock3 size={14} className="text-[var(--text-quaternary)]" />
            </div>
            <h4 className="mt-2 text-sm font-bold text-[var(--text-primary)]">{connector.label}</h4>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{connector.signal}</p>
            <p className="mt-3 text-[11px] font-semibold text-[var(--text-primary)]">{connector.access}</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">{connector.disclosure}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4 text-xs">
        <Link href="/rank-tracking" className="inline-flex items-center gap-1.5 font-semibold text-purple-700 hover:text-purple-900">쿠팡 순위 검증 <ArrowUpRight size={13} /></Link>
        <Link href="/sourcing-ai/wholesale-search" className="inline-flex items-center gap-1.5 font-semibold text-purple-700 hover:text-purple-900">공급처 검색 <ArrowUpRight size={13} /></Link>
      </div>
    </section>
  );
}

function SignalCard({ icon: Icon, title, subtitle, badge, children }: { icon: typeof Search; title: string; subtitle: string; badge: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={16} /></span><div><h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3><p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{subtitle}</p></div></div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-600">{badge}</span>
      </div>
      {children}
    </section>
  );
}

function PanelState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--text-tertiary)]">{icon}{text}</div>;
}

function CompactEmpty({ text, loading = false, error = false }: { text: string; loading?: boolean; error?: boolean }) {
  const Icon = loading ? Loader2 : error ? AlertCircle : Database;
  return <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-5 py-8 text-center text-xs leading-5 text-[var(--text-tertiary)]"><Icon size={19} className={loading ? 'animate-spin' : ''} /><p className="max-w-xs">{text}</p></div>;
}

interface SourceContext {
  chinaCount: number;
  globalCount: number;
  koreaCount: number;
  naverLoading: boolean;
  naverError: boolean;
  naverReady: boolean;
  naverWarning: boolean;
}

function StageCount({ stage, context }: { stage: GlobalSourcingStageId; context: SourceContext }) {
  const count = stage === 'china' ? context.chinaCount : stage === 'global' ? context.globalCount : context.koreaCount;
  const label = stage === 'china' ? '1688 오퍼' : stage === 'global' ? '관련 영상' : '키워드 후보';
  return <span className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">{formatNumber(count)}개 {label}</span>;
}

function sourceStatus(source: GlobalSourcingSource, context: SourceContext): { label: string; className: string } {
  if (source.id === '1688') return context.chinaCount > 0 ? collectedStatus() : { label: '수집·인증 확인', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
  if (source.id === 'youtube') return context.globalCount > 0 ? collectedStatus() : { label: '수집 대기', className: 'bg-slate-100 text-slate-600 ring-slate-200' };
  if (source.id === 'naver') {
    if (context.naverLoading) return { label: '연결 중', className: 'bg-slate-100 text-slate-600 ring-slate-200' };
    if (context.naverError) return { label: '연동 확인', className: 'bg-rose-50 text-rose-700 ring-rose-200' };
    if (context.naverWarning) return { label: '일부 연동', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
    return { label: '공식 API', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  }
  if (source.integrationMode === 'linked-feature') return { label: '기능 연결', className: 'bg-purple-50 text-purple-700 ring-purple-200' };
  if (source.integrationMode === 'research-snapshot') return { label: '리서치 참고', className: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return { label: '연동 예정', className: 'bg-white text-slate-500 ring-slate-200' };
}

function collectedStatus() {
  return { label: '수집 스냅샷', className: 'bg-purple-50 text-purple-700 ring-purple-200' };
}
