import { RefreshCw, Search, Store } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { CompetitorSeller } from "../lib/competitor-tracking-api";

const sellerRowGrid = "grid-cols-[minmax(0,1fr)_42px_48px_46px_116px]";

export function CompetitorSellerList({
  sellers,
  selectedSellerKey,
  search,
  onSearchChange,
  onSelect,
  onCollectSeller,
  collectingSellerKey,
  collectionDisabled,
}: {
  sellers: CompetitorSeller[];
  selectedSellerKey: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (sellerKey: string) => void;
  onCollectSeller: (seller: CompetitorSeller) => void;
  collectingSellerKey: string | null | undefined;
  collectionDisabled: boolean;
}) {
  return (
    <aside className="self-start overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              추적 판매자
            </h2>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              사용자 추가와 KidItem 자동 발굴
            </p>
          </div>
          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">
            {formatNumber(sellers.length)}곳
          </span>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3">
          <Search size={15} className="text-[var(--text-tertiary)]" />
          <span className="sr-only">판매자 또는 키워드 검색</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="판매자·키워드 검색"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </label>
      </div>

      <div role="table" aria-label="추적 판매자 비교" className="min-w-[440px]">
        <div
          role="row"
          className={cn(
            "grid h-9 items-center border-b border-[var(--border)] bg-[var(--surface-sunken)] text-[11px] font-semibold text-[var(--text-tertiary)]",
            sellerRowGrid,
          )}
        >
          <span role="columnheader" className="px-3">
            판매자
          </span>
          <span role="columnheader" className="text-center">
            겹침
          </span>
          <span role="columnheader" className="text-center">
            TOP10
          </span>
          <span role="columnheader" className="text-center">
            평균
          </span>
          <span role="columnheader" className="sr-only">
            수집 액션
          </span>
        </div>

        <div
          role="rowgroup"
          className="max-h-[448px] divide-y divide-[var(--border-subtle)] overflow-y-auto overscroll-contain"
        >
          {sellers.map((seller) => {
            const selected = seller.sellerKey === selectedSellerKey;
            const isUserAdded = seller.discoverySource === "user";
            const canCollect = Boolean(
              seller.sellerId && seller.sellerStoreUrl,
            );
            const collecting = seller.sellerKey === collectingSellerKey;

            return (
              <div
                key={seller.sellerKey}
                role="row"
                className={cn(
                  "grid h-14 items-stretch bg-[var(--surface)]",
                  sellerRowGrid,
                )}
              >
                <div role="cell" className="min-w-0">
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(seller.sellerKey)}
                    className="flex h-full w-full min-w-0 items-center gap-2 px-3 text-left outline-none transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--primary-soft)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
                      <Store size={15} strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {seller.brandName ?? seller.sellerName}
                      </span>
                      {isUserAdded ? (
                        <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-emerald-700">
                          사용자 추가
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-medium text-[var(--text-tertiary)]">
                          미추가
                        </span>
                      )}
                    </span>
                  </button>
                </div>

                <MetricCell value={formatNumber(seller.overlapProductCount)} />
                <MetricCell value={formatNumber(seller.top10Count)} />
                <MetricCell
                  value={seller.averageRank ? `${seller.averageRank}위` : "-"}
                />

                <div role="cell" className="flex items-center px-2">
                  <button
                    type="button"
                    onClick={() => onCollectSeller(seller)}
                    disabled={collectionDisabled || !canCollect}
                    className={cn(
                      "inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      isUserAdded
                        ? "bg-purple-50 text-purple-700 hover:bg-purple-100"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                    )}
                  >
                    {isUserAdded ? (
                      <RefreshCw
                        size={12}
                        className={collecting ? "animate-spin" : undefined}
                      />
                    ) : null}
                    {collecting
                      ? "수집 중"
                      : isUserAdded
                        ? "전체상품 수집"
                        : "추가하고 수집"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function MetricCell({ value }: { value: string }) {
  return (
    <span
      role="cell"
      className="flex items-center justify-center text-sm font-medium tabular-nums text-[var(--text-secondary)]"
    >
      {value}
    </span>
  );
}
