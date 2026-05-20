import { formatKRW, formatNumber } from '@/lib/utils';
import {
  sourcingReports,
  sourcingRows,
  topSellingProducts,
  trendKeywords,
  wholesaleCategories,
  wholesaleProducts,
} from '../lib/sourcing-ai-dashboard';

type RankingItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
};

export function HomeRankingBoard() {
  const recommendationItems = [
    ...sourcingReports.map((report) => ({
      id: report.id,
      title: report.title,
      meta: report.category,
      value: report.status === 'ready' ? '지금 가능' : '관찰',
    })),
    ...sourcingRows.map((row) => ({
      id: row.id,
      title: row.keyword,
      meta: row.category,
      value: `${row.score}점`,
    })),
    ...trendKeywords.map((keyword) => ({
      id: `keyword-${keyword.keyword}`,
      title: keyword.keyword,
      meta: keyword.category,
      value: `+${keyword.movement}`,
    })),
  ].slice(0, 10);
  const keywordItems = trendKeywords.slice(0, 10).map((keyword) => ({
    id: keyword.keyword,
    title: keyword.keyword,
    meta: keyword.category,
    value: formatNumber(keyword.searchVolume),
  }));
  const marketItems = [
    ...topSellingProducts.map((product) => ({
      id: String(product.rank),
      title: product.title,
      meta: `${formatKRW(product.priceKrw)}원`,
      value: `리뷰 ${formatNumber(product.reviewCount)}`,
    })),
    ...wholesaleProducts.map((product) => ({
      id: product.id,
      title: product.title,
      meta: product.category,
      value: `${formatKRW(product.priceKrw)}원`,
    })),
  ].slice(0, 10);
  const categoryItems = [
    ...wholesaleCategories.flatMap((category) =>
      category.children.map((child) => ({
        id: `${category.id}-${child}`,
        title: child,
        meta: category.label,
        value: '소싱',
      })),
    ),
    ...trendKeywords.map((keyword) => ({
      id: `trend-category-${keyword.keyword}`,
      title: keyword.category,
      meta: keyword.keyword,
      value: formatNumber(keyword.productCount),
    })),
  ].slice(0, 10);
  const koreanNewProductItems = [
    ...sourcingRows
      .toSorted((a, b) => b.demand.newProductDelta - a.demand.newProductDelta)
      .map((row) => ({
        id: `new-${row.id}`,
        title: row.keyword,
        meta: row.category,
        value: `신규 +${row.demand.newProductDelta}`,
      })),
    ...trendKeywords.map((keyword) => ({
      id: `new-keyword-${keyword.keyword}`,
      title: keyword.keyword,
      meta: keyword.category,
      value: `${formatNumber(keyword.productCount)}개`,
    })),
  ].slice(0, 10);

  return (
    <section className="grid w-full gap-3 xl:grid-cols-5">
      <RankingPanel title="오늘의 추천" caption="AI 리포트 추천순" items={recommendationItems} />
      <RankingPanel title="키워드 순위" caption="검색량 기준" items={keywordItems} />
      <RankingPanel title="시장 분석" caption="판매 상품 흐름" items={marketItems} />
      <RankingPanel title="카테고리 순위" caption="소싱 카테고리 후보" items={categoryItems} />
      <RankingPanel title="한국 신상품 순위" caption="신규 등록 증가 기준" items={koreanNewProductItems} />
    </section>
  );
}

function RankingPanel({ title, caption, items }: { title: string; caption: string; items: RankingItem[] }) {
  return (
    <article className="rounded-[22px] border border-[#eef1f5] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#111827]">{title}</h2>
          <p className="mt-0.5 text-[11px] font-black text-[#9ca3af]">{caption}</p>
        </div>
        <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-black text-[#6d5dfc]">TOP 10</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.map((item, index) => (
          <RankedSummaryItem key={item.id} index={index + 1} item={item} />
        ))}
      </div>
    </article>
  );
}

function RankedSummaryItem({ index, item }: { index: number; item: RankingItem }) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-lg border border-[#eef1f5] bg-[#fbfbfc] px-2.5 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6d5dfc] text-xs font-black text-white">{index}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-[#111827]">{item.title}</p>
        <p className="mt-0.5 truncate text-[11px] font-bold text-[#7a8494]">{item.meta}</p>
      </div>
      <span className="max-w-20 truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#6d5dfc] ring-1 ring-[#e5e7eb]">{item.value}</span>
    </div>
  );
}
