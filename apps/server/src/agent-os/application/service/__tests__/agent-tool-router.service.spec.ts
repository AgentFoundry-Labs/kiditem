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

  it('uses repository atomic completion when a capability succeeds with artifacts', async () => {
    const registry = new AgentCapabilityRegistry();
    registry.register({
      key: 'sourcing.create_candidate',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: z.object({ productName: z.string() }),
      outputSchema: z.object({ candidateId: z.string() }),
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:candidate:${input.productName}`,
      async execute() {
        return {
          outputSummary: { candidateId: 'candidate-1' },
          resourceType: 'sourcing_candidate',
          resourceId: 'candidate-1',
          artifacts: [
            {
              artifactType: 'sourcing_candidate',
              targetDomain: 'sourcing',
              targetModel: 'SourcingCandidate',
              targetId: 'candidate-1',
              title: 'Candidate',
              summary: { candidateId: 'candidate-1' },
            },
          ],
        };
      },
    });

    const completedInvocation = {
      id: 'tool-candidate-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      runId: 'run-1',
      approvalRequestId: null,
      capabilityKey: 'sourcing.create_candidate',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: 'sourcing_candidate',
      resourceId: 'candidate-1',
      idempotencyKey: 'org-1:candidate:Toy car',
      inputSummary: {},
      outputSummary: { candidateId: 'candidate-1' },
      errorCode: null,
      errorMessage: null,
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    const createdArtifact = {
      id: 'artifact-candidate-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      runId: 'run-1',
      toolInvocationId: 'tool-candidate-1',
      artifactType: 'sourcing_candidate',
      targetDomain: 'sourcing',
      targetModel: 'SourcingCandidate',
      targetId: 'candidate-1',
      title: 'Candidate',
      href: null,
      summary: { candidateId: 'candidate-1' },
      status: 'active',
      createdAt: completedAt,
      updatedAt: completedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(null),
      createToolInvocation: vi.fn().mockResolvedValue({
        ...completedInvocation,
        status: 'running',
        outputSummary: null,
        resourceType: null,
        resourceId: null,
        completedAt: null,
        created: true,
      }),
      completeToolInvocationWithArtifacts: vi.fn().mockResolvedValue({
        invocation: completedInvocation,
        artifacts: [createdArtifact],
      }),
      completeToolInvocation: vi.fn(),
      createArtifact: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn().mockResolvedValue({
        decision: 'allowed',
        reasonCode: 'policy_allow',
        reason: 'Allowed by default test policy.',
        policy: {
          toolId: 'tool-candidate',
          toolKey: 'sourcing.create_candidate',
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
      capabilityKey: 'sourcing.create_candidate',
      input: { productName: 'Toy car' },
    });

    expect(repository.completeToolInvocationWithArtifacts).toHaveBeenCalledWith({
      organizationId: 'org-1',
      invocationId: 'tool-candidate-1',
      status: 'succeeded',
      outputSummary: { candidateId: 'candidate-1' },
      resourceType: 'sourcing_candidate',
      resourceId: 'candidate-1',
      artifacts: [
        {
          conversationId: 'conversation-1',
          agentInstanceId: 'agent-1',
          requestId: 'request-1',
          runId: 'run-1',
          artifactType: 'sourcing_candidate',
          targetDomain: 'sourcing',
          targetModel: 'SourcingCandidate',
          targetId: 'candidate-1',
          title: 'Candidate',
          href: null,
          summary: { candidateId: 'candidate-1' },
        },
      ],
    });
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
    expect(repository.createArtifact).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'succeeded',
      invocation: completedInvocation,
      artifacts: [createdArtifact],
    });
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

  it('executes an approved waiting invocation without creating another approval', async () => {
    const registry = new AgentCapabilityRegistry();
    let executions = 0;
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
        executions += 1;
        return {
          outputSummary: { submitted: true },
          resourceType: 'purchase_order',
          resourceId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        };
      },
    });

    const waitingInvocation = {
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
      inputSummary: {
        purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      },
      outputSummary: null,
      errorCode: 'policy_approval_required',
      errorMessage: 'requires approval',
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(waitingInvocation),
      findApprovalRequestById: vi.fn().mockResolvedValue({
        id: 'approval-1',
        organizationId: 'org-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        status: 'approved',
        payload: {
          purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        },
        actionSnapshot: {
          capabilityKey: 'supply.submit_purchase_order',
        },
      }),
      createToolInvocation: vi.fn(),
      createApprovalRequest: vi.fn(),
      markRequestStatus: vi.fn(),
      markToolInvocationRunning: vi.fn().mockResolvedValue({
        claimed: true,
        invocation: {
          ...waitingInvocation,
          status: 'running',
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      }),
      completeToolInvocation: vi.fn().mockResolvedValue({
        ...waitingInvocation,
        status: 'succeeded',
        outputSummary: { submitted: true },
        resourceType: 'purchase_order',
        resourceId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        errorCode: null,
        errorMessage: null,
      }),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn(),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-2',
      capabilityKey: 'supply.submit_purchase_order',
      input: { purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1' },
    });

    expect(result.status).toBe('succeeded');
    expect(executions).toBe(1);
    expect(policy.authorizeToolUse).not.toHaveBeenCalled();
    expect(repository.createToolInvocation).not.toHaveBeenCalled();
    expect(repository.createApprovalRequest).not.toHaveBeenCalled();
    expect(repository.markToolInvocationRunning).toHaveBeenCalledWith({
      organizationId: 'org-1',
      invocationId: 'tool-approval-1',
    });
    expect(repository.completeToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: 'tool-approval-1',
        status: 'succeeded',
      }),
    );
    expect(
      vi.mocked(repository.markToolInvocationRunning).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.completeToolInvocation).mock.invocationCallOrder[0],
    );
  });

  it('returns an existing pending approval invocation instead of duplicating the gate', async () => {
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
        throw new Error('pending approval should not execute');
      },
    });

    const waitingInvocation = {
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
      inputSummary: {
        purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      },
      outputSummary: null,
      errorCode: 'policy_approval_required',
      errorMessage: 'requires approval',
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(waitingInvocation),
      findApprovalRequestById: vi.fn().mockResolvedValue({
        id: 'approval-1',
        organizationId: 'org-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        status: 'pending',
        payload: waitingInvocation.inputSummary,
        actionSnapshot: {
          capabilityKey: 'supply.submit_purchase_order',
        },
      }),
      createToolInvocation: vi.fn(),
      createApprovalRequest: vi.fn(),
      completeToolInvocation: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn(),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-2',
      capabilityKey: 'supply.submit_purchase_order',
      input: { purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1' },
    });

    expect(result.status).toBe('waiting_approval');
    expect(result.invocation.id).toBe('tool-approval-1');
    expect(policy.authorizeToolUse).not.toHaveBeenCalled();
    expect(repository.createToolInvocation).not.toHaveBeenCalled();
    expect(repository.createApprovalRequest).not.toHaveBeenCalled();
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
  });

  it('returns the running invocation when an approved resume loses the execution claim race', async () => {
    const registry = new AgentCapabilityRegistry();
    let executions = 0;
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
        executions += 1;
        return { outputSummary: { submitted: true } };
      },
    });

    const waitingInvocation = {
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
      inputSummary: {
        purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
      },
      outputSummary: null,
      errorCode: 'policy_approval_required',
      errorMessage: 'requires approval',
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    const runningInvocation = {
      ...waitingInvocation,
      status: 'running',
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(waitingInvocation),
      findApprovalRequestById: vi.fn().mockResolvedValue({
        id: 'approval-1',
        organizationId: 'org-1',
        agentInstanceId: 'agent-1',
        requestId: 'request-1',
        runId: 'run-1',
        status: 'approved',
        payload: waitingInvocation.inputSummary,
        actionSnapshot: {
          capabilityKey: 'supply.submit_purchase_order',
        },
      }),
      markToolInvocationRunning: vi.fn().mockResolvedValue({
        claimed: false,
        invocation: runningInvocation,
      }),
      completeToolInvocation: vi.fn(),
      createArtifact: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn(),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-2',
      capabilityKey: 'supply.submit_purchase_order',
      input: { purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1' },
    });

    expect(result).toEqual({
      status: 'running',
      invocation: runningInvocation,
      artifacts: [],
    });
    expect(executions).toBe(0);
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
    expect(repository.createArtifact).not.toHaveBeenCalled();
  });

  it('returns an existing in-progress invocation instead of duplicating execution', async () => {
    const registry = new AgentCapabilityRegistry();
    registry.register({
      key: 'channels.submit_coupang_listing',
      ownerDomain: 'channels',
      executionKind: 'workflow',
      inputSchema: z.object({
        masterId: z.string().uuid(),
        channelAccountId: z.string().uuid(),
      }),
      outputSchema: z.object({ submitted: z.boolean() }),
      sideEffects: ['external_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:channels.submit_coupang_listing:${input.channelAccountId}:${input.masterId}`,
      async execute() {
        throw new Error('in-progress invocation should not execute again');
      },
    });

    const inProgressInvocation = {
      id: 'tool-coupang-submit-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-channel-1',
      requestId: 'request-channel-1',
      runId: 'run-channel-1',
      approvalRequestId: null,
      capabilityKey: 'channels.submit_coupang_listing',
      status: 'running',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: null,
      resourceId: null,
      idempotencyKey:
        'org-1:channels.submit_coupang_listing:00000000-0000-4000-8000-000000000002:00000000-0000-4000-8000-000000000001',
      inputSummary: {
        masterId: '00000000-0000-4000-8000-000000000001',
        channelAccountId: '00000000-0000-4000-8000-000000000002',
      },
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt,
      completedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi
        .fn()
        .mockResolvedValue(inProgressInvocation),
      createToolInvocation: vi.fn(),
      createApprovalRequest: vi.fn(),
      completeToolInvocation: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn(),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-channel-1',
      agentType: 'channel_registration',
      requestId: 'request-channel-2',
      runId: 'run-channel-2',
      capabilityKey: 'channels.submit_coupang_listing',
      input: {
        masterId: '00000000-0000-4000-8000-000000000001',
        channelAccountId: '00000000-0000-4000-8000-000000000002',
      },
    });

    expect(result).toEqual({
      status: 'running',
      invocation: inProgressInvocation,
      artifacts: [],
    });
    expect(policy.authorizeToolUse).not.toHaveBeenCalled();
    expect(repository.createToolInvocation).not.toHaveBeenCalled();
    expect(repository.createApprovalRequest).not.toHaveBeenCalled();
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
  });

  it('does not execute when createToolInvocation loses an idempotency race to a running invocation', async () => {
    const registry = new AgentCapabilityRegistry();
    const execute = vi.fn(async () => ({
      outputSummary: { submitted: true },
    }));
    registry.register({
      key: 'channels.submit_coupang_listing',
      ownerDomain: 'channels',
      executionKind: 'workflow',
      inputSchema: z.object({
        masterId: z.string().uuid(),
        channelAccountId: z.string().uuid(),
      }),
      outputSchema: z.object({ submitted: z.boolean() }),
      sideEffects: ['external_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:channels.submit_coupang_listing:${input.channelAccountId}:${input.masterId}`,
      execute,
    });

    const winningInvocation = {
      id: 'tool-coupang-submit-winning',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-channel-1',
      requestId: 'request-channel-1',
      runId: 'run-channel-1',
      approvalRequestId: null,
      capabilityKey: 'channels.submit_coupang_listing',
      status: 'running',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: null,
      resourceId: null,
      idempotencyKey:
        'org-1:channels.submit_coupang_listing:00000000-0000-4000-8000-000000000002:00000000-0000-4000-8000-000000000001',
      inputSummary: {},
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt,
      completedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
      created: false,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(null),
      createToolInvocation: vi.fn().mockResolvedValue(winningInvocation),
      completeToolInvocation: vi.fn(),
      createArtifact: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn().mockResolvedValue({
        decision: 'allowed',
        reasonCode: 'policy_allow',
        reason: 'Allowed by default test policy.',
        policy: {
          toolId: 'tool-coupang-submit',
          toolKey: 'channels.submit_coupang_listing',
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
      agentInstanceId: 'agent-channel-2',
      agentType: 'channel_registration',
      requestId: 'request-channel-2',
      runId: 'run-channel-2',
      capabilityKey: 'channels.submit_coupang_listing',
      input: {
        masterId: '00000000-0000-4000-8000-000000000001',
        channelAccountId: '00000000-0000-4000-8000-000000000002',
      },
    });

    expect(result).toEqual({
      status: 'running',
      invocation: winningInvocation,
      artifacts: [],
    });
    expect(execute).not.toHaveBeenCalled();
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
    expect(repository.createArtifact).not.toHaveBeenCalled();
  });

  it('re-attaches succeeded idempotent artifacts to the current conversation context', async () => {
    const registry = new AgentCapabilityRegistry();
    const execute = vi.fn(async () => {
      throw new Error('succeeded idempotent invocation should not execute again');
    });
    registry.register({
      key: 'sourcing.scrapeProductUrl',
      ownerDomain: 'sourcing',
      executionKind: 'scraper',
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({ ok: z.boolean() }),
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:sourcing.scrapeProductUrl:${input.url}`,
      execute,
    });

    const existingInvocation = {
      id: 'tool-scrape-old',
      organizationId: 'org-1',
      conversationId: 'conversation-old',
      agentInstanceId: 'agent-sourcing-old',
      requestId: 'request-old',
      runId: 'run-old',
      approvalRequestId: null,
      capabilityKey: 'sourcing.scrapeProductUrl',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: 'sourcing_scrape_snapshot',
      resourceId: 'https://detail.1688.com/offer/123.html',
      idempotencyKey:
        'org-1:sourcing.scrapeProductUrl:https://detail.1688.com/offer/123.html',
      inputSummary: { url: 'https://detail.1688.com/offer/123.html' },
      outputSummary: { ok: true },
      errorCode: null,
      errorMessage: null,
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    const existingArtifact = {
      id: 'artifact-old',
      organizationId: 'org-1',
      conversationId: 'conversation-old',
      agentInstanceId: 'agent-sourcing-old',
      requestId: 'request-old',
      runId: 'run-old',
      toolInvocationId: 'tool-scrape-old',
      artifactType: 'sourcing_scrape_snapshot',
      targetDomain: 'sourcing',
      targetModel: 'SourcingScrapeSnapshot',
      targetId: 'https://detail.1688.com/offer/123.html',
      title: '1688 scrape snapshot',
      href: null,
      summary: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/123.html',
        scraped_data: {
          title: 'Remote control tank',
          images: ['https://example.com/tank.jpg'],
        },
      },
      status: 'active',
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    const reattachedArtifact = {
      ...existingArtifact,
      id: 'artifact-current',
      conversationId: 'conversation-current',
      agentInstanceId: 'agent-sourcing-current',
      requestId: 'request-current',
      runId: 'run-current',
      createdAt: completedAt,
      updatedAt: completedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi
        .fn()
        .mockResolvedValue(existingInvocation),
      listArtifacts: vi
        .fn()
        .mockResolvedValueOnce([existingArtifact])
        .mockResolvedValueOnce([]),
      createArtifact: vi.fn().mockResolvedValue(reattachedArtifact),
      createToolInvocation: vi.fn(),
      completeToolInvocation: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const policy = {
      authorizeToolUse: vi.fn(),
    } as unknown as AgentPolicyService;

    const router = new AgentToolRouter(registry, repository, policy);
    const result = await router.invoke({
      organizationId: 'org-1',
      conversationId: 'conversation-current',
      agentInstanceId: 'agent-sourcing-current',
      agentType: 'sourcing',
      requestId: 'request-current',
      runId: 'run-current',
      capabilityKey: 'sourcing.scrapeProductUrl',
      input: { url: 'https://detail.1688.com/offer/123.html' },
    });

    expect(result.status).toBe('succeeded');
    expect(result.artifacts).toEqual([reattachedArtifact]);
    expect(repository.createArtifact).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-current',
      agentInstanceId: 'agent-sourcing-current',
      requestId: 'request-current',
      runId: 'run-current',
      toolInvocationId: null,
      artifactType: 'sourcing_scrape_snapshot',
      targetDomain: 'sourcing',
      targetModel: 'SourcingScrapeSnapshot',
      targetId: 'https://detail.1688.com/offer/123.html',
      title: '1688 scrape snapshot',
      href: null,
      summary: {
        ...existingArtifact.summary,
        agentOsCacheSource: {
          artifactId: 'artifact-old',
          toolInvocationId: 'tool-scrape-old',
        },
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(policy.authorizeToolUse).not.toHaveBeenCalled();
    expect(repository.createToolInvocation).not.toHaveBeenCalled();
    expect(repository.completeToolInvocation).not.toHaveBeenCalled();
  });

  it('re-executes a succeeded idempotent invocation when stale error state remains', async () => {
    const registry = new AgentCapabilityRegistry();
    const execute = vi.fn(async () => ({
      outputSummary: { candidateId: 'candidate-1', thumbnailGenerationId: 'thumb-1' },
      resourceType: 'sourcing_candidate',
      resourceId: 'candidate-1',
      artifacts: [
        {
          artifactType: 'listing_prep_package',
          targetDomain: 'sourcing',
          targetModel: 'ProductGenerationPackage',
          targetId: 'candidate-1',
          title: 'Listing package',
          summary: { candidateId: 'candidate-1', thumbnailGenerationId: 'thumb-1' },
        },
      ],
    }));
    registry.register({
      key: 'product_listing.create_generation_package',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      inputSchema: z.object({ productName: z.string(), imageUrls: z.array(z.string()).min(1) }),
      outputSchema: z.object({
        candidateId: z.string(),
        thumbnailGenerationId: z.string().nullable(),
      }),
      sideEffects: ['db_write', 'job_enqueue'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) =>
        `${organizationId}:listing:${input.productName}`,
      execute,
    });

    const staleInvocation = {
      id: 'tool-listing-stale',
      organizationId: 'org-1',
      conversationId: 'conversation-old',
      agentInstanceId: 'agent-listing-old',
      requestId: 'request-old',
      runId: 'run-old',
      approvalRequestId: null,
      capabilityKey: 'product_listing.create_generation_package',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: 'sourcing_candidate',
      resourceId: 'candidate-1',
      idempotencyKey: 'org-1:listing:Remote control tank',
      inputSummary: {
        productName: 'Remote control tank',
        imageUrls: ['https://example.com/tank.jpg'],
      },
      outputSummary: { candidateId: 'candidate-1', thumbnailGenerationId: null },
      errorCode: 'capability_failed',
      errorMessage: 'previous enqueue failed',
      startedAt,
      completedAt,
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    const completedInvocation = {
      ...staleInvocation,
      conversationId: 'conversation-current',
      agentInstanceId: 'agent-listing-current',
      requestId: 'request-current',
      runId: 'run-current',
      outputSummary: { candidateId: 'candidate-1', thumbnailGenerationId: 'thumb-1' },
      errorCode: null,
      errorMessage: null,
      updatedAt: completedAt,
    };

    const repository = {
      findToolInvocationByIdempotency: vi.fn().mockResolvedValue(staleInvocation),
      createToolInvocation: vi.fn().mockResolvedValue(staleInvocation),
      completeToolInvocation: vi.fn().mockResolvedValue(completedInvocation),
      createArtifact: vi.fn(async (input) => ({
        id: 'artifact-listing-current',
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
          toolId: 'tool-listing-package',
          toolKey: 'product_listing.create_generation_package',
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
      conversationId: 'conversation-current',
      agentInstanceId: 'agent-listing-current',
      agentType: 'listing',
      requestId: 'request-current',
      runId: 'run-current',
      capabilityKey: 'product_listing.create_generation_package',
      input: {
        productName: 'Remote control tank',
        imageUrls: ['https://example.com/tank.jpg'],
      },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(repository.createToolInvocation).toHaveBeenCalled();
    expect(repository.completeToolInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: 'tool-listing-stale',
        status: 'succeeded',
        outputSummary: { candidateId: 'candidate-1', thumbnailGenerationId: 'thumb-1' },
      }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.artifacts[0]).toMatchObject({
      conversationId: 'conversation-current',
      runId: 'run-current',
      summary: { candidateId: 'candidate-1', thumbnailGenerationId: 'thumb-1' },
    });
  });
});
