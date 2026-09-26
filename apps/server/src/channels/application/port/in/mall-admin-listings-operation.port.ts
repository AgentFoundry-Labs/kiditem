import type { MallAdminListingsResult } from '@kiditem/shared/mall-admin-listings';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const MALL_ADMIN_LISTINGS_OPERATION_PORT = Symbol('MALL_ADMIN_LISTINGS_OPERATION_PORT');

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 몰 관리자 목록 = `channels.mall_admin_listings` 실행 kind(ADR-0025, KID-363·381) — 읽기기가 있는 몰
 * (`MALL_ADMIN_LISTING_READERS`) 모두.
 */
export interface MallAdminListingsOperationPort {
  plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<MallAdminListingsResult>;
}
