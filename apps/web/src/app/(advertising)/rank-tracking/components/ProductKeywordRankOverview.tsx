"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Loader2,
  Minus,
  PackageSearch,
  Search,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import {
  cn,
  formatDateTime,
  formatKRW,
  formatNumber,
  formatPercent,
} from "@/lib/utils";
import {
  fetchProductKeywordRanks,
  type ProductKeywordRankRow,
} from "../lib/rank-api";
import RepresentativeKeywordCell from "./RepresentativeKeywordCell";

const PERIOD_OPTIONS = [7, 14, 30] as const;
const PAGE_SIZE = 50;

function RankValue({ row }: { row: ProductKeywordRankRow }) {
  if (row.status === "not_collected") {
    return (
      <span
        className="text-xs font-medium text-slate-400"
        title="전체 배치가 아직 이 상품의 대표 키워드까지 도달하지 않았습니다."
      >
        미수집
      </span>
    );
  }
  if (row.currentSalesRank === null) {
    const coverage = row.collectedCount;
    return (
      <span
        className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
        title={
          coverage
            ? `Wing 검색결과 ${coverage}개 안에서 자사 옵션ID가 확인되지 않았습니다.`
            : "수집한 Wing 검색결과 안에서 자사 옵션ID가 확인되지 않았습니다."
        }
      >
        {coverage ? `${formatNumber(coverage)}위 밖` : "수집범위 밖"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-lg font-bold tabular-nums",
        row.currentSalesRank <= 20 ? "text-purple-700" : "text-slate-900",
      )}
    >
      {row.currentSalesRank}
      <span className="ml-0.5 text-xs font-semibold text-slate-400">위</span>
    </span>
  );
}

function RankMovement({ row }: { row: ProductKeywordRankRow }) {
  if (row.status === "rising" && row.rankChange !== null) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-green-600 tabular-nums">
        <ArrowUp size={13} />+{row.rankChange}
      </span>
    );
  }
  if (row.status === "falling" && row.rankChange !== null) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-red-600 tabular-nums">
        <ArrowDown size={13} />
        {Math.abs(row.rankChange)}
      </span>
    );
  }
  if (row.status === "out_of_range" && row.previousSalesRank !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 tabular-nums">
        <TrendingDown size={13} />
        {row.previousSalesRank}위 → 이탈
      </span>
    );
  }
  if (row.status === "not_collected" || row.previousSalesRank === null) {
    return <span className="text-xs text-slate-400">비교 전</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400 tabular-nums">
      <Minus size={13} />0
    </span>
  );
}

