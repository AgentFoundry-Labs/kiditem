import { describe, expect, it, vi } from 'vitest';
import { AgentOsApprovalRepository } from '../agent-os.approval.repository';

describe('AgentOsApprovalRepository', () => {
  it('marks waiting tool invocations failed when their approval is rejected', async () => {
    const approval = {
      id: 'approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-1',
      requestId: 'request-1',
      runId: 'run-1',
      status: 'rejected',
    };
    const tx = {
      agentApprovalRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'approval-1',
          requestId: 'request-1',
          status: 'pending',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(approval),
      },
      agentRunRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      agentToolInvocation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsApprovalRepository(prisma as never);

    await repository.resolveApprovalRequest({
      organizationId: 'org-1',
      approvalRequestId: 'approval-1',
      status: 'rejected',
      decidedByUserId: 'user-1',
      decisionReason: '상품 정보가 부족합니다.',
    });

    expect(tx.agentToolInvocation.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        approvalRequestId: 'approval-1',
        status: 'waiting_approval',
      },
      data: {
        status: 'failed',
        errorCode: 'approval_rejected',
        errorMessage: '상품 정보가 부족합니다.',
        completedAt: expect.any(Date),
      },
    });
  });

  it('does not resolve an approval that was already decided', async () => {
    const tx = {
      agentApprovalRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'approval-1',
          requestId: 'request-1',
          status: 'approved',
        }),
        updateMany: vi.fn(),
        findFirstOrThrow: vi.fn(),
      },
      agentRunRequest: {
        updateMany: vi.fn(),
      },
      agentToolInvocation: {
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsApprovalRepository(prisma as never);

    await expect(
      repository.resolveApprovalRequest({
        organizationId: 'org-1',
        approvalRequestId: 'approval-1',
        status: 'approved',
        decidedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      code: 'approval_request_not_pending',
    });

    expect(tx.agentApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.agentRunRequest.updateMany).not.toHaveBeenCalled();
  });

  it('does not move a terminal request back to pending when approval is approved', async () => {
    const tx = {
      agentApprovalRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'approval-1',
          requestId: 'request-1',
          status: 'pending',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: 'approval-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-1',
          requestId: 'request-1',
          runId: 'run-1',
          status: 'approved',
        }),
      },
      agentRunRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      agentToolInvocation: {
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const repository = new AgentOsApprovalRepository(prisma as never);

    await expect(
      repository.resolveApprovalRequest({
        organizationId: 'org-1',
        approvalRequestId: 'approval-1',
        status: 'approved',
        decidedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      code: 'approval_request_not_awaiting_request',
    });

    expect(tx.agentRunRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        organizationId: 'org-1',
        status: 'requires_approval',
      },
      data: {
        status: 'pending',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });
});
