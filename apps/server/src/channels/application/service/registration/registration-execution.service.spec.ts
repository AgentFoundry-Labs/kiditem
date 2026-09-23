import { describe, expect, it, vi } from 'vitest';
import type {
  FrozenRegistrationSubmission,
  RegistrationExecutionRepositoryPort,
} from '../../port/out/repository/registration-execution.repository.port';
import type { ChannelRegistrationPort } from '../../port/in/registration/channel-registration.port';
import type { RegistrationDraftPort } from '../../port/out/persistence/registration-draft.port';
import { RegistrationExecutionService } from './registration-execution.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CANDIDATE_ID = 'candidate-1';
const SALES_PRODUCT_ID = 'draft-1';
const PREPARATION_ID = 'preparation-1';
const WORKSPACE_ID = 'workspace-1';
const ACCOUNT_ID = 'account-1';
const LISTING_ID = 'listing-1';
const LEASE = '33333333-3333-4333-8333-333333333333';
const TX = { opaque: true } as never;

const REGISTRATION_INPUT = { listingPayload: { sellerProductName: 'Kids rain boots' } };

function frozenSubmission(
  overrides: Partial<FrozenRegistrationSubmission> = {},
): FrozenRegistrationSubmission {
  return {
    executionId: 'execution-1',
    preparationId: PREPARATION_ID,
    salesProductId: SALES_PRODUCT_ID,
    sourceRecordId: CANDIDATE_ID,
    channelAccountId: ACCOUNT_ID,
    sourceContentWorkspaceId: WORKSPACE_ID,
    displayName: 'Kids rain boots',
    status: 'submitting',
    submissionKey: 'submission-key-1',
    submissionPayloadJson: {
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: REGISTRATION_INPUT,
    },
    submissionPayloadHash: 'hash-1',
    providerSubmissionId: null,
    registrationResult: null,
    providerOutcome: 'not_attempted',
    submissionLeaseToken: LEASE,
    isRetry: false,
    ...overrides,
  };
}

function liveExecution(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'execution-1', preparationId: PREPARATION_ID, requestHash: 'hash-1',
    status: 'executing', providerOutcome: 'uncertain', submissionLeaseToken: LEASE,
    expectedProviderAccountId: 'A00012345', listingId: null,
    ...overrides,
  };
}