function RankSparkline({ row }: { row: ProductKeywordRankRow }) {
  const points = row.history.filter(
    (point): point is typeof point & { salesRank: number } =>
      point.salesRank !== null,
  );
  if (points.length < 2)
    return <span className="text-xs text-slate-300">—</span>;
  const width = 88;
  const height = 30;
  const ranks = points.map((point) => point.salesRank);
  const min = Math.min(...ranks);
  const max = Math.max(...ranks);
  const range = Math.max(max - min, 1);
  const path = points
    .map((point, index) => {
      const x = 3 + (index / (points.length - 1)) * (width - 6);
      const y = 3 + ((point.salesRank - min) / range) * (height - 6);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    row.status === "rising"
      ? "#16a34a"
      : row.status === "falling"
        ? "#dc2626"
        : "#7c3aed";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[30px] w-[88px]"
      role="img"
      aria-label={`${points.length}일 Wing 판매순위 흐름`}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProductKeywordRankOverview() {
  const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.ads.keywordRankProducts(days),
    queryFn: () => fetchProductKeywordRanks(days),
  });

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.rows ?? [];
    return (data?.rows ?? []).filter((row) =>
      [
        row.productName,
        row.keyword,
        row.vendorItemId,
        row.skuId,
        ...row.groupedVendorItemIds,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data?.rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => setPage(1), [days, search]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const summary = data?.summary;
  const needsAttention =
    (summary?.fallingCount ?? 0) +
    (summary?.outOfRangeCount ?? 0) +
    (summary?.notCollectedCount ?? 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              내 쿠팡 상품 전체 판매순위
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Wing 최근 28일 판매량순
            </span>
            {isFetching && !isLoading && (
              <Loader2 size={13} className="animate-spin text-purple-600" />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Wing 상품분석 결과를 대표 키워드별 판매량순으로 정렬한 뒤 자사
            옵션ID를 정확히 매칭합니다. 미수집과 수집범위 밖은 구분해
            표시합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상품명·대표키워드·옵션ID 검색"
              aria-label="상품 판매순위 검색"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  days === option
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {option}일
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-200 lg:grid-cols-4">
        {[
          {
            label: "중복 제거 상품",
            value: summary?.productCount ?? 0,
            detail: `원본 옵션 ${formatNumber(summary?.optionCount ?? 0)}개 · ${formatNumber(summary?.duplicateOptionCount ?? 0)}개 숨김`,
            icon: PackageSearch,
            color: "text-slate-600",
          },
          {
            label: "순위 확인 완료",
            value: summary?.rankedCount ?? 0,
            detail: `TOP 20 ${summary?.top20Count ?? 0}개`,
            icon: Trophy,
            color: "text-purple-600",
          },
          {
            label: "순위 상승",
            value: summary?.risingCount ?? 0,
            detail: "직전 일자 대비",
            icon: TrendingUp,
            color: "text-green-600",
          },
          {
            label: "점검 필요",
            value: needsAttention,
            detail: `미수집 ${formatNumber(summary?.notCollectedCount ?? 0)} · 범위 밖 ${formatNumber(summary?.outOfRangeCount ?? 0)}`,
            icon: Clock3,
            color: needsAttention > 0 ? "text-red-600" : "text-slate-400",
          },
        ].map((item, index) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-3 px-5 py-4",
              index % 2 === 0 && "border-r border-slate-200",
              index < 2 && "border-b border-slate-200 lg:border-b-0",
              (index === 1 || index === 2) && "lg:border-r lg:border-slate-200",
            )}
          >
            <item.icon size={18} className={item.color} />
            <div>
              <p className="text-[11px] font-medium text-slate-500">
                {item.label}
              </p>
              <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
                {formatNumber(item.value)}
                <span className="ml-0.5 text-xs font-medium text-slate-400">
                  개
                </span>
              </p>
              <p className="text-[10px] text-slate-400">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-14 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin text-purple-600" />
          자사 쿠팡 상품 전체를 불러오는 중…
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="px-5 py-14 text-center text-slate-400">
          <PackageSearch size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">
            {search
              ? "검색 조건에 맞는 상품이 없습니다"
              : "자사 쿠팡 상품이 없습니다"}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left">내 상품</th>
                  <th className="px-3 py-3 text-left">대표 키워드</th>
                  <th className="px-3 py-3 text-right">판매량순 순위</th>
                  <th className="px-3 py-3 text-right">변동</th>
                  <th className="px-3 py-3 text-right">28일 판매량</th>
                  <th className="px-3 py-3 text-right">28일 매출</th>
                  <th className="px-3 py-3 text-right">조회·전환율</th>
                  <th className="px-3 py-3 text-center">{days}일 흐름</th>
                  <th className="px-5 py-3 text-left">최근 수집</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.vendorItemId}>
                    <td className="max-w-[350px] px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {row.abcGrade && (
                          <span
                            className={cn(
                              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ring-1",
                              row.abcGrade === "A"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : row.abcGrade === "B"
                                  ? "bg-sky-50 text-sky-700 ring-sky-200"
                                  : "bg-slate-100 text-slate-500 ring-slate-200",
                            )}
                            title={`재고분석 ABC 등급: ${row.abcGrade}`}
                          >
                            {row.abcGrade}
                          </span>
                        )}
                        <span className="truncate font-semibold text-slate-800">
                          {row.productName ?? "상품명 미확인"}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-[11px] text-slate-400 tabular-nums">
                        {row.groupedOptionCount > 1
                          ? `옵션 ${formatNumber(row.groupedOptionCount)}개 · 대표ID ${row.vendorItemId}`
                          : `옵션ID ${row.vendorItemId}`}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <RepresentativeKeywordCell row={row} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RankValue row={row} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RankMovement row={row} />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-700">
                      {row.salesLast28d === null
                        ? "—"
                        : `${formatNumber(row.salesLast28d)}개`}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {row.revenueLast28d === null
                        ? "—"
                        : `${formatKRW(row.revenueLast28d)}원`}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      <span>
                        {row.viewsLast28d === null
                          ? "—"
                          : `${formatNumber(row.viewsLast28d)}회`}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">
                        {row.conversionRate28d === null
                          ? "—"
                          : formatPercent(row.conversionRate28d * 100)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex">
                        <RankSparkline row={row} />
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-slate-500">
                      {row.capturedAt
                        ? formatDateTime(row.capturedAt)
                        : "아직 수집 안 됨"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="relative flex items-center justify-center border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            <span className="absolute left-5 top-1/2 hidden -translate-y-1/2 sm:block">
              총 {formatNumber(filteredRows.length)}개 중{" "}
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–
              {formatNumber(Math.min(page * PAGE_SIZE, filteredRows.length))}개
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40"
              >
                <ArrowLeft size={12} /> 이전
              </button>
              <span className="min-w-16 text-center font-semibold tabular-nums text-slate-700">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={page === pageCount}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40"
              >
                다음 <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
