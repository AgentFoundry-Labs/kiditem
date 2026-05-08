import type { ThumbnailGenerateAgentOutput } from '../../../domain/agent-output';

export const THUMBNAIL_AGENT_OUTPUT_SINK_PORT = Symbol(
  'THUMBNAIL_AGENT_OUTPUT_SINK_PORT',
);

/**
 * Where validated `thumbnail_generate` output goes after the AI bridge has
 * accepted it.
 *
 * Phase 1: bound to a no-op adapter that only logs. Phase 2 will replace the
 * adapter with a real implementation that writes candidates and status onto
 * the `ThumbnailGeneration` row pointed to by `sourceResourceId`.
 */
export interface ThumbnailAgentOutputSinkPort {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    /**
     * `AgentRunRequest.sourceResourceId` — by convention this carries the
     * downstream `ThumbnailGeneration.id` once Phase 2 wires the producer side.
     * Phase 1 producers may leave it null.
     */
    sourceResourceId: string | null;
    output: ThumbnailGenerateAgentOutput;
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
