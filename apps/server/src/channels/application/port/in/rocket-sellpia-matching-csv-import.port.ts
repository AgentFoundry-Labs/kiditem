import type { RocketMatchingCsvResult } from '@kiditem/shared/channels-operations';
import type { OperationPlanResult, OperationStagedChunk, OperationView } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT',
);

export type ImportRocketSellpiaMatchingCsvInput = {
  bytes: Uint8Array;
  organizationId: string;
  userId: string;
  channelAccountId: string;
  fileName: string;
};

type PlanContext = { organizationId: string; userId: string | null };
type FinalizeContext = { tx: OwnerTransaction; organizationId: string; operationId: string; plan: Record<string, unknown> };

/**
 * 로켓-셀피아 매칭 CSV = `channels.rocket_matching_csv` 실행 하나(ADR-0025, KID-363). 업로드 컨트롤러는
 * `importMatchingCsv`(서버가 스스로 producer)를, owner 포트는 `plan`·`finalize`를 쓴다.
 */
export interface RocketSellpiaMatchingCsvImportPort {
  importMatchingCsv(input: ImportRocketSellpiaMatchingCsvInput): Promise<{ operation: OperationView }>;
  planCsv(scope: Record<string, unknown>, context: PlanContext): Promise<OperationPlanResult>;
  finalizeCsv(chunks: OperationStagedChunk[], context: FinalizeContext): Promise<RocketMatchingCsvResult>;
}
