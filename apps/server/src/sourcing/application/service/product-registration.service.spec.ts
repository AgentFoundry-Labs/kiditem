import { describe, expect, it, vi } from 'vitest';
import type {
  ProductPreparationRepositoryPort,
  FrozenProductPreparationSubmission,
} from '../port/out/repository/product-preparation.repository.port';
import {
  DefinitiveChannelProductRegistrationError,
  type ChannelProductRegistrationPort,
} from '../port/out/cross-domain/channel-product-registration.port';
import type { RegistrationContentWorkspacePort } from '../port/out/cross-domain/registration-content-workspace.port';
import { ProductRegistrationService } from './product-registration.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CANDIDATE_ID = 'candidate-1';
const PREPARATION_ID = 'preparation-1';
const WORKSPACE_ID = 'workspace-1';
const ACCOUNT_ID = 'account-1';
const LISTING_ID = 'listing-1';
const MASTER_PRODUCT_ID = '00000000-0000-4000-8000-000000000010';
const PRODUCT_VARIANT_ID = '00000000-0000-4000-8000-000000000011';
const TX = { opaque: true } as never;

const DRAFT_INPUT = {
  channelAccountId: ACCOUNT_ID,
  displayName: 'Kids rain boots',
  registrationInput: { listingPayload: { sellerProductName: 'Kids rain boots' } },
};

function frozenSubmission(
  overrides: Partial<FrozenProductPreparationSubmission> = {},
): FrozenProductPreparationSubmission {
  return {
    preparationId: PREPARATION_ID,
    sourceCandidateId: CANDIDATE_ID,
    channelAccountId: ACCOUNT_ID,
    sourceContentWorkspaceId: WORKSPACE_ID,
    displayName: 'Kids rain boots',
    status: 'submitting',
    submissionKey: 'submission-key-1',
    submissionPayloadJson: {
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: DRAFT_INPUT.registrationInput,
    },
    submissionPayloadHash: 'hash-1',
    providerSubmissionId: null,
    registrationResult: null,
    providerOutcome: 'not_attempted',
    submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
    isRetry: false,
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
    selectedDetailPageGenerationId: null,
    ...overrides,
  };
}

function setup(overrides: {
  repository?: Partial<ProductPreparationRepositoryPort>;
  channel?: Partial<ChannelProductRegistrationPort>;
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
    claimForSubmission: vi.fn().mockImplementation(
      async (organizationId, _preparationId, _userId, resolveSelections) => {
        await resolveSelections(TX, {
          organizationId,
          sourceWorkspaceId: WORKSPACE_ID,
          selectedThumbnailUrl: null,
          selectedThumbnailGenerationId: null,
          selectedThumbnailGenerationCandidateId: null,
          selectedDetailPageArtifactId: null,
          selectedDetailPageRevisionId: null,
          selectedDetailPageGenerationId: null,
        });
        return frozenSubmission();
      },
    ),
    loadFrozenSubmission: vi.fn().mockResolvedValue(frozenSubmission()),
    markProviderAttemptStarted: vi.fn().mockResolvedValue(undefined),
    recordProviderResult: vi.fn().mockImplementation(async (_orgId, _id, _leaseToken, result) =>
      frozenSubmission({
        providerSubmissionId: result.providerSubmissionId,
        registrationResult: result.rawResult,
        providerOutcome: 'succeeded',
      }),
    ),
    markFailed: vi.fn().mockResolvedValue({ preparationId: PREPARATION_ID, status: 'failed' }),
    finalizeRegistered: vi.fn().mockImplementation(async (_orgId, _id, _leaseToken, finalize) => {
      const result = await finalize(TX);
      return { preparationId: PREPARATION_ID, status: 'registered' as const, listingId: result.listingId };
    }),
    ...overrides.repository,
  } as ProductPreparationRepositoryPort;
  const channel = {
    reconcile: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockImplementation(async (_input, beforeProviderCreate) => {
      await beforeProviderCreate();
      return {
        providerSubmissionId: 'provider-1',
        externalListingId: '427011919',
        channel: 'coupang',
        rawResult: { code: 'SUCCESS' },
      };
    }),
    resolveListing: vi.fn().mockResolvedValue({
      listingId: LISTING_ID,
      channelAccountId: ACCOUNT_ID,
      channel: 'coupang',
      externalId: '427011919',
      status: 'active',
    }),
    ...overrides.channel,
  } as ChannelProductRegistrationPort;
  const content = {
    resolveSourceSelections: vi.fn().mockImplementation(async (_tx, input) => ({
      selectedThumbnailUrl: input.selectedThumbnailUrl,
      selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
      selectedThumbnailGenerationCandidateId:
        input.selectedThumbnailGenerationCandidateId,
      selectedDetailPageArtifactId: input.selectedDetailPageArtifactId,
      selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
      selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
    })),
    ensureCandidateWorkspace: vi.fn().mockResolvedValue(WORKSPACE_ID),
    branchToListing: vi.fn().mockResolvedValue({ workspaceId: 'listing-workspace-1' }),
    ...overrides.content,
  } as RegistrationContentWorkspacePort;
  return {
    service: new ProductRegistrationService(repository, channel, content),
    repository,
    channel,
    content,
  };
}

