import { computeDeadStock, computeReorder } from './sellpia-product-sales.metrics';
import {
  createSellpiaProductInventoryResolver,
  type SellpiaProductInventoryCandidate,
  type SellpiaProductInventoryCandidateResolution,
  type SellpiaProductInventoryEvidence,
} from './sellpia-product-inventory-resolver';
import type {
  SellpiaProductDestination,
  SellpiaProductInventoryResolution,
} from '@kiditem/shared/dashboard';
import { productAbcDisplayStatus } from '@kiditem/shared/product-abc';
import type {
  InventoryAvailabilityBatch,
} from '@kiditem/shared/inventory-availability';

export type SellpiaProductInventoryProjectionInput = Readonly<{
  key: string;
  evidence: SellpiaProductInventoryEvidence;
  completeMonthly: ReadonlyArray<{ yearMonth: string; orderQty: number }>;
}>;

export type SellpiaProductDestinationRow = SellpiaProductDestination & {
  masterProductId: string;
};

export type SellpiaInventoryProductRow = Readonly<{
  masterProductId: string;
  masterProductCode: string;
  masterProductName: string;
  abc: SellpiaProductDestination['abc'];
}>;

export type SellpiaProductInventoryMetrics = Readonly<{
  inventoryResolution: SellpiaProductInventoryResolution;
  monthsOfAvailableStockLeft: number | null;
  reorderPoint: number | null;
  needsReorder: boolean;
  deadStock: boolean;
  deadStockReason: string | null;
}>;

export function resolveSellpiaProductInventoryRows(
  products: readonly SellpiaProductInventoryProjectionInput[],
  candidates: readonly SellpiaProductInventoryCandidate[],
): {
  resolutions: ReadonlyMap<string, SellpiaProductInventoryCandidateResolution>;
  matchedSkuIds: string[];
} {
  const resolve = createSellpiaProductInventoryResolver(candidates);
  const resolutions = new Map(products.map((product) => [
    product.key,
    resolve(product.evidence),
  ]));
  const matchedSkuIds = [...new Set([...resolutions.values()].flatMap((resolution) =>
    resolution.status === 'matched'
      ? [resolution.masterProductId]
      : []))].sort((left, right) => left.localeCompare(right));
  return { resolutions, matchedSkuIds };
}

export function projectSellpiaProductInventory(input: {
  products: readonly SellpiaProductInventoryProjectionInput[];
  resolutions: ReadonlyMap<string, SellpiaProductInventoryCandidateResolution>;
  availability: InventoryAvailabilityBatch;
  inventoryProducts: readonly SellpiaInventoryProductRow[];
  destinations: readonly SellpiaProductDestinationRow[];
}): {
  byProductKey: ReadonlyMap<string, SellpiaProductInventoryMetrics>;
  summary: {
    reorderCount: number;
    deadStockCount: number;
    matchedSalesRows: number;
    mappingRequiredSalesRows: number;
    matchedSkus: number;
    unlinkedSkus: number;
    abcCounts: { A: number; B: number; C: number };
    abcStatusCounts: {
      READY: number;
      INSUFFICIENT_EVIDENCE: number;
      SOURCE_UNMAPPED: number;
      SELLPIA_SOURCE_STALE: number;
      AD_SOURCE_STALE: number;
    };
    abcContributionProfitByGrade: { A: number; B: number; C: number };
    classifiedProductCount: number;
    unclassifiedProductCount: number;
  };
} {
  const byProductKey = new Map<string, SellpiaProductInventoryMetrics>();
  if (!input.availability.snapshot.collected) {
    for (const product of input.products) {
      byProductKey.set(product.key, emptyMetrics({ status: 'not_collected' }));
    }
    return {
      byProductKey,
      summary: {
        reorderCount: 0,
        deadStockCount: 0,
        matchedSalesRows: 0,
        mappingRequiredSalesRows: 0,
        matchedSkus: 0,
        unlinkedSkus: 0,
        ...summarizeInventoryProductAbc(input.inventoryProducts),
      },
    };
  }

  const availabilityBySkuId = new Map(input.availability.items.map((item) => [
    item.masterProductId,
    item,
  ]));
  const destinationsBySkuId = groupDestinations(input.destinations);
  const inventoryProductBySkuId = new Map(input.inventoryProducts.map((product) => [
    product.masterProductId,
    product,
  ]));
  const groups = new Map<string, SellpiaProductInventoryProjectionInput[]>();
  let mappingRequiredSalesRows = 0;

  for (const product of input.products) {
    const resolution = input.resolutions.get(product.key);
    if (!resolution || resolution.status === 'mapping_required') {
      mappingRequiredSalesRows += 1;
      byProductKey.set(product.key, emptyMetrics(resolution ?? {
        status: 'mapping_required',
        reason: 'not_found',
        candidateCount: 0,
      }));
      continue;
    }
    const availability = availabilityBySkuId.get(resolution.masterProductId);
    if (!availability) {
      mappingRequiredSalesRows += 1;
      byProductKey.set(product.key, emptyMetrics({
        status: 'mapping_required',
        reason: 'not_found',
        candidateCount: 0,
      }));
      continue;
    }
    const group = groups.get(resolution.masterProductId) ?? [];
    group.push(product);
    groups.set(resolution.masterProductId, group);
  }

  let reorderCount = 0;
  let deadStockCount = 0;
  let unlinkedSkus = 0;
  for (const [masterProductId, products] of groups) {
    const availability = availabilityBySkuId.get(masterProductId)!;
    const completeQuantities = aggregateCompleteQuantities(products);
    const recent = completeQuantities.slice(-2);
    const monthlyRate = recent.length > 0
      ? Math.round(recent.reduce((sum, quantity) => sum + quantity, 0) / recent.length)
      : 0;
    const reorder = computeReorder(availability.currentStock, monthlyRate);
    const deadStock = computeDeadStock(
      completeQuantities,
      availability.currentStock,
    );
    const destinations = destinationsBySkuId.get(masterProductId) ?? [];
    const inventoryProduct = inventoryProductBySkuId.get(masterProductId);
    if (destinations.length === 0) unlinkedSkus += 1;
    if (reorder.needsReorder) reorderCount += 1;
    if (deadStock.deadStock) deadStockCount += 1;
    const metrics: SellpiaProductInventoryMetrics = {
      inventoryResolution: {
        status: 'matched',
        masterProductId,
        currentStock: availability.currentStock,
        salesRowCount: products.length,
        inventoryProduct: inventoryProduct
          ? {
              masterProductId: inventoryProduct.masterProductId,
              masterProductCode: inventoryProduct.masterProductCode,
              masterProductName: inventoryProduct.masterProductName,
              abc: inventoryProduct.abc,
            }
          : null,
        destinations,
      },
      monthsOfAvailableStockLeft: reorder.monthsOfAvailableStockLeft,
      reorderPoint: reorder.reorderPoint,
      needsReorder: reorder.needsReorder,
      deadStock: deadStock.deadStock,
      deadStockReason: deadStock.deadStockReason,
    };
    for (const product of products) byProductKey.set(product.key, metrics);
  }

  return {
    byProductKey,
    summary: {
      reorderCount,
      deadStockCount,
      matchedSalesRows: [...groups.values()].reduce(
        (sum, products) => sum + products.length,
        0,
      ),
      mappingRequiredSalesRows,
      matchedSkus: groups.size,
      unlinkedSkus,
      ...summarizeInventoryProductAbc(input.inventoryProducts.filter((product) =>
        groups.has(product.masterProductId))),
    },
  };
}

