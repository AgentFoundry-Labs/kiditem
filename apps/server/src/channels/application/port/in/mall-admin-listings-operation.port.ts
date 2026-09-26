import type { MallAdminListingsResult } from '@kiditem/shared/mall-admin-listings';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const MALL_ADMIN_LISTINGS_OPERATION_PORT = Symbol('MALL_ADMIN_LISTINGS_OPERATION_PORT');

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 몰 관리자 목록 = `channels.mall_admin_listings` 실행 kind(ADR-0025, KID-363) — 1차 몰
 * (`MALL_ADMIN_LISTING_OPERATION_MALLS`)만. 나머지 몰은 옛 시도 경로(`MallAdminListingsPort`)가 받는다.
 */
export interface MallAdminListingsOperationPort {
  plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<MallAdminListingsResult>;
}