function setup(overrides: {
  executions?: Partial<RegistrationExecutionRepositoryPort>;
  registration?: Partial<ChannelRegistrationPort>;
  drafts?: Partial<RegistrationDraftPort>;
} = {}) {
  const executions = {
    prepare: vi.fn().mockResolvedValue(liveExecution({
      status: 'prepared', providerOutcome: 'not_attempted', submissionLeaseToken: null,
    })),
    start: vi.fn().mockResolvedValue(liveExecution()),
    get: vi.fn().mockResolvedValue(liveExecution()),
    markUnresolved: vi.fn().mockResolvedValue(liveExecution({ status: 'reconciling' })),
    markNotSubmitted: vi.fn().mockResolvedValue({
      executionId: 'execution-1', preparationId: PREPARATION_ID,
      status: 'failed', providerOutcome: 'definitive_failure',
    }),
    loadFrozenSubmission: vi.fn().mockResolvedValue(frozenSubmission()),
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
    ...overrides.executions,
  } as RegistrationExecutionRepositoryPort;
  const registration = {
    preflightExternalProductRegistration: vi.fn().mockResolvedValue({
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
    assertExternalProductRegistrationAccount: vi.fn()
      .mockResolvedValue({ channel: 'coupang', vendorId: 'A00012345' }),
    resolveProductRegistration: vi.fn().mockResolvedValue({
      listingId: LISTING_ID,
      channelAccountId: ACCOUNT_ID,
      channel: 'coupang',
      externalId: '427011919',
      status: 'active',
    }),
    ...overrides.registration,
  } as ChannelRegistrationPort;
  const drafts = {
    branchContentToListing: vi.fn().mockResolvedValue({ workspaceId: 'listing-workspace-1' }),
    ...overrides.drafts,
  } as RegistrationDraftPort;
  return {
    service: new RegistrationExecutionService(executions, registration, drafts, {
      list: vi.fn(), findForSourceRecord: vi.fn(), ensureSalesProductCodes: vi.fn(),
      get: vi.fn(), create: vi.fn(), update: vi.fn(),
      replaceOptions: vi.fn(), createDraft: vi.fn(), deleteDraft: vi.fn(), mallCategories: vi.fn(),
    }, {
      resolve: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(),
      archive: vi.fn(),
    }, {
      preview: vi.fn(), prepare: vi.fn(), assertEligible: vi.fn(),
    }, { read: vi.fn(), readMany: vi.fn(), importFromSource: vi.fn() }),
    executions,
    registration,
    drafts,
  };
}

describe('RegistrationExecutionService', () => {
  it('prepares and starts a WING execution before returning a browser payload', async () => {
    const { service, executions } = setup();

    await expect(service.prepareWingRegistration(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      channelAccountId: ACCOUNT_ID,
      displayName: '꿀사과슬랑이',
      registrationInput: {
        wingProduct: {
          productName: '꿀사과슬랑이 1p',
          sellerProductName: '꿀사과슬랑이',
          variants: [{ stock: 999 }],
        },
      },
      idempotencyKey: LEASE,
    })).resolves.toEqual(expect.objectContaining({
      executionId: 'execution-1',
      expectedVendorId: 'A00012345',
    }));
    await service.startExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, 'execution-1');

    expect(executions.prepare).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      salesProductId: SALES_PRODUCT_ID,
      providerAbsenceVerified: false,
    }));
    expect(executions.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: USER_ID,
      executionId: 'execution-1',
    }));
  });

  it('keys the fence by the sales product so a directly authored product can register', async () => {
    const { service, executions, drafts } = setup({
      executions: {
        loadFrozenSubmission: vi.fn().mockResolvedValue(
          frozenSubmission({ sourceRecordId: null, sourceContentWorkspaceId: null }),
        ),
        recordProviderResult: vi.fn().mockResolvedValue(
          frozenSubmission({ sourceRecordId: null, providerOutcome: 'succeeded' }),
        ),
      },
    });

    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).resolves.toMatchObject({ status: 'registered', listingId: LISTING_ID });

    expect(executions.get).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      salesProductId: SALES_PRODUCT_ID,
    }));
    // 원천 기록이 없는 초안에는 분기할 작업공간도 없다.
    expect(drafts.branchContentToListing).not.toHaveBeenCalled();
  });

  it('returns the server-frozen bundle code and ignores a client-assigned code', async () => {
    const { service, executions } = setup({
      executions: { prepare: vi.fn().mockResolvedValue(liveExecution({
        status: 'prepared', kidItemCode: 'KID00000999',
      })) },
    });
    const result = await service.prepareWingRegistration(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      channelAccountId: ACCOUNT_ID,
      displayName: 'Bundle',
      registrationInput: {
        kidItemCode: 'KID99999999',
        wingProduct: { sellerProductName: 'Bundle', productName: 'Bundle', variants: [{ stock: 999, vendorItemCode: 'client-code' }] },
      },
      idempotencyKey: LEASE,
    });
    expect(result.sellpiaMatch.code).toBe('KID00000999');
    const request = vi.mocked(executions.prepare).mock.calls[0]![0];
    expect(request.registrationInput).not.toHaveProperty('kidItemCode');
    expect(request.registrationInput).toMatchObject({
      sellpiaMatch: { code: '10451-1' },
      wingProduct: { variants: [{ vendorItemCode: '10451-1' }] },
    });
  });

  it('freezes the verified Sellpia match and its real code into the WING vendor item code', async () => {
    const preflightExternalProductRegistration = vi.fn().mockResolvedValue({
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
    const { service, executions } = setup({
      registration: { preflightExternalProductRegistration },
    });

    await expect(service.prepareWingRegistration(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      channelAccountId: ACCOUNT_ID,
      displayName: '꿀사과슬랑이',
      registrationInput: {
        wingProduct: {
          productName: '꿀사과슬랑이 1p',
          sellerProductName: '꿀사과슬랑이',
          variants: [{ stock: 999, vendorItemCode: 'client-controlled-value' }],
        },
      },
      idempotencyKey: LEASE,
    })).resolves.toMatchObject({
      sellpiaMatch: { code: '10451-1' },
      existingListing: { externalListingId: '427011919' },
    });

    expect(preflightExternalProductRegistration).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      channelAccountId: ACCOUNT_ID,
      channelListingOptionId: SALES_PRODUCT_ID,
      listingName: '꿀사과슬랑이',
      itemName: '꿀사과슬랑이 1p',
    });
    expect(executions.prepare).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
    const frozenInput = vi.mocked(executions.prepare).mock.calls[0]?.[0]
      .registrationInput as Record<string, unknown>;
    expect(frozenInput.sellpiaMatch).toEqual({
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
      code: '10451-1',
      name: '3500꿀사과슬랑이',
      optionName: null,
      quantity: 1,
    });
  });

  it('accepts matching WING extension evidence without calling the Coupang Open API', async () => {
    const assertExternalProductRegistrationAccount = vi.fn()
      .mockResolvedValue({ channel: 'coupang', vendorId: 'A00012345' });
    const { service, executions } = setup({
      registration: { assertExternalProductRegistrationAccount },
    });

    await service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(assertExternalProductRegistrationAccount).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      channelAccountId: ACCOUNT_ID,
    });
    expect(executions.recordProviderResult).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      LEASE,
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
      'execution-1',
    );
  });

  it('branches the sourcing content workspace to the resolved listing inside the finalize transaction', async () => {
    const { service, drafts, registration } = setup({ executions: {
      loadFrozenSubmission: vi.fn().mockResolvedValue(frozenSubmission({
        submissionPayloadJson: { registrationInput: {
          kidItemCode: 'KID00000999',
          sellpiaMatch: { sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051', quantity: 2 },
        } },
      })),
    } });

    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).resolves.toMatchObject({ status: 'registered', listingId: LISTING_ID });

    expect(registration.resolveProductRegistration).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: ORG_ID,
        salesProductId: SALES_PRODUCT_ID,
        channelAccountId: ACCOUNT_ID,
        externalListingId: '427011919',
        preparedRecipe: { kidItemCode: 'KID00000999', masterProductId: '00000000-0000-4000-8000-000000000051', quantity: 2 },
      }),
    );
    expect(drafts.branchContentToListing).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceWorkspaceId: WORKSPACE_ID,
        listingId: LISTING_ID,
      }),
    );
  });

  it('starts a prepared manual execution only when the user supplies the WING product id', async () => {
    const get = vi.fn().mockResolvedValue(liveExecution({
      status: 'prepared', providerOutcome: 'not_attempted', submissionLeaseToken: null,
    }));
    const { service, executions } = setup({ executions: { get } as never });

    await service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1',
      externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    });

    expect(executions.start).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: 'execution-1',
      requestedByUserId: USER_ID,
    });
  });

  it('rejects completion when WING extension evidence belongs to another vendor', async () => {
    const { service, executions } = setup();
    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'B00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).rejects.toThrow('does not match the prepared registration');
    expect(executions.recordProviderResult).not.toHaveBeenCalled();
  });

  it('rejects completion without deterministic WING extension evidence', async () => {
    const { service, executions } = setup();
    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
    })).rejects.toThrow('WING extension evidence is required');
    expect(executions.recordProviderResult).not.toHaveBeenCalled();
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
    const { service, executions } = setup({
      executions: { loadFrozenSubmission } as never,
    });

    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
    })).resolves.toMatchObject({ status: 'registered' });
    expect(executions.recordProviderResult).toHaveBeenCalledWith(
      ORG_ID,
      PREPARATION_ID,
      LEASE,
      expect.objectContaining({
        rawResult: expect.objectContaining({ source: 'synced-channel-listing' }),
      }),
      'execution-1',
    );
  });

  it('rejects completion when the persisted WING vendor changed after preparation', async () => {
    const { service, executions } = setup({
      registration: {
        assertExternalProductRegistrationAccount: vi.fn()
          .mockResolvedValue({ channel: 'coupang', vendorId: 'B00012345' }),
      },
    });

    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).rejects.toThrow('identity changed');

    expect(executions.recordProviderResult).not.toHaveBeenCalled();
  });

  it('replays a completed execution without recording or finalizing again', async () => {
    const get = vi.fn().mockResolvedValue(liveExecution({
      status: 'succeeded', providerOutcome: 'succeeded',
      submissionLeaseToken: null, listingId: LISTING_ID,
    }));
    const { service, executions } = setup({ executions: { get } as never });
    await expect(service.confirmExecution(ORG_ID, SALES_PRODUCT_ID, USER_ID, {
      executionId: 'execution-1', externalListingId: '427011919',
      evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
    })).resolves.toEqual({ preparationId: PREPARATION_ID, status: 'registered', listingId: LISTING_ID });
    expect(executions.recordProviderResult).not.toHaveBeenCalled();
    expect(executions.finalizeRegistered).not.toHaveBeenCalled();
  });

  it('closes a fill failure as not-submitted so the same draft can be sent again', async () => {
    const { service, executions } = setup();

    await expect(service.markExecutionNotSubmitted(
      ORG_ID, SALES_PRODUCT_ID, USER_ID, 'execution-1', { reason: 'extension_error' },
    )).resolves.toMatchObject({ status: 'failed', providerOutcome: 'definitive_failure' });
    expect(executions.markNotSubmitted).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: 'execution-1',
      requestedByUserId: USER_ID,
      evidence: { reason: 'extension_error' },
    });
  });
});
