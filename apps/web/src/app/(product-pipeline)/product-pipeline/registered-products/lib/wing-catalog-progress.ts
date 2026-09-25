import {
  CoupangCatalogCollectionQualitySchema,
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WING_CATALOG_LIST_KIND,
  WingCatalogExcelResultSchema,
  WingCatalogListResultSchema,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { OperationView } from '@kiditem/shared/operation';
import { operatorReason } from '@/lib/operator-error';
import { formatNumber } from '@/lib/utils';

export type WingCatalogOperationTone = 'running' | 'done' | 'failed' | 'stopped';

/** 운영자에게 보이는 실행 하나의 한 줄: 단계, 수, 진행률(모르면 null). */
export type WingCatalogOperationView = Readonly<{
  phase: string;
  detail: string | null;
  percent: number | null;
  tone: WingCatalogOperationTone;
}>;

const FAILED_FALLBACK = '쿠팡 상품 받기에 실패했습니다.';

/**
 * Wing 카탈로그 실행(목록·상세·엑셀, KID-354·351) 하나를 운영자 문장으로 바꾼다. 끝난 실행은 result의 수를 그대로
 * 말한다 — 상품 하나 다시 받기가 끝나도 "전체 상품 반영 완료"라고 하지 않는다(KID-351).
 */
export function describeWingCatalogOperation(operation: OperationView): WingCatalogOperationView {
  if (operation.status === 'cancelled') return { phase: '수집 중단됨', detail: null, percent: null, tone: 'stopped' };
  if (operation.status === 'failed') {
    return { phase: '수집 실패', detail: operatorReason(operation.errorMessage, FAILED_FALLBACK), percent: null, tone: 'failed' };
  }
  const progress = operation.progress ?? {};
  const running = operation.status === 'executing' || operation.status === 'prepared';
  switch (operation.kind) {
    case WING_CATALOG_LIST_KIND: {
      if (running) {
        const listed = num(progress.listedProducts);
        const total = num(progress.totalProducts);
        return {
          phase: '상품 목록 받는 중',
          detail: total === null ? null : `목록 ${formatNumber(listed ?? 0)} / ${formatNumber(total)}`,
          percent: ratio(listed, total),
          tone: 'running',
        };
      }
      const result = WingCatalogListResultSchema.pick({
        listedProductCount: true,
        detailTargetProductIds: true,
        absentProductIds: true,
      }).strip().safeParse(operation.result);
      if (!result.success) return { phase: '상품 목록 반영', detail: null, percent: 100, tone: 'done' };
      const { detailTargetProductIds: targets, absentProductIds: absent, listedProductCount } = result.data;
      if (targets.length === 0 && absent.length === 0) {
        return { phase: `바뀐 상품 없음 · 상품 ${formatNumber(listedProductCount)}개 최신`, detail: null, percent: 100, tone: 'done' };
      }
      // 확장이 곧바로 상세 실행을 잇는다.
      return {
        phase: `목록 반영 · 상세 ${formatNumber(targets.length)}개 · 삭제 확인 ${formatNumber(absent.length)}개 받을 차례`,
        detail: null,
        percent: null,
        tone: 'running',
      };
    }
    case WING_CATALOG_DETAILS_KIND: {
      if (running) {
        const done = num(progress.detailsDone) ?? 0;
        const targets = num(progress.detailTargets);
        const checked = num(progress.absentChecked) ?? 0;
        const absent = num(progress.absentTotal) ?? 0;
        const detail = targets === null
          ? null
          : `상세 ${formatNumber(done)} / ${formatNumber(targets)}${absent > 0 ? ` · 삭제 확인 ${formatNumber(checked)} / ${formatNumber(absent)}` : ''}`;
        return {
          phase: '바뀐 상품 상세 받는 중',
          detail,
          percent: targets === null ? null : ratio(done + checked, targets + absent),
          tone: 'running',
        };
      }
      const quality = CoupangCatalogCollectionQualitySchema.safeParse(operation.result);
      if (!quality.success) return { phase: '상품 상세 반영', detail: null, percent: 100, tone: 'done' };
      const { detailApplied, detailUnchanged, deletedProducts, unconfirmedAbsentProductIds } = quality.data;
      const parts = [
        detailUnchanged > 0 ? `같은 상세 ${formatNumber(detailUnchanged)}개` : null,
        deletedProducts > 0 ? `삭제 ${formatNumber(deletedProducts)}개` : null,
        unconfirmedAbsentProductIds.length > 0 ? `삭제 미확인 ${formatNumber(unconfirmedAbsentProductIds.length)}개` : null,
      ].filter((part): part is string => part !== null);
      return {
        phase: `상품 ${formatNumber(detailApplied)}개 상세 반영`,
        detail: parts.length > 0 ? parts.join(' · ') : null,
        percent: 100,
        tone: 'done',
      };
    }
    case WING_CATALOG_EXCEL_KIND: {
      if (running) {
        const executed = num(progress.executeCount);
        const total = num(progress.totalCount);
        return {
          phase: progress.status === 'DOWNLOADED' ? '쿠팡상품정보 엑셀 반영 중' : '쿠팡상품정보 엑셀 만드는 중',
          detail: total === null ? null : `${formatNumber(executed ?? 0)} / ${formatNumber(total)}`,
          percent: ratio(executed, total),
          tone: 'running',
        };
      }
      const changes = WingCatalogExcelResultSchema.safeParse(operation.result);
      if (!changes.success) return { phase: '쿠팡상품정보 반영', detail: null, percent: 100, tone: 'done' };
      const { createdProductCount, updatedProductCount, createdSkuCount, updatedSkuCount, skippedRowCount } = changes.data;
      return {
        phase: `쿠팡상품정보 반영 · 상품 ${formatNumber(createdProductCount + updatedProductCount)}개 · 옵션 ${formatNumber(createdSkuCount + updatedSkuCount)}개`,
        detail: skippedRowCount > 0 ? `건너뛴 줄 ${formatNumber(skippedRowCount)}개` : null,
        percent: 100,
        tone: 'done',
      };
    }
    default:
      return { phase: running ? '상품 받기 진행 중' : '상품 받기 끝남', detail: null, percent: null, tone: running ? 'running' : 'done' };
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function ratio(done: number | null, total: number | null): number | null {
  if (done === null || total === null) return null;
  if (total === 0) return 100;
  return Math.min(100, Math.round((done / total) * 100));
}

/** 목록이 상세를 넘긴 뒤 상세 실행이 나타나기를 기다리는 시간. 확장은 목록 finish 직후 곧바로 begin한다. */
export const CHAINED_DETAILS_GRACE_MS = 60_000;

/**
 * 계정의 최신 실행이 상세를 넘긴(`result.next`) 목록이고 그 뒤 상세 실행이 아직 없으면 기다리는 중이다(KID-354).
 * 목록 finish와 상세 begin 사이에도 화면이 계속 읽도록 폴링 조건에 쓴다. `operations`는 최신 것부터.
 */
export function awaitingChainedDetails(operations: readonly OperationView[], nowMs: number): boolean {
  const pending = chainedListWithoutDetails(operations);
  return pending !== null && nowMs - finishedMs(pending) < CHAINED_DETAILS_GRACE_MS;
}

/**
 * 계정의 카탈로그 상태 한 줄: 도는 실행이 있으면 그것, 없으면 최신 실행. 목록이 넘긴 상세가 제시간에 시작되지 않았으면
 * (확장이 상세 begin을 거절당했거나 멈췄다) 상세 시작 실패로 끝낸다.
 */
export function describeAccountCatalog(operations: readonly OperationView[], nowMs: number): WingCatalogOperationView | null {
  const running = operations.find((operation) => operation.status === 'executing' || operation.status === 'prepared');
  if (running) return describeWingCatalogOperation(running);
  const latest = operations[0];
  if (!latest) return null;
  const pending = chainedListWithoutDetails(operations);
  if (pending && nowMs - finishedMs(pending) >= CHAINED_DETAILS_GRACE_MS) {
    return {
      phase: '상세 시작 실패',
      detail: '목록은 반영했지만 상세 받기가 시작되지 않았습니다. 다시 받기로 다시 시작해 주세요.',
      percent: null,
      tone: 'failed',
    };
  }
  return describeWingCatalogOperation(latest);
}

function chainedListWithoutDetails(operations: readonly OperationView[]): OperationView | null {
  const latest = operations[0];
  if (!latest || latest.kind !== WING_CATALOG_LIST_KIND || latest.status !== 'succeeded') return null;
  const next = latest.result?.next;
  return next !== null && next !== undefined ? latest : null;
}

function finishedMs(operation: OperationView): number {
  return operation.finishedAt ? new Date(operation.finishedAt).getTime() : 0;
}
