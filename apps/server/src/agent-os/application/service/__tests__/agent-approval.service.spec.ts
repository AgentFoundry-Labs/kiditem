import { describe, expect, it, vi } from 'vitest';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import { AgentApprovalService } from '../agent-approval.service';

describe('AgentApprovalService', () => {
  it('resolves a pending approval with the current organization and user', async () => {
    const repository = {
      findApprovalRequestById: vi.fn().mockResolvedValue({
        id: 'approval-1',
        organizationId: 'org-1',
        agentInstanceId: 'agent-order-1',
        requestId: 'request-order-1',
        runId: 'run-order-1',
        status: 'pending',
        reasonCode: 'policy_approval_required',
        reason: 'Human approval required.',
        prompt: '발주를 진행할까요?',
        payload: {},
        actionSnapshot: {},
        requestedByActorType: 'agent',
        requestedByActorId: 'agent-order-1',
        requestedByUserId: null,
        approverUserId: null,
        decidedByUserId: null,
        decidedAt: null,
        decisionReason: null,
        expiresAt: null,
        createdAt: new Date('2026-05-29T00:04:00.000Z'),
        updatedAt: new Date('2026-05-29T00:04:00.000Z'),
      }),
      resolveApprovalRequest: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentOsRepositoryPort;
    const runner = {
      executeRequest: vi.fn().mockResolvedValue({
        executed: true,
        requestId: 'request-order-1',
        runId: 'run-order-2',
      }),
    };
    const service = new AgentApprovalService(repository, runner as never);

    const result = await service.resolveApproval({
      organizationId: 'org-1',
      userId: 'user-1',
      actorRole: 'admin',
      approvalRequestId: 'approval-1',
      status: 'approved',
      decisionReason: '테스트 발주 범위라 승인합니다.',
    });

    expect(repository.resolveApprovalRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      approvalRequestId: 'approval-1',
      status: 'approved',
      decidedByUserId: 'user-1',
      decisionReason: '테스트 발주 범위라 승인합니다.',
    });
    expect(runner.executeRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestId: 'request-order-1',
      workerId: 'agent-os-approval',
    });
    expect(result).toEqual({
      approvalRequestId: 'approval-1',
      requestId: 'request-order-1',
      status: 'approved',
    });
  });

  it('resolves a rejected approval with a normalized empty reason', async () => {
    const repository = {
      findApprovalRequestById: vi.fn().mockResolvedValue({
        id: 'approval-2',
        organizationId: 'org-1',
        agentInstanceId: 'agent-order-1',
        requestId: 'request-order-2',
        runId: 'run-order-1',
        status: 'pending',
        reasonCode: 'policy_approval_required',
        reason: 'Human approval required.',
        prompt: '발주를 진행할까요?',
        payload: {},
        actionSnapshot: {},
        requestedByActorType: 'agent',
        requestedByActorId: 'agent-order-1',
        requestedByUserId: null,
        approverUserId: null,
        decidedByUserId: null,
        decidedAt: null,
        decisionReason: null,
        expiresAt: null,
        createdAt: new Date('2026-05-29T00:04:00.000Z'),
        updatedAt: new Date('2026-05-29T00:04:00.000Z'),
      }),
      resolveApprovalRequest: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentOsRepositoryPort;
    const runner = {
      executeRequest: vi.fn(),
    };
    const service = new AgentApprovalService(repository, runner as never);

    const result = await service.resolveApproval({
      organizationId: 'org-1',
      userId: 'user-1',
      actorRole: 'owner',
      approvalRequestId: 'approval-2',
      status: 'rejected',
      decisionReason: '   ',
    });

    expect(repository.resolveApprovalRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      approvalRequestId: 'approval-2',
      status: 'rejected',
      decidedByUserId: 'user-1',
      decisionReason: null,
    });
    expect(runner.executeRequest).not.toHaveBeenCalled();
    expect(result).toEqual({
      approvalRequestId: 'approval-2',
      requestId: 'request-order-2',
      status: 'rejected',
    });
  });

  it('lists approval requests for the current organization', async () => {
    const repository = {
      listApprovalRequests: vi.fn().mockResolvedValue([
        {
          id: 'approval-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-order-1',
          requestId: 'request-order-1',
          runId: 'run-order-1',
          status: 'approved',
          reasonCode: 'policy_approval_required',
          reason: 'Human approval required.',
          prompt: '쿠팡 등록을 진행할까요?',
          payload: { productName: '실리콘 흡착 식판' },
          actionSnapshot: { capabilityKey: 'channels.register_confirmed_listing' },
          requestedByActorType: 'agent',
          requestedByActorId: 'agent-sourcing-1',
          requestedByUserId: null,
          approverUserId: null,
          decidedByUserId: 'user-1',
          decidedAt: new Date('2026-05-29T00:05:00.000Z'),
          decisionReason: '테스트 등록 범위라 승인합니다.',
          expiresAt: null,
          createdAt: new Date('2026-05-29T00:04:00.000Z'),
          updatedAt: new Date('2026-05-29T00:05:00.000Z'),
        },
      ]),
    } as unknown as AgentOsRepositoryPort;
    const service = new AgentApprovalService(repository);

    const result = await service.listApprovals({
      organizationId: 'org-1',
      status: ['approved'],
      limit: 25,
    });

    expect(repository.listApprovalRequests).toHaveBeenCalledWith({
      organizationId: 'org-1',
      agentInstanceId: null,
      status: ['approved'],
      cursor: null,
      limit: 25,
    });
    expect(result[0].prompt).toBe('쿠팡 등록을 진행할까요?');
  });

  it('rejects approval resolution from non-admin organization members', async () => {
    const repository = {
      findApprovalRequestById: vi.fn(),
      resolveApprovalRequest: vi.fn(),
    } as unknown as AgentOsRepositoryPort;
    const service = new AgentApprovalService(repository);

    await expect(
      service.resolveApproval({
        organizationId: 'org-1',
        userId: 'user-1',
        actorRole: 'member',
        approvalRequestId: 'approval-1',
        status: 'approved',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'agent_approval_resolution_forbidden',
      },
    });

    expect(repository.findApprovalRequestById).not.toHaveBeenCalled();
    expect(repository.resolveApprovalRequest).not.toHaveBeenCalled();
  });
});
