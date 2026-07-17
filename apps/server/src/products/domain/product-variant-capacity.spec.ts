import { describe, expect, it } from 'vitest';
import {
  projectProductInventory,
  projectVariantCapacity,
} from './product-variant-capacity';

describe('projectVariantCapacity', () => {
  it('projects one unit component stock directly', () => {
    expect(projectVariantCapacity([
      { sellpiaInventorySkuId: 'sku-1', currentStock: 7, activeCommitmentQuantity: 0, availableStock: 7, quantity: 1, isActive: true },
    ])).toEqual({
      capacity: 7,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-1'],
    });
  });

  it('floors multipack capacity by the component quantity', () => {
    expect(projectVariantCapacity([
      { sellpiaInventorySkuId: 'sku-1', currentStock: 8, activeCommitmentQuantity: 0, availableStock: 8, quantity: 3, isActive: true },
    ])).toEqual({
      capacity: 2,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-1'],
    });
  });

  it('uses the minimum component capacity and identifies the bottleneck', () => {
    expect(projectVariantCapacity([
      { sellpiaInventorySkuId: 'sku-1', currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, quantity: 2, isActive: true },
      { sellpiaInventorySkuId: 'sku-2', currentStock: 7, activeCommitmentQuantity: 0, availableStock: 7, quantity: 1, isActive: true },
    ])).toEqual({
      capacity: 5,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-1'],
    });
  });

  it('uses available stock while preserving the physical and commitment facts', () => {
    expect(projectVariantCapacity([
      { sellpiaInventorySkuId: 'sku-1', currentStock: 100, activeCommitmentQuantity: 80, availableStock: 20, quantity: 1, isActive: true },
    ])).toEqual({
      capacity: 20,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-1'],
    });
  });

  it('requires configuration when no components are confirmed', () => {
    expect(projectVariantCapacity([])).toEqual({
      capacity: null,
      warningState: 'configuration_required',
      bottleneckSellpiaInventorySkuIds: [],
    });
  });

  it.each([
    { sellpiaInventorySkuId: 'sku-1', currentStock: 7, activeCommitmentQuantity: 0, availableStock: 7, quantity: 1, isActive: false },
    { sellpiaInventorySkuId: 'sku-1', currentStock: null, activeCommitmentQuantity: null, availableStock: null, quantity: 1, isActive: null },
  ])('requires review for an inactive or missing component', (component) => {
    expect(projectVariantCapacity([component])).toEqual({
      capacity: null,
      warningState: 'review_required',
      bottleneckSellpiaInventorySkuIds: [],
    });
  });
});

describe('projectProductInventory', () => {
  it('counts shared physical SKU stock once across variants', () => {
    expect(projectProductInventory([
      {
        isActive: true,
        components: [
          { sellpiaInventorySkuId: 'shared', currentStock: 7, activeCommitmentQuantity: 2, availableStock: 5, quantity: 1, isActive: true },
        ],
      },
      {
        isActive: true,
        components: [
          { sellpiaInventorySkuId: 'shared', currentStock: 7, activeCommitmentQuantity: 2, availableStock: 5, quantity: 2, isActive: true },
          { sellpiaInventorySkuId: 'other', currentStock: 3, activeCommitmentQuantity: 0, availableStock: 3, quantity: 1, isActive: true },
        ],
      },
    ])).toMatchObject({ inventoryUnits: 8 });
  });

  it.each([
    ['review_required', [
      { isActive: true, components: [{ sellpiaInventorySkuId: 'sku', currentStock: null, activeCommitmentQuantity: null, availableStock: null, quantity: 1, isActive: null }] },
    ]],
    ['configuration_required', [
      { isActive: true, components: [] },
      { isActive: true, components: [{ sellpiaInventorySkuId: 'sku', currentStock: 1, activeCommitmentQuantity: 0, availableStock: 1, quantity: 1, isActive: true }] },
    ]],
    ['partial_out_of_stock', [
      { isActive: true, components: [{ sellpiaInventorySkuId: 'zero', currentStock: 0, activeCommitmentQuantity: 0, availableStock: 0, quantity: 1, isActive: true }] },
      { isActive: true, components: [{ sellpiaInventorySkuId: 'stocked', currentStock: 1, activeCommitmentQuantity: 0, availableStock: 1, quantity: 1, isActive: true }] },
    ]],
    ['out_of_stock', [
      { isActive: true, components: [{ sellpiaInventorySkuId: 'zero', currentStock: 0, activeCommitmentQuantity: 0, availableStock: 0, quantity: 1, isActive: true }] },
    ]],
    ['sellable', [
      { isActive: true, components: [{ sellpiaInventorySkuId: 'stocked', currentStock: 1, activeCommitmentQuantity: 0, availableStock: 1, quantity: 1, isActive: true }] },
    ]],
  ] as const)('applies product status priority for %s', (inventoryStatus, variants) => {
    expect(projectProductInventory(variants).inventoryStatus).toBe(inventoryStatus);
  });
});
