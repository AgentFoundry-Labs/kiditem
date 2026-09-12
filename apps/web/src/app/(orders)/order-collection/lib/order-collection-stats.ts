import {
  resolveOrderCollectionMallKey,
  resolveOrderCollectionMallName,
} from "./order-collection-malls";
import {
  getHistoryCollectionBucket,
  getHistoryOrderCount,
} from "./order-history-count";
import {
  hasSellpiaTransmissionRequest,
  isSellpiaOrderFile,
} from "./order-collection-page-model";
import type { StoredOrderCollectionFile } from "./order-generated-file-store";
import type { OrderCollectionPipelineSummary } from "../components/OrderCollectionPipeline";

export interface DailyCollectionStat {
  key: string;
  label: string;
  files: number;
  orderRows: number;
  productRows: number;
  outputRows: number;
  browserFiles: number;
  manualFiles: number;
  latestAt: number;
  malls: string[];
}

export interface MallCollectionStat {
  key: string;
  name: string;
  files: number;
  orderRows: number;
  newRows: number;
  productRows: number;
  latestAt: number;
  /**
   * 서버 기억이 말하는 오늘 마지막 수집 결과. 쇼핑몰 홈의 몰별 상태와 같은 기록이라 두 화면이
   * 같은 말을 한다. 로그인 필요 · 인증 필요 · 실패면 카드가 빨갛게 선다.
   */
  serverStatus?: {
    label: string;
    tone: 'failed' | 'attention' | 'ok' | 'empty';
    /** 왜 그런지 — 기억에 남은 짧은 사유. 카드에서 마우스를 올리면 보인다. */
    detail?: string | null;
  } | null;
}

export interface OrderCollectionSummary {
  dailyStats: DailyCollectionStat[];
  mallStats: MallCollectionStat[];
  mallStatsByKey: Map<string, MallCollectionStat>;
  latestAt: number;
  totals: {
    orders: number;
    products: number;
  };
}

interface MallCollectionAccumulator {
  key: string;
  name: string;
  files: number;
  orderNumbers: Set<string>;
  fallbackByBucket: Map<string, number>;
  /**
   * "신규" = 오늘 수집분 중 셀피아 미전송. 파일 순서와 무관하게 "전송됨이 우선"이 되도록
   * 전송된 주문번호를 따로 모아 마지막에 차집합으로 계산한다.
   */
  transmittedOrderNumbers: Set<string>;
  /** 주문번호가 없는 레거시 파일용. 전송된 버킷은 신규에서 뺀다. */
  fallbackWaitingByBucket: Map<string, number>;
  fallbackTransmittedBuckets: Set<string>;
  productRows: number;
  latestAt: number;
}

