import type { Prisma } from '@prisma/client';
import {
  MALL_ADMIN_LISTING_MALL_KEYS,
  MALL_ADMIN_LISTING_READERS,
  type MallAdminListingsSource,
} from '@kiditem/shared/mall-admin-listings';
import { readMallAccountRowIds } from './mall-account-rows';

/**
 * 직접 읽기기가 있는 몰마다 받을 몰 계정 행. 계정 행이 없는 몰도 목록에 선다(가져올 곳이 없다는 사실). 실행과 발행 결과는
 * 서비스가 실행 계약에서 채운다(KID-363·381) — 옛 시도 행(`source_import_runs`)은 읽지 않는다.
 */
export async function readMallAdminListingsSource(
  client: Pick<Prisma.TransactionClient, 'channelAccount'>,
  organizationId: string,
): Promise<MallAdminListingsSource> {
  const accounts = await readMallAccountRowIds(client, organizationId, MALL_ADMIN_LISTING_MALL_KEYS);
  return {
    malls: MALL_ADMIN_LISTING_MALL_KEYS.map((mallKey) => ({
      mallKey,
      mallName: MALL_ADMIN_LISTING_READERS[mallKey].mallName,
      channelAccountId: accounts.get(mallKey) ?? null,
      latestPublication: null,
      latestOperation: null,
      latestSucceeded: null,
    })),
  } satisfies MallAdminListingsSource;
}
