import { ERROR_LISTING_STATUSES } from '../../../domain/listing/mall-listing-state';
import { getMallAdapterManifest } from '../../../domain/registration/mall-adapter-manifest';
import type { Prisma } from '@prisma/client';

export type RejectedListingCount = Readonly<{
  /** `ChannelAccount.channel` — 몰 키(`coupang` · `kidkids` …). */
  channel: string;
  /** 매트릭스 열과 같은 이름 — 매니페스트 이름, 없으면 계정 이름. */
  mallName: string;
  count: number;
}>;

/**
 * 몰이 등록을 거절한 활성 리스팅 수, 몰마다.
 *
 * 몰 리스팅 매트릭스가 칸을 `error` 로 읽는 원문 상태(`ERROR_LISTING_STATUSES`)만 센다.
 * 판정은 Channels 의 접는 표가 소유하고, 이 리더는 그 표로 센 수만 낸다 — 대시보드가
 * 상태 글자를 다시 적지 않게 한다.
 */
export async function readRejectedListingCounts(
  tx: Pick<Prisma.TransactionClient, 'channelListing' | 'channelAccount'>,
  organizationId: string,
): Promise<RejectedListingCount[]> {
  const grouped = await tx.channelListing.groupBy({
    by: ['channelAccountId'],
    where: {
      organizationId,
      isActive: true,
      status: { in: [...ERROR_LISTING_STATUSES] },
    },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const accounts = await tx.channelAccount.findMany({
    where: { organizationId, id: { in: grouped.map((row) => row.channelAccountId) } },
    select: { id: true, channel: true, name: true },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const byChannel = new Map<string, { mallName: string; count: number }>();
  for (const row of grouped) {
    const account = accountById.get(row.channelAccountId);
    if (!account) continue;
    // 계정 행의 채널이 곧 몰 키다(ADR-0012).
    const entry = byChannel.get(account.channel) ?? {
      mallName: getMallAdapterManifest(account.channel)?.name ?? account.name,
      count: 0,
    };
    entry.count += row._count._all;
    byChannel.set(account.channel, entry);
  }
  return [...byChannel]
    .map(([channel, entry]) => ({ channel, mallName: entry.mallName, count: entry.count }))
    .sort((left, right) => right.count - left.count || left.channel.localeCompare(right.channel));
}
