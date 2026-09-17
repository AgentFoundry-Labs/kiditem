import { NotImplementedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductPreparationRepositoryPort } from '../../port/out/repository/product-preparation.repository.port';
import type { RegistrationContentWorkspacePort } from '../../port/out/cross-domain/registration-content-workspace.port';
import { ProductPreparationService } from '../product-preparation.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CANDIDATE_ID = 'candidate-1';
const PREPARATION_ID = 'preparation-1';
const WORKSPACE_ID = 'workspace-1';
const ACCOUNT_ID = 'account-1';
const TX = { opaque: true } as never;

const DRAFT_INPUT = {
  channelAccountId: ACCOUNT_ID,
  displayName: 'Kids rain boots',
  registrationInput: { listingPayload: { sellerProductName: 'Kids rain boots' } },
};

function setup(overrides: {
  repository?: Partial<ProductPreparationRepositoryPort>;
  content?: Partial<RegistrationContentWorkspacePort>;
} = {}) {
  const repository = {
    createOrGetActiveDraft: vi.fn().mockImplementation(
      async (input, resolveWorkspace, resolveSelections) => {
        const sourceContentWorkspaceId = await resolveWorkspace(TX);
        await resolveSelections(TX, {
          organizationId: input.organizationId,
          sourceWorkspaceId: sourceContentWorkspaceId,
          selectedThumbnailUrl: null,
          selectedThumbnailGenerationId: null,
          selectedThumbnailGenerationCandidateId: null,
          selectedDetailPageArtifactId: null,
          selectedDetailPageRevisionId: null,
          selectedDetailPageGenerationId: null,
        });
        return {
          preparationId: PREPARATION_ID,
          status: 'draft' as const,
          sourceContentWorkspaceId,
        };
      },
    ),
    replaceDraftInput: vi.fn().mockResolvedValue({ preparationId: PREPARATION_ID, status: 'draft' }),
    assertCandidateTerminalTransitionAllowed: vi.fn().mockResolvedValue(undefined),
    ...overrides.repository,
  } as ProductPreparationRepositoryPort;
  const content = {
    resolveSourceSelections: vi.fn().mockImplementation(async (_tx, input) => ({
      selectedThumbnailUrl: input.selectedThumbnailUrl,
      selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
      selectedThumbnailGenerationCandidateId: input.selectedThumbnailGenerationCandidateId,
      selectedDetailPageArtifactId: input.selectedDetailPageArtifactId,
      selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
      selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
    })),
    ensureCandidateWorkspace: vi.fn().mockResolvedValue(WORKSPACE_ID),
    branchToListing: vi.fn().mockResolvedValue({ workspaceId: 'listing-workspace-1' }),
    ...overrides.content,
  } as RegistrationContentWorkspacePort;
  return { service: new ProductPreparationService(repository, content), repository, content };
}

describe('ProductPreparationService', () => {
  it('creates an account-scoped draft and atomically resolves the candidate workspace', async () => {
    const { service, repository, content } = setup();

    await expect(service.createDraft(ORG_ID, CANDIDATE_ID, USER_ID, DRAFT_INPUT))
      .resolves.toEqual({ preparationId: PREPARATION_ID, status: 'draft' });

    expect(repository.createOrGetActiveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceCandidateId: CANDIDATE_ID,
        createdByUserId: USER_ID,
        input: DRAFT_INPUT,
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(content.ensureCandidateWorkspace).toHaveBeenCalledWith(TX, {
      organizationId: ORG_ID,
      sourceCandidateId: CANDIDATE_ID,
      displayName: DRAFT_INPUT.displayName,
      createdByUserId: USER_ID,
    });
    expect(content.resolveSourceSelections).toHaveBeenCalledWith(TX, {
      organizationId: ORG_ID,
      sourceWorkspaceId: WORKSPACE_ID,
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    });
  });

  it('surfaces the deterministic candidate-wide expand compatibility conflict', async () => {
    const conflict = new Error('Candidate already has a preparation for another channel account.');
    const { service } = setup({
      repository: { createOrGetActiveDraft: vi.fn().mockRejectedValue(conflict) },
    });

    await expect(service.createDraft(ORG_ID, CANDIDATE_ID, USER_ID, DRAFT_INPUT))
      .rejects.toBe(conflict);
  });

  it('editing a failed preparation returns the replacement draft created by the repository', async () => {
    const replaceDraftInput = vi.fn().mockResolvedValue({
      preparationId: 'preparation-2',
      status: 'draft',
    });
    const { service } = setup({ repository: { replaceDraftInput } });

    await expect(
      service.updateDraft(ORG_ID, PREPARATION_ID, USER_ID, {
        registrationInput: { listingPayload: { salePrice: 22900 } },
      }),
    ).resolves.toEqual({ preparationId: 'preparation-2', status: 'draft' });
    expect(replaceDraftInput).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        preparationId: PREPARATION_ID,
        userId: USER_ID,
        command: {
          kind: 'replace',
          input: { registrationInput: { listingPayload: { salePrice: 22900 } } },
        },
      },
      expect.any(Function),
    );
  });

  it('returns an HTTP 501-style unsupported error before touching the draft or its content', () => {
    const { service, repository, content } = setup();
    let thrown: unknown;

    try {
      service.submit(ORG_ID, PREPARATION_ID, USER_ID);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NotImplementedException);
    expect((thrown as NotImplementedException).getStatus()).toBe(501);
    expect((thrown as Error).message).toContain('product submission is not supported');
    expect(repository.replaceDraftInput).not.toHaveBeenCalled();
    expect(content.branchToListing).not.toHaveBeenCalled();
  });

  it('cancels through the row-locked repository command', async () => {
    const replaceDraftInput = vi.fn().mockResolvedValue({
      preparationId: PREPARATION_ID,
      status: 'cancelled',
    });
    const { service } = setup({ repository: { replaceDraftInput } });

    await expect(service.cancel(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'cancelled',
    });
    expect(replaceDraftInput).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        preparationId: PREPARATION_ID,
        userId: USER_ID,
        command: { kind: 'cancel' },
      },
      expect.any(Function),
    );
  });
});