function emptyMetrics(
  inventoryResolution: SellpiaProductInventoryResolution,
): SellpiaProductInventoryMetrics {
  return {
    inventoryResolution,
    monthsOfAvailableStockLeft: null,
    reorderPoint: null,
    needsReorder: false,
    deadStock: false,
    deadStockReason: null,
  };
}

function aggregateCompleteQuantities(
  products: readonly SellpiaProductInventoryProjectionInput[],
): number[] {
  const byMonth = new Map<string, number>();
  for (const product of products) {
    for (const month of product.completeMonthly) {
      byMonth.set(
        month.yearMonth,
        (byMonth.get(month.yearMonth) ?? 0) + month.orderQty,
      );
    }
  }
  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, quantity]) => quantity);
}

function groupDestinations(
  rows: readonly SellpiaProductDestinationRow[],
): Map<string, SellpiaProductDestination[]> {
  const grouped = new Map<string, Map<string, SellpiaProductDestination>>();
  for (const row of rows) {
    const byOption = grouped.get(row.masterProductId) ?? new Map();
    byOption.set(row.channelListingOptionId, {
      masterProductId: row.masterProductId,
      masterProductCode: row.masterProductCode,
      masterProductName: row.masterProductName,
      channelListingOptionId: row.channelListingOptionId,
      channelListingId: row.channelListingId,
      channel: row.channel,
      externalOptionId: row.externalOptionId,
      optionName: row.optionName,
      unitsPerSale: row.unitsPerSale,
      abc: row.abc,
      displayImage: row.displayImage,
    });
    grouped.set(row.masterProductId, byOption);
  }
  return new Map([...grouped.entries()].map(([skuId, byOption]) => [
    skuId,
    [...byOption.values()].sort((left, right) =>
      left.masterProductCode.localeCompare(right.masterProductCode)
      || left.channel.localeCompare(right.channel)
      || left.externalOptionId.localeCompare(right.externalOptionId)
      || left.channelListingOptionId.localeCompare(right.channelListingOptionId)),
  ]));
}

function summarizeInventoryProductAbc(
  inventoryProducts: readonly SellpiaInventoryProductRow[],
): {
  abcCounts: { A: number; B: number; C: number };
  abcStatusCounts: {
    READY: number;
    INSUFFICIENT_EVIDENCE: number;
    SOURCE_UNMAPPED: number;
    SELLPIA_SOURCE_STALE: number;
    AD_SOURCE_STALE: number;
  };
  abcContributionProfitByGrade: { A: number; B: number; C: number };
  classifiedProductCount: number;
  unclassifiedProductCount: number;
} {
  const byMasterProduct = new Map<string, SellpiaInventoryProductRow>();
  for (const product of inventoryProducts) {
    if (!byMasterProduct.has(product.masterProductId)) {
      byMasterProduct.set(product.masterProductId, product);
    }
  }
  const summary = {
    abcCounts: { A: 0, B: 0, C: 0 },
    abcStatusCounts: {
      READY: 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
    },
    abcContributionProfitByGrade: { A: 0, B: 0, C: 0 },
    classifiedProductCount: 0,
    unclassifiedProductCount: 0,
  };
  for (const product of byMasterProduct.values()) {
    if (product.abc.abcGrade) {
      summary.abcCounts[product.abc.abcGrade] += 1;
      summary.classifiedProductCount += 1;
    } else {
      summary.unclassifiedProductCount += 1;
    }
    const evaluation = product.abc.evaluation;
    summary.abcStatusCounts[productAbcDisplayStatus(product.abc)] += 1;
    if (product.abc.abcGrade && evaluation) {
      summary.abcContributionProfitByGrade[product.abc.abcGrade] += Math.round(
        evaluation.weightedOperatingProfit,
      );
    }
  }
  return summary;
}
