import { describe, expect, it, vi } from 'vitest';
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
  it('keeps quick-process backward compatible when the request body is empty', async () => {
    const sourcingService = {
      quickProcessCandidate: vi.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new SourcingCandidateWorkspaceController(
      sourcingService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.quickProcess('candidate-1', undefined, 'org-1', authUser);

    expect(sourcingService.quickProcessCandidate).toHaveBeenCalledWith(
      'candidate-1',
      'org-1',
      'user-1',
      'all',
    );
  });
});
