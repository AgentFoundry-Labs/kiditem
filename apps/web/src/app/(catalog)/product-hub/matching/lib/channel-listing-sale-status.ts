const ON_SALE_CHANNEL_STATUSES = new Set([
  'active',
  'on_sale',
  'sale',
  'selling',
  'true',
  '활성',
  '판매 중',
  '판매중',
]);

export function isChannelListingOnSale(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLocaleLowerCase();
  return normalized ? ON_SALE_CHANNEL_STATUSES.has(normalized) : false;
}
