import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SourcingCandidateWorkspaceController } from '../sourcing-candidate-workspace.controller';
import type { AuthUser } from '../../../../../auth/auth.types';

const authUser: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  membershipId: 'membership-1',
  role: 'admin',
  type: 'human',
  email: 'user@example.com',
};

describe('SourcingCandidateWorkspaceController', () => {
  it('passes the caller-stable idempotency key to the direct quick-process owner', async () => {
    const sourcingService = {
      quickProcessCandidate: vi.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new SourcingCandidateWorkspaceController(
      sourcingService as never,
      {} as never,
      {} as never,
    );

    await controller.quickProcess('candidate-1', undefined, 'org-1', authUser, 'quick-process-key');

    expect(sourcingService.quickProcessCandidate).toHaveBeenCalledWith(
      'candidate-1',
      'org-1',
      'user-1',
      'all',
      'quick-process-key',
    );
  });

  it('rejects quick processing without a caller-generated Idempotency-Key', async () => {
    const controller = new SourcingCandidateWorkspaceController(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(controller.quickProcess('candidate-1', undefined, 'org-1', authUser, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
