'use client';

import {
  Bookmark,
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
  topSellingProducts,
  trendKeywords,
  wholesaleProducts,
  type SourcingReport,
  type WholesaleProduct,
} from '../lib/sourcing-ai-dashboard';
import { HomeRankingBoard } from './SellochSourcingHomeRankings';
import { RealtimeSourcingTerminal } from './SellochRealtimeTerminal';

export type SellochSourcingPageKind =
  | 'home'
  | 'recommendations'
  | 'keywords'
  | 'market'
  | 'category'
  | 'wholesale'
  | 'validation'
  | 'saved';

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
  category: {
    title: '카테고리 소싱',
  },
  wholesale: {
    title: '도매상품',
  },
  validation: {
    title: '상품 검증',
  },
  saved: {
    title: '보관함',
  },
};

export function SellochSourcingPage({ kind }: { kind: SellochSourcingPageKind }) {
  const meta = pageMeta[kind];

  return (
    <main className="min-h-full bg-transparent text-[#171923]">
      <div className="flex w-full flex-col gap-10 px-8 py-8">
        {kind !== 'home' && <PageTitle title={meta.title} />}

        {kind === 'home' && <HomePage />}
        {kind === 'recommendations' && <RecommendationsPage />}
        {kind === 'keywords' && <KeywordsPage />}
        {kind === 'market' && <MarketPage />}
        {kind === 'category' && <CategoryPage />}
        {kind === 'wholesale' && <WholesalePage />}
        {kind === 'validation' && <ValidationPage />}
        {kind === 'saved' && <SavedPage />}
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
    <div className="space-y-10">
      <RealtimeSourcingTerminal />
      <HomeRankingBoard />

      <MarketSection />
    </div>
  );
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
  return (
    <div className="space-y-8">
      <SearchHero placeholder="검색어 또는 카테고리를 입력해보세요" compact />
      <MarketSection />
    </div>
  );
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
      <div className="grid gap-7 xl:grid-cols-[260px_1fr]">
        <FilterSidebar />
        <div className="space-y-5">
          <HorizontalTabs items={['인기상품', '주차번호판', '강아지계단', '안전벨트클립', '식탁매트']} activeIndex={0} />
          <WholesaleProductGrid products={wholesaleProducts} />
        </div>
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

function SavedPage() {
  return (
    <div className="grid w-full gap-6 xl:grid-cols-2">
      <SavedBox title="보관한 리포트" count={2}>
        {sourcingReports.slice(0, 2).map((report) => (
          <ReportListCard key={report.id} report={report} compact />
        ))}
      </SavedBox>
      <SavedBox title="비교 중인 상품" count={3}>
        {wholesaleProducts.slice(0, 3).map((product) => (
          <CompareRow key={product.id} product={product} />
        ))}
      </SavedBox>
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

function MarketSection() {
  return (
    <section className="w-full rounded-[28px] bg-gradient-to-r from-[#e7fbfb] to-[#f1f0ff] px-8 py-8">
      <div className="space-y-4">
        <ChipLine label="성별/연령대" items={['전체', '10대 여성', '10대 남성', '20대 여성', '20대 남성', '30대 여성', '40대 여성', '50대 남성']} />
        <ChipLine label="카테고리" items={['전체', '패션의류', '패션잡화', '화장품/미용', '디지털/가전', '가구/인테리어', '출산/육아', '식품', '생활/건강']} />
      </div>

      <div className="mt-8">
        <ProductRankPanel />
      </div>
    </section>
  );
}

function ProductRankPanel() {
  const koreanTrendProducts = Array.from({ length: 40 }, (_, index) => {
    const product = topSellingProducts[index % topSellingProducts.length];
    const signal = sourcingRows[index % sourcingRows.length];
    const recentRegistrations = signal.demand.newProductDelta;
    const searchVolume = signal.demand.searchVolume;

    return {
      ...product,
      title: index < topSellingProducts.length ? product.title : `${product.title} ${Math.floor(index / topSellingProducts.length) + 1}`,
      category: '문구',
      marginRate: Math.round(signal.cost.marginRate),
      recentRegistrations,
      searchVolume,
      competitionScore: signal.demand.competitionScore,
      trendScore: recentRegistrations * 100000 + searchVolume,
    };
  })
    .sort((a, b) => b.trendScore - a.trendScore)
    .map((product, index) => ({ ...product, rank: index + 1 }));

  return (
    <section className="rounded-[22px] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#111827]">최근 트렌드 상품</h2>
          <p className="mt-1 text-xs font-bold text-[#7a8494]">최근 3일 상품등록 증가와 검색량 반응을 우선으로 봅니다. 마진과 경쟁은 보조 판단값입니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['3일등록', '검색량', '보조: 마진', '보조: 경쟁'].map((metric, index) => (
            <span
              key={metric}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-black ring-1',
                index < 2 ? 'bg-[#eef2ff] text-[#6d5dfc] ring-[#ddd6fe]' : 'bg-[#f6f7f9] text-[#6b7280] ring-[#e5e7eb]',
              )}
            >
              {metric}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
        {koreanTrendProducts.map((product) => (
          <article key={product.rank} className="min-w-0">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#eef1f5]">
              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-0 top-0 bg-[#111827] px-2 py-1 text-xs font-black text-white">{product.rank}</span>
            </div>
            <h3 className="mt-2 line-clamp-2 min-h-9 text-xs font-black leading-4 text-[#111827]">{product.title}</h3>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-[11px] font-bold text-[#7a8494]">{product.category}</p>
              <p className="shrink-0 text-xs font-black text-[#111827]">{formatKRW(product.priceKrw)}원</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <TrendMetric label="3일등록" value={`+${product.recentRegistrations}`} tone="primary" />
              <TrendMetric label="검색량" value={formatNumber(product.searchVolume)} tone="primary" />
              <TrendMetric label="마진" value={`${product.marginRate}%`} />
              <TrendMetric label="경쟁" value={`${product.competitionScore}`} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TrendMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' }) {
  return (
    <div className={cn('rounded-md px-1.5 py-1 ring-1', tone === 'primary' ? 'bg-[#eef2ff] ring-[#ddd6fe]' : 'bg-[#f8fafc] ring-[#eef1f5]')}>
      <p className={cn('text-[10px] font-bold leading-none', tone === 'primary' ? 'text-[#6d5dfc]' : 'text-[#9ca3af]')}>{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-black leading-tight text-[#111827]">{value}</p>
    </div>
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

function FilterSidebar() {
  return (
    <aside className="space-y-7 border-r border-[#eef1f5] pr-7">
      <div>
        <div className="flex items-center justify-between text-sm font-black text-[#111827]">
          <span>필터 옵션</span>
          <button type="button" className="text-xs text-[#9ca3af]">초기화</button>
        </div>
      </div>
      <FilterGroup title="가격 범위 (元)" items={['최소', '최대']} inputs />
      <FilterGroup title="배송 옵션" items={['당일 배송', '24시간 내 배송', '48시간 내 배송']} />
      <FilterGroup title="평점" items={['전체', '5점', '4.5-5.0점', '4.0-4.5점']} />
      <FilterGroup title="24시간 내 발송 비율" items={['전체', '95% 미만', '95% 이상', '99% 이상']} />
    </aside>
  );
}

function FilterGroup({ title, items, inputs = false }: { title: string; items: string[]; inputs?: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-black text-[#111827]">{title}</h2>
      {inputs ? (
        <div className="space-y-2">
          {items.map((item) => (
            <input key={item} placeholder={item} className="h-11 w-full rounded-lg border border-[#eef1f5] px-4 text-sm font-bold outline-none placeholder:text-[#c3c8d0]" />
          ))}
          <button type="button" className="h-11 w-full rounded-lg bg-[#b5482b] text-sm font-black text-white">적용</button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <label key={item} className="flex items-center gap-2 text-sm font-bold text-[#4b5563]">
              <span className={cn('h-4 w-4 rounded border border-[#cfd6df]', index === 0 && 'border-[#b5482b] bg-[#b5482b]')} />
              {item}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function WholesaleProductGrid({ products }: { products: WholesaleProduct[] }) {
  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {products.map((product) => (
        <article key={product.id} className="overflow-hidden rounded-[20px] border border-[#eef1f5] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          <div className="relative aspect-square bg-[#f3f4f6]">
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
            <button type="button" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#9ca3af] shadow">
              <Bookmark size={17} />
            </button>
            <span className="absolute left-3 top-3 rounded-lg bg-[#2f80ed] px-2 py-1 text-xs font-black text-white">PLUS</span>
          </div>
          <div className="p-4">
            <h3 className="line-clamp-2 min-h-11 text-sm font-black leading-6 text-[#111827]">{product.title}</h3>
            <p className="mt-3 text-xl font-black text-[#b5482b]">{formatKRW(product.priceKrw)}원</p>
            <p className="mt-1 text-xs font-bold text-[#7a8494]">월 {formatNumber(product.minOrder * 46)}개 판매 · 재구매 {Math.round(product.minOrder * 1.7)}%</p>
            <button type="button" className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2f80ed] text-sm font-black text-white">
              <ShoppingCart size={16} />
              상품 판매하기
            </button>
          </div>
        </article>
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

function ChipLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-2 min-w-20 text-sm font-black text-[#111827]">{label}</span>
      {items.map((item, index) => (
        <button key={item} type="button" className={cn('rounded-full border px-4 py-2 text-sm font-black', index === 0 ? 'border-[#6d5dfc] bg-white text-[#6d5dfc]' : 'border-[#dbe2ea] bg-white/70 text-[#7a8494]')}>
          {item}
        </button>
      ))}
    </div>
  );
}

function HorizontalTabs({ items, activeIndex }: { items: string[]; activeIndex: number }) {
  return (
    <div className="flex flex-wrap gap-8 border-b border-[#eef1f5] text-sm font-black">
      {items.map((item, index) => (
        <button key={item} type="button" className={cn('border-b-2 px-1 pb-3', index === activeIndex ? 'border-[#b5482b] text-[#b5482b]' : 'border-transparent text-[#4b5563]')}>
          {item}
        </button>
      ))}
    </div>
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

function SavedBox({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[#eef1f5] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-black text-[#111827]">{title}</h2>
        <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-black text-[#6d5dfc]">{count}개</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function CompareRow({ product }: { product: WholesaleProduct }) {
  return (
    <article className="flex gap-4 rounded-xl bg-[#fbfbfc] p-3">
      <img src={product.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-black text-[#111827]">{product.title}</h3>
        <p className="mt-2 text-sm font-black text-[#b5482b]">{formatKRW(product.priceKrw)}원</p>
      </div>
    </article>
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
