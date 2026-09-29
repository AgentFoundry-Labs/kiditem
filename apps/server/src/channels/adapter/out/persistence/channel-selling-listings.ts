import type { Prisma } from '@prisma/client';
import { USABLE_CHANNEL_ACCOUNT_STATUSES } from '../../../domain/account/channel-account-usability';
import { listingSaleState } from '../../../domain/listing/listing-sale-state';
import type { ChannelSellingListingFact, ChannelSellingListingFilter } from '../../../application/port/in/listing/channel-listing-query.port';

/**
 * 판매중 정본 리더(KID-333 ②). 켜진 리스팅마다 판정(`saleState`)과 옵션 레시피를 싣는다 — 판매중만 세는 쪽은
 * `saleState === 'on_sale'`로 거른다. 꺼 둔 리스팅은 판정이 늘 판매중 아님이라 읽지 않는다.
 */
export async function readSellingListingFacts(
  client: Prisma.TransactionClient,
  input: ChannelSellingListingFilter & { organizationId: string },
): Promise<ChannelSellingListingFact[]> {
  if (input.channels?.length === 0 || input.channelAccountIds?.length === 0) return [];
  const { organizationId } = input;
  const rows = await client.channelListing.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(input.channelAccountIds ? { channelAccountId: { in: [...input.channelAccountIds] } } : {}),
      channelAccount: {
        organizationId,
        ...(input.channels ? { channel: { in: [...input.channels] } } : {}),
        ...(input.usableAccountsOnly ? { status: { in: [...USABLE_CHANNEL_ACCOUNT_STATUSES] } } : {}),
      },
    },
    select: {
      id: true, isActive: true, status: true, rawJson: true, channelAccountId: true,
      channelAccount: { select: { channel: true, name: true } },
      options: {
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true, status: true, isActive: true,
          inventoryComponents: { where: { organizationId }, orderBy: { masterProductId: 'asc' }, select: { masterProductId: true, quantity: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    listingId: row.id,
    channel: row.channelAccount.channel,
    channelAccountId: row.channelAccountId,
    channelAccountName: row.channelAccount.name,
    saleState: listingSaleState(row),
    options: row.options.map((option) => ({ optionId: option.id, isActive: option.isActive, components: option.inventoryComponents })),
  }));
}
