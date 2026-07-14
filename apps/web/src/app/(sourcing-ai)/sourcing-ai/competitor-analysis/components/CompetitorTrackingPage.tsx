"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserCollectionRunIdSchema } from "@kiditem/shared/browser-collection-session";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { BrowserCollectionRunControls } from "@/components/browser-collection/BrowserCollectionRunControls";
import { useBrowserCollectionSession } from "@/hooks/useBrowserCollectionSession";
import { friendlyError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTime, formatNumber } from "@/lib/utils";
import {
  autoConfigureCompetitorTrackers,
  fetchCompetitorTrackingOverview,
  type CompetitorSeller,
} from "../lib/competitor-tracking-api";
import {
  competitorExtensionGateMessage,
  detectCompetitorExtensionGate,
  getCompetitorCollectionStatus,
  getCompetitorSellerCollectionStatus,
  runCompetitorCollection,
  runCompetitorSellerCollection,
  type CompetitorExtensionGate,
} from "../lib/competitor-extension";
import { CompetitorSellerDetail } from "./CompetitorSellerDetail";
import { CompetitorSellerList } from "./CompetitorSellerList";

type GateState = CompetitorExtensionGate | { status: "checking" };
type ActiveRun = {
  runId: string;
  extensionId: string;
  mode: "all" | "seller";
  sellerId?: string;
  sellerKey?: string;
  sellerName?: string;
} | null;

