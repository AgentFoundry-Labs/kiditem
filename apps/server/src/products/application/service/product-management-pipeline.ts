import type { ProductManagementPipelineCounts } from '@kiditem/shared/product';
import {
  EMPTY_METRICS,
  type ManagementFacts,
  type ProductManagementGradeInfo,
} from './product-management.read-model';

export function emptyPipelineCounts(): ProductManagementPipelineCounts {
  return {
    total: 0,
    channelLinkedProducts: 0,
    channelUnlinkedProducts: 0,
    gradeA: 0,
    gradeB: 0,
    gradeC: 0,
    active: 0,
    inactive: 0,
    cleanup: 0,
    unknown: 0,
    minus: 0,
    low: 0,
    zeroStock: 0,
    lowStock: 0,
    stockRisk: 0,
    adLoss: 0,
    gradeChangeA: 0,
    gradeChangeB: 0,
    gradeChangeC: 0,
    adCount: 0,
    noAdCount: 0,
    totalRev: 0,
    totalAd: 0,
    gradeRevA: 0,
    gradeRevB: 0,
    gradeRevC: 0,
    gradeAdA: 0,
    gradeAdB: 0,
    gradeAdC: 0,
  } satisfies ProductManagementPipelineCounts;
}

export function buildPipelineCounts(params: {
  masterIds: string[];
  gradeByMaster: Map<string, ProductManagementGradeInfo>;
  facts: ManagementFacts;
  channelLinkedMasterIds: Set<string>;
  emptyInventory: () => ManagementFacts['inventoryByMaster'] extends Map<string, infer T> ? T : never;
}): ProductManagementPipelineCounts {
  const {
    masterIds,
    gradeByMaster,
    facts,
    channelLinkedMasterIds,
    emptyInventory,
  } = params;
  const counts = emptyPipelineCounts();
  counts.total = masterIds.length;
  counts.channelLinkedProducts = channelLinkedMasterIds.size;
  counts.channelUnlinkedProducts = Math.max(masterIds.length - channelLinkedMasterIds.size, 0);

  for (const masterId of masterIds) {
    const isChannelLinked = channelLinkedMasterIds.has(masterId);
    const grade = gradeByMaster.get(masterId)?.grade ?? 'C';
    if (isChannelLinked) {
      counts[`grade${grade}` as 'gradeA' | 'gradeB' | 'gradeC'] += 1;
    }

    const status = facts.statusByMaster.get(masterId) ?? 'unknown';
    counts[status] += 1;

    const inventory = facts.inventoryByMaster.get(masterId) ?? emptyInventory();
    if (inventory.stockStatus === 'out') counts.zeroStock += 1;
    if (inventory.stockStatus === 'low') counts.lowStock += 1;
    if (inventory.stockStatus !== 'healthy') counts.stockRisk += 1;

    const metrics = facts.periodMetricsByMaster.get(masterId) ?? EMPTY_METRICS;
    const profit = facts.profitByMaster.get(masterId) ?? {
      revenue: metrics.revenue,
      netProfit: 0,
      profitRate: 0,
      orderCount: metrics.orders,
    };
    if (isChannelLinked && facts.profitByMaster.has(masterId)) {
      if (profit.profitRate < 0) counts.minus += 1;
      if (profit.profitRate >= 0 && profit.profitRate <= 3) counts.low += 1;
    }

    const isAdvertising = facts.activeAdMasterIds.has(masterId);
    if (isAdvertising) counts.adCount += 1;
    else counts.noAdCount += 1;
    if (isAdvertising && profit.profitRate < 0) counts.adLoss += 1;

    const revenue = metrics.revenue;
    const adSpend = metrics.adSpend;
    counts.totalRev += revenue;
    counts.totalAd += adSpend;
    if (isChannelLinked) {
      counts[`gradeRev${grade}` as 'gradeRevA' | 'gradeRevB' | 'gradeRevC'] += revenue;
      counts[`gradeAd${grade}` as 'gradeAdA' | 'gradeAdB' | 'gradeAdC'] += adSpend;
    }
  }

  return counts satisfies ProductManagementPipelineCounts;
}
