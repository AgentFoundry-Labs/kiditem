import { formatNumber } from '@/lib/utils';
import type {
  CoupangCatalogCollectionRun,
  CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';

export type CoupangCatalogProgressView = {
  discoveredLabel: string;
  hydratedLabel: string;
  publishedLabel: string;
  publicationDetailsLabel: string;
  rateLabel: string | null;
  etaLabel: string | null;
  percent: number;
  stageLabel: string;
  resumeLabel: string | null;
};

export function buildCoupangCatalogProgress(
  run: CoupangCatalogCollectionRun,
  nowMs: number,
  stage: CoupangCatalogStage = run.plan.stage,
): CoupangCatalogProgressView {
  const progress = run.progress;
  const discovered = Math.max(run.manifest?.totalItems ?? 0, progress.discoveredProducts);
  // 상세 단계는 목록 단계가 계획한 대상만 받는다 (KID-348). 옛 계획은 목록 전체.
  const detailTargets = stage === 'details'
    ? run.plan.detailTargetProductIds?.length ?? run.plan.basicProductIds?.length
    : undefined;
  const total = detailTargets ?? discovered;
  const quality = run.quality;
  const finished = run.state === 'COMPLETE';
  const stageLabel = stage === 'basics' ? '기본 목록' : '상세';
  const hydrationLabel = stage === 'basics' ? '기본 목록 수집' : '상세 수집';
  const remaining = Math.max(0, total - progress.hydratedProducts);
  const elapsedMs = nowMs - new Date(run.createdAt).getTime();
  const ratePerMinute = run.state === 'RUNNING' && elapsedMs > 0 && progress.hydratedProducts > 0
    ? progress.hydratedProducts / (elapsedMs / 60_000)
    : 0;
  const etaMinutes = !finished && remaining > 0 && ratePerMinute > 0
    ? remaining / ratePerMinute
    : null;
  const percent = finished
    ? 100
    : total > 0
      ? Math.min(99, Math.round((progress.hydratedProducts / total) * 100))
      : 0;

  return {
    discoveredLabel:
      `목록 발견 ${formatNumber(progress.discoveredProducts)} / ${formatNumber(discovered)}`,
    hydratedLabel:
      `${hydrationLabel} ${formatNumber(progress.hydratedProducts)} / ${formatNumber(total)}`,
    publishedLabel: finished
      ? stage === 'details' && quality
        ? `상세 반영 ${formatNumber(quality.detailApplied)} · 변경 없음 ${formatNumber(quality.detailUnchanged)}` +
          ` / ${formatNumber(quality.detailTargets)}`
        : `${stageLabel} 보강 완료 ${formatNumber(progress.publishedProducts)} / ${formatNumber(total)}`
      : stage === 'details'
        ? '상세는 모두 받은 뒤 한 번에 반영'
        : '기본 목록 완료 후 반영',
    publicationDetailsLabel: finished
      ? `옵션 ${formatNumber(progress.publishedOptionCount)}개 · ` +
        `이미지 ${formatNumber(progress.publishedMediaCount)}개 반영` +
        (quality && quality.deletedProducts > 0 ? ` · 삭제 ${formatNumber(quality.deletedProducts)}개` : '') +
        (quality && quality.unconfirmedAbsentProductIds.length > 0
          ? ` · 삭제 미확인 ${formatNumber(quality.unconfirmedAbsentProductIds.length)}개`
          : '')
      : '수집 중에는 기존 상품 데이터 유지',
    rateLabel: ratePerMinute > 0 ? `수집 ${ratePerMinute.toFixed(1)}개/분` : null,
    etaLabel: etaMinutes === null ? null : `${hydrationLabel} 예상 ${formatEta(etaMinutes)}`,
    percent,
    stageLabel,
    resumeLabel: run.error?.notBefore
      ? `재개 가능 시각 ${formatResumeAt(run.error.notBefore)}`
      : null,
  };
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

function formatResumeAt(value: string | Date): string {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(timestamp)) return '재개 가능 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}
