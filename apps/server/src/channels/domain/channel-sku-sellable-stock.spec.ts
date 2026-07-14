import { describe, expect, it } from 'vitest';
import { projectChannelSkuSellableStock } from './channel-sku-sellable-stock';

describe('projectChannelSkuSellableStock', () => {
  it('returns null when the channel SKU has no confirmed components', () => {
    expect(projectChannelSkuSellableStock([])).toBeNull();
  });

  it('uses the available quantity of a single component', () => {
    expect(projectChannelSkuSellableStock([
      { currentStock: 12, quantity: 1 },
    ])).toBe(12);
  });

  it('divides multipack stock by the exact component quantity', () => {
    expect(projectChannelSkuSellableStock([
      { currentStock: 80, quantity: 8 },
    ])).toBe(10);
  });

  it('uses the smallest component capacity for a mixed recipe', () => {
    expect(projectChannelSkuSellableStock([
      { currentStock: 12, quantity: 1 },
      { currentStock: 9, quantity: 2 },
    ])).toBe(4);
  });

  it('returns zero when a required component is out of stock', () => {
    expect(projectChannelSkuSellableStock([
      { currentStock: 0, quantity: 8 },
    ])).toBe(0);
  });

  it('rejects non-positive component quantities', () => {
    expect(() => projectChannelSkuSellableStock([
      { currentStock: 10, quantity: 0 },
    ])).toThrow('ChannelSku component quantity must be positive');
  });
});
