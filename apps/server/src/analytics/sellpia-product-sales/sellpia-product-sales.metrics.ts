import type {
  SellpiaProductAbcGrade,
  SellpiaProductTrend,
} from '@kiditem/shared/dashboard';

/**
 * Sellpia 상품별 소진 재고관리 파생 지표(순수 함수).
 *
 * 입력은 모두 "완결 월"(진행 중인 현재 월 제외) 오름차순 소진량 배열 기준.
 * 재고(현재고)가 필요한 발주 계산만 별도이며, ABC/추세/악성/시즌은 판매만으로 산정한다.
 */

// 발주점 = 월평균 소진 × (리드타임 + 안전재고). 리드타임 1개월 + 안전 0.5개월.
export const LEAD_TIME_MONTHS = 1;
export const SAFETY_MONTHS = 0.5;

// ─── 이상치(일회성 벌크/저가 대량) 감지 ───────────────────────────────────────
// 정상 실수요가 아닌 판매를 걸러 평균/ABC/발주를 왜곡하지 않게 한다.
//   (A) 저가 대량: 단가 < 100원(사은품/부자재/B2B) + 총량 큼 → 큰 달을 이상치로.
//   (B) 단일월 급증: 한 달이 나머지 달 합의 4배↑ + 절대량 큼 → 그 달을 이상치로.
// 시즌 스파이크(여름 등)는 나머지 합 대비 4배 미만이라 보통 걸리지 않는다.
const ANOMALY_LOW_PRICE = 100; // 원 미만 = 비정상 저가(사은품/부자재/B2B)
const ANOMALY_LOW_PRICE_MIN_TOTAL = 10000; // 저가 대량으로 볼 최소 총량
const ANOMALY_SPIKE_ABS = 20000; // 단일월 급증 최소 절대량(보수적)
const ANOMALY_DOMINANCE = 6; // 단일월 ≥ 나머지 합 × 6 (일회성 판단)

export function detectAnomaly(
  monthly: { yearMonth: string; orderQty: number }[],
  salePrice: number,
): { anomalyMonths: string[]; anomalyReason: string | null } {
  const total = monthly.reduce((a, m) => a + m.orderQty, 0);
  // (A) 저가 대량: 단가<100원 + 총량 큼 + **1~2달에 몰빵(집중)** → 일회성 벌크.
  // 저가라도 매달 꾸준히 팔리면(집중도 낮음) 정상 상품이므로 제외하지 않는다.
  if (salePrice < ANOMALY_LOW_PRICE && total >= ANOMALY_LOW_PRICE_MIN_TOTAL) {
    const desc = monthly.map((m) => m.orderQty).sort((a, b) => b - a);
    const top2 = (desc[0] ?? 0) + (desc[1] ?? 0);
    const concentrated = total > 0 && top2 >= 0.85 * total; // 상위 2개월이 85%↑
    if (concentrated) {
      const anomalyMonths = monthly.filter((m) => m.orderQty > 0).map((m) => m.yearMonth);
      return { anomalyMonths, anomalyReason: `저가 대량(단가 ${salePrice}원)` };
    }
  }
  // (B) 단일월 급증: 한 달이 크고(≥20000) 나머지 합의 6배↑ → 일회성 대량.
  const anomalyMonths: string[] = [];
  for (const m of monthly) {
    if (m.orderQty < ANOMALY_SPIKE_ABS) continue;
    const rest = total - m.orderQty;
    if (m.orderQty >= ANOMALY_DOMINANCE * rest) anomalyMonths.push(m.yearMonth);
  }
  if (!anomalyMonths.length) return { anomalyMonths: [], anomalyReason: null };
  return { anomalyMonths, anomalyReason: '단일월 급증(일회성)' };
}

// ─── ABC 등급 (소진량 파레토) ────────────────────────────────────────────────
// 총 소진량 내림차순 누적 비중: A ≤ 70%, B ≤ 90%, C 나머지. 무판매(0)는 항상 C.
export function assignAbcGrades(totals: number[]): SellpiaProductAbcGrade[] {
  const grand = totals.reduce((a, b) => a + b, 0);
  if (grand <= 0) return totals.map(() => 'C');
  // 내림차순 순회하되 원래 인덱스 순서로 결과를 되돌린다.
  const order = totals
    .map((qty, idx) => ({ qty, idx }))
    .sort((x, y) => y.qty - x.qty);
  const grades: SellpiaProductAbcGrade[] = new Array(totals.length).fill('C');
  let cum = 0;
  for (const { qty, idx } of order) {
    if (qty <= 0) {
      grades[idx] = 'C';
      continue;
    }
    // 누적 "이전" 비중 기준: 밴드를 교차하는 상품은 상위 밴드에 포함(표준 ABC).
    // 한 상품이 총량을 지배해도 최상위 상품은 A가 된다.
    const shareBefore = cum / grand;
    grades[idx] = shareBefore < 0.7 ? 'A' : shareBefore < 0.9 ? 'B' : 'C';
    cum += qty;
  }
  return grades;
}

