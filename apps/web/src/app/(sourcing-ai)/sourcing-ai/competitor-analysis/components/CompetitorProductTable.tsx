import { ExternalLink } from "lucide-react";
import { cn, formatDateTime, formatKRW, formatNumber } from "@/lib/utils";
import { CompetitorProductThumbnail } from "./CompetitorProductThumbnail";
import type { CompetitorSeller } from "../lib/competitor-tracking-api";

export function CompetitorProductTable({
  seller,
}: {
  seller: CompetitorSeller;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {seller.sellerName}
              </h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  seller.sellerResolved
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700",
                )}
              >
                {seller.sellerResolved ? "판매자 확인됨" : "상세 재수집 필요"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              내 상품 {formatNumber(seller.matchedOwnProductCount)}개와 겹치는
              쿠팡 상품 {formatNumber(seller.overlapProductCount)}개
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)]">
            <span>
              오가닉 노출{" "}
              <b className="text-[var(--text-primary)]">
                {formatNumber(seller.organicExposureCount)}
              </b>
            </span>
            <span>
              변화 감지{" "}
              <b className="text-[var(--text-primary)]">
                {formatNumber(seller.recentChangeCount)}
              </b>
            </span>
            <span>
              최근 수집{" "}
              <b className="text-[var(--text-primary)]">
                {formatDateTime(seller.lastCapturedAt)}
              </b>
            </span>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr>
              <th className="px-4 py-3">경쟁 상품</th>
              <th className="px-4 py-3">겹치는 내 상품</th>
              <th className="px-4 py-3 text-right">검색 순위</th>
              <th className="px-4 py-3 text-right">판매가</th>
              <th className="px-4 py-3 text-right">리뷰</th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">쿠팡 열기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {seller.products.map((product) => {
              const own = product.matchedOwnProducts[0];
              return (
                <tr key={product.productKey}>
                  <td className="max-w-[310px] px-4 py-3 align-top">
                    <div className="flex items-start gap-3">
                      <CompetitorProductThumbnail
                        imageUrl={product.imageUrl}
                        name={product.name}
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-2 whitespace-normal text-sm font-semibold leading-5 text-[var(--text-primary)]">
                          {product.name}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {product.keywords.map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
                            >
                              {keyword}
                            </span>
                          ))}
                          {product.isAd && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              광고
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[300px] px-4 py-3 align-top">
                    <p className="line-clamp-2 whitespace-normal text-sm text-[var(--text-secondary)]">
                      {own.productName}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                      일치 {own.score}점 · {own.sharedTerms.join(" · ")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {product.rank}위
                    </p>
                    <Delta
                      value={product.rankChange}
                      suffix=""
                      positiveLabel="상승"
                      negativeLabel="하락"
                    />
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {product.priceKrw === null
                        ? "-"
                        : `${formatKRW(product.priceKrw)}원`}
                    </p>
                    <Delta value={product.priceChange} suffix="원" invertTone />
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {formatNumber(product.reviewCount)}
                    </p>
                    <Delta value={product.reviewChange} suffix="" />
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
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Delta({
  value,
  suffix,
  positiveLabel,
  negativeLabel,
  invertTone = false,
}: {
  value: number | null;
  suffix: string;
  positiveLabel?: string;
  negativeLabel?: string;
  invertTone?: boolean;
}) {
  if (value === null || value === 0) {
    return (
      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">변화 없음</p>
    );
  }
  const positive = value > 0;
  const favorable = invertTone ? !positive : positive;
  return (
    <p
      className={cn(
        "mt-1 text-[11px] font-semibold",
        favorable ? "text-green-600" : "text-red-600",
      )}
    >
      {positive ? "+" : ""}
      {formatNumber(value)}
      {suffix} {positive ? positiveLabel : negativeLabel}
    </p>
  );
}
