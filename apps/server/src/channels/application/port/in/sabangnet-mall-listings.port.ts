import type { SabangnetMallListingsResult, SabangnetMallListingsSource } from '@kiditem/shared/sabangnet-mall-listings';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 사방넷 송신 기록으로 몰 등록 상품을 가져오는 원천 owner(KID-246) = `channels.sabangnet_mall_listings` 실행 kind
 * (ADR-0025, KID-363). 가져오기 한 번은 조직 단위 실행 하나이고, 발행은 받을 몰 계정 행마다 리스팅을 바꾼다.
 * 마스터 상품과 레시피는 만들지 않는다.
 */
export interface SabangnetMallListingsPort {
  readSource(organizationId: string): Promise<SabangnetMallListingsSource>;
  plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<SabangnetMallListingsResult>;
}

export const SABANGNET_MALL_LISTINGS_PORT = Symbol('SABANGNET_MALL_LISTINGS_PORT');
