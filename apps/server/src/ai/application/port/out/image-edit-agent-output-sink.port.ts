import type { ImageEditAgentOutput } from '../../../domain/agent-output';

export const IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT = Symbol('IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT');

export interface ImageEditAgentOutputSinkPort {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: ImageEditAgentOutput;
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
