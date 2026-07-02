'use client';

import { useMemo } from 'react';
import { formatKRW, formatNumber } from '@/lib/utils';
import {
  sourcingReports,
  sourcingRows,
  trendKeywords,
  wholesaleCategories,
} from '../lib/sourcing-ai-dashboard';
import { useSourcingHomeKeywords } from '../lib/use-sourcing-home-keywords';
import { useTodayRecommendationRows, useTodayRecommendationSnapshots } from '../lib/use-today-recommendation-rows';
import {
  snapshotsToLatestMap,
  THREE_DAY_TRACKING_MS,
  type ProductSnapshot,
  type TodayRecommendationRow,
} from '../recommendations/lib/today-recommendations';

type RankingItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
};

export function HomeRankingBoard() {
  const {
    hasDynamicKeywords,
    rankedKeywords,
    agentKeywords,
    categories,
  } = useSourcingHomeKeywords();
  const marketRows = useTodayRecommendationRows();
  const snapshots = useTodayRecommendationSnapshots();
  const snapshotMap = useMemo(() => snapshotsToLatestMap(snapshots), [snapshots]);
  const dynamicRecommendationItems = (agentKeywords.length > 0 ? agentKeywords : rankedKeywords)
    .slice(0, 6)
    .map((keyword) => ({
      id: `dynamic-recommendation-${keyword.id}`,
      title: keyword.keyword,
      meta: keyword.meta,
      value: keyword.value,
    }));
  const recommendationItems = [
    ...dynamicRecommendationItems,
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
    ...(hasDynamicKeywords ? [] : trendKeywords.map((keyword) => ({
      id: `keyword-${keyword.keyword}`,
      title: keyword.keyword,
      meta: keyword.category,
      value: `+${keyword.movement}`,
    }))),
  ].slice(0, 10);
  const keywordItems = rankedKeywords.length > 0
    ? rankedKeywords.slice(0, 10).map((keyword) => ({
      id: keyword.id,
      title: keyword.keyword,
      meta: keyword.meta,
      value: keyword.value,
    }))
    : agentKeywords.length > 0
      ? agentKeywords.slice(0, 10).map((keyword) => ({
        id: keyword.id,
        title: keyword.keyword,
        meta: keyword.meta,
        value: keyword.value,
      }))
    : trendKeywords.slice(0, 10).map((keyword) => ({
      id: keyword.keyword,
      title: keyword.keyword,
      meta: keyword.category,
      value: formatNumber(keyword.searchVolume),
    }));
  const marketItems = marketRows
    .slice(0, 10)
    .map((row) => ({
      id: `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`,
      title: row.productName,
      meta: `${row.primaryKeyword} · ${row.salePrice == null ? '-' : `${formatKRW(row.salePrice)}원`}`,
      value: `${formatNumber(row.score)}점`,
    }));
  const categoryItems = categories.length > 0
    ? categories.map((category) => ({
      id: category.id,
      title: category.title,
      meta: category.meta,
      value: category.value,
    }))
    : [
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
  const koreanNewProductItems = marketRows
    .filter((row) => isRecentlyFirstSeen(snapshotMap.get(rowKey(row))))
    .slice(0, 10)
    .map((row) => ({
      id: `new-${rowKey(row)}`,
      title: row.productName,
      meta: row.primaryKeyword,
      value: formatFirstSeen(snapshotMap.get(rowKey(row))),
    }));

  return (
    <section className="grid w-full gap-3 xl:grid-cols-5">
      <RankingPanel title="오늘의 추천" caption={hasDynamicKeywords ? '키워드 분석 반영' : 'AI 리포트 추천순'} items={recommendationItems} />
      <RankingPanel title="키워드 순위" caption={rankedKeywords.length > 0 ? 'DataLab 보드 기준' : agentKeywords.length > 0 ? '에이전트 점수 기준' : '검색량 기준'} items={keywordItems} />
      <RankingPanel title="시장 분석" caption="오늘의 추천 상품 기준" items={marketItems} emptyText="오늘의 추천 실행 후 표시" />
      <RankingPanel title="카테고리 순위" caption={categories.length > 0 ? '키워드 분석 카테고리' : '소싱 카테고리 후보'} items={categoryItems} />
      <RankingPanel title="3일 등록추정" caption="오늘의 추천 firstSeen 기준" items={koreanNewProductItems} emptyText="추적 스냅샷 누적 후 표시" />
    </section>
  );
}

function RankingPanel({ title, caption, items, emptyText }: { title: string; caption: string; items: RankingItem[]; emptyText?: string }) {
  return (
    <article className="rounded-[22px] border border-[#eef1f5] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#111827]">{title}</h2>
          <p className="mt-0.5 text-[11px] font-black text-[#9ca3af]">{caption}</p>
        </div>
        <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-black text-[#6d5dfc]">TOP 10</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-[#eef1f5] bg-[#fbfbfc] px-3 py-4 text-xs font-bold leading-5 text-[#7a8494]">
          {emptyText ?? '표시할 항목이 없습니다.'}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <RankedSummaryItem key={item.id} index={index + 1} item={item} />
          ))}
        </div>
      )}
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

function rowKey(row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId'>): string {
  return `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`;
}

function isRecentlyFirstSeen(snapshot: ProductSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const firstSeenAt = snapshot.firstSeenAt ?? snapshot.capturedAt;
  const now = Date.now();
  return firstSeenAt >= now - THREE_DAY_TRACKING_MS && firstSeenAt <= now;
}

function formatFirstSeen(snapshot: ProductSnapshot | undefined): string {
  if (!snapshot) return '추적 전';
  const firstSeenAt = snapshot.firstSeenAt ?? snapshot.capturedAt;
  const elapsedDays = Math.max(0, Math.floor((Date.now() - firstSeenAt) / (24 * 60 * 60 * 1000)));
  if (elapsedDays === 0) return '오늘';
  return `${formatNumber(elapsedDays)}일 전`;
}
