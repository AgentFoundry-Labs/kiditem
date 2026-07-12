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

  it('uses the preparation state machine for canonical and deprecated draft creation routes', async () => {
    const registrations = {
      createDraft: vi.fn().mockResolvedValue({ preparationId: 'preparation-1', status: 'draft' }),
    };
    const controller = new SourcingCandidateWorkspaceController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      registrations as never,
    );
    const body = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Kids rain boots',
      registrationInput: { salePrice: 21900 },
    };

    await expect(controller.createPreparation('candidate-1', body, 'org-1', authUser))
      .resolves.toEqual({ preparationId: 'preparation-1', status: 'draft' });
    await expect(controller.promote('candidate-1', body, 'org-1', authUser))
      .resolves.toEqual({ preparationId: 'preparation-1', status: 'draft' });
    expect(registrations.createDraft).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'candidate-1',
      'user-1',
      body,
    );
    expect(registrations.createDraft).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'candidate-1',
      'user-1',
      body,
    );
  });

  it('routes update, submit, and cancel commands with organization/user scope', async () => {
    const registrations = {
      updateDraft: vi.fn().mockResolvedValue({ preparationId: 'preparation-1', status: 'draft' }),
      submit: vi.fn().mockResolvedValue({
        preparationId: 'preparation-1',
        status: 'registered',
        listingId: 'listing-1',
      }),
      cancel: vi.fn().mockResolvedValue({ preparationId: 'preparation-1', status: 'cancelled' }),
    };
    const controller = new SourcingCandidateWorkspaceController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      registrations as never,
    );

    await controller.updatePreparation(
      'preparation-1',
      { registrationInput: { salePrice: 22900 } },
      'org-1',
      authUser,
    );
    await controller.submitPreparation('preparation-1', 'org-1', authUser);
    await controller.cancelPreparation('preparation-1', 'org-1', authUser);

    expect(registrations.updateDraft).toHaveBeenCalledWith(
      'org-1', 'preparation-1', 'user-1', { registrationInput: { salePrice: 22900 } },
    );
    expect(registrations.submit).toHaveBeenCalledWith('org-1', 'preparation-1', 'user-1');
    expect(registrations.cancel).toHaveBeenCalledWith('org-1', 'preparation-1', 'user-1');
  });
});
