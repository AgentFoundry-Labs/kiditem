const ON_SALE_CHANNEL_STATUSES = new Set([
  'active',
  'approved',
  'on_sale',
  '승인완료',
  '활성',
  '판매중',
]);

export function isChannelListingOnSale(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLocaleLowerCase();
  return normalized ? ON_SALE_CHANNEL_STATUSES.has(normalized) : false;
}
