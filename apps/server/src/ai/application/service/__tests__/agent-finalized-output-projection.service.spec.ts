import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentFinalizedOutputProjectionService } from '../agent-finalized-output-projection.service';

const OutputSchema = z.object({
  value: z.string(),
});

function makeSink() {
  return {
    applySuccess: vi.fn().mockResolvedValue(undefined),
    applyFailure: vi.fn().mockResolvedValue(undefined),
  };
}

const FINALIZED_BASE = {
  organizationId: 'org-1',
  requestId: 'request-1',
  runId: 'run-1',
  sourceResourceId: 'resource-1',
};

describe('AgentFinalizedOutputProjectionService', () => {
  it('routes succeeded finalized output through the typed success sink', async () => {
    const sink = makeSink();
    const projection = new AgentFinalizedOutputProjectionService();

    const result = await projection.project({
      agentLabel: 'test_agent',
      schema: OutputSchema,
      sink,
      finalized: {
        ...FINALIZED_BASE,
        status: 'succeeded',
        output: { value: 'ok' },
      },
    });

    expect(result).toEqual({ status: 'success_applied' });
    expect(sink.applySuccess).toHaveBeenCalledWith({
      ...FINALIZED_BASE,
      output: { value: 'ok' },
    });
    expect(sink.applyFailure).not.toHaveBeenCalled();
  });

  it('routes failed finalized output through the failure sink with defaults', async () => {
    const sink = makeSink();
    const projection = new AgentFinalizedOutputProjectionService();

    const result = await projection.project({
      agentLabel: 'test_agent',
      schema: OutputSchema,
      sink,
      finalized: {
        ...FINALIZED_BASE,
        status: 'failed',
        errorCode: null,
        errorMessage: null,
      },
    });

    expect(result).toEqual({ status: 'failure_applied', reason: 'agent_failed' });
    expect(sink.applyFailure).toHaveBeenCalledWith({
      ...FINALIZED_BASE,
      errorCode: 'agent_run_failed',
      errorMessage: 'Agent run failed without a message.',
    });
    expect(sink.applySuccess).not.toHaveBeenCalled();
  });

  it('projects invalid succeeded output as agent_output_invalid failure', async () => {
    const sink = makeSink();
    const projection = new AgentFinalizedOutputProjectionService();

    const result = await projection.project({
      agentLabel: 'test_agent',
      schema: OutputSchema,
      sink,
      finalized: {
        ...FINALIZED_BASE,
        status: 'succeeded',
        output: { value: 123 },
      },
    });

    expect(result).toEqual({ status: 'failure_applied', reason: 'output_invalid' });
    expect(sink.applyFailure).toHaveBeenCalledWith({
      ...FINALIZED_BASE,
      errorCode: 'agent_output_invalid',
      errorMessage: 'value: Expected string, received number',
    });
    expect(sink.applySuccess).not.toHaveBeenCalled();
  });

  it('skips cancelled finalized requests without touching the sink', async () => {
    const sink = makeSink();
    const projection = new AgentFinalizedOutputProjectionService();

    const result = await projection.project({
      agentLabel: 'test_agent',
      schema: OutputSchema,
      sink,
      finalized: {
        ...FINALIZED_BASE,
        requestStatus: 'cancelled',
        status: 'failed',
        errorCode: 'cancelled',
        errorMessage: 'cancelled',
      },
    });

    expect(result).toEqual({ status: 'skipped_cancelled' });
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(sink.applyFailure).not.toHaveBeenCalled();
  });
});