export function CompetitorTrackingPage() {
  const queryClient = useQueryClient();
  const [periodDays, setPeriodDays] = useState(30);
  const [search, setSearch] = useState("");
  const [selectedSellerKey, setSelectedSellerKey] = useState<string | null>(
    null,
  );
  const [gate, setGate] = useState<GateState>({ status: "checking" });
  const [activeRun, setActiveRun] = useState<ActiveRun>(null);
  const [linkedRunId] = useState(readCollectionRunId);
  const completedRunRef = useRef<string | null>(null);
  const collectionSessionQuery = useBrowserCollectionSession(
    activeRun?.runId ?? linkedRunId,
  );
  const collectionSession =
    collectionSessionQuery.data?.producer === "advertising.competitor_catalog" ||
    collectionSessionQuery.data?.producer === "advertising.keyword_rank"
      ? collectionSessionQuery.data
      : null;

  const overviewQuery = useQuery({
    queryKey: queryKeys.sourcing.competitors(periodDays),
    queryFn: () => fetchCompetitorTrackingOverview(periodDays),
    refetchInterval: activeRun ? 5_000 : 60_000,
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

  useEffect(() => {
    if (activeRun || gate.status !== "ready" || !collectionSession) return;
    if (
      collectionSession.status !== "running" &&
      collectionSession.status !== "attention_required"
    ) {
      return;
    }
    setActiveRun({
      runId: collectionSession.runId,
      extensionId: gate.extensionId,
      mode:
        collectionSession.producer === "advertising.competitor_catalog"
          ? "seller"
          : "all",
    });
  }, [activeRun, collectionSession, gate]);

  const statusQuery = useQuery({
    queryKey: queryKeys.sourcing.competitorCollectionStatus(
      activeRun?.runId ?? null,
    ),
    queryFn: () =>
      activeRun!.mode === "seller"
        ? getCompetitorSellerCollectionStatus(
            activeRun!.extensionId,
            activeRun!.runId,
          )
        : getCompetitorCollectionStatus(
            activeRun!.extensionId,
            activeRun!.runId,
          ),
    enabled: Boolean(activeRun),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "done" || status === "error" || status === "cancelled"
        ? false
        : 2_000;
    },
  });

  useEffect(() => {
    if (!activeRun || !statusQuery.data) return;
    const status = statusQuery.data.status;
    if (status !== "done" && status !== "error" && status !== "cancelled") return;
    if (completedRunRef.current === activeRun.runId) return;
    completedRunRef.current = activeRun.runId;
    queryClient.invalidateQueries({
      queryKey: queryKeys.sourcing.competitors(periodDays),
    });
    if (status === "done") {
      if (activeRun.mode === "seller") {
        toast.success(
          `${activeRun.sellerName ?? "판매자"} 상품 수집 완료 · ${formatNumber(statusQuery.data.catalogProductCount ?? 0)}개`,
        );
      } else {
        toast.success(
          `쿠팡 경쟁 판매자 수집 완료 · ${formatNumber(statusQuery.data.completed ?? 0)}개 키워드`,
        );
      }
    } else if (status === "cancelled") {
      toast.info("쿠팡 경쟁 판매자 수집을 중단했습니다.");
    } else {
      toast.error(
        statusQuery.data.error ?? "쿠팡 경쟁 판매자 수집에 실패했습니다.",
      );
    }
    setActiveRun(null);
  }, [activeRun, periodDays, queryClient, statusQuery.data]);

  const collectMutation = useMutation({
    mutationFn: async () => {
      const configured = await autoConfigureCompetitorTrackers(12);
      const nextGate = await detectCompetitorExtensionGate();
      setGate(nextGate);
      if (nextGate.status !== "ready") {
        throw new Error(
          competitorExtensionGateMessage(nextGate) ??
            "쿠팡 확장프로그램을 사용할 수 없습니다.",
        );
      }
      const run = await runCompetitorCollection(nextGate.extensionId);
      return { configured, run, extensionId: nextGate.extensionId };
    },
    onSuccess: ({ configured, run, extensionId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.competitors(periodDays),
      });
      if (run.started && run.runId) {
        completedRunRef.current = null;
        setActiveRun({ runId: run.runId, extensionId, mode: "all" });
        toast.success(
          `${formatNumber(configured.configuredCount)}개 키워드로 경쟁 판매자 수집을 시작했습니다.`,
        );
      } else {
        toast.success(
          "추적 키워드가 준비됐습니다. 수집 데이터를 새로고침합니다.",
        );
        overviewQuery.refetch();
      }
    },
    onError: (error) => toast.error(friendlyError(error) ?? "수집 시작 실패"),
  });

  const collectSellerMutation = useMutation({
    mutationFn: async (seller: CompetitorSeller) => {
      if (!seller.sellerId || !seller.sellerStoreUrl) {
        throw new Error("판매자샵 주소가 확인된 판매자만 수집할 수 있습니다.");
      }
      const nextGate = await detectCompetitorExtensionGate();
      setGate(nextGate);
      if (nextGate.status !== "ready") {
        throw new Error(
          competitorExtensionGateMessage(nextGate) ??
            "쿠팡 확장프로그램을 사용할 수 없습니다.",
        );
      }
      const run = await runCompetitorSellerCollection(
        nextGate.extensionId,
        seller.sellerId,
      );
      return { seller, run, extensionId: nextGate.extensionId };
    },
    onSuccess: ({ seller, run, extensionId }) => {
      if (run.started && run.runId) {
        completedRunRef.current = null;
        setActiveRun({
          runId: run.runId,
          extensionId,
          mode: "seller",
          sellerKey: seller.sellerKey,
          sellerId: seller.sellerId ?? undefined,
          sellerName: seller.brandName ?? seller.sellerName,
        });
        toast.success(
          `${seller.brandName ?? seller.sellerName} 전체상품 수집을 시작했습니다.`,
        );
      } else {
        overviewQuery.refetch();
      }
    },
    onError: (error) =>
      toast.error(friendlyError(error) ?? "판매자 상품 수집 시작 실패"),
  });

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
  const collecting =
    Boolean(activeRun) ||
    collectionSession?.status === "running" ||
    collectionSession?.status === "attention_required";
  const collectingSellerKey =
    activeRun?.mode === "seller" ? activeRun.sellerKey : null;
  const pendingSellerKey = collectSellerMutation.isPending
    ? collectSellerMutation.variables?.sellerKey
    : null;

  const restartCollection = async () => {
    if (!collectionSession) return;
    if (collectionSession.producer === "advertising.keyword_rank") {
      await collectMutation.mutateAsync();
      return;
    }
    const sellerId = activeRun?.sellerId ?? statusQuery.data?.sellerId ?? null;
    const seller = data?.sellers.find((candidate) => candidate.sellerId === sellerId);
    if (!seller) {
      toast.error("처음부터 다시 수집할 판매자를 확인할 수 없습니다.");
      return;
    }
    await collectSellerMutation.mutateAsync(seller);
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
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              Wing 카탈로그와 키드아이템 신상품 페이지에서 대표 키워드를 만들고,
              쿠팡 검색 상위 노출 상품을 판매자별로 묶어 순위·가격·리뷰 변화를
              추적합니다. 여기서 상위 판매자는 추적 키워드의 검색 노출
              기준입니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
              <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">
                키드아이템 신상품{" "}
                {formatNumber(data.collection.storefrontProductCount)}개
              </span>
              <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1">
                Wing 상품 {formatNumber(data.collection.wingProductCount)}개
              </span>
              {data.collection.watchedCompetitors.map((competitor) => (
                <span
                  key={competitor.sellerId}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"
                >
                  {competitor.brandName} · {competitor.sellerName} ·{" "}
                  {competitor.discoverySource === "kiditem"
                    ? "자동 발굴"
                    : "사용자 추가"}
                </span>
              ))}
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
              onClick={() => collectMutation.mutate()}
              disabled={
                collectMutation.isPending ||
                collectSellerMutation.isPending ||
                collecting
              }
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

      {collectionSession && (
        <BrowserCollectionRunControls
          session={collectionSession}
          onWebRestart={restartCollection}
        />
      )}

      {(gateMessage ||
        collecting ||
        data.summary.unresolvedSellerProductCount > 0) && (
        <CollectionNotice
          gateMessage={gateMessage}
          collecting={collecting}
          currentKeyword={statusQuery.data?.current ?? null}
          completed={statusQuery.data?.completed ?? 0}
          total={statusQuery.data?.total ?? 0}
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
          onCollect={() => collectMutation.mutate()}
          pending={collectMutation.isPending}
        />
      ) : (
        <section className="grid min-w-0 gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
          <CompetitorSellerList
            sellers={filteredSellers}
            selectedSellerKey={selectedSeller?.sellerKey ?? null}
            search={search}
            onSearchChange={setSearch}
            onSelect={setSelectedSellerKey}
            onCollectSeller={(seller) => collectSellerMutation.mutate(seller)}
            collectingSellerKey={collectingSellerKey ?? pendingSellerKey}
            collectionDisabled={collecting || collectSellerMutation.isPending}
          />
          {selectedSeller ? (
            <CompetitorSellerDetail
              key={selectedSeller.sellerKey}
              seller={selectedSeller}
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

function readCollectionRunId(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = BrowserCollectionRunIdSchema.safeParse(
    new URLSearchParams(window.location.search).get("collectionRun"),
  );
  return parsed.success ? parsed.data : null;
}

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
      `기존 스냅샷 ${formatNumber(unresolvedCount)}개 상품은 판매자 정보가 없습니다. 확장프로그램 1.2.32+로 재수집하면 내 상품과 겹치는 판매자만 선별해 전체 상품과 이미지를 추적합니다.`);
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
