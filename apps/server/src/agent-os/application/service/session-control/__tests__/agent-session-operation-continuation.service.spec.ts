import { describe, expect, it, vi } from 'vitest';
import { OperationLifecycleGateService } from '../../../../../operations/application/service/operation-lifecycle-gate.service';
import { AgentSessionOperationContinuationService } from '../agent-session-operation-continuation.service';

const graph = {
  organizationId: 'org-1',
  sessionId: '00000000-0000-4000-8000-000000000001',
  taskId: '00000000-0000-4000-8000-000000000002',
  executionId: '00000000-0000-4000-8000-000000000003',
  attemptId: '00000000-0000-4000-8000-000000000004',
  predecessorOperationRunId: '00000000-0000-4000-8000-000000000005',
};

function harness() {
  const controls = {
    continueOperationAttempt: vi.fn().mockResolvedValue({
      operationRunId: '00000000-0000-4000-8000-000000000006',
      attemptId: graph.attemptId,
    }),
    listLifecycleRecoveryCandidates: vi.fn()
      .mockResolvedValueOnce([graph])
      .mockResolvedValue([]),
    advanceApprovedContinuation: vi.fn().mockResolvedValue({
      approvalId: '00000000-0000-4000-8000-000000000007',
      operationRunId: '00000000-0000-4000-8000-000000000006',
      attemptId: graph.attemptId,
      runtimeType: 'hermes_http',
      executionId: graph.executionId,
      externalRunId: 'external-run-1',
      encryptedHandleRef: 'vault://handle-1',
      runtimeGeneration: 1,
      state: 'successor_created',
    }),
    markApprovalContinuationInterruptDelivered: vi.fn().mockResolvedValue(undefined),
    listIncompleteApprovalContinuations: vi.fn().mockResolvedValue([]),
  };
  const gate = new OperationLifecycleGateService();
  const runtime = { interrupt: vi.fn().mockResolvedValue(undefined) };
  const runtimes = { requireCompatible: vi.fn().mockReturnValue(runtime) };
  const service = new AgentSessionOperationContinuationService(
    controls as never,
    gate,
    runtimes as never,
  );
  return { service, controls, gate, runtime, runtimes };
}

describe('AgentSessionOperationContinuationService', () => {
  it('rejects an approval continuation before the API lifecycle accepts work', async () => {
    const { service, controls } = harness();

    await expect(service.continueApproval({
      ...graph,
      approvalId: '00000000-0000-4000-8000-000000000007',
    })).rejects.toMatchObject({ status: 503 });
    expect(controls.continueOperationAttempt).not.toHaveBeenCalled();
  });

  it('delivers an approved continuation from its durable outbox without inferring a latest binding', async () => {
    const { service, controls, gate, runtime } = harness();
    gate.open();

    await expect(service.continueApproval({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      approvalId: '00000000-0000-4000-8000-000000000007',
    })).resolves.toEqual({
      operationRunId: '00000000-0000-4000-8000-000000000006',
      attemptId: graph.attemptId,
    });
    expect(controls.advanceApprovedContinuation).toHaveBeenCalledWith({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      approvalId: '00000000-0000-4000-8000-000000000007',
      signal: gate.signal(),
    });
    expect(runtime.interrupt).toHaveBeenCalledWith({
      runtimeType: 'hermes_http',
      executionId: graph.executionId,
      attemptId: graph.attemptId,
      externalRunId: 'external-run-1',
      encryptedHandleRef: 'vault://handle-1',
      generation: 1,
    }, {
      interruptId: '00000000-0000-4000-8000-000000000007',
      payload: { decision: 'approved' },
    });
    expect(controls.markApprovalContinuationInterruptDelivered).toHaveBeenCalledWith({
      organizationId: graph.organizationId,
      approvalId: '00000000-0000-4000-8000-000000000007',
      operationRunId: '00000000-0000-4000-8000-000000000006',
    });
  });

  it('replays lifecycle-cancelled graphs through one idempotent successor boundary after acceptance', async () => {
    const { service, controls, gate } = harness();
    gate.open();

    await expect(service.recoverLifecycleCancelledRuns()).resolves.toEqual({
      examined: 1,
      continued: 1,
    });
    expect(controls.continueOperationAttempt).toHaveBeenCalledWith({
      ...graph,
      continuationKey: `lifecycle:${graph.predecessorOperationRunId}`,
      signal: gate.signal(),
    });
  });
});
