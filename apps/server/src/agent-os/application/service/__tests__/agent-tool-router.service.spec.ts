import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentPolicyService } from '../agent-policy.service';
import { AgentToolRouter } from '../agent-tool-router.service';

const startedAt = new Date('2026-05-29T00:00:00.000Z');
const completedAt = new Date('2026-05-29T00:00:01.000Z');

describe('AgentToolRouter', () => {
  it('runs an allowed capability and records invocation plus artifact', async () => {
    const registry = new AgentCapabilityRegistry();
    registry.register({
      key: 'sourcing.score_opportunities',
      ownerDomain: 'sourcing',
      executionKind: 'scorer',
      inputSchema: z.object({ candidates: z.array(z.unknown()) }),
      outputSchema: z.object({ recommendations: z.number() }),
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:score:${input.candidates.length}`,
      async execute() {
        return {
          outputSummary: { recommendations: 1 },
          resourceType: 'sourcing_recommendation',
          resourceId: 'recommendation-1',
          artifacts: [
            {
              artifactType: 'sourcing_recommendation',
              targetDomain: 'sourcing',
              targetModel: 'SourcingRecommendation',
              targetId: 'recommendation-1',
              title: '실리콘 식판 추천',
              summary: { score: 84 },
            },
          ],
        };
      },
    });

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(null),
      createToolInvocation: vi.fn().mockResolvedValue({
        id: 'tool-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        approvalRequestId: null,
        capabilityKey: 'sourcing.score_opportunities',
        status: 'running',
        policyDecision: 'allowed',
        reasonCode: 'policy_allow',
        resourceType: null,
        resourceId: null,
        idempotencyKey: 'org-1:score:0',
        inputSummary: {},
        outputSummary: null,
        errorCode: null,
        errorMessage: null,
        startedAt,
        completedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      }),
      completeToolInvocation: vi.fn().mockResolvedValue({
        id: 'tool-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        approvalRequestId: null,
        capabilityKey: 'sourcing.score_opportunities',
        status: 'succeeded',
        policyDecision: 'allowed',
        reasonCode: 'policy_allow',
        resourceType: 'sourcing_recommendation',
        resourceId: 'recommendation-1',
        idempotencyKey: 'org-1:score:0',
        inputSummary: {},
        outputSummary: { recommendations: 1 },
        errorCode: null,
        errorMessage: null,
        startedAt,
        completedAt,
        createdAt: startedAt,
        updatedAt: completedAt,
      }),
      createArtifact: vi.fn(async (input) => ({
        id: 'artifact-1',
        organizationId: input.organizationId,
        conversationId: input.conversationId ?? null,
        agentInstanceId: input.agentInstanceId ?? null,
        requestId: input.requestId ?? null,
        runId: input.runId ?? null,
        toolInvocationId: input.toolInvocationId ?? null,
        artifactType: input.artifactType,
        targetDomain: input.targetDomain,
        targetModel: input.targetModel,
        targetId: input.targetId ?? null,
        title: input.title,
        href: input.href ?? null,
        summary: input.summary ?? {},
        status: 'active',
        createdAt: completedAt,
        updatedAt: completedAt,
      })),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn().mockResolvedValue({
        decision: 'allowed',
        reasonCode: 'policy_allow',
        reason: 'Allowed by default test policy.',
        policy: {
          toolId: 'tool-sourcing-score',
          toolKey: 'sourcing.score_opportunities',
          effect: 'allow',
          approvalMode: 'none',
          dryRunMode: 'optional',
          constraints: {},
          source: 'definition',
        },
      }),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      requestId: 'request-1',
      runId: 'run-1',
      capabilityKey: 'sourcing.score_opportunities',
      input: { candidates: [] },
    });

    expect(result.status).toBe('succeeded');
    expect(result.artifacts[0].artifactType).toBe('sourcing_recommendation');
    expect(repository.createToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'org-1:score:0',
        inputSummary: { candidates: [] },
        policyDecision: 'allowed',
      }),
    );
  });

  it('creates an approval request and pauses the task when policy requires approval', async () => {
    const registry = new AgentCapabilityRegistry();
    registry.register({
      key: 'supply.submit_purchase_order',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      inputSchema: z.object({ purchaseOrderId: z.string().uuid() }),
      outputSchema: z.object({ submitted: z.boolean() }),
      sideEffects: ['external_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ input }) => `submit:${input.purchaseOrderId}`,
      async execute() {
        throw new Error('approval should pause before execution');
      },
    });

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(null),
      createToolInvocation: vi.fn().mockResolvedValue({
        id: 'tool-approval-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        approvalRequestId: null,
        capabilityKey: 'supply.submit_purchase_order',
        status: 'running',
        policyDecision: 'approval_required',
        reasonCode: 'policy_approval_required',
        resourceType: null,
        resourceId: null,
        idempotencyKey: 'submit:0187e942-9098-7382-9a22-c5b821f2f5d1',
        inputSummary: {},
        outputSummary: null,
        errorCode: null,
        errorMessage: null,
        startedAt,
        completedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      }),
      completeToolInvocation: vi.fn().mockResolvedValue({
        id: 'tool-approval-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        approvalRequestId: 'approval-1',
        capabilityKey: 'supply.submit_purchase_order',
        status: 'waiting_approval',
        policyDecision: 'approval_required',
        reasonCode: 'policy_approval_required',
        resourceType: null,
        resourceId: null,
        idempotencyKey: 'submit:0187e942-9098-7382-9a22-c5b821f2f5d1',
        inputSummary: {},
        outputSummary: null,
        errorCode: 'policy_approval_required',
        errorMessage: 'requires approval',
        startedAt,
        completedAt,
        createdAt: startedAt,
        updatedAt: completedAt,
      }),
      createApprovalRequest: vi.fn().mockResolvedValue({
        id: 'approval-1',
        status: 'pending',
      }),
      markRequestStatus: vi.fn().mockResolvedValue({
        id: 'request-1',
        status: 'requires_approval',
      }),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn().mockResolvedValue({
        decision: 'approval_required',
        reasonCode: 'policy_approval_required',
        reason: 'requires approval',
        policy: {
          toolId: 'tool-submit-po',
          toolKey: 'supply.submit_purchase_order',
          effect: 'approval_required',
          approvalMode: 'admin',
          dryRunMode: 'required',
          constraints: {},
          source: 'definition',
        },
      }),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-1',
      capabilityKey: 'supply.submit_purchase_order',
      input: { purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1' },
    });

    expect(result.status).toBe('waiting_approval');
    expect(repository.createApprovalRequest).toHaveBeenCalledTimes(1);
    expect(repository.markRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        status: 'requires_approval',
      }),
    );
  });
});
