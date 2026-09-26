"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
import {
  competitorCollectionStatus,
  type CompetitorCollectionStatus,
} from "@kiditem/shared/advertising";
import { friendlyError } from "@/lib/api-error";
import { CollectionStartControl } from "@/components/collection/CollectionStartControl";
import { useCollectionSourceControl, type CollectionControlView } from "@/hooks/use-collection-source-control";
import { COLLECTION_STOPPED_MESSAGE } from "@/lib/collection-source-status-query";
import { advertisingOperationState } from "@/lib/advertising-operation-collection";
import type { OperationListResponse } from "@kiditem/shared/operation";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTime, formatNumber } from "@/lib/utils";
import {
  fetchCompetitorTrackingOverview,
  type CompetitorSeller,
} from "../lib/competitor-tracking-api";
import {
  competitorCatalogCollection,
  competitorSellerIdentityCollection,
  type CompetitorCatalogInput,
} from "../lib/competitor-catalog-collection";
import { useCompetitorProductTracking } from "../hooks/useCompetitorProductTracking";
import { CompetitorSellerDetail } from "./CompetitorSellerDetail";
import { CompetitorSellerList } from "./CompetitorSellerList";
import { attemptFailureText } from '@/lib/operator-error';

export function CompetitorTrackingPage() {
  const productTracking = useCompetitorProductTracking();
  const [periodDays, setPeriodDays] = useState(30);
  const [search, setSearch] = useState("");
  const [selectedSellerKey, setSelectedSellerKey] = useState<string | null>(
    null,
  );
  const [requestedSellerKey, setRequestedSellerKey] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: queryKeys.sourcing.competitors(periodDays),
    queryFn: () => fetchCompetitorTrackingOverview(periodDays),
    refetchInterval: 60_000,
    // 기간 전환 시 전체화면 스켈레톤으로 되돌아가지 않도록 직전 데이터를 유지한다.
    placeholderData: keepPreviousData,
  });
  // 판매자 수집(`advertising.competitor_catalog`)과 판매자 확인(`advertising.competitor_seller_identity`, KID-362)은
  // 확장이 도는 실행 kind다. 공용 컨트롤이 시작·진행·중단을 맡고, 완료되면 경쟁사 읽기를 다시 읽는다.
  const catalogSource = useCollectionSourceControl(competitorCatalogCollection);
  const identitySource = useCollectionSourceControl(competitorSellerIdentityCollection);

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
  const collecting = catalogSource.state === "starting" || catalogSource.running !== null;
  // 판매자 하나를 수집 중이면 그 판매자 행에 표시한다(시작한 판매자를 기억한다).
  useEffect(() => {
    if (!collecting) setRequestedSellerKey(null);
  }, [collecting]);
  const collectingSellerKey = collecting ? requestedSellerKey : null;

  const startCollection = (input: CompetitorCatalogInput, requestedSeller: CompetitorSeller | null = null) => {
    setRequestedSellerKey(requestedSeller?.sellerKey ?? null);
    catalogSource.start(input);
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
              onClick={() => startCollection({})}
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

      <CollectionNotice
        collecting={collecting}
        sourceStatus={catalogSource.status}
        control={catalogSource}
      />
      {data.summary.unresolvedSellerProductCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <p>판매자를 아직 모르는 경쟁 상품 {formatNumber(data.summary.unresolvedSellerProductCount)}개 — 상품 상세에서 판매자를 확인하면 판매자샵 상품까지 이어서 수집합니다.</p>
          <CollectionStartControl
            control={identitySource}
            startLabel="판매자 확인"
            startTitle="최근 검색 순위의 경쟁 상품 상세를 열어 판매자를 확인합니다(최대 200개)."
            onStart={() => identitySource.start()}
            onStop={identitySource.stop}
          />
        </div>
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

      {competitorCollectionStatus(data.collection) === "catalog_empty" ? (
        <CatalogEmptyState />
      ) : data.sellers.length === 0 ? (
        <DataEmptyState
          status={competitorCollectionStatus(data.collection)}
          keywords={data.collection.suggestedKeywords}
          onCollect={() => startCollection({})}
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
              startCollection({ sellerId: seller.sellerId }, seller);
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
  collecting,
  sourceStatus,
  control,
}: {
  collecting: boolean;
  sourceStatus: OperationListResponse | undefined;
  control: CollectionControlView & Readonly<{ stop: () => void }>;
}) {
  const { latest, lastSucceeded } = advertisingOperationState(sourceStatus);
  const message = collecting
    ? "새 경쟁 판매자 수집 진행 중입니다. 이전 완료 스냅샷은 계속 표시됩니다."
    : latest?.status === "cancelled"
      ? COLLECTION_STOPPED_MESSAGE
      : latest?.status === "failed"
        ? `마지막 수집 실패: ${attemptFailureText(latest, "coupang_competitor_catalog")}`
        : lastSucceeded?.finishedAt
          ? `마지막 완료 ${formatDateTime(lastSucceeded.finishedAt)}`
          : null;
  if (!message && !control.running) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        <p>{message ?? "경쟁 판매자 수집 진행 중입니다."}</p>
      </div>
      {control.running && (
        <CollectionStartControl
          control={control}
          startLabel="판매자 수집·갱신"
          onStart={() => undefined}
          onStop={control.stop}
        />
      )}
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
  status: CompetitorCollectionStatus;
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
