import type { CoupangCatalogCollectionRun } from '@kiditem/shared/coupang-catalog-snapshot';
import { formatNumber } from '@/lib/utils';

export type CoupangCatalogProgressView = {
  discoveredLabel: string;
  hydratedLabel: string;
  publishedLabel: string;
  publicationDetailsLabel: string;
  rateLabel: string | null;
  etaLabel: string | null;
  percent: number;
};

export function buildCoupangCatalogProgress(
  run: CoupangCatalogCollectionRun,
  nowMs: number,
): CoupangCatalogProgressView {
  const progress = run.progress;
  const total = Math.max(run.manifest?.totalItems ?? 0, progress.discoveredProducts);
  const remaining = Math.max(0, total - progress.publishedProducts);
  const publicationStartedAt = progress.firstPublishedAt ?? run.createdAt;
  const elapsedMs = Math.max(1, nowMs - new Date(publicationStartedAt).getTime());
  const ratePerMinute = progress.publishedProducts > 0
    ? progress.publishedProducts / (elapsedMs / 60_000)
    : 0;
  const finished = run.status === 'completed' || run.phase === 'finished';
  const etaMinutes = !finished && remaining > 0 && ratePerMinute > 0
    ? remaining / ratePerMinute
    : null;
  const percent = finished
    ? 100
    : total > 0
      ? Math.min(99, Math.round((progress.publishedProducts / total) * 100))
      : 0;

  return {
    discoveredLabel:
      `목록 발견 ${formatNumber(progress.discoveredProducts)} / ${formatNumber(total)}`,
    hydratedLabel:
      `상세 수집 ${formatNumber(progress.hydratedProducts)} / ${formatNumber(total)}`,
    publishedLabel:
      `DB 반영 ${formatNumber(progress.publishedProducts)} / ${formatNumber(total)}`,
    publicationDetailsLabel:
      `옵션 ${formatNumber(progress.publishedOptionCount)}개 · ` +
      `이미지 ${formatNumber(progress.publishedMediaCount)}개 반영`,
    rateLabel: ratePerMinute > 0 ? `처리 ${ratePerMinute.toFixed(1)}개/분` : null,
    etaLabel: etaMinutes === null ? null : `완료 예상 ${formatEta(etaMinutes)}`,
    percent,
  };
}

export function resolveCoupangCatalogError(input: {
  browserActive: boolean;
  extensionError: string | null;
  startError: string | null;
  serverError: string | null;
}): string | null {
  if (input.startError) return input.startError;
  if (input.browserActive) return null;
  return input.extensionError || input.serverError;
}

function formatEta(minutes: number): string {
  if (minutes < 1) return '1분 이내';
  const rounded = Math.ceil(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}
