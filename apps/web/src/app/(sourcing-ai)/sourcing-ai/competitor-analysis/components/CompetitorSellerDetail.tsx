"use client";

import { useMemo, useState } from "react";
import { ExternalLink, PackageSearch, Sparkles } from "lucide-react";
import { cn, formatDateTime, formatKRW, formatNumber } from "@/lib/utils";
import { CompetitorProductTable } from "./CompetitorProductTable";
import { CompetitorProductThumbnail } from "./CompetitorProductThumbnail";
import type { CompetitorSeller } from "../lib/competitor-tracking-api";

type SellerDetailTab = "catalog" | "overlap";

export function CompetitorSellerDetail({
  seller,
}: {
  seller: CompetitorSeller;
}) {
  const [tab, setTab] = useState<SellerDetailTab>("catalog");
  const catalog = seller.catalog;
  const sellerStoreUrl = catalog?.sellerStoreUrl ?? seller.sellerStoreUrl;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex rounded-lg bg-[var(--surface-sunken)] p-1">
          <TabButton
            active={tab === "catalog"}
            onClick={() => setTab("catalog")}
            label={`판매자 전체상품 ${catalog ? formatNumber(catalog.collectedProductCount) : "-"}`}
          />
          <TabButton
            active={tab === "overlap"}
            onClick={() => setTab("overlap")}
            label={`내 상품과 겹침 ${formatNumber(seller.overlapProductCount)}`}
          />
        </div>
        {sellerStoreUrl ? (
          <a
            href={sellerStoreUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:underline"
          >
            쿠팡 판매자샵 열기
            <ExternalLink size={13} />
          </a>
        ) : null}
      </div>

      {tab === "catalog" ? (
        catalog ? (
          <SellerCatalogTable seller={seller} />
        ) : (
          <CatalogPending seller={seller} />
        )
      ) : (
        <CompetitorProductTable seller={seller} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--surface)] text-purple-700 shadow-sm"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </button>
  );
}

function SellerCatalogTable({ seller }: { seller: CompetitorSeller }) {
  const catalog = seller.catalog!;
  const [sort, setSort] = useState<"coupang" | "discovered">("coupang");
  const [onlyNew, setOnlyNew] = useState(false);
  const visibleProducts = useMemo(() => {
    const products = onlyNew
      ? catalog.products.filter((product) => product.isNew)
      : [...catalog.products];
    if (sort === "discovered") {
      products.sort(
        (a, b) =>
          new Date(b.firstSeenAt).getTime() -
            new Date(a.firstSeenAt).getTime() || a.sourceRank - b.sourceRank,
      );
    }
    return products;
  }, [catalog.products, onlyNew, sort]);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {seller.brandName ?? seller.sellerName}의 현재 판매 상품
              </h2>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                쿠팡 최신순
              </span>
              {catalog.newProductCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Sparkles size={10} />
                  신상품 {formatNumber(catalog.newProductCount)}개
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              판매자샵 전체 {formatNumber(catalog.totalProductCount)}개 중{" "}
              {formatNumber(catalog.collectedProductCount)}개 수집
              {catalog.isTruncated ? " · 수집 상한 도달" : ""}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              순서는 쿠팡 판매자샵의 최신순이며, 최초 발견일은 KidItem 수집
              기준입니다.
            </p>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            최근 수집{" "}
            <b className="text-[var(--text-primary)]">
              {formatDateTime(catalog.lastCapturedAt)}
            </b>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-sunken)] p-2">
          <select
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "coupang" | "discovered")
            }
            aria-label="판매자 상품 정렬"
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-secondary)]"
          >
            <option value="coupang">쿠팡 최신순</option>
            <option value="discovered">최초 발견 최신순</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyNew((value) => !value)}
            aria-pressed={onlyNew}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs font-semibold",
              onlyNew
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]",
            )}
          >
            NEW만 보기 {formatNumber(catalog.newProductCount)}
          </button>
          <span className="ml-auto px-1 text-[11px] text-[var(--text-tertiary)]">
            {formatNumber(visibleProducts.length)}개 표시
          </span>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr>
              <th className="w-20 px-4 py-3 text-right">최신순</th>
              <th className="px-4 py-3">현재 판매 상품</th>
              <th className="px-4 py-3 text-right">판매가</th>
              <th className="px-4 py-3 text-right">리뷰</th>
              <th className="px-4 py-3 text-right">최초 발견</th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">쿠팡 열기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.productKey}>
                <td className="px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                  {formatNumber(product.sourceRank)}
                </td>
                <td className="max-w-[390px] px-4 py-3 align-top">
                  <div className="flex items-start gap-3">
                    <CompetitorProductThumbnail
                      imageUrl={product.imageUrl}
                      name={product.name}
                    />
                    <div className="flex min-w-0 items-start gap-2">
                      <p className="line-clamp-2 whitespace-normal text-sm font-semibold leading-5 text-[var(--text-primary)]">
                        {product.name}
                      </p>
                      {product.isNew ? (
                        <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          NEW
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                  {product.priceKrw === null
                    ? "-"
                    : `${formatKRW(product.priceKrw)}원`}
                </td>
                <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-[var(--text-secondary)]">
                  {formatNumber(product.reviewCount)}
                </td>
                <td className="px-4 py-3 text-right align-top text-xs text-[var(--text-tertiary)]">
                  {formatDateTime(product.firstSeenAt)}
                </td>
                <td className="px-4 py-3 text-right align-top">
                  {product.link ? (
                    <a
                      href={product.link}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${product.name} 쿠팡에서 열기`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CatalogPending({ seller }: { seller: CompetitorSeller }) {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
      <PackageSearch size={38} className="mx-auto text-slate-300" />
      <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
        {seller.sellerName} 판매자샵은 아직 수집 전입니다
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--text-secondary)]">
        확장프로그램 1.2.32+로 판매자 수집을 실행하면 판매자샵 전체
        상품·이미지와 이후 신상품을 기록합니다.
      </p>
    </section>
  );
}
