import type { DetailPageGenerateDirectOutput } from '../../../../domain/direct-generation';

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
    runId: string | undefined;
    /**
     * Downstream `ContentGeneration.id` when the generation is ledger-backed.
     */
    sourceResourceId: string | null;
    output: DetailPageGenerateDirectOutput;
  }): Promise<void>;

  applyFailure(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
}
