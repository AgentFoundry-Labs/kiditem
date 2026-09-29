import {
  resolveOrderCollectionMallKey,
  resolveOrderCollectionMallName,
} from "./order-collection-malls";
import { getHistoryOrderCount } from "./order-history-count";
import {
  hasSellpiaTransmissionRequest,
  isSellpiaOrderFile,
} from "./order-collection-page-model";
import type { OrderCollectionTodayOrders } from "@kiditem/shared/order-collection-source";
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

/** 이 브라우저의 오늘 파일 기록에서 나오는 몰 칸(파일 수·상품 줄·마지막 변환 시각). 주문 수는 없다. */
export interface LocalMallCollectionStat {
  key: string;
  name: string;
  files: number;
  productRows: number;
  latestAt: number;
}

/** 몰 카드 한 칸. 당일(`orderRows`)·신규(`newRows`)는 Orders 서버 리더의 값이다(KID-234). */
export interface MallCollectionStat extends LocalMallCollectionStat {
  orderRows: number;
  newRows: number;
}

export interface OrderCollectionSummary {
  dailyStats: DailyCollectionStat[];
  mallStats: LocalMallCollectionStat[];
  mallStatsByKey: Map<string, LocalMallCollectionStat>;
  latestAt: number;
  totals: {
    orders: number;
    products: number;
  };
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
  const byMall = new Map<string, LocalMallCollectionStat>();
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

    // 몰 카드의 파일 칸은 오늘 수집분만 본다. 당일·신규 수는 서버 리더가 준다(KID-234) — 이 브라우저의 파일·전송 기록으로 세지 않는다.
    if (dateKey !== today) continue;

    const mallStatKey = mallKey ?? `unknown-${mallName}`;
    const mallStat = byMall.get(mallStatKey);
    if (!mallStat) {
      byMall.set(mallStatKey, { key: mallStatKey, name: mallName, files: 1, productRows, latestAt: item.convertedAt });
      continue;
    }
    mallStat.files += 1;
    mallStat.productRows = Math.max(mallStat.productRows, productRows);
    mallStat.latestAt = Math.max(mallStat.latestAt, item.convertedAt);
  }

  const dailyStats = [...byDate.values()]
    .map((stat) => ({ ...stat, malls: [...stat.malls] }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const mallStats = [...byMall.values()].sort((a, b) => b.latestAt - a.latestAt);
  const mallStatsByKey = new Map(mallStats.map((stat) => [stat.key, stat]));

  return {
    dailyStats,
    mallStats,
    mallStatsByKey,
    latestAt,
    totals,
  };
}

/**
 * 몰 카드 = 이 브라우저의 파일 칸 + Orders 서버 리더의 오늘 주문·신규(KID-234, 사장님 2026-09-29 Q3). 당일·신규는 서버 값만
 * 쓴다 — 다른 PC에서 걷거나 보낸 몰도 같은 수로 보이고, 서버가 오늘 성공 수집을 모르는 몰은 로컬 파일이 있어도 0이다.
 * 셀피아 대조 결과는 카드 수를 바꾸지 않는다(토스트·버튼 툴팁의 참고).
 */
export function mergeServerTodayOrders(
  local: ReadonlyMap<string, LocalMallCollectionStat>,
  serverByMall: OrderCollectionTodayOrders["byMall"] | undefined,
): Map<string, MallCollectionStat> {
  const cards = new Map<string, MallCollectionStat>();
  for (const [mallKey, stat] of local) cards.set(mallKey, { ...stat, orderRows: 0, newRows: 0 });
  for (const [mallKey, today] of Object.entries(serverByMall ?? {})) {
    const stat = local.get(mallKey) ?? { key: mallKey, name: mallKey, files: 0, productRows: 0, latestAt: 0 };
    cards.set(mallKey, { ...stat, orderRows: today.orderCount, newRows: today.newCount });
  }
  return cards;
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
