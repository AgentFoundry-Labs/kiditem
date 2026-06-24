import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { AgentApprovalsController } from '../agent-approvals.controller';

describe('AgentApprovalsController', () => {
  it('requires owner or admin role to resolve approvals', () => {
    const roles = Reflect.getMetadata(
      ROLES_METADATA_KEY,
      AgentApprovalsController.prototype.resolve,
    );

    expect(roles).toEqual(['owner', 'admin']);
  });

  it('passes current organization, user id, and role to AgentApprovalService.resolveApproval', async () => {
    const approvals = {
      resolveApproval: vi.fn().mockResolvedValue({ status: 'approved' }),
    };
    const controller = new AgentApprovalsController(approvals as never);
    const user: AuthUser = {
      id: 'user-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      role: 'admin',
      type: 'human',
      email: 'admin@example.com',
    };

    await controller.resolve('org-1', user, 'approval-1', {
      status: 'approved',
      decisionReason: '승인합니다.',
    });

    expect(approvals.resolveApproval).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      actorRole: 'admin',
      approvalRequestId: 'approval-1',
      status: 'approved',
      decisionReason: '승인합니다.',
    });
  });
});
