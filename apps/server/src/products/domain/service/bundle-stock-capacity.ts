// apps/server/src/products/domain/bundle-stock-capacity.ts

/**
 * Pure capacity math for `BundleStockService.recompute`.
 *
 * `availableStock = min(floor(currentStock / qty))` across active components.
 * Empty / all-soft-deleted set → 0. Missing inventory rows are treated as
 * `currentStock = 0` (capacity 0 for that component, which collapses the
 * whole bundle).
 */
export interface BundleComponentForCapacity {
  qty: number;
  currentStock: number | null | undefined;
}

export function computeBundleCapacity(
  components: ReadonlyArray<BundleComponentForCapacity>,
): number {
  if (components.length === 0) return 0;
  return Math.min(
    ...components.map((c) => {
      const stock = c.currentStock ?? 0;
      return Math.floor(stock / c.qty);
    }),
  );
}
