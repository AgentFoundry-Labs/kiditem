import type {
  MallAdminListingRow,
  MallAdminListingsPlan,
  MallAdminListingsPublication,
} from '@kiditem/shared/mall-admin-listings';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { MallAdminListingsPort } from '../../in/mall-admin-listings.port';

export interface MallAdminListingsRepositoryPort extends MallAdminListingsPort {}

export const MALL_ADMIN_LISTINGS_REPOSITORY_PORT = Symbol(
  'MALL_ADMIN_LISTINGS_REPOSITORY_PORT',
);

/** 실행 kind(`channels.mall_admin_listings`, KID-363)의 Channels 원장. `publishOperation`은 finish 트랜잭션 안에서만. */
export interface MallAdminListingsOperationRepositoryPort {
  /** 몰 허브가 고르는 그 몰의 계정 행. 없으면 null. */
  readMallAccountId(organizationId: string, mallKey: string): Promise<string | null>;
  publishOperation(
    tx: OwnerTransaction,
    input: { organizationId: string; operationId: string; plan: MallAdminListingsPlan; rows: MallAdminListingRow[] },
  ): Promise<MallAdminListingsPublication>;
}

export const MALL_ADMIN_LISTINGS_OPERATION_REPOSITORY_PORT = Symbol(
  'MALL_ADMIN_LISTINGS_OPERATION_REPOSITORY_PORT',
);
