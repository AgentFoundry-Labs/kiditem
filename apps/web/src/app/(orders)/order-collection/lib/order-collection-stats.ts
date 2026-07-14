import {
  resolveOrderCollectionMallKey,
  resolveOrderCollectionMallName,
} from "./order-collection-malls";
import {
  getHistoryCollectionBucket,
  getHistoryOrderCount,
} from "./order-history-count";
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
  sentOrderNumbers: Set<string>;
  fallbackByBucket: Map<string, number>;
  fallbackUnsentByBucket: Map<string, number>;
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

    if (dateKey !== today) continue;

    const mallStatKey = mallKey ?? `unknown-${mallName}`;
    let mallStat = byMall.get(mallStatKey);
    if (!mallStat) {
      mallStat = {
        key: mallStatKey,
        name: mallName,
        files: 0,
        orderNumbers: new Set<string>(),
        sentOrderNumbers: new Set<string>(),
        fallbackByBucket: new Map<string, number>(),
        fallbackUnsentByBucket: new Map<string, number>(),
        productRows: 0,
        latestAt: item.convertedAt,
      };
      byMall.set(mallStatKey, mallStat);
    }

    mallStat.files += 1;
    const orderNumbers = (item.orderNumbers ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (orderNumbers.length > 0) {
      for (const orderNumber of orderNumbers) {
        mallStat.orderNumbers.add(orderNumber);
        if (item.sentAt) mallStat.sentOrderNumbers.add(orderNumber);
      }
    } else {
      const bucket = getHistoryCollectionBucket(item);
      const fallbackCount = getHistoryOrderCount(item) ?? 0;
      mallStat.fallbackByBucket.set(
        bucket,
        Math.max(mallStat.fallbackByBucket.get(bucket) ?? 0, fallbackCount),
      );
      if (!item.sentAt) {
        mallStat.fallbackUnsentByBucket.set(
          bucket,
          Math.max(
            mallStat.fallbackUnsentByBucket.get(bucket) ?? 0,
            fallbackCount,
          ),
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
      return {
        key: stat.key,
        name: stat.name,
        files: stat.files,
        orderRows: hasOrderNumbers
          ? stat.orderNumbers.size
          : sumMapValues(stat.fallbackByBucket),
        newRows: hasOrderNumbers
          ? [...stat.orderNumbers].filter(
              (orderNumber) => !stat.sentOrderNumbers.has(orderNumber),
            ).length
          : sumMapValues(stat.fallbackUnsentByBucket),
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
    sent: 0,
    trackingSent: 0,
    done: 0,
  };

  for (const item of items) {
    if ((item.collectionDate ?? dayKey(item.convertedAt)) !== date) continue;
    const orderCount = getHistoryOrderCount(item) ?? 0;
    summary.todayOrders += orderCount;
    if (item.sentAt) summary.sent += orderCount;
    else summary.waiting += orderCount;
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
