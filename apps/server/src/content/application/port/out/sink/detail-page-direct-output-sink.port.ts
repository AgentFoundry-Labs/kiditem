import type { DetailPageGenerateDirectOutput } from '../../../../domain/direct-generation';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT = Symbol(
  'DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT',
);

/**
 * Where validated detail-page generation output is projected after a direct AI
 * job completes.
 *
 * Sinks are responsible for organization scope. The `organizationId` here
 * is resolved by the producer/job path and must be carried into every DB
 * write.
 */
export interface DetailPageDirectOutputSinkPort {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    /** 실행 finish 트랜잭션(KID-358). 반영은 실행을 닫는 트랜잭션 안에서 쓴다. 없으면 자기 트랜잭션. */
    transaction?: OwnerTransaction;
    /**
     * Downstream `ContentGeneration.id` when the generation is ledger-backed.
     */
    sourceResourceId: string | null;
    output: DetailPageGenerateDirectOutput;
  }): Promise<void>;

  applyFailure(input: {
    organizationId: string;
    requestId: string;
    /** 실행 finish 트랜잭션(KID-358). 반영은 실행을 닫는 트랜잭션 안에서 쓴다. 없으면 자기 트랜잭션. */
    transaction?: OwnerTransaction;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
}
