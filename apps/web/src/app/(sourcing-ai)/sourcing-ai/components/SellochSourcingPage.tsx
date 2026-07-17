'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Download,
  Home,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  sourcingReports,
  sourcingRows,
  trendKeywords,
  type SourcingReport,
} from '../lib/sourcing-ai-dashboard';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-extension';
import { HomeRankingBoard } from './SellochSourcingHomeRankings';
import { SellochMarketAnalysisPage } from './SellochMarketAnalysisPage';
import { CompetitorTrackingPage } from '../competitor-analysis/components/CompetitorTrackingPage';
import { SourcingHomeHero } from './SourcingHomeHero';
import { SellochFinalSelectionPage } from './SellochFinalSelectionPage';
import { SellochWholesaleCoupangMatches } from './SellochWholesaleCoupangMatches';
import { SellochWholesaleKeywordSearch } from './SellochWholesaleKeywordSearch';
import { SellochWholesaleRankingTabs } from './SellochWholesaleRankingTabs';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

export type SellochSourcingPageKind =
  | 'home'
  | 'recommendations'
  | 'keywords'
  | 'market'
  | 'competitor'
  | 'category'
  | 'wholesale'
  | 'validation'
  | 'final';

const pageMeta: Record<SellochSourcingPageKind, { title: string }> = {
  home: {
    title: '홈',
  },
  recommendations: {
    title: '오늘의 추천',
  },
  keywords: {
    title: '키워드 분석',
  },
  market: {
    title: '시장분석',
  },
  competitor: {
    title: '경쟁업체 분석',
  },
  category: {
    title: '카테고리 소싱',
  },
  wholesale: {
    title: '도매상품',
  },
  validation: {
    title: '상품 검증',
  },
  final: {
    title: '소싱 에이전트',
  },
};

export function SellochSourcingPage({ kind }: { kind: SellochSourcingPageKind }) {
  const meta = pageMeta[kind];

  return (
    <main className="min-h-full bg-transparent text-[#171923]">
      <div className={cn(
        'flex w-full flex-col',
        kind === 'final' ? 'gap-0 px-0 py-0' : 'gap-10 px-8 py-8',
      )}>
        {kind !== 'home' && kind !== 'final' && <PageTitle title={meta.title} />}

        {kind === 'home' && <HomePage />}
        {kind === 'recommendations' && <RecommendationsPage />}
        {kind === 'keywords' && <KeywordsPage />}
        {kind === 'market' && <MarketPage />}
        {kind === 'competitor' && <CompetitorTrackingPage />}
        {kind === 'category' && <CategoryPage />}
        {kind === 'wholesale' && <WholesalePage />}
        {kind === 'validation' && <ValidationPage />}
        {kind === 'final' && <SellochFinalSelectionPage />}
      </div>
    </main>
  );
}

function PageTitle({ title }: { title: string }) {
  return (
    <header className="w-full pt-2">
      <h1 className="text-3xl font-black tracking-normal text-[#111827]">{title}</h1>
    </header>
  );
}

function HomePage() {
  return (
    <div className="space-y-8">
      <SourcingHomeHero />
      <TodayRecommendationImageRail />
      <HomeRankingBoard />

      <SellochMarketAnalysisPage compact />
    </div>
  );
}

type TodayRecommendationSnapshotPayload = {
  result?: {
    rows?: TodayRecommendationRow[];
  };
};

