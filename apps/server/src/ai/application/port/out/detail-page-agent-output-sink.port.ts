import type { DetailPageGenerateAgentOutput } from '../../../domain/agent-output';

export const DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT = Symbol(
  'DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT',
);

/**
 * Where validated `detail_page_generate` output goes after the AI bridge has
 * accepted it.
 *
 * Phase 1: bound to a no-op adapter that only logs. The interface is shaped so
 * a Phase 2 adapter can map (`requestId`, `sourceResourceId`, `output`) into a
 * `ContentGeneration` row update without changing the bridge.
 *
 * Sinks are responsible for organization scope. The `organizationId` here
 * comes straight from the finalized event and must be carried into every DB
 * write (bridge does not write directly).
 */
export interface DetailPageAgentOutputSinkPort {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    /**
     * `AgentRunRequest.sourceResourceId` — by convention this carries the
     * downstream `ContentGeneration.id` once Phase 2 wires the producer side.
     * Phase 1 producers may leave it null.
     */
    sourceResourceId: string | null;
    output: DetailPageGenerateAgentOutput;
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
