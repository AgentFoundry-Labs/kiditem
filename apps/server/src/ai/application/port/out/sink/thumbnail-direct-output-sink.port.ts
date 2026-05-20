import type { ThumbnailGenerateDirectOutput } from '../../../../domain/direct-generation';

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
    runId: string | undefined;
    /**
     * Downstream `ThumbnailGeneration.id` when the generation is ledger-backed.
     */
    sourceResourceId: string | null;
    output: ThumbnailGenerateDirectOutput;
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
