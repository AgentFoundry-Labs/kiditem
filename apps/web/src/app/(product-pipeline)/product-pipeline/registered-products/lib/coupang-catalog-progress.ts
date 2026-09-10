import { formatNumber } from '@/lib/utils';
import type {
  CoupangCatalogCollectionRun,
  CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';

const EXTENSION_RESPONSE_TIMEOUT = '익스텐션 응답 시간이 초과되었습니다.';

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
  stage: CoupangCatalogStage = run.plan?.stage ?? 'full',
): CoupangCatalogProgressView {
  const progress = run.progress;
  const total = Math.max(run.manifest?.totalItems ?? 0, progress.discoveredProducts);
  const finished = run.state === 'COMPLETE';
  const stageLabel = stage === 'basics' ? '기본 목록' : stage === 'details' ? '전체 상세' : '전체 상품';
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
      `목록 발견 ${formatNumber(progress.discoveredProducts)} / ${formatNumber(total)}`,
    hydratedLabel:
      `${hydrationLabel} ${formatNumber(progress.hydratedProducts)} / ${formatNumber(total)}`,
    publishedLabel: finished
      ? stage === 'full'
        ? `DB 반영 ${formatNumber(progress.publishedProducts)} / ${formatNumber(total)}`
        : `${stageLabel} 보강 완료 ${formatNumber(progress.publishedProducts)} / ${formatNumber(total)}`
      : stage === 'details'
        ? `상세 보강 반영 ${formatNumber(progress.publishedProducts)} / ${formatNumber(total)}`
        : stage === 'basics'
          ? '기본 목록 완료 후 반영'
          : '전체 수집 후 한 번에 반영',
    publicationDetailsLabel: finished
      ? `옵션 ${formatNumber(progress.publishedOptionCount)}개 · ` +
        `이미지 ${formatNumber(progress.publishedMediaCount)}개 반영`
      : stage === 'details' && (progress.publishedProducts > 0 || progress.publishedOptionCount > 0 || progress.publishedMediaCount > 0)
        ? `옵션 ${formatNumber(progress.publishedOptionCount)}개 · 이미지 ${formatNumber(progress.publishedMediaCount)}개 보강 · 미완료 상품은 기존 상세 유지`
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

export function resolveCoupangCatalogError(input: {
  browserActive: boolean;
  extensionError: string | null;
  startError: string | null;
  serverError: string | null;
}): string | null {
  if (input.serverError) return input.serverError;
  if (input.startError && !(
    input.browserActive && input.startError === EXTENSION_RESPONSE_TIMEOUT
  )) return input.startError;
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

function formatResumeAt(value: string | Date): string {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(timestamp)) return '재개 가능 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}
