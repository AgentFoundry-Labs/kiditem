import type { ThumbnailGenerateDirectOutput } from '../../../../domain/direct-generation';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const THUMBNAIL_DIRECT_OUTPUT_SINK_PORT = Symbol(
  'THUMBNAIL_DIRECT_OUTPUT_SINK_PORT',
);

/**
 * Where validated thumbnail generation output is projected after a direct AI
 * job completes.
 */
export interface ThumbnailDirectOutputSinkPort {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    /** 실행 finish 트랜잭션(KID-358). 반영은 실행을 닫는 트랜잭션 안에서 쓴다. 없으면 자기 트랜잭션. */
    transaction?: OwnerTransaction;
    /**
     * Downstream `ThumbnailGeneration.id` when the generation is ledger-backed.
     */
    sourceResourceId: string | null;
    output: ThumbnailGenerateDirectOutput;
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