function TodayRecommendationImageRail() {
  const localRows = useTodayRecommendationRows();
  const [snapshotRows, setSnapshotRows] = useState<TodayRecommendationRow[]>([]);

  useEffect(() => {
    let active = true;

    getTodaySourcingWorkspaceSnapshot<TodayRecommendationSnapshotPayload>('today_recommendations')
      .then(({ snapshot }) => {
        if (!active) return;
        const rows = snapshot?.payload?.result?.rows;
        if (Array.isArray(rows)) setSnapshotRows(rows);
      })
      .catch(() => {
        if (active) setSnapshotRows([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const recommendationRows = useMemo(() => {
    const source = localRows.length > 0 ? localRows : snapshotRows;
    const seen = new Set<string>();

    return [...source]
      .filter((row) => {
        const key = recommendationRowKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
  }, [localRows, snapshotRows]);

  return (
    <section className="rounded-[22px] border border-[#dbe5f4] bg-white/88 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#6d5dfc]">오늘의 추천</p>
          <h2 className="mt-1 text-xl font-black tracking-normal text-[#111827]">실시간 후보 상품</h2>
        </div>
        <span className="rounded-full border border-[#e3eaf5] bg-[#f7faff] px-3 py-1.5 text-xs font-black text-[#64748b]">
          {recommendationRows.length > 0 ? `${formatNumber(recommendationRows.length)}개 표시` : '검증 대기'}
        </span>
      </div>

      {recommendationRows.length > 0 ? (
        <div className="mt-4 grid snap-x grid-flow-col auto-cols-[calc((100%-0.75rem)/2)] gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] md:auto-cols-[calc((100%-2.25rem)/4)] xl:auto-cols-[calc((100%-3.75rem)/6)]">
          {recommendationRows.map((row) => (
            <TodayRecommendationImageCard key={recommendationRowKey(row)} row={row} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#cfd9e8] bg-[#f7faff] px-4 py-6 text-sm font-bold text-[#667085]">
          오늘의 추천에서 Wing 검증을 실행하면 상품 이미지가 한 줄 레일로 표시됩니다.
        </div>
      )}
    </section>
  );
}

function TodayRecommendationImageCard({ row }: { row: TodayRecommendationRow }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);
  const salesLast3d = row.salesLast3d > 0 ? row.salesLast3d : row.salesLast28d ?? 0;

  return (
    <article className="min-w-0 snap-start overflow-hidden rounded-2xl border border-[#dbe5f4] bg-white">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[#f1f5fb]">
        {imageUrl ? (
          <img src={imageUrl} alt={row.productName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingCart size={28} className="text-[#9aa8ba]" />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-[#ff5a1f] ring-1 ring-[#f0d4c7]">
          {row.grade}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-[#111827]">{row.productName}</p>
        <div className="flex items-center justify-between gap-2 text-[11px] font-black text-[#667085]">
          <span className="truncate">{row.primaryKeyword}</span>
          <span className="text-[#6d5dfc]">{row.score}점</span>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[11px] font-bold text-[#667085]">
          <span>
            판매 <b className="text-[#111827]">{formatNumber(salesLast3d)}</b>
          </span>
          <span className="text-right">
            리뷰 <b className="text-[#111827]">{formatNumber(row.ratingCount ?? 0)}</b>
          </span>
        </div>
        <p className="text-sm font-black text-[#111827]">{formatKRW(row.salePrice)}원</p>
      </div>
    </article>
  );
}

function recommendationRowKey(row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId' | 'productName'>): string {
  return [row.productId, row.itemId, row.vendorItemId, row.productName].filter(Boolean).join(':');
}

function RecommendationsPage() {
  return (
    <div className="grid w-full gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        {sourcingReports.map((report) => (
          <ReportListCard key={report.id} report={report} />
        ))}
      </section>
      <StickyPanel title="오늘 추천 키워드">
        <div className="space-y-2">
          {trendKeywords.slice(0, 8).map((keyword) => (
            <KeywordMiniRow key={keyword.keyword} rank={keyword.rank} label={keyword.keyword} meta={keyword.category} value={formatNumber(keyword.searchVolume)} />
          ))}
        </div>
      </StickyPanel>
    </div>
  );
}

function KeywordsPage() {
  return (
    <div className="w-full space-y-8">
      <SearchHero placeholder="분석할 키워드를 입력해주세요." compact />
      <MarketplaceFilter />
      <DataTable title="키워드 분석 결과" right={<DownloadButton />}>
        <KeywordTableRows />
      </DataTable>
    </div>
  );
}

function MarketPage() {
  return <SellochMarketAnalysisPage />;
}

function CategoryPage() {
  return (
    <div className="w-full space-y-8">
      <CategorySearchBox />
      <p className="text-sm font-bold text-[#6b7280]">
        2026.05.17 <span className="font-black text-[#111827]">711,412개</span>의 데이터가 업데이트 되었습니다.
      </p>
      <DataTable title="카테고리 소싱 결과" right={<DownloadButton />}>
        <tr className="border-b border-[#e5e7eb] bg-[#f6f7f9] text-xs font-black text-[#4b5563]">
          {['키워드', '카테고리', '신규진입', '브랜드', '쇼핑성', '경쟁률', '최근 1개월 검색량', '예상 1개월 검색량', '네이버 상품수'].map((header) => (
            <th key={header} className="whitespace-nowrap px-4 py-4">{header}</th>
          ))}
        </tr>
        {trendKeywords.slice(0, 5).map((item) => (
          <tr key={item.keyword} className="border-b border-[#eef1f5] bg-white text-sm font-bold text-[#374151]">
            <td className="px-4 py-4 font-black text-[#111827]">{item.keyword}</td>
            <td className="px-4 py-4">{item.category}</td>
            <td className="px-4 py-4 text-[#6d5dfc]">상승</td>
            <td className="px-4 py-4">낮음</td>
            <td className="px-4 py-4">높음</td>
            <td className="px-4 py-4">{item.competition.toFixed(2)}</td>
            <td className="px-4 py-4">{formatNumber(item.searchVolume)}</td>
            <td className="px-4 py-4">{formatNumber(Math.round(item.searchVolume * 1.18))}</td>
            <td className="px-4 py-4">{formatNumber(item.productCount)}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function WholesalePage() {
  return (
    <div className="w-full space-y-8">
      <SearchHero placeholder="1688 상품 URL 또는 상품명(한/중/영)을 입력해 주세요" compact homeButton />
      <div className="space-y-5">
        <SellochWholesaleRankingTabs />
        <SellochWholesaleKeywordSearch />
        <SellochWholesaleCoupangMatches />
      </div>
    </div>
  );
}

function ValidationPage() {
  return (
    <div className="w-full space-y-6">
      <DataTable title="상품 검증 큐" right={<span className="text-xs font-black text-[#6d5dfc]">마진 · 인증 · 옵션</span>}>
        <tr className="border-b border-[#e5e7eb] bg-[#f6f7f9] text-xs font-black text-[#4b5563]">
          {['상품 후보', '카테고리', '점수', '예상 마진', '리스크', '다음 작업'].map((header) => (
            <th key={header} className="whitespace-nowrap px-4 py-4">{header}</th>
          ))}
        </tr>
        {sourcingRows.map((row) => (
          <tr key={row.id} className="border-b border-[#eef1f5] bg-white text-sm font-bold text-[#374151]">
            <td className="px-4 py-4 font-black text-[#111827]">{row.keyword}</td>
            <td className="px-4 py-4">{row.category}</td>
            <td className="px-4 py-4 text-[#6d5dfc]">{row.score}</td>
            <td className="px-4 py-4">{Math.round(row.cost.marginRate)}%</td>
            <td className="px-4 py-4">{row.risks.slice(0, 2).join(', ')}</td>
            <td className="px-4 py-4">{row.nextStep}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function SearchHero({ placeholder, compact = false, homeButton = false }: { placeholder: string; compact?: boolean; homeButton?: boolean }) {
  return (
    <section className={cn('w-full', compact ? 'mt-0' : '-mt-2')}>
      <div className="flex h-16 items-center rounded-full bg-gradient-to-r from-[#6d5dfc] to-[#59c7e8] p-[2px] shadow-[0_18px_44px_rgba(93,95,239,0.16)]">
        <div className="flex h-full w-full items-center gap-3 rounded-full bg-white px-6">
          {homeButton && <Home size={22} className="text-[#b5482b]" />}
          <input className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-bold text-[#111827] outline-none placeholder:text-[#c1c7d0]" placeholder={placeholder} />
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#20a5d8]">
            <Search size={26} />
          </button>
        </div>
      </div>
    </section>
  );
}

function CategorySearchBox() {
  return (
    <section className="w-full rounded-[22px] border border-[#eef1f5] bg-white p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center gap-3 text-sm font-black text-[#111827]">
        <span>선택 모드</span>
        <span className="relative h-6 w-12 rounded-full bg-[#eef1f5]">
          <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow" />
        </span>
        <span>검색 모드</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_64px]">
        {['1차분류', '2차분류', '3차분류', '4차분류'].map((label, index) => (
          <button key={label} type="button" className={cn('flex h-16 items-center justify-between rounded-xl bg-[#fbfbfc] px-6 text-sm font-black ring-1 ring-[#eef1f5]', index > 0 && 'text-[#c3c8d0]')}>
            {label}
            <ChevronDown size={16} />
          </button>
        ))}
        <button type="button" className="flex h-16 items-center justify-center rounded-xl bg-[#4e6cf5] text-white shadow-[0_12px_24px_rgba(78,108,245,0.24)]">
          <Search size={26} />
        </button>
      </div>
    </section>
  );
}

function MarketplaceFilter() {
  return (
    <section className="grid w-full grid-cols-[140px_1fr] overflow-hidden rounded-[22px] border border-[#eef1f5] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      {[
        ['네이버', ['국내', '해외', 'N배송']],
        ['쿠팡', ['국내', '해외', '로켓배송', '판매자 로켓', '로켓직구']],
        ['지마켓', ['국내', '해외', '스타배송']],
      ].map(([market, values]) => (
        <div key={market as string} className="contents">
          <div className="bg-[#f8fafc] px-6 py-4 text-sm font-black text-[#10a64a]">{market}</div>
          <div className="flex flex-wrap gap-2 px-6 py-3">
            {(values as string[]).map((value) => (
              <button key={value} type="button" className="rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-bold text-[#6b7280]">
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function DataTable({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#eef1f5] bg-white">
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-base font-black text-[#111827]">{title}</h2>
        {right}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">{children}</table>
      </div>
    </section>
  );
}

function KeywordTableRows() {
  return (
    <>
      <tr className="border-b border-[#e5e7eb] bg-[#f6f7f9] text-xs font-black text-[#4b5563]">
        {['순위', '키워드', '카테고리', '검색수', '상품수', '경쟁', '변동'].map((header) => (
          <th key={header} className="whitespace-nowrap px-4 py-4">{header}</th>
        ))}
      </tr>
      {trendKeywords.map((item) => (
        <tr key={item.keyword} className="border-b border-[#eef1f5] bg-white text-sm font-bold text-[#374151]">
          <td className="px-4 py-4 font-black">{item.rank}</td>
          <td className="px-4 py-4 font-black text-[#111827]">{item.keyword}</td>
          <td className="px-4 py-4">{item.category}</td>
          <td className="px-4 py-4">{formatNumber(item.searchVolume)}</td>
          <td className="px-4 py-4">{formatNumber(item.productCount)}</td>
          <td className="px-4 py-4">{item.competition.toFixed(2)}</td>
          <td className="px-4 py-4 text-[#ef4444]">▲ {item.movement}</td>
        </tr>
      ))}
    </>
  );
}

function ReportListCard({ report, compact = false }: { report: SourcingReport; compact?: boolean }) {
  return (
    <article className="rounded-[22px] border border-[#eef1f5] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#eaf4ff] px-3 py-1 text-xs font-black text-[#2f80ed]">지금 가능</span>
          <span className="rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-black text-[#6b7280]">{report.category}</span>
        </div>
        <span className="text-xs font-black text-[#9ca3af]">{report.dateLabel}</span>
      </div>
      <h2 className="mt-4 text-xl font-black text-[#111827]">{report.title}</h2>
      <p className={cn('mt-3 text-sm font-bold leading-7 text-[#4b5563]', compact && 'line-clamp-2')}>{report.summary}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="네이버 평균 판매가" value={`${formatKRW(report.priceAnalysis.naverAvgKrw)}원`} />
        <Metric label="도매 평균 매입가" value={`${formatKRW(report.priceAnalysis.wholesaleAvgKrw)}원`} />
        <Metric label="예상 마진율" value={`${report.priceAnalysis.estimatedMarginRate}%`} blue />
      </div>
    </article>
  );
}

function StickyPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-[22px] border border-[#eef1f5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] xl:sticky xl:top-6 xl:self-start">
      <h2 className="mb-4 text-base font-black text-[#111827]">{title}</h2>
      {children}
    </aside>
  );
}

function KeywordMiniRow({ rank, label, meta, value }: { rank: number; label: string; meta: string; value: string }) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl bg-[#fbfbfc] px-3 py-3">
      <span className="text-sm font-black text-[#6d5dfc]">{rank}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#111827]">{label}</p>
        <p className="text-xs font-bold text-[#9ca3af]">{meta}</p>
      </div>
      <span className="text-xs font-black text-[#111827]">{value}</span>
    </div>
  );
}

function Metric({ label, value, blue = false }: { label: string; value: string; blue?: boolean }) {
  return (
    <div className={cn('rounded-xl bg-[#f6f7f9] px-4 py-4 text-center', blue && 'bg-[#eaf4ff]')}>
      <p className="text-xs font-bold text-[#9ca3af]">{label}</p>
      <p className={cn('mt-1 text-lg font-black text-[#111827]', blue && 'text-[#2f80ed]')}>{value}</p>
    </div>
  );
}

function DownloadButton() {
  return (
    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#f2f5ff] px-4 text-xs font-black text-[#4e6cf5]">
      엑셀 다운로드
      <Download size={14} />
    </button>
  );
}
