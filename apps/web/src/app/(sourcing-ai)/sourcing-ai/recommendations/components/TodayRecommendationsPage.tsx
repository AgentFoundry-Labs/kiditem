'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
  CheckCircle2,
  Loader2,
  PackageSearch,
  Radar,
  Search,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
  searchWingCatalogProducts,
} from '../../wing-catalog/lib/wing-catalog-extension';
import {
  rankedKeywordPoolToText,
  readRankedKeywordPool,
} from '../../lib/ranked-keyword-pool';
import {
  DEFAULT_TODAY_RECOMMENDATION_KEYWORDS,
  appendProductSnapshots,
  buildRecommendationSummary,
  buildRisingKeywordOpportunities,
  buildTodayRecommendationRows,
  mergeTodayRecommendationRows,
  readTodayRecommendationRows,
  readTodayRecommendationSnapshots,
  snapshotsToMap,
  writeTodayRecommendationRows,
  writeTodayRecommendationSnapshots,
  type ProductSnapshot,
  type RecommendationGrade,
  type TodayRecommendationRow,
} from '../lib/today-recommendations';
import {
  getTodaySourcingWorkspaceSnapshot,
  saveTodaySourcingWorkspaceSnapshot,
} from '../../lib/sourcing-workspace-snapshot-api';

const SAVED_STORAGE_KEY = 'kiditem:sourcing-ai:today-recommendation:saved';
const keywordLimitOptions = [10, 20, 50];
const pageOptions = [1, 2];

type TodayRecommendationsSnapshotPayload = {
  version: 1;
  rows: TodayRecommendationRow[];
  productSnapshots: ProductSnapshot[];
  savedIds: string[];
  keywordText: string;
  keywordLimit: number;
  maxPages: number;
  updatedAt: string;
};

