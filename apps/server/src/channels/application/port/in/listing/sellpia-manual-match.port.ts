import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  SellpiaManualMatchResult,
  SellpiaManualMatchSourceStatus,
} from '@kiditem/shared/sellpia-manual-match';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { SellpiaManualMatchAliasRecord } from '../../out/repository/sellpia-manual-match.repository.port';

export const SELLPIA_MANUAL_MATCH_PORT = Symbol('SELLPIA_MANUAL_MATCH_PORT');

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 셀피아 수동상품매칭 원천 = `channels.sellpia_manual_match` 실행 kind(ADR-0025, KID-363). 화면은 `readSource`로 최근
 * 실행과 게시된 스냅샷을 보고, 매칭은 `findByNormalizedAliases`로 별칭을 읽는다.
 */
export interface SellpiaManualMatchPort {
  readSource(organizationId: string): Promise<SellpiaManualMatchSourceStatus>;
  plan(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<SellpiaManualMatchResult>;
  findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]>;
}