export function buildOrderCollectionSummary(
  items: StoredOrderCollectionFile[],
  today = dayKey(Date.now()),
): OrderCollectionSummary {
  const byDate = new Map<
    string,
    Omit<DailyCollectionStat, "malls"> & {
      malls: Set<string>;
    }
  >();
  const byMall = new Map<string, MallCollectionAccumulator>();
  const totals = { orders: 0, products: 0 };
  let latestAt = 0;

  for (const item of items) {
    if (!isSellpiaOrderFile(item)) continue;
    const orderRows = getOrderCount(item);
    const productRows = item.productRows ?? 0;
    const outputRows = item.outputRows ?? 0;
    const mallKey = resolveOrderCollectionMallKey(item);
    const mallName =
      resolveOrderCollectionMallName({ mallKey, mallName: item.mallName }) ??
      "기타";

    latestAt = Math.max(latestAt, item.convertedAt);
    totals.orders += orderRows;
    totals.products += productRows;

    const dateKey = item.collectionDate || dayKey(item.convertedAt);
    let dateStat = byDate.get(dateKey);
    if (!dateStat) {
      dateStat = {
        key: dateKey,
        label: dayLabel(dateKey),
        files: 0,
        orderRows: 0,
        productRows: 0,
        outputRows: 0,
        browserFiles: 0,
        manualFiles: 0,
        latestAt: item.convertedAt,
        malls: new Set<string>(),
      };
      byDate.set(dateKey, dateStat);
    }

    dateStat.files += 1;
    dateStat.orderRows += orderRows;
    dateStat.productRows += productRows;
    dateStat.outputRows += outputRows;
    dateStat.latestAt = Math.max(dateStat.latestAt, item.convertedAt);
    if (item.collectionMode === "manual-upload") dateStat.manualFiles += 1;
    else dateStat.browserFiles += 1;
    if (mallName) dateStat.malls.add(mallName);

    // 몰 카드는 오늘 수집분만 집계한다("당일", "신규" 모두 오늘 수집 기준).
    if (dateKey !== today) continue;

    const mallStatKey = mallKey ?? `unknown-${mallName}`;
    let mallStat = byMall.get(mallStatKey);
    if (!mallStat) {
      mallStat = {
        key: mallStatKey,
        name: mallName,
        files: 0,
        orderNumbers: new Set<string>(),
        fallbackByBucket: new Map<string, number>(),
        transmittedOrderNumbers: new Set<string>(),
        fallbackWaitingByBucket: new Map<string, number>(),
        fallbackTransmittedBuckets: new Set<string>(),
        productRows: 0,
        latestAt: item.convertedAt,
      };
      byMall.set(mallStatKey, mallStat);
    }

    const transmitted = hasSellpiaTransmissionRequest(item);
    mallStat.files += 1;
    const orderNumbers = (item.orderNumbers ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (orderNumbers.length > 0) {
      for (const orderNumber of orderNumbers) {
        mallStat.orderNumbers.add(orderNumber);
        if (transmitted) mallStat.transmittedOrderNumbers.add(orderNumber);
      }
    } else {
      const bucket = getHistoryCollectionBucket(item);
      const fallbackCount = getHistoryOrderCount(item) ?? 0;
      mallStat.fallbackByBucket.set(
        bucket,
        Math.max(mallStat.fallbackByBucket.get(bucket) ?? 0, fallbackCount),
      );
      if (transmitted) {
        mallStat.fallbackTransmittedBuckets.add(bucket);
      } else {
        mallStat.fallbackWaitingByBucket.set(
          bucket,
          Math.max(mallStat.fallbackWaitingByBucket.get(bucket) ?? 0, fallbackCount),
        );
      }
    }
    mallStat.productRows = Math.max(mallStat.productRows, productRows);
    mallStat.latestAt = Math.max(mallStat.latestAt, item.convertedAt);
  }

  const dailyStats = [...byDate.values()]
    .map((stat) => ({ ...stat, malls: [...stat.malls] }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const mallStats = [...byMall.values()]
    .map<MallCollectionStat>((stat) => {
      const hasOrderNumbers = stat.orderNumbers.size > 0;
      // 신규 = 오늘 수집분 중 셀피아 미전송. 전송하면 빠진다.
      const pendingOrderNumbers = [...stat.orderNumbers].filter(
        (orderNumber) => !stat.transmittedOrderNumbers.has(orderNumber),
      ).length;
      const pendingFallbackRows = [...stat.fallbackWaitingByBucket.entries()]
        .filter(([bucket]) => !stat.fallbackTransmittedBuckets.has(bucket))
        .reduce((sum, [, count]) => sum + count, 0);
      return {
        key: stat.key,
        name: stat.name,
        files: stat.files,
        orderRows: hasOrderNumbers
          ? stat.orderNumbers.size
          : sumMapValues(stat.fallbackByBucket),
        newRows: pendingOrderNumbers + pendingFallbackRows,
        productRows: stat.productRows,
        latestAt: stat.latestAt,
      };
    })
    .sort((a, b) => b.latestAt - a.latestAt || b.orderRows - a.orderRows);
  const mallStatsByKey = new Map(mallStats.map((stat) => [stat.key, stat]));

  return {
    dailyStats,
    mallStats,
    mallStatsByKey,
    latestAt,
    totals,
  };
}

function sumMapValues(values: Map<string, number>): number {
  let sum = 0;
  for (const value of values.values()) sum += value;
  return sum;
}

export function buildOrderCollectionPipelineSummary(
  items: StoredOrderCollectionFile[],
  date = dayKey(Date.now()),
): OrderCollectionPipelineSummary {
  const summary: OrderCollectionPipelineSummary = {
    todayOrders: 0,
    waiting: 0,
    transmissionRequested: 0,
    inventoryPending: 0,
    trackingSent: 0,
    done: 0,
  };

  for (const item of items) {
    if (!isSellpiaOrderFile(item)) continue;
    if ((item.collectionDate ?? dayKey(item.convertedAt)) !== date) continue;
    const orderCount = getHistoryOrderCount(item) ?? 0;
    summary.todayOrders += orderCount;
    if (hasSellpiaTransmissionRequest(item)) {
      summary.transmissionRequested += orderCount;
      summary.inventoryPending += orderCount;
    } else {
      summary.waiting += orderCount;
    }
  }

  return summary;
}

export function getOrderCollectionOrderCount(
  result: StoredOrderCollectionFile,
): number {
  return getOrderCount(result);
}

export function dayKey(timestamp: number): string {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrderCount(result: StoredOrderCollectionFile): number {
  if (result.outputRows === null || result.productRows === null) return 0;
  return Math.max(0, result.outputRows - result.productRows);
}

function dayLabel(key: string): string {
  const [year, month, day] = key.split("-");
  return `${year}. ${month}. ${day}.`;
}
