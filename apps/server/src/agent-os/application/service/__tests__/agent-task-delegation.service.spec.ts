import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type { AgentRunnerPort } from '../../port/in/agent-runner.port';
import { AgentTaskDelegationService } from '../agent-task-delegation.service';

describe('AgentTaskDelegationService', () => {
  it('passes an explicit idempotency key to the runner', async () => {
    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-sourcing-1',
        agentType: 'sourcing',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;
    const service = new AgentTaskDelegationService(runner);

    const result = await service.delegate({
      organizationId: 'org-1',
      parentAgentType: 'manager',
      agentType: 'sourcing',
      conversationId: 'conversation-1',
      parentRequestId: 'request-operator-1',
      delegatedByRunId: 'run-operator-1',
      requestedByUserId: 'user-1',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'sourcing_agent',
      displayName: 'Sourcing Agent',
      idempotencyKey: 'operator:request-operator-1:sourcing-agent',
      payload: { keyword: '실리콘 식판' },
    });

    expect(result.requestId).toBe('request-sourcing-1');
    expect(runner.runByType).toHaveBeenCalledWith(
      'sourcing',
      expect.objectContaining({
        idempotencyKey: 'operator:request-operator-1:sourcing-agent',
        taskKey: 'conversation:conversation-1:sourcing_agent',
      }),
    );
  });

  it('preserves orchestrator-mediated user-selection source metadata', async () => {
    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-order-1',
        agentType: 'order',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;
    const service = new AgentTaskDelegationService(runner);

    await service.delegate({
      organizationId: 'org-1',
      parentAgentType: 'manager',
      agentType: 'order',
      conversationId: 'conversation-1',
      parentRequestId: 'request-operator-1',
      requestedByUserId: 'user-1',
      requestedByActorType: 'user',
      requestedByActorId: 'user-1',
      sourceType: 'agent_os_selection',
      sourceResourceType: 'agent_artifact',
      sourceResourceId: 'artifact-1',
      taskKey: 'conversation:conversation-1:order_draft:artifact:artifact-1',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'order_draft',
      displayName: 'Order Agent',
      payload: { recommendationArtifactId: 'artifact-1' },
    });

    expect(runner.runByType).toHaveBeenCalledWith(
      'order',
      expect.objectContaining({
        requestedByUserId: 'user-1',
        requestedByActorType: 'user',
        requestedByActorId: 'user-1',
        sourceType: 'agent_os_selection',
        sourceResourceType: 'agent_artifact',
        sourceResourceId: 'artifact-1',
        taskKey: 'conversation:conversation-1:order_draft:artifact:artifact-1',
        payload: { recommendationArtifactId: 'artifact-1' },
      }),
    );
  });

  it('rejects delegation when the parent agent is a leaf agent', async () => {
    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-order-1',
        agentType: 'order',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;
    const service = new AgentTaskDelegationService(runner);

    await expect(
      service.delegate({
        organizationId: 'org-1',
        parentAgentType: 'sourcing',
        agentType: 'order',
        conversationId: 'conversation-1',
        parentRequestId: 'request-sourcing-1',
        delegatedByRunId: 'run-sourcing-1',
        requestedByUserId: 'user-1',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'order_draft',
        displayName: 'Order Agent',
        idempotencyKey: 'sourcing:request-sourcing-1:order-draft',
        payload: { recommendationArtifactId: 'artifact-1' },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      name: 'AgentOsRuntimeError',
      code: 'agent_delegation_not_allowed',
    });
    expect(runner.runByType).not.toHaveBeenCalled();
  });
});