export function TodayRecommendationsPage() {
  const [keywordText, setKeywordText] = useState(DEFAULT_TODAY_RECOMMENDATION_KEYWORDS.join('\n'));
  const [keywordPoolNotice, setKeywordPoolNotice] = useState<string | null>(null);
  const [keywordLimit, setKeywordLimit] = useState(10);
  const [maxPages, setMaxPages] = useState(1);
  const [rows, setRows] = useState<TodayRecommendationRow[]>(() => readTodayRecommendationRows());
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, keyword: '' });
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readSavedIds());
  const [editingKeywords, setEditingKeywords] = useState(false);
  const cancelRef = useRef(false);

  const summary = useMemo(() => buildRecommendationSummary(rows), [rows]);
  const aRows = rows.filter((row) => row.grade === 'A');
  const keywordOpportunities = useMemo(() => buildRisingKeywordOpportunities(rows).slice(0, 5), [rows]);

  const keywords = useMemo(() => (
    Array.from(new Set(
      keywordText
        .split(/\n|,/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    )).slice(0, keywordLimit)
  ), [keywordLimit, keywordText]);

  const applyKeywordAnalysisPool = useCallback(() => {
    const snapshot = readRankedKeywordPool();
    if (!snapshot || snapshot.entries.length === 0) {
      setKeywordPoolNotice('키워드 분석에서 순위 갱신을 한 뒤 돌아오면 TOP 키워드가 자동으로 들어옵니다.');
      return;
    }

    const limit = Math.max(...keywordLimitOptions);
    setKeywordText(rankedKeywordPoolToText(snapshot, limit));
    setKeywordPoolNotice(`키워드 분석 순위권 ${formatNumber(snapshot.entries.length)}개를 후보 풀로 가져왔습니다.`);
  }, []);

  const persistTodaySnapshot = useCallback((
    nextRows: TodayRecommendationRow[],
    nextProductSnapshots: ProductSnapshot[] = readTodayRecommendationSnapshots(),
    nextSavedIds: Set<string> = savedIds,
  ) => {
    const payload: TodayRecommendationsSnapshotPayload = {
      version: 1,
      rows: nextRows.slice(0, 100),
      productSnapshots: nextProductSnapshots.slice(0, 2000),
      savedIds: [...nextSavedIds],
      keywordText,
      keywordLimit,
      maxPages,
      updatedAt: new Date().toISOString(),
    };
    void saveTodaySourcingWorkspaceSnapshot('today_recommendations', payload).catch(() => {
      // Local storage remains the offline fallback when the API is unavailable.
    });
  }, [keywordLimit, keywordText, maxPages, savedIds]);

  useEffect(() => {
    let active = true;
    void getTodaySourcingWorkspaceSnapshot<TodayRecommendationsSnapshotPayload>('today_recommendations')
      .then(({ snapshot }) => {
        if (!active || !isTodayRecommendationsSnapshotPayload(snapshot?.payload)) return;
        const payload = snapshot.payload;
        setKeywordText(payload.keywordText);
        setKeywordLimit(payload.keywordLimit);
        setMaxPages(payload.maxPages);
        setRows(payload.rows);
        writeTodayRecommendationRows(payload.rows);
        writeTodayRecommendationSnapshots(payload.productSnapshots);
        const nextSavedIds = new Set(payload.savedIds);
        writeSavedIds(nextSavedIds);
        setSavedIds(nextSavedIds);
        setKeywordPoolNotice(`오늘 ${snapshot.businessDate} 저장된 추천 후보 ${formatNumber(payload.rows.length)}개를 불러왔습니다.`);
      })
      .catch(() => {
        // Keep localStorage fallback and manual execution available.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyKeywordAnalysisPool();
  }, [applyKeywordAnalysisPool]);

  const runRecommendations = async () => {
    if (keywords.length === 0) {
      setErrors(['키워드를 1개 이상 입력하세요.']);
      return;
    }

    cancelRef.current = false;
    setIsRunning(true);
    setRows([]);
    setErrors([]);
    setProgress({ current: 0, total: keywords.length, keyword: '' });

    let snapshots = readTodayRecommendationSnapshots();
    const previousSnapshots = snapshotsToMap(snapshots);
    let accumulated: TodayRecommendationRow[] = [];
    const nextErrors: string[] = [];

    for (let index = 0; index < keywords.length; index += 1) {
      if (cancelRef.current) break;
      const keyword = keywords[index];
      setProgress({ current: index + 1, total: keywords.length, keyword });

      try {
        const response = await searchWingCatalogProducts({ keyword, maxPages });
        const scored = buildTodayRecommendationRows({
          keyword,
          products: response.rows ?? [],
          previousSnapshots,
        });
        snapshots = appendProductSnapshots(scored, snapshots);
        writeTodayRecommendationSnapshots(snapshots);
        accumulated = mergeTodayRecommendationRows([...accumulated, ...scored]);
        const nextRows = accumulated.slice(0, 80);
        setRows(nextRows);
        writeTodayRecommendationRows(nextRows);
        persistTodaySnapshot(nextRows, snapshots);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextErrors.push(`${keyword}: ${message}`);
        setErrors([...nextErrors]);
        if (message.includes('확장프로그램') || message.includes('Wing 로그인')) break;
      }

      await sleep(700);
    }

    const finalRows = accumulated.slice(0, 80);
    writeTodayRecommendationRows(finalRows);
    if (finalRows.length > 0) persistTodaySnapshot(finalRows, snapshots);
    setRows(finalRows);
    setIsRunning(false);
    setProgress((current) => ({ ...current, keyword: cancelRef.current ? '중단됨' : '완료' }));
  };

  const cancelRun = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  const saveCandidate = (row: TodayRecommendationRow) => {
    const key = rowKey(row);
    const next = new Set(savedIds);
    next.add(key);
    writeSavedIds(next);
    setSavedIds(next);
    persistTodaySnapshot(rows, readTodayRecommendationSnapshots(), next);
  };

  return (
    <main className="min-h-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-6 py-6">
        <header className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-3 text-xs font-bold text-[var(--primary)]">
                <Radar size={14} />
                Wing 상품 추천
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-normal">오늘 추천 상품 후보</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                키워드 분석에서 고른 키워드나 직접 입력한 키워드를 Wing에서 검증해, 저리뷰 판매 상품과 전환 반응이 있는 후보만 봅니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryMini label="A급" value={`${formatNumber(summary.aCount)}개`} />
              <SummaryMini label="B급" value={`${formatNumber(summary.bCount)}개`} />
              <SummaryMini label="평균점수" value={`${formatNumber(summary.averageScore)}점`} />
              <SummaryMini label="강한 키워드" value={summary.strongestKeyword ?? '-'} />
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Search size={18} className="text-[var(--primary)]" />
                <h2 className="text-base font-black">Wing 검증 키워드 풀</h2>
              </div>
              <p className="mt-2 max-w-4xl text-xs font-bold leading-5 text-[var(--text-secondary)]">
                키워드 분석 순위권과 직접 입력 키워드를 Wing 카탈로그 검색으로 검증합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={applyKeywordAnalysisPool}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[#ffb89f] hover:text-[#d94112]"
            >
              순위권 다시 가져오기
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[var(--text-primary)]">후보 풀</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[var(--text-tertiary)]">
                    {keywordPoolNotice ?? '키워드 분석 순위권을 확인하는 중입니다.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingKeywords((current) => !current)}
                  className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-black text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  {editingKeywords ? '칩으로 보기' : '직접 편집'}
                </button>
              </div>

              {editingKeywords ? (
                <textarea
                  value={keywordText}
                  onChange={(event) => setKeywordText(event.target.value)}
                  className="h-[92px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm font-semibold leading-6 outline-none focus:border-[var(--primary)]"
                  placeholder="키워드를 줄바꿈으로 입력"
                />
              ) : (
                <div className="max-h-[92px] min-h-[92px] overflow-y-auto pr-1">
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {keywords.slice(0, 40).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-[var(--text-secondary)] shadow-sm">
                        {keyword}
                      </span>
                    ))}
                    {keywords.length > 40 && (
                      <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-[var(--text-tertiary)] shadow-sm">
                        +{formatNumber(keywords.length - 40)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={keywordLimit}
                  onChange={(event) => setKeywordLimit(Number(event.target.value))}
                  className="h-11 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none"
                >
                  {keywordLimitOptions.map((value) => <option key={value} value={value}>{value}개 키워드</option>)}
                </select>
                <select
                  value={maxPages}
                  onChange={(event) => setMaxPages(Number(event.target.value))}
                  className="h-11 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none"
                >
                  {pageOptions.map((value) => <option key={value} value={value}>{value}페이지씩</option>)}
                </select>
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_64px] gap-2">
                <button
                  type="button"
                  onClick={runRecommendations}
                  disabled={isRunning}
                  className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-sm font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunning ? <Loader2 size={17} className="animate-spin" /> : <PackageSearch size={17} />}
                  <span className="truncate">키워드 검증 시작</span>
                </button>
                <button
                  type="button"
                  onClick={cancelRun}
                  disabled={!isRunning}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-black text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  중단
                </button>
              </div>
              <ProgressBar current={progress.current} total={progress.total} label={progress.keyword} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
            <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <MetricCard icon={PackageSearch} label="추천 후보" value={`${formatNumber(summary.totalCandidates)}개`} caption="중복 제거 후" />
              <MetricCard icon={TrendingUp} label="A급 후보" value={`${formatNumber(aRows.length)}개`} caption="오늘 소싱 테스트" />
              <MetricCard icon={Radar} label="강한 키워드" value={summary.strongestKeyword ?? '-'} caption="Wing 반응 기준" />
              <MetricCard icon={CheckCircle2} label="보관" value={`${formatNumber(savedIds.size)}개`} caption="로컬 저장" />
            </section>

            <KeywordOpportunityPanel
              opportunities={keywordOpportunities}
              keywords={keywords}
              running={isRunning}
            />

            {errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                <div className="flex items-center gap-2 font-black">
                  <AlertCircle size={17} />
                  실행 메모
                </div>
                {errors.slice(0, 4).map((error) => <p key={error} className="mt-2">{error}</p>)}
              </div>
            )}

            <RecommendationsTable rows={rows} savedIds={savedIds} onSave={saveCandidate} />
        </section>
      </div>
    </main>
  );
}

function SummaryMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2">
      <p className="text-xs font-bold text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-tertiary)]">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{caption}</p>
    </article>
  );
}

function KeywordOpportunityPanel({
  opportunities,
  keywords,
  running,
}: {
  opportunities: ReturnType<typeof buildRisingKeywordOpportunities>;
  keywords: string[];
  running: boolean;
}) {
  if (opportunities.length > 0) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">지금 반응 좋은 키워드</h2>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">A/B급 상품이 붙은 키워드부터 소싱 후보로 봅니다.</p>
          </div>
          <span className="rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-xs font-black text-[var(--text-secondary)]">
            TOP {formatNumber(opportunities.length)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-5">
          {opportunities.map((item) => (
            <article key={item.keyword} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-black text-[var(--text-primary)]">{item.keyword}</p>
                <GradeBadge grade={item.grade} />
              </div>
              <p className="mt-2 text-2xl font-black text-[#ff5a1f]">{formatNumber(item.score)}점</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                <span>후보 {formatNumber(item.candidateCount)}개</span>
                <span>강함 {formatNumber(item.strongProductCount)}개</span>
                <span>저리뷰 {formatNumber(item.lowReviewProductCount)}개</span>
                <span>3일 {formatNumber(item.totalSales3d)}개</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-black">{running ? 'Wing 검증 진행 중' : '추천 후보 대기'}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-tertiary)]">
            키워드별 Wing 상품을 가져오면 저리뷰 판매력, 전환율, 3일 판매량을 기준으로 A/B/C 후보를 바로 정렬합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.slice(0, 10).map((keyword) => (
            <span key={keyword} className="rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5 text-xs font-black text-[var(--text-secondary)]">
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ current, total, label }: { current: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs font-bold text-[var(--text-tertiary)]">
        <span>{label || '대기중'}</span>
        <span>{total > 0 ? `${current}/${total}` : '-'}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="h-full rounded-full bg-[#ff5a1f] transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function RecommendationsTable({
  rows,
  savedIds,
  onSave,
}: {
  rows: TodayRecommendationRow[];
  savedIds: Set<string>;
  onSave: (row: TodayRecommendationRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="border-b border-[var(--border)] p-4">
        <h2 className="text-base font-black">뜨는 키워드 상품 검증 리스트</h2>
        <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">A급은 오늘 바로 공급가 확인, B급은 보류 검토, 관찰은 스냅샷을 더 쌓는 후보입니다.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
          <thead className="bg-[var(--surface-sunken)] text-xs font-black text-[var(--text-tertiary)]">
            <tr>
              {['등급', '상품', '검증 키워드', '점수', '저리뷰 판매력', '급상승 검증 신호', '가격', '리뷰', '3일 판매량', '전환율', '스냅샷 변화', '판단', ''].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-16 text-center text-sm font-bold text-[var(--text-tertiary)]">
                  `키워드 검증 시작`을 누르면 Wing 데이터를 분석해서 추천 후보가 표시됩니다.
                </td>
              </tr>
            ) : rows.map((row) => (
              <RecommendationRow
                key={rowKey(row)}
                row={row}
                saved={savedIds.has(rowKey(row))}
                onSave={() => onSave(row)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecommendationRow({ row, saved, onSave }: { row: TodayRecommendationRow; saved: boolean; onSave: () => void }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);

  return (
    <tr className="align-top transition hover:bg-[var(--surface-sunken)]">
      <td className="px-4 py-4"><GradeBadge grade={row.grade} /></td>
      <td className="px-4 py-4">
        <div className="flex min-w-[360px] gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
            {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <PackageSearch size={20} className="text-[var(--text-tertiary)]" />}
          </div>
          <div>
            <p className="font-black leading-5">{row.productName}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">상품ID {row.productId}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-xs font-bold text-[var(--text-secondary)]">{row.keywords.slice(0, 3).join(', ')}</td>
      <td className="px-4 py-4 text-lg font-black text-[#ff5a1f]">{row.score}</td>
      <td className="px-4 py-4 font-black">{row.newEntrySignal}</td>
      <td className="px-4 py-4 font-black">{formatNumber(row.marketReactionSignal)}점</td>
      <td className="px-4 py-4 font-bold">{formatKRW(row.salePrice)}원</td>
      <td className="px-4 py-4 font-bold">{formatNumber(row.ratingCount)}개</td>
      <td className="px-4 py-4">
        <p className="font-black">{formatNumber(resolveSalesLast3d(row))}개</p>
        <p className="mt-1 text-[11px] font-bold text-[var(--text-tertiary)]">
          {row.threeDaySalesTracked ? `${formatNumber(row.threeDayTrackingDays ?? 3)}일 추적` : '추적 대기'}
        </p>
      </td>
      <td className="px-4 py-4 font-bold">{formatWingCatalogRate(row.conversionRate28d)}</td>
      <td className="px-4 py-4 text-xs font-bold text-[var(--text-secondary)]">
        {deltaText(row)}
      </td>
      <td className="max-w-[260px] px-4 py-4">
        <div className="space-y-1">
          {row.reasons.slice(0, 2).map((reason) => <p key={reason} className="text-xs font-black text-[#268b7f]">{reason}</p>)}
          {row.risks.slice(0, 2).map((risk) => <p key={risk} className="text-xs font-bold text-amber-700">{risk}</p>)}
        </div>
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <BookmarkPlus size={14} />
          {saved ? '보관됨' : '보관'}
        </button>
      </td>
    </tr>
  );
}

function GradeBadge({ grade }: { grade: RecommendationGrade }) {
  return (
    <span className={cn('inline-flex h-8 min-w-12 items-center justify-center rounded-lg px-3 text-sm font-black', gradeClass(grade))}>
      {grade}
    </span>
  );
}

function gradeClass(grade: RecommendationGrade): string {
  if (grade === 'A') return 'bg-green-100 text-green-700';
  if (grade === 'B') return 'bg-blue-100 text-blue-700';
  if (grade === 'C') return 'bg-amber-100 text-amber-700';
  if (grade === 'WATCH') return 'bg-slate-100 text-slate-700';
  return 'bg-red-100 text-red-700';
}

function deltaText(row: TodayRecommendationRow): string {
  const parts = [];
  if (row.salesDelta != null) parts.push(`판매 ${row.salesDelta >= 0 ? '+' : ''}${row.salesDelta}`);
  if (row.viewDelta != null) parts.push(`조회 ${row.viewDelta >= 0 ? '+' : ''}${row.viewDelta}`);
  if (row.reviewDelta != null) parts.push(`리뷰 ${row.reviewDelta >= 0 ? '+' : ''}${row.reviewDelta}`);
  return parts.length > 0 ? parts.join(' / ') : '첫 스냅샷';
}

function isTodayRecommendationsSnapshotPayload(value: unknown): value is TodayRecommendationsSnapshotPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<TodayRecommendationsSnapshotPayload>;
  return payload.version === 1 &&
    Array.isArray(payload.rows) &&
    Array.isArray(payload.productSnapshots) &&
    Array.isArray(payload.savedIds) &&
    typeof payload.keywordText === 'string' &&
    typeof payload.keywordLimit === 'number' &&
    typeof payload.maxPages === 'number';
}

function readSavedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSavedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...ids]));
}

function rowKey(row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId'>): string {
  return `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`;
}

function resolveSalesLast3d(row: TodayRecommendationRow): number {
  return row.salesLast3d ?? Math.max(0, Math.round(((row.salesLast28d ?? 0) / 28) * 3));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
