import { NotImplementedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  ProductPreparationRepositoryPort,
  FrozenProductPreparationSubmission,
} from '../port/out/repository/product-preparation.repository.port';
import type { ChannelProductRegistrationPort } from '../port/out/cross-domain/channel-product-registration.port';
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
const SELLPIA_INVENTORY_SKU_ID = '00000000-0000-4000-8000-000000000011';
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
    executionId: 'execution-1',
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
    getExternalExecution: vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
      status: 'executing', providerOutcome: 'uncertain',
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      expectedProviderAccountId: 'A00012345', listingId: null,
    }),
    startExternalExecution: vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
      status: 'executing', providerOutcome: 'uncertain',
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      expectedProviderAccountId: 'A00012345', listingId: null,
    }),
    markExternalExecutionUnresolved: vi.fn(),
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
    preflightExternalRegistration: vi.fn().mockResolvedValue({
      sellpiaMatch: {
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: null,
    }),
    assertExternalRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang', vendorId: 'A00012345' }),
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
  it('prepares and starts an external WING execution before returning a browser payload', async () => {
    const prepareExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
      preparationId: PREPARATION_ID,
      requestHash: 'hash-1',
      status: 'prepared',
      expectedProviderAccountId: 'A00012345',
    });
    const startExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
      preparationId: PREPARATION_ID,
      status: 'executing',
      providerOutcome: 'uncertain',
    });
    const { service, repository } = setup({
      repository: { prepareExternalExecution, startExternalExecution } as never,
      channel: { assertExternalRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang', vendorId: 'A00012345' }) },
    });

    await expect(service.prepareExternalWingRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      channelAccountId: ACCOUNT_ID,
      displayName: '꿀사과슬랑이',
      registrationInput: {
        wingProduct: {
          productName: '꿀사과슬랑이 1p',
          sellerProductName: '꿀사과슬랑이',
          variants: [{ stock: 999 }],
        },
      },
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    })).resolves.toEqual(expect.objectContaining({
      executionId: 'execution-1',
      expectedVendorId: 'A00012345',
    }));
    await service.startExternalWingRegistration(ORG_ID, CANDIDATE_ID, USER_ID, 'execution-1');

    expect(prepareExternalExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceCandidateId: CANDIDATE_ID,
        providerAbsenceVerified: false,
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(startExternalExecution).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      sourceCandidateId: CANDIDATE_ID,
      requestedByUserId: USER_ID,
      executionId: 'execution-1',
    }));
    expect(repository.createOrGetActiveDraft).not.toHaveBeenCalled();
  });

  it('freezes the verified Sellpia match and its real code into the WING vendor item code', async () => {
    const prepareExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1',
      preparationId: PREPARATION_ID,
      requestHash: 'hash-1',
      status: 'prepared',
      expectedProviderAccountId: 'A00012345',
    });
    const preflightExternalRegistration = vi.fn().mockResolvedValue({
      sellpiaMatch: {
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: {
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      },
    });
    const { service } = setup({
      repository: { prepareExternalExecution } as never,
      channel: { preflightExternalRegistration },
    });

    await expect(service.prepareExternalWingRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      channelAccountId: ACCOUNT_ID,
      displayName: '꿀사과슬랑이',
      registrationInput: {
        wingProduct: {
          productName: '꿀사과슬랑이 1p',
          sellerProductName: '꿀사과슬랑이',
          variants: [{ stock: 999, vendorItemCode: 'client-controlled-value' }],
        },
      },
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    })).resolves.toMatchObject({
      sellpiaMatch: { code: '10451-1' },
      existingListing: { externalListingId: '427011919' },
    });

    expect(preflightExternalRegistration).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      channelAccountId: ACCOUNT_ID,
      sourceCandidateId: CANDIDATE_ID,
      listingName: '꿀사과슬랑이',
      itemName: '꿀사과슬랑이 1p',
    });
    expect(prepareExternalExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAbsenceVerified: false,
        registrationInput: expect.objectContaining({
          sellpiaMatch: expect.objectContaining({ code: '10451-1' }),
          existingChannelListing: {
            externalListingId: '427011919',
            displayName: '꿀사과슬랑이',
            status: 'APPROVED',
          },
          wingProduct: expect.objectContaining({
            variants: [expect.objectContaining({ vendorItemCode: '10451-1' })],
          }),
        }),
      }),
      expect.any(Function),
      expect.any(Function),
    );
    const frozenInput = prepareExternalExecution.mock.calls[0]?.[0]
      .registrationInput as Record<string, unknown>;
    expect(frozenInput.sellpiaMatch).toEqual({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
      code: '10451-1',
      name: '3500꿀사과슬랑이',
      optionName: null,
      quantity: 1,
    });
  });

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

  it('returns an HTTP 501-style unsupported error before claiming or mutating a preparation', () => {
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
    expect(repository.claimForSubmission).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(content.branchToListing).not.toHaveBeenCalled();
  });

  it('accepts matching WING extension evidence without calling the Coupang Open API', async () => {
    const assertExternalRegistrationAccount = vi.fn().mockResolvedValue({ channel: 'coupang', vendorId: 'A00012345' });
    const { service, repository } = setup({
      channel: { assertExternalRegistrationAccount },
    });

    await service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(assertExternalRegistrationAccount).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      channelAccountId: ACCOUNT_ID,
    });
    expect(repository.recordProviderResult).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        channel: 'coupang',
        rawResult: expect.objectContaining({
          source: 'coupang-wing-extension',
          evidence: {
            wingVendorId: 'A00012345',
            wingIdentitySource: 'dom:data-vendor-id',
          },
        }),
      }),
    );
  });

  it('starts a prepared manual execution only when the user supplies the WING product id', async () => {
    const getExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
      status: 'prepared', providerOutcome: 'not_attempted', submissionLeaseToken: null,
      expectedProviderAccountId: 'A00012345', listingId: null,
    });
    const startExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
      status: 'executing', providerOutcome: 'uncertain',
      submissionLeaseToken: '33333333-3333-4333-8333-333333333333',
      expectedProviderAccountId: 'A00012345', listingId: null,
    });
    const { service, repository } = setup({
      repository: { getExternalExecution, startExternalExecution } as never,
    });

    await service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(repository.startExternalExecution).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      sourceCandidateId: CANDIDATE_ID,
      executionId: 'execution-1',
      requestedByUserId: USER_ID,
    });
  });

  it('rejects completion when WING extension evidence belongs to another vendor', async () => {
    const { service, repository } = setup();
    await expect(service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'B00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).rejects.toThrow('does not match the prepared registration');
    expect(repository.recordProviderResult).not.toHaveBeenCalled();
  });

  it('rejects completion without deterministic WING extension evidence', async () => {
    const { service, repository } = setup();
    await expect(service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
    })).rejects.toThrow('WING extension evidence is required');
    expect(repository.recordProviderResult).not.toHaveBeenCalled();
  });

  it('completes a server-frozen synced listing match without browser evidence', async () => {
    const loadFrozenSubmission = vi.fn().mockResolvedValue(frozenSubmission({
      submissionPayloadJson: {
        channelAccountId: ACCOUNT_ID,
        displayName: 'Kids rain boots',
        registrationInput: {
          existingChannelListing: {
            externalListingId: '427011919',
            displayName: 'Kids rain boots',
            status: 'APPROVED',
          },
        },
      },
    }));
    const { service, repository } = setup({
      repository: { loadFrozenSubmission } as never,
    });

    await expect(service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
    })).resolves.toMatchObject({ status: 'registered' });
    expect(repository.recordProviderResult).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        rawResult: expect.objectContaining({ source: 'synced-channel-listing' }),
      }),
    );
  });

  it('rejects completion when the persisted WING vendor changed after preparation', async () => {
    const { service, repository } = setup({
      channel: {
        assertExternalRegistrationAccount: vi.fn().mockResolvedValue({ channel: 'coupang', vendorId: 'B00012345' }),
      },
    });

    await expect(service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).rejects.toThrow('identity changed');

    expect(repository.recordProviderResult).not.toHaveBeenCalled();
  });

  it('replays a completed external execution without recording or finalizing again', async () => {
    const getExternalExecution = vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
      status: 'succeeded', providerOutcome: 'succeeded', submissionLeaseToken: null,
      expectedProviderAccountId: 'A00012345', listingId: LISTING_ID,
    });
    const { service, repository } = setup({ repository: { getExternalExecution } as never });
    await expect(service.confirmExternalRegistration(ORG_ID, CANDIDATE_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).resolves.toEqual({ preparationId: PREPARATION_ID, status: 'registered', listingId: LISTING_ID });
    expect(repository.recordProviderResult).not.toHaveBeenCalled();
    expect(repository.finalizeRegistered).not.toHaveBeenCalled();
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
