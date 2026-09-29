import type { Prisma } from '@prisma/client';
import { LOGIN_ACCOUNT_MARKETS } from '../../../application/port/out/persistence/channel-account.persistence.port';
import { orderCollectionMallAccountChannels } from '../../../domain/account/mall-account-identity';

/**
 * 한 채널에 계정 행이 여럿일 때 몰의 행으로 고르는 순서 — 대표 계정, 먼저 만든 행.
 *
 * 쇼핑몰 현황(가져왔는지 · 등록 상품 수)과 몰 리스팅을 발행하는 원천이 같은 행을 봐야
 * 한다. 서로 다른 행을 고르면 가져온 리스팅이 현황에 보이지 않는다(ADR-0012).
 */
export const MALL_ACCOUNT_ROW_ORDER = [
  { isPrimary: 'desc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ChannelAccountOrderByWithRelationInput[];

/**
 * 몰 계정 행의 조건 하나 — 쇼핑몰 계정 화면·주문 수집과 쇼핑몰 현황(몰 게시)이 같은 행을 읽는다(ADR-0012).
 * 레지스트리 몰의 몰 행은 channel · externalAccountId 모두 몰 키이고, 공유 마켓 행(`rocket`)과 로그인만 두는
 * 마켓 행(쿠팡 윙, KID-377)은 채널로 고른다.
 */
export function mallAccountRowsWhere(organizationId: string) {
  const { own, shared } = orderCollectionMallAccountChannels();
  const loginMarkets = LOGIN_ACCOUNT_MARKETS.map((market) => market.sharedAccountChannel);
  return {
    organizationId,
    OR: [
      { channel: { in: own }, externalAccountId: { in: own } },
      { channel: { in: [...new Set([...shared, ...loginMarkets])] } },
    ],
  } satisfies Prisma.ChannelAccountWhereInput;
}

/**
 * 몰 키마다 그 몰의 계정 행 ID — `mallAccountRowsWhere`와 같은 행이라 쇼핑몰 현황과 리스팅 발행 원천이 같은 행을 본다
 * (ADR-0012). 행이 없는 몰은 결과에 없다. 상태는 가리지 않는다.
 */
export async function readMallAccountRowIds(
  client: Pick<Prisma.TransactionClient, 'channelAccount'>,
  organizationId: string,
  mallKeys: readonly string[],
): Promise<Map<string, string>> {
  if (mallKeys.length === 0) return new Map();
  const rows = await client.channelAccount.findMany({
    where: { AND: [mallAccountRowsWhere(organizationId), { channel: { in: [...mallKeys] } }] },
    orderBy: MALL_ACCOUNT_ROW_ORDER,
    select: { id: true, channel: true },
  });
  const byMall = new Map<string, string>();
  for (const row of rows) {
    if (!byMall.has(row.channel)) byMall.set(row.channel, row.id);
  }
  return byMall;
}