// ─── 추세 ───────────────────────────────────────────────────────────────────
// 최근 완결 월 소진량 vs 직전 최대 3개월 평균. ±20% 밴드 밖이면 up/down.
export function computeTrend(monthlyAsc: number[]): SellpiaProductTrend {
  const n = monthlyAsc.length;
  if (n < 2) return 'flat';
  const recent = monthlyAsc[n - 1];
  const prior = monthlyAsc.slice(Math.max(0, n - 4), n - 1);
  const base = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (base === 0) return recent > 0 ? 'up' : 'flat';
  const ratio = recent / base;
  if (ratio >= 1.2) return 'up';
  if (ratio <= 0.8) return 'down';
  return 'flat';
}

// ─── 악성재고 ────────────────────────────────────────────────────────────────
// 악성재고 = "재고는 있는데 안 팔리는" 재고. 두 신호:
//   (정체) 최근 2개월 완결 판매 0 + 이전엔 팔렸음 → 재고가 있어야 진짜 악성
//   (급감) 최근 3개월 연속 감소 + 최근월 ≤ 최대치 30% → 수요 붕괴
// currentStock 로 품절과 구분한다:
//   - null(재고 미상, 1단계): '정체'는 품절과 구분 불가 → 보류. '급감'만 소프트 신호.
//   - 0(품절): 쌓인 재고 없음 → 악성 아님.
//   - >0(재고 있음): 정체/급감 모두 진짜 악성.
export function computeDeadStock(
  monthlyAsc: number[],
  currentStock: number | null,
): { deadStock: boolean; deadStockReason: string | null } {
  const none = { deadStock: false, deadStockReason: null };
  const n = monthlyAsc.length;
  if (n < 2) return none;
  if (currentStock === 0) return none; // 품절 = 쌓인 재고 없음

  const last2 = monthlyAsc.slice(-2);
  const earlierSum = monthlyAsc.slice(0, -2).reduce((a, b) => a + b, 0);
  const stall = last2[0] === 0 && last2[1] === 0 && earlierSum > 0;

  let declining = false;
  if (n >= 3) {
    const l3 = monthlyAsc.slice(-3);
    const peak = Math.max(...monthlyAsc);
    declining = l3[0] > l3[1] && l3[1] > l3[2] && peak > 0 && l3[2] <= peak * 0.3;
  }

  if (currentStock === null) {
    // 재고 미상: 급감(수요 붕괴)만 표시. 정체는 품절 가능성 때문에 보류.
    return declining ? { deadStock: true, deadStockReason: '판매 급감' } : none;
  }
  // currentStock > 0
  if (stall) return { deadStock: true, deadStockReason: '재고 정체(2개월+ 미판매)' };
  if (declining) return { deadStock: true, deadStockReason: '판매 급감' };
  return none;
}

// ─── 시즌 분류 ────────────────────────────────────────────────────────────────
// 완결 월별 소진을 달력 월(1~12)로 합산해 시즌 윈도우별 비중을 낸다.
// 한 시즌이 총 판매의 50% 이상이면 그 시즌 태그. 근거(완결 월 수)가 8개월 미만이면 null.
const SEASON_WINDOWS: { tag: string; months: number[] }[] = [
  { tag: '신학기', months: [2, 3] },
  { tag: '어린이날', months: [4, 5] },
  { tag: '여름', months: [6, 7, 8] },
  { tag: '겨울', months: [11, 12, 1] },
];

export function computeSeasonTag(
  monthly: { yearMonth: string; orderQty: number }[],
  completeMonthCount: number,
): string | null {
  if (completeMonthCount < 8) return null; // 1년치 근거 부족 — 판단 보류
  const byCalMonth = new Array(13).fill(0); // index 1..12
  let total = 0;
  for (const m of monthly) {
    const mm = Number(m.yearMonth.split('-')[1]);
    if (mm >= 1 && mm <= 12) {
      byCalMonth[mm] += m.orderQty;
      total += m.orderQty;
    }
  }
  if (total <= 0) return null;
  let best: { tag: string; share: number } | null = null;
  for (const win of SEASON_WINDOWS) {
    const sum = win.months.reduce((a, mm) => a + byCalMonth[mm], 0);
    const share = sum / total;
    if (!best || share > best.share) best = { tag: win.tag, share };
  }
  if (best && best.share >= 0.5) return best.tag;
  return '상시';
}

// ─── 발주(재고 소진) — 현재고 필요 ────────────────────────────────────────────
export interface ReorderResult {
  monthsOfStockLeft: number | null;
  reorderPoint: number | null;
  needsReorder: boolean;
}

// monthlyRate = 월평균 소진(avg2m 등). currentStock=null 이면 미수집 → 계산 보류.
export function computeReorder(
  currentStock: number | null,
  monthlyRate: number,
): ReorderResult {
  if (currentStock === null) {
    return { monthsOfStockLeft: null, reorderPoint: null, needsReorder: false };
  }
  const reorderPoint = Math.round(monthlyRate * (LEAD_TIME_MONTHS + SAFETY_MONTHS));
  // 소진이 없으면(월평균 0) 잔여 개월수는 무한 → null 로 표기, 발주 대상 아님(악성재고로 분리).
  const monthsOfStockLeft =
    monthlyRate > 0 ? Math.round((currentStock / monthlyRate) * 10) / 10 : null;
  const needsReorder = monthlyRate > 0 && currentStock <= reorderPoint;
  return { monthsOfStockLeft, reorderPoint, needsReorder };
}
