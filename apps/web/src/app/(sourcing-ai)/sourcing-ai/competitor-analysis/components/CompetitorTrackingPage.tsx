"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdvertisingCompetitorCatalogInput } from "@kiditem/shared/sourcing";
import Link from "next/link";
import {
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Database,
  RefreshCw,
  Store,
  Target,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTime, formatNumber } from "@/lib/utils";
import {
  fetchCompetitorTrackingOverview,
  type CompetitorSeller,
} from "../lib/competitor-tracking-api";
import {
  competitorExtensionGateMessage,
  detectCompetitorExtensionGate,
  type CompetitorExtensionGate,
} from "../lib/competitor-extension";
import { useCompetitorProductTracking } from "../hooks/useCompetitorProductTracking";
import { CompetitorSellerDetail } from "./CompetitorSellerDetail";
import { CompetitorSellerList } from "./CompetitorSellerList";
import { useSourcingOperationAction } from "../../hooks/use-sourcing-operation-action";
import { SourcingOperationRunPanel } from "../../components/SourcingOperationRunPanel";

type GateState = CompetitorExtensionGate | { status: "checking" };
const ACTIVE_OPERATION_STATUSES = new Set([
  "queued",
  "waiting_runtime",
  "waiting_dependency",
  "running",
  "attention_required",
]);

