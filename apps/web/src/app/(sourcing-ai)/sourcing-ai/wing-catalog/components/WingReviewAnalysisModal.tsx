'use client';

import { useEffect, useMemo } from 'react';
import { ExternalLink, Star, X } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
  type WingCatalogProduct,
} from '../lib/wing-catalog-extension';
import { buildCoupangProductUrl, buildCoupangReviewUrl } from '../lib/wing-catalog-delivery';

interface WingReviewAnalysisModalProps {
  product: WingCatalogProduct;
  rows: WingCatalogProduct[];
  onClose: () => void;
}

export function WingReviewAnalysisModal({ product, rows, onClose }: WingReviewAnalysisModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const analysis = useMemo(() => buildReviewAnalysis(product, rows), [product, rows]);
  const imageUrl = resolveCoupangCatalogImageUrl(product.imagePath);
  const productUrl = buildCoupangProductUrl(product);
  const reviewUrl = buildCoupangReviewUrl(product);
  const keywords = useMemo(() => tokenizeProductName(product.productName), [product.productName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)]">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Star size={22} className="text-[var(--text-tertiary)]" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-black leading-6 text-[var(--text-primary)]">리뷰 분석</h2>
              <p className="mt-1 line-clamp-2 max-w-md text-sm font-bold text-[var(--text-secondary)]">
                {product.productName}
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--text-tertiary)]">
                상품ID {product.productId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)]"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="평점" value={product.rating != null ? product.rating.toFixed(1) : '-'} accent />
            <StatTile label="리뷰수" value={`${formatNumber(product.ratingCount)}개`} />
            <StatTile label="28일 판매량" value={`${formatNumber(product.salesLast28d)}개`} />
            <StatTile label="전환율" value={formatWingCatalogRate(product.conversionRate28d)} />
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
            <h3 className="text-sm font-black text-[var(--text-secondary)]">이 키워드 안에서의 위치</h3>
            <ul className="mt-3 space-y-2.5">
              <AnalysisLine
                label="리뷰수 순위"
                value={`${analysis.reviewRank}위 / ${analysis.total}개`}
                caption={analysis.reviewPercentileText}
              />
              <AnalysisLine
                label="판매량 순위"
                value={`${analysis.salesRank}위 / ${analysis.total}개`}
                caption={analysis.salesPercentileText}
              />
              <AnalysisLine
                label="가격 포지션"
                value={`${formatKRW(product.salePrice)}원`}
                caption={analysis.pricePositionText}
              />
              <AnalysisLine
                label="리뷰 대비 판매"
                value={analysis.reviewPerSale}
                caption="28일 판매량 ÷ 누적 리뷰수 — 높을수록 신상/회전 빠름"
              />
            </ul>
          </section>

          {keywords.length > 0 && (
            <section>
              <h3 className="text-sm font-black text-[var(--text-secondary)]">상품명 키워드</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {keywords.map((token) => (
                  <span
                    key={token}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]"
                  >
                    {token}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-dashed border-[var(--border)] p-4">
            <p className="text-xs font-bold leading-5 text-[var(--text-tertiary)]">
              리뷰 원문(별점 분포·텍스트)은 쿠팡 상품 페이지에서 확인하세요. 원문 텍스트 자동 분석은 추후
              확장 기능으로 추가할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewUrl && (
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ff5a1f] px-3 text-xs font-black text-white transition hover:bg-[#ef4f18]"
                >
                  <ExternalLink size={14} />
                  쿠팡 리뷰 원문 보기
                </a>
              )}
              {productUrl && (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)]"
                >
                  <ExternalLink size={14} />
                  상품 페이지 열기
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
      <p className="text-xs font-bold text-[var(--text-tertiary)]">{label}</p>
      <p className={cn('mt-1.5 text-lg font-black', accent ? 'text-[#ff5a1f]' : 'text-[var(--text-primary)]')}>{value}</p>
    </div>
  );
}

function AnalysisLine({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-[var(--text-primary)]">{label}</p>
        <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">{caption}</p>
      </div>
      <span className="shrink-0 tabular-nums text-sm font-black text-[var(--text-secondary)]">{value}</span>
    </li>
  );
}

interface ReviewAnalysis {
  total: number;
  reviewRank: number;
  salesRank: number;
  reviewPercentileText: string;
  salesPercentileText: string;
  pricePositionText: string;
  reviewPerSale: string;
}

function buildReviewAnalysis(product: WingCatalogProduct, rows: WingCatalogProduct[]): ReviewAnalysis {
  const total = Math.max(rows.length, 1);
  const reviewRank = rankOf(product, rows, (row) => row.ratingCount ?? -1);
  const salesRank = rankOf(product, rows, (row) => row.salesLast28d ?? -1);

  const prices = rows.map((row) => row.salePrice).filter((value): value is number => value != null);
  const price = product.salePrice;
  let pricePositionText = '가격 정보 없음';
  if (price != null && prices.length > 0) {
    const cheaper = prices.filter((value) => value < price).length;
    const ratio = cheaper / prices.length;
    const band = ratio < 0.33 ? '저가대' : ratio < 0.66 ? '중가대' : '고가대';
    pricePositionText = `이 키워드에서 ${band} · 하위 ${Math.round(ratio * 100)}% 지점`;
  }

  const sales = product.salesLast28d ?? 0;
  const reviews = product.ratingCount ?? 0;
  const reviewPerSale = reviews > 0 ? `${(sales / reviews).toFixed(1)}배` : sales > 0 ? '신규(리뷰 적음)' : '-';

  return {
    total,
    reviewRank,
    salesRank,
    reviewPercentileText: percentileText(reviewRank, total),
    salesPercentileText: percentileText(salesRank, total),
    pricePositionText,
    reviewPerSale,
  };
}

function rankOf(product: WingCatalogProduct, rows: WingCatalogProduct[], valueOf: (row: WingCatalogProduct) => number): number {
  const target = valueOf(product);
  const higher = rows.filter((row) => valueOf(row) > target).length;
  return higher + 1;
}

function percentileText(rank: number, total: number): string {
  if (total <= 1) return '수집 상품 1개';
  const percentile = Math.round((rank / total) * 100);
  return `상위 ${percentile}%`;
}

function tokenizeProductName(name: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of name.replace(/[^\p{Letter}\p{Number}\s]/gu, ' ').split(/\s+/)) {
    const token = raw.trim();
    if (token.length < 2 || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= 12) break;
  }
  return tokens;
}
