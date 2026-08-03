import type {
  SellpiaProductDestination,
  SellpiaProductInventoryResolution,
} from '@kiditem/shared/dashboard';
import type {
  InventoryAvailabilityBatch,
} from '@kiditem/shared/inventory-commitment';
import { computeDeadStock, computeReorder } from './sellpia-product-sales.metrics';
import {
  createSellpiaProductInventoryResolver,
  type SellpiaProductInventoryCandidate,
  type SellpiaProductInventoryCandidateResolution,
  type SellpiaProductInventoryEvidence,
} from './sellpia-product-inventory-resolver';

export type SellpiaProductInventoryProjectionInput = Readonly<{
  key: string;
  evidence: SellpiaProductInventoryEvidence;
  completeMonthly: ReadonlyArray<{ yearMonth: string; orderQty: number }>;
}>;

export type SellpiaProductDestinationRow = SellpiaProductDestination & {
  sellpiaInventorySkuId: string;
};

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
      ? [resolution.sellpiaInventorySkuId]
      : []))].sort((left, right) => left.localeCompare(right));
  return { resolutions, matchedSkuIds };
}

export function projectSellpiaProductInventory(input: {
  products: readonly SellpiaProductInventoryProjectionInput[];
  resolutions: ReadonlyMap<string, SellpiaProductInventoryCandidateResolution>;
  availability: InventoryAvailabilityBatch;
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
      CALIBRATION_PENDING: number;
      RECALCULATING: number;
      SELLPIA_SOURCE_STALE: number;
      AD_SOURCE_STALE: number;
      ORDERS_SOURCE_STALE: number;
      CALCULATION_ERROR: number;
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
        ...summarizeDestinationAbc(input.destinations),
      },
    };
  }

  const availabilityBySkuId = new Map(input.availability.items.map((item) => [
    item.sellpiaInventorySkuId,
    item,
  ]));
  const destinationsBySkuId = groupDestinations(input.destinations);
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
    const availability = availabilityBySkuId.get(resolution.sellpiaInventorySkuId);
    if (!availability || !availability.isActive) {
      mappingRequiredSalesRows += 1;
      byProductKey.set(product.key, emptyMetrics({
        status: 'mapping_required',
        reason: availability ? 'inactive_candidate' : 'not_found',
        candidateCount: availability ? 1 : 0,
      }));
      continue;
    }
    const group = groups.get(resolution.sellpiaInventorySkuId) ?? [];
    group.push(product);
    groups.set(resolution.sellpiaInventorySkuId, group);
  }

  let reorderCount = 0;
  let deadStockCount = 0;
  let unlinkedSkus = 0;
  for (const [sellpiaInventorySkuId, products] of groups) {
    const availability = availabilityBySkuId.get(sellpiaInventorySkuId)!;
    const completeQuantities = aggregateCompleteQuantities(products);
    const recent = completeQuantities.slice(-2);
    const monthlyRate = recent.length > 0
      ? Math.round(recent.reduce((sum, quantity) => sum + quantity, 0) / recent.length)
      : 0;
    const reorder = computeReorder(availability.availableStock, monthlyRate);
    const deadStock = computeDeadStock(
      completeQuantities,
      availability.availableStock,
    );
    const destinations = destinationsBySkuId.get(sellpiaInventorySkuId) ?? [];
    if (destinations.length === 0) unlinkedSkus += 1;
    if (reorder.needsReorder) reorderCount += 1;
    if (deadStock.deadStock) deadStockCount += 1;
    const metrics: SellpiaProductInventoryMetrics = {
      inventoryResolution: {
        status: 'matched',
        sellpiaInventorySkuId,
        currentStock: availability.currentStock,
        activeCommitmentQuantity: availability.activeCommitmentQuantity,
        availableStock: availability.availableStock,
        salesRowCount: products.length,
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
      ...summarizeDestinationAbc(input.destinations),
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
    const byVariant = grouped.get(row.sellpiaInventorySkuId) ?? new Map();
    byVariant.set(row.productVariantId, {
      masterProductId: row.masterProductId,
      masterProductCode: row.masterProductCode,
      masterProductName: row.masterProductName,
      productVariantId: row.productVariantId,
      productVariantCode: row.productVariantCode,
      productVariantName: row.productVariantName,
      unitsPerVariant: row.unitsPerVariant,
      abcGrade: row.abcGrade,
      abcEvaluation: row.abcEvaluation,
      displayImage: row.displayImage,
    });
    grouped.set(row.sellpiaInventorySkuId, byVariant);
  }
  return new Map([...grouped.entries()].map(([skuId, byVariant]) => [
    skuId,
    [...byVariant.values()].sort((left, right) =>
      left.masterProductCode.localeCompare(right.masterProductCode)
      || left.productVariantCode.localeCompare(right.productVariantCode)
      || left.productVariantId.localeCompare(right.productVariantId)),
  ]));
}

function summarizeDestinationAbc(
  destinations: readonly SellpiaProductDestinationRow[],
): {
  abcCounts: { A: number; B: number; C: number };
  abcStatusCounts: {
    READY: number;
    INSUFFICIENT_EVIDENCE: number;
    SOURCE_UNMAPPED: number;
    CALIBRATION_PENDING: number;
    RECALCULATING: number;
    SELLPIA_SOURCE_STALE: number;
    AD_SOURCE_STALE: number;
    ORDERS_SOURCE_STALE: number;
    CALCULATION_ERROR: number;
  };
  abcContributionProfitByGrade: { A: number; B: number; C: number };
  classifiedProductCount: number;
  unclassifiedProductCount: number;
} {
  const byMasterProduct = new Map<string, SellpiaProductDestinationRow>();
  for (const destination of destinations) {
    if (!byMasterProduct.has(destination.masterProductId)) {
      byMasterProduct.set(destination.masterProductId, destination);
    }
  }
  const summary = {
    abcCounts: { A: 0, B: 0, C: 0 },
    abcStatusCounts: {
      READY: 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: 0,
      CALIBRATION_PENDING: 0,
      RECALCULATING: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
      ORDERS_SOURCE_STALE: 0,
      CALCULATION_ERROR: 0,
    },
    abcContributionProfitByGrade: { A: 0, B: 0, C: 0 },
    classifiedProductCount: 0,
    unclassifiedProductCount: 0,
  };
  for (const destination of byMasterProduct.values()) {
    if (destination.abcGrade) {
      summary.abcCounts[destination.abcGrade] += 1;
      summary.classifiedProductCount += 1;
    } else if (destination.abcEvaluation === null) {
      summary.unclassifiedProductCount += 1;
    }
    const evaluation = destination.abcEvaluation;
    if (!evaluation) {
      summary.abcStatusCounts.CALIBRATION_PENDING += 1;
      continue;
    }
    summary.abcStatusCounts[evaluation.calculationStatus] += 1;
    if (destination.abcGrade && evaluation.weightedContributionProfit !== null) {
      summary.abcContributionProfitByGrade[destination.abcGrade] += Math.round(
        evaluation.weightedContributionProfit,
      );
    }
  }
  return summary;
}