export function CompetitorTrackingPage() {
  const productTracking = useCompetitorProductTracking();
  const [initialRunId] = useState(readOperationRunId);
  const [periodDays, setPeriodDays] = useState(30);
  const [search, setSearch] = useState("");
  const [selectedSellerKey, setSelectedSellerKey] = useState<string | null>(
    null,
  );
  const [gate, setGate] = useState<GateState>({ status: "checking" });
  const [requestedSellerKey, setRequestedSellerKey] = useState<string | null>(null);
  const snapshotQueryKey = queryKeys.sourcing.competitors(periodDays);
  const operation = useSourcingOperationAction({
    operationKey: "advertising.collect_competitor_catalog",
    input: { target: "configured_watchlist" },
    snapshotQueryKey,
    initialRunId,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.sourcing.competitors(periodDays),
    queryFn: () => fetchCompetitorTrackingOverview(periodDays),
    refetchInterval: 60_000,
    // 기간 전환 시 전체화면 스켈레톤으로 되돌아가지 않도록 직전 데이터를 유지한다.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    let active = true;
    detectCompetitorExtensionGate()
      .then((nextGate) => {
        if (active) setGate(nextGate);
      })
      .catch(() => {
        if (active) setGate({ status: "missing" });
      });
    return () => {
      active = false;
    };
  }, []);

  const data = overviewQuery.data;
  const filteredSellers = useMemo(() => {
    const sellers = data?.sellers ?? [];
    const keyword = search.trim().toLocaleLowerCase("ko");
    if (!keyword) return sellers;
    return sellers.filter(
      (seller) =>
        seller.sellerName.toLocaleLowerCase("ko").includes(keyword) ||
        seller.brandName?.toLocaleLowerCase("ko").includes(keyword) ||
        seller.products.some(
          (product) =>
            product.name.toLocaleLowerCase("ko").includes(keyword) ||
            product.keywords.some((item) =>
              item.toLocaleLowerCase("ko").includes(keyword),
            ) ||
            product.matchedOwnProducts.some((item) =>
              item.productName.toLocaleLowerCase("ko").includes(keyword),
            ),
        ),
    );
  }, [data?.sellers, search]);
  const selectedSeller =
    filteredSellers.find((seller) => seller.sellerKey === selectedSellerKey) ??
    filteredSellers[0] ??
    null;
  const gateMessage =
    gate.status === "checking"
      ? null
      : competitorExtensionGateMessage(gate as CompetitorExtensionGate);
  const collecting = operation.isStarting || (
    operation.run !== null && ACTIVE_OPERATION_STATUSES.has(operation.run.status)
  );
  const collectingSellerKey = collecting ? requestedSellerKey : null;

  const startCollection = async (
    input: AdvertisingCompetitorCatalogInput,
    requestedSeller: CompetitorSeller | null = null,
  ) => {
    if (input.target === "seller_id" && !requestedSeller?.sellerId) {
      toast.error("검증된 판매자 ID가 필요합니다.");
      return;
    }
    setRequestedSellerKey(requestedSeller?.sellerKey ?? null);
    try {
      const run = await operation.start(input, [snapshotQueryKey]);
      const params = new URLSearchParams(window.location.search);
      params.delete("collectionRun");
      params.set("operationRun", run.id);
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
      toast.success(
        requestedSeller
          ? `${requestedSeller.brandName ?? requestedSeller.sellerName} 전체상품 수집을 시작했습니다.`
          : "설정된 경쟁 판매자 수집을 시작했습니다.",
      );
    } catch (error) {
      setRequestedSellerKey(null);
      toast.error(friendlyError(error) ?? "판매자 수집 시작 실패");
    }
  };

  if (overviewQuery.isLoading) return <LoadingState />;
  if (overviewQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">
          경쟁 판매자 데이터를 불러오지 못했습니다.
        </p>
        <p className="mt-1">{friendlyError(overviewQuery.error)}</p>
        <button
          type="button"
          onClick={() => overviewQuery.refetch()}
          className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
                <Building2 size={18} />
              </span>
              <div>
                <p className="text-xs font-semibold text-[var(--primary)]">
                  쿠팡 문구·완구 경쟁 추적
                </p>
                <h2 className="mt-0.5 text-xl font-bold text-[var(--text-primary)]">
                  내 상품과 겹치는 상위 판매자
                </h2>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value))}
              aria-label="조회 기간"
              className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-secondary)]"
            >
              <option value={7}>최근 7일</option>
              <option value={14}>최근 14일</option>
              <option value={30}>최근 30일</option>
              <option value={60}>최근 60일</option>
            </select>
            <button
              type="button"
              onClick={() => void startCollection({ target: "configured_watchlist" })}
              disabled={collecting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={collecting ? "animate-spin" : undefined}
              />
              {collecting ? "수집 중" : "판매자 수집·갱신"}
            </button>
          </div>
        </div>
      </section>

      <SourcingOperationRunPanel
        run={operation.run}
        onCancel={() => void operation.cancel()}
        onRetryAttention={() => void operation.retryAttention()}
        isCancelling={operation.isCancelling}
        isRetrying={operation.isRetrying}
      />

      {(gateMessage ||
        collecting ||
        data.summary.unresolvedSellerProductCount > 0) && (
        <CollectionNotice
          gateMessage={gateMessage}
          collecting={collecting}
          currentKeyword={operation.run?.stage ?? null}
          completed={operation.run?.progressCurrent ?? 0}
          total={operation.run?.progressTotal ?? 0}
          unresolvedCount={data.summary.unresolvedSellerProductCount}
        />
      )}

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-5"
        aria-label="경쟁 판매자 요약"
      >
        <SummaryCard
          icon={Store}
          label="확인된 판매자"
          value={data.summary.trackedSellerCount}
        />
        <SummaryCard
          icon={Trophy}
          label="상위 판매자"
          value={data.summary.topSellerCount}
        />
        <SummaryCard
          icon={Target}
          label="겹치는 상품"
          value={data.summary.overlappingProductCount}
        />
        <SummaryCard
          icon={Database}
          label="매칭된 내 상품"
          value={data.summary.matchedOwnProductCount}
        />
        <SummaryCard
          icon={RefreshCw}
          label="수집 키워드"
          value={data.summary.trackedKeywordCount}
          detail={formatDateTime(data.summary.lastCapturedAt)}
        />
      </section>

      {data.collection.status === "catalog_empty" ? (
        <CatalogEmptyState />
      ) : data.sellers.length === 0 ? (
        <DataEmptyState
          status={data.collection.status}
          keywords={data.collection.suggestedKeywords}
          onCollect={() => void startCollection({ target: "configured_watchlist" })}
          pending={collecting}
        />
      ) : (
        <section className="grid min-w-0 gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
          <CompetitorSellerList
            sellers={filteredSellers}
            selectedSellerKey={selectedSeller?.sellerKey ?? null}
            search={search}
            onSearchChange={setSearch}
            onSelect={setSelectedSellerKey}
            onCollectSeller={(seller) => {
              if (!seller.sellerId) {
                toast.error("검증된 판매자 ID가 필요합니다.");
                return;
              }
              void startCollection(
                { target: "seller_id", sellerId: seller.sellerId },
                seller,
              );
            }}
            collectingSellerKey={collectingSellerKey}
            collectionDisabled={collecting}
          />
          {selectedSeller ? (
            <CompetitorSellerDetail
              key={selectedSeller.sellerKey}
              seller={selectedSeller}
              trackedProductIds={productTracking.trackedProductIds}
              trackingProductId={productTracking.trackingProductId}
              trackingPending={productTracking.trackingPending}
              onTrackProduct={productTracking.trackProduct}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-tertiary)]">
              검색 조건에 맞는 판매자가 없습니다.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function readOperationRunId(): string | null {
  if (typeof window === "undefined") return null;
  const runId = new URLSearchParams(window.location.search).get("operationRun");
  return runId !== null && OPERATION_RUN_ID_PATTERN.test(runId) ? runId : null;
}

const OPERATION_RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Store;
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {formatNumber(value)}
          </p>
          {detail && (
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              {detail}
            </p>
          )}
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
          <Icon size={17} />
        </span>
      </div>
    </article>
  );
}

function CollectionNotice({
  gateMessage,
  collecting,
  currentKeyword,
  completed,
  total,
  unresolvedCount,
}: {
  gateMessage: string | null;
  collecting: boolean;
  currentKeyword: string | null;
  completed: number;
  total: number;
  unresolvedCount: number;
}) {
  const message = collecting
    ? `${currentKeyword ?? "키워드 준비 중"} · ${formatNumber(completed)}/${formatNumber(total)} 완료`
    : (gateMessage ??
      `기존 스냅샷 ${formatNumber(unresolvedCount)}개 상품은 판매자 정보가 없습니다. 확장프로그램 1.2.33+로 재수집하면 내 상품과 겹치는 판매자만 선별해 전체 상품과 이미지를 추적합니다.`);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function CatalogEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
      <Database size={42} className="mx-auto text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
        자사 상품을 불러오지 못했습니다
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--text-secondary)]">
        Wing 상품 카탈로그를 동기화하거나 키드아이템 신상품 페이지 연결 상태를
        확인하면 문구·완구 대표 키워드를 만들 수 있습니다.
      </p>
      <Link
        href="/sourcing-ai/wing-catalog"
        className="mt-5 inline-flex rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
      >
        쿠팡 상품 분석으로 이동
      </Link>
    </section>
  );
}

function DataEmptyState({
  status,
  keywords,
  onCollect,
  pending,
}: {
  status: string;
  keywords: string[];
  onCollect: () => void;
  pending: boolean;
}) {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
      <Target size={42} className="mx-auto text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
        {status === "not_configured"
          ? "추적 키워드를 준비할게요"
          : "아직 경쟁 판매자 수집값이 없습니다"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        아래 대표 키워드로 쿠팡 검색 결과를 수집하고, 내 상품과 겹치는 판매자를
        자동으로 묶습니다.
      </p>
      <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
        {keywords.slice(0, 10).map((keyword) => (
          <span
            key={keyword}
            className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
          >
            {keyword}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onCollect}
        disabled={pending}
        className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
      >
        {pending ? "준비 중" : "판매자 추적 시작"}
      </button>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-label="경쟁 판매자 불러오는 중">
      <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl bg-slate-100"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
