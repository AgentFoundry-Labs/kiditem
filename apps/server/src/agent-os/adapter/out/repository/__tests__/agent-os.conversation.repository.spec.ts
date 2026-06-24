import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AgentOsConversationRepository } from '../agent-os.conversation.repository';

const startedAt = new Date('2026-06-02T00:00:00.000Z');

function toolInvocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tool-1',
    organizationId: 'org-1',
    conversationId: null,
    agentInstanceId: 'agent-1',
    requestId: 'request-1',
    runId: 'run-1',
    approvalRequestId: null,
    capabilityKey: 'channels.submit_coupang_listing',
    status: 'running',
    policyDecision: 'allowed',
    reasonCode: 'policy_allow',
    resourceType: null,
    resourceId: null,
    idempotencyKey: 'org-1:channels.submit_coupang_listing:listing-1',
    inputSummary: { listing: 'listing-1' },
    outputSummary: null,
    errorCode: null,
    errorMessage: null,
    startedAt,
    completedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}

describe('AgentOsConversationRepository', () => {
  it('stores an allowed tool invocation as running while execution is in flight', async () => {
    const prisma = {
      agentToolInvocation: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            toolInvocationRow({
              status: data.status,
              policyDecision: data.policyDecision,
              idempotencyKey: data.idempotencyKey,
            }),
          ),
        ),
      },
    };
    const repository = new AgentOsConversationRepository(prisma as never);

    const result = await repository.createToolInvocation({
      organizationId: 'org-1',
      conversationId: null,
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      runId: 'run-1',
      capabilityKey: 'channels.submit_coupang_listing',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      idempotencyKey: 'org-1:channels.submit_coupang_listing:listing-1',
      inputSummary: { listing: 'listing-1' },
    });

    expect(result.status).toBe('running');
    expect(prisma.agentToolInvocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyDecision: 'allowed',
          status: 'running',
        }),
      }),
    );
  });

  it('recovers a tool invocation idempotency race by returning the winning row', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    const prisma = {
      agentToolInvocation: {
        create: vi.fn().mockRejectedValueOnce(p2002),
        findFirst: vi.fn().mockResolvedValueOnce(toolInvocationRow()),
      },
    };
    const repository = new AgentOsConversationRepository(prisma as never);

    const result = await repository.createToolInvocation({
      organizationId: 'org-1',
      conversationId: null,
      agentInstanceId: 'agent-1',
      requestId: 'request-2',
      runId: 'run-2',
      capabilityKey: 'channels.submit_coupang_listing',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      idempotencyKey: 'org-1:channels.submit_coupang_listing:listing-1',
      inputSummary: { listing: 'listing-1' },
    });

    expect(result.id).toBe('tool-1');
    expect(prisma.agentToolInvocation.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        capabilityKey: 'channels.submit_coupang_listing',
        idempotencyKey: 'org-1:channels.submit_coupang_listing:listing-1',
      },
    });
  });

  it('marks a resumable tool invocation as running and clears approval pause errors', async () => {
    const prisma = {
      agentToolInvocation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(
          toolInvocationRow({
            status: 'running',
            approvalRequestId: 'approval-1',
            errorCode: null,
            errorMessage: null,
          }),
        ),
      },
    };
    const repository = new AgentOsConversationRepository(prisma as never);

    const result = await repository.markToolInvocationRunning({
      organizationId: 'org-1',
      invocationId: 'tool-1',
    });

    expect(result.claimed).toBe(true);
    expect(result.invocation.status).toBe('running');
    expect(result.invocation.errorCode).toBeNull();
    expect(result.invocation.errorMessage).toBeNull();
    expect(prisma.agentToolInvocation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'tool-1',
        organizationId: 'org-1',
        status: { in: ['requested', 'waiting_approval'] },
      },
      data: {
        status: 'running',
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      },
    });
  });

  it('returns the current invocation without claiming when another worker already moved it', async () => {
    const prisma = {
      agentToolInvocation: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(
          toolInvocationRow({
            status: 'running',
            approvalRequestId: 'approval-1',
            errorCode: null,
            errorMessage: null,
          }),
        ),
      },
    };
    const repository = new AgentOsConversationRepository(prisma as never);

    const result = await repository.markToolInvocationRunning({
      organizationId: 'org-1',
      invocationId: 'tool-1',
    });

    expect(result.claimed).toBe(false);
    expect(result.invocation.status).toBe('running');
    expect(prisma.agentToolInvocation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'tool-1',
        organizationId: 'org-1',
      },
    });
  });

  it('clears stale errors when completing a terminal invocation successfully', async () => {
    const prisma = {
      agentToolInvocation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(
          toolInvocationRow({
            status: 'succeeded',
            outputSummary: { ok: true },
            errorCode: null,
            errorMessage: null,
          }),
        ),
      },
    };
    const repository = new AgentOsConversationRepository(prisma as never);

    const result = await repository.completeToolInvocation({
      organizationId: 'org-1',
      invocationId: 'tool-1',
      status: 'succeeded',
      outputSummary: { ok: true },
    });

    expect(result.status).toBe('succeeded');
    expect(result.errorCode).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(prisma.agentToolInvocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'succeeded',
          errorCode: null,
          errorMessage: null,
        }),
      }),
    );
  });
});
