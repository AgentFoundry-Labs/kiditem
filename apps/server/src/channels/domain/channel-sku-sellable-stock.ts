export type ChannelSkuStockComponent = Readonly<{
  currentStock: number;
  quantity: number;
}>;

export function projectChannelSkuSellableStock(
  components: readonly ChannelSkuStockComponent[],
): number | null {
  if (components.length === 0) return null;
  if (components.some((component) => component.quantity <= 0)) {
    throw new Error('ChannelSku component quantity must be positive');
  }
  return Math.min(
    ...components.map((component) =>
      Math.floor(component.currentStock / component.quantity)),
  );
}
