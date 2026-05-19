import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';

export interface AgentFinalizedOutputSink<TOutput> {
  applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: TOutput;
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

export interface AgentFinalizedOutputProjectionInput<TOutput> {
  agentLabel: string;
  schema: z.ZodType<TOutput>;
  sink: AgentFinalizedOutputSink<TOutput>;
  finalized: {
    organizationId: string;
    requestId: string;
    runId?: string;
    sourceResourceId: string | null;
    requestStatus?: string | null;
    status: 'succeeded' | 'failed';
    output?: unknown;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
}

export type AgentFinalizedOutputProjectionResult =
  | { status: 'success_applied' }
  | { status: 'failure_applied'; reason: 'agent_failed' | 'output_invalid' }
  | { status: 'skipped_cancelled' };

@Injectable()
export class AgentFinalizedOutputProjectionService {
  private readonly logger = new Logger(AgentFinalizedOutputProjectionService.name);

  async project<TOutput>(
    input: AgentFinalizedOutputProjectionInput<TOutput>,
  ): Promise<AgentFinalizedOutputProjectionResult> {
    const finalized = input.finalized;
    if (finalized.requestStatus === 'cancelled') {
      return { status: 'skipped_cancelled' };
    }

    if (finalized.status === 'failed') {
      await input.sink.applyFailure({
        organizationId: finalized.organizationId,
        requestId: finalized.requestId,
        runId: finalized.runId,
        sourceResourceId: finalized.sourceResourceId,
        errorCode: finalized.errorCode ?? 'agent_run_failed',
        errorMessage:
          finalized.errorMessage ?? 'Agent run failed without a message.',
      });
      return { status: 'failure_applied', reason: 'agent_failed' };
    }

    const parsed = input.schema.safeParse(finalized.output);
    if (!parsed.success) {
      const errorMessage = firstIssueMessage(parsed.error);
      this.logger.warn(
        `${input.agentLabel} output rejected (request=${finalized.requestId}): ${errorMessage}`,
      );
      await input.sink.applyFailure({
        organizationId: finalized.organizationId,
        requestId: finalized.requestId,
        runId: finalized.runId,
        sourceResourceId: finalized.sourceResourceId,
        errorCode: 'agent_output_invalid',
        errorMessage,
      });
      return { status: 'failure_applied', reason: 'output_invalid' };
    }

    await input.sink.applySuccess({
      organizationId: finalized.organizationId,
      requestId: finalized.requestId,
      runId: finalized.runId,
      sourceResourceId: finalized.sourceResourceId,
      output: parsed.data,
    });
    return { status: 'success_applied' };
  }
}

function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue
    ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
    : 'Output failed schema validation.';
}