describe('ProductRegistrationService', () => {
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

  it('marks a provider failure retriable without finalizing locally', async () => {
    const failure = new Error('provider unavailable');
    const { service, repository, channel, content } = setup({
      channel: { submit: vi.fn().mockRejectedValue(failure) },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    expect(repository.markFailed).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      preparationId: PREPARATION_ID,
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      error: 'provider unavailable',
    });
    expect(repository.finalizeRegistered).not.toHaveBeenCalled();
    expect(content.branchToListing).not.toHaveBeenCalled();
    expect(channel.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ submissionKey: 'submission-key-1', submissionPayloadHash: 'hash-1' }),
    );
  });

  it('resolves source-owned selections inside the claim transaction before provider IO', async () => {
    const { service, repository, channel, content } = setup();

    await service.submit(ORG_ID, PREPARATION_ID, USER_ID);

    expect(repository.claimForSubmission).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      USER_ID,
      expect.any(Function),
    );
    expect(content.resolveSourceSelections).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceWorkspaceId: WORKSPACE_ID,
      }),
    );
    expect(content.resolveSourceSelections.mock.invocationCallOrder[0])
      .toBeLessThan(channel.reconcile.mock.invocationCallOrder[0]);
  });

  it('reconciles an uncertain prior success and does not create a duplicate provider product', async () => {
    const reconciled = {
      providerSubmissionId: 'provider-1',
      externalListingId: '427011919',
      channel: 'coupang',
      rawResult: { code: 'RECONCILED' },
    };
    const finalizeRegistered = vi.fn()
      .mockRejectedValueOnce(new Error('local transaction failed'))
      .mockImplementationOnce(async (_orgId, _id, _leaseToken, finalize) => {
        const result = await finalize(TX);
        return { preparationId: PREPARATION_ID, status: 'registered', listingId: result.listingId };
      });
    const reconcile = vi.fn().mockResolvedValue(reconciled);
    const { service, channel, repository } = setup({
      repository: {
        claimForSubmission: vi.fn().mockResolvedValue(frozenSubmission({
          providerOutcome: 'uncertain',
          isRetry: true,
        })),
        finalizeRegistered,
      },
      channel: { reconcile },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'registered',
      listingId: LISTING_ID,
    });

    expect(channel.submit).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(repository.recordProviderResult).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      '33333333-3333-4333-8333-333333333333',
      reconciled,
    );
  });

  it('resolves the listing, branches content, and registers in one repository transaction', async () => {
    const { service, repository, channel, content } = setup();

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'registered',
      listingId: LISTING_ID,
    });

    expect(repository.finalizeRegistered).toHaveBeenCalledTimes(1);
    expect(channel.resolveListing).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceCandidateId: CANDIDATE_ID,
        channelAccountId: ACCOUNT_ID,
        externalListingId: '427011919',
      }),
    );
    expect(content.branchToListing).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceWorkspaceId: WORKSPACE_ID,
        listingId: LISTING_ID,
        createdByUserId: USER_ID,
      }),
    );
  });

  it('carries frozen KidItem-first product and option identities to the channel finalizer', async () => {
    const exactSubmission = frozenSubmission({
      submissionPayloadJson: {
        channelAccountId: ACCOUNT_ID,
        displayName: 'Kids rain boots',
        registrationInput: {
          ...DRAFT_INPUT.registrationInput,
          masterProductId: MASTER_PRODUCT_ID,
          optionLinks: [{
            externalOptionId: ' RAIN-BOOT-PINK ',
            productVariantId: PRODUCT_VARIANT_ID,
          }],
        },
      },
    });
    const { service, channel } = setup({
      repository: {
        claimForSubmission: vi.fn().mockResolvedValue(exactSubmission),
      },
    });

    await service.submit(ORG_ID, PREPARATION_ID, USER_ID);

    expect(channel.resolveListing).toHaveBeenCalledWith(TX, expect.objectContaining({
      masterProductId: MASTER_PRODUCT_ID,
      optionLinks: [{
        externalOptionId: 'RAIN-BOOT-PINK',
        productVariantId: PRODUCT_VARIANT_ID,
      }],
    }));
  });

  it('never blind-creates when an uncertain attempt cannot be reconciled', async () => {
    const { service, repository, channel } = setup({
      repository: {
        claimForSubmission: vi.fn().mockResolvedValue(frozenSubmission({
          providerOutcome: 'uncertain',
          isRetry: true,
        })),
      },
      channel: { reconcile: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    expect(channel.submit).not.toHaveBeenCalled();
    expect(repository.markProviderAttemptStarted).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      preparationId: PREPARATION_ID,
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      error: 'Provider outcome remains uncertain after reconciliation.',
    });
  });

  it('durably marks the attempt uncertain immediately before an allowed provider create', async () => {
    const providerCreateBoundary = vi.fn();
    const { service, repository, channel } = setup({
      repository: {
        claimForSubmission: vi.fn().mockResolvedValue(frozenSubmission({
          providerOutcome: 'definitive_failure',
          isRetry: true,
        })),
      },
      channel: {
        submit: vi.fn().mockImplementation(async (_input, beforeProviderCreate) => {
          await beforeProviderCreate();
          providerCreateBoundary();
          return {
            providerSubmissionId: 'provider-1',
            externalListingId: '427011919',
            channel: 'coupang',
            rawResult: { code: 'SUCCESS' },
          };
        }),
      },
    });

    await service.submit(ORG_ID, PREPARATION_ID, USER_ID);

    expect(repository.markProviderAttemptStarted).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      '33333333-3333-4333-8333-333333333333',
    );
    expect(channel.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOutcome: 'uncertain',
        providerCreateAllowed: true,
      }),
      expect.any(Function),
    );
    expect(repository.markProviderAttemptStarted.mock.invocationCallOrder[0])
      .toBeLessThan(providerCreateBoundary.mock.invocationCallOrder[0]);
  });

  it('does not mark an attempt uncertain when local channel validation rejects before provider create', async () => {
    const { service, repository } = setup({
      channel: {
        submit: vi.fn().mockRejectedValue(new Error('invalid frozen listing payload')),
      },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    expect(repository.markProviderAttemptStarted).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      preparationId: PREPARATION_ID,
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      error: 'invalid frozen listing payload',
    });
  });

  it('records a definitive provider rejection without leaving an uncertain identity', async () => {
    const rejection = new DefinitiveChannelProductRegistrationError('invalid category');
    const { service, repository } = setup({
      channel: { submit: vi.fn().mockRejectedValue(rejection) },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    expect(repository.markFailed).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      preparationId: PREPARATION_ID,
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      providerOutcome: 'definitive_failure',
      error: 'invalid category',
    });
  });

  it('retains succeeded provider identity when local finalization fails', async () => {
    const { service, repository } = setup({
      repository: {
        finalizeRegistered: vi.fn().mockRejectedValue(new Error('local transaction failed')),
      },
    });

    await expect(service.submit(ORG_ID, PREPARATION_ID, USER_ID)).resolves.toEqual({
      preparationId: PREPARATION_ID,
      status: 'failed',
    });
    expect(repository.markFailed).toHaveBeenLastCalledWith({
      organizationId: ORG_ID,
      preparationId: PREPARATION_ID,
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      error: 'local transaction failed',
    });
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
