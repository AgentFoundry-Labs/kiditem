import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../../apps/server/src/sourcing/domain/supplier-source-url-policy';
import { canonicalSourcingCandidateIdentity } from '../../apps/server/src/sourcing/domain/sourcing-candidate-identity';
import { freezeProductRegistrationPayload } from '../../apps/server/src/channels/domain/registration-submission-payload';

const { ensureFormula } = vi.hoisted(() => ({ ensureFormula: vi.fn() }));
vi.mock('../data-migrations/ensure/absolute-product-abc-formula', () => ({
  ensureAbsoluteProductAbcFormulaForOrganization: ensureFormula,
}));

const repoRoot = resolve(__dirname, '..', '..');
const seedPath = resolve(repoRoot, 'scripts', 'seed-agent-os-browser-qa.ts');

async function loadSeed(): Promise<Record<string, any> | undefined> {
  expect(existsSync(seedPath), 'the reusable browser-QA seed command must exist').toBe(true);
  if (!existsSync(seedPath)) return undefined;
  return import(/* @vite-ignore */ pathToFileURL(seedPath).href);
}

function isolatedTarget(seed: Record<string, any>) {
  const databaseName = `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`;
  return {
    databaseUrl: `postgresql://qa_agent_os@127.0.0.1:55432/${databaseName}`,
    seedTarget: JSON.stringify({
      databaseName,
      host: '127.0.0.1',
      mappedPort: 55432,
    }),
  };
}

function interactiveInput() {
  const input = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    pause: () => void;
    resume: () => void;
    setRawMode: ReturnType<typeof vi.fn>;
  };
  input.isTTY = true;
  input.pause = vi.fn();
  input.resume = vi.fn();
  input.setRawMode = vi.fn();
  return input;
}

describe('isolated Agent OS browser-QA seed', () => {
  it('accepts only the clean-cutover injected Testcontainer target', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const target = isolatedTarget(seed);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget(target)).not.toThrow();
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      seedTarget: undefined,
    })).toThrow(/isolated clean-cutover target/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      databaseUrl: 'postgresql://qa_agent_os@127.0.0.1:55432/kiditem',
      seedTarget: JSON.stringify({
        databaseName: 'kiditem',
        host: '127.0.0.1',
        mappedPort: 55432,
      }),
    })).toThrow(/default development database/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      databaseUrl: `postgresql://qa_agent_os@kiditem-office:55432/${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
      seedTarget: JSON.stringify({
        databaseName: `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
        host: 'kiditem-office',
        mappedPort: 55432,
      }),
    })).toThrow(/Office/i);
    expect(() => seed.assertIsolatedBrowserQaSeedTarget({
      ...target,
      seedTarget: JSON.stringify({
        databaseName: `${seed.GENERATED_DATABASE_MARKER}_a1b2c3d4e5f60708`,
        host: '127.0.0.1',
        mappedPort: 5432,
      }),
    })).toThrow(/port/i);
  });

  it('requires a known fixture profile and only its declared runtime variables', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    expect(seed.parseBrowserQaSeedArgs([
      '--profile',
      'runtime.general-chat.v1',
      '--email',
      ' Browser.QA@example.test ',
    ])).toEqual({
      email: 'browser.qa@example.test',
      reset: false,
      profile: 'runtime.general-chat.v1',
      variables: {},
    });
    expect(seed.parseBrowserQaSeedArgs([
      '--reset',
      '--profile=sourcing.candidate-ingest.v1',
      '--var',
      'supplierUrl=https://detail.1688.com/offer/900000000001.html',
      '--email=Browser.QA@example.test',
    ])).toEqual({
      email: 'browser.qa@example.test',
      reset: true,
      profile: 'sourcing.candidate-ingest.v1',
      variables: {
        supplierUrl: 'https://detail.1688.com/offer/900000000001.html',
      },
    });
    expect(() => seed.parseBrowserQaSeedArgs([], {})).toThrow(/email/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--email', 'browser.qa@example.test'])).toThrow(/profile/i);
    expect(() => seed.parseBrowserQaSeedArgs([
      '--profile',
      'not-a-fixture',
      '--email',
      'browser.qa@example.test',
    ])).toThrow(/unknown.*profile/i);
    expect(() => seed.parseBrowserQaSeedArgs([
      '--profile',
      'sourcing.candidate-ingest.v1',
      '--email',
      'browser.qa@example.test',
    ])).toThrow(/supplierUrl/i);
    expect(() => seed.parseBrowserQaSeedArgs([
      '--profile',
      'runtime.general-chat.v1',
      '--var',
      'supplierUrl=https://detail.1688.com/offer/900000000001.html',
      '--email',
      'browser.qa@example.test',
    ])).toThrow(/unknown.*variable/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--password'])).toThrow(/password.*stdin/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--reset', '--reset'])).toThrow(/only once/i);
    expect(() => seed.parseBrowserQaSeedArgs(['--unknown'])).toThrow(/unsupported/i);
  });

  it('requires an interactive stdin password and never writes the entered value', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const input = interactiveInput();
    const writes: string[] = [];
    const output = { write: (value: string) => writes.push(value) };
    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const read = seed.readBrowserQaPassword(input, output);
    input.emit('data', Buffer.from(`${enteredValue}\r`, 'utf8'));

    await expect(read).resolves.toBe(enteredValue);
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(writes.join('')).not.toContain(enteredValue);
    await expect(seed.readBrowserQaPassword({ isTTY: false }, output)).rejects.toThrow(/interactive stdin/i);
  });

  it('plans only the minimal rows required by each fixture profile', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const passwordHash = `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
    const now = new Date('2026-08-27T00:00:00.000Z');
    const general = seed.createBrowserQaSeedPlan({
      profile: 'runtime.general-chat.v1',
      email: 'browser.qa@example.test',
      passwordHash,
      now,
    });

    expect(general).toMatchObject({
      profile: 'runtime.general-chat.v1',
      organization: { isActive: true },
      user: {
        email: 'browser.qa@example.test',
        passwordHash,
        isActive: true,
      },
      membership: { role: 'owner', status: 'active' },
      variables: {},
    });
    expect(Object.keys(general).sort()).toEqual([
      'membership',
      'organization',
      'profile',
      'user',
      'variables',
    ]);

    const recommendation = seed.createBrowserQaSeedPlan({
      profile: 'sourcing.recommendation.v1',
      email: 'browser.qa@example.test',
      passwordHash,
      now,
    });
    expect(recommendation).toMatchObject({
      recommendationRun: { status: 'complete' },
      recommendationItem: { rank: 1 },
      evidenceIngestionRun: { status: 'complete' },
      evidenceObservation: { supportsCandidate: true },
      workspaceSnapshot: { scope: 'sourcing_agent_rag' },
    });

    const supply = seed.createBrowserQaSeedPlan({
      profile: 'supply.purchase-order-submit.v1',
      email: 'browser.qa@example.test',
      passwordHash,
      now,
      externalOrderId: 'qa-external-order-opaque',
    });
    expect(supply).toMatchObject({
      sellpiaInventorySku: { isActive: true },
      sellpiaInventoryState: {
        lastVerifiedAt: now,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
      },
      purchaseOrder: {
        status: 'draft',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: 'qa-external-order-opaque',
      },
    });
    expect(supply.purchaseOrder.externalOrderId).toBeTruthy();

    const channel = seed.createBrowserQaSeedPlan({
      profile: 'channels.confirmed-listing.v1',
      email: 'browser.qa@example.test',
      passwordHash,
      now,
    });
    expect(channel).toMatchObject({
      profile: 'channels.confirmed-listing.v1',
      sourcingCandidate: { sourcePlatform: 'ALIBABA_1688' },
      contentWorkspace: {
        ownerType: 'sourcing_candidate',
        status: 'active',
      },
      channelAccount: {
        channel: 'coupang',
        vendorId: 'browser-qa-vendor',
        status: 'active',
      },
      productPreparation: {
        status: 'submitting',
        providerOutcome: 'uncertain',
      },
      productRegistrationExecution: {
        status: 'executing',
        providerOutcome: 'uncertain',
        expectedProviderAccountId: 'browser-qa-vendor',
      },
      variables: {
        registrationExecutionRef:
          channel.productRegistrationExecution.id,
        preparationRef: channel.productPreparation.id,
        externalListingRef: expect.stringMatching(/^browser-qa-listing-/),
        wingVendorRef: 'browser-qa-vendor',
      },
    });
    const frozenChannelPayload = freezeProductRegistrationPayload(
      channel.productRegistrationExecution.submissionPayloadJson,
    );
    expect(frozenChannelPayload.payload).toMatchObject({
      channelAccountId: channel.channelAccount.id,
      displayName: channel.productPreparation.displayName,
      registrationInput: channel.productPreparation.registrationInput,
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    });
    expect(channel.productPreparation.submissionPayloadHash)
      .toBe(frozenChannelPayload.hash);
    expect(channel.productPreparation.reviewPayloadHash)
      .toBe(frozenChannelPayload.hash);
    expect(channel.productRegistrationExecution.requestHash)
      .toBe(frozenChannelPayload.hash);
    expect(channel.productRegistrationExecution.submissionPayloadHash)
      .toBe(frozenChannelPayload.hash);
  });

  it('generates stable per-plan synthetic supplier identities through the Sourcing allowlist', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const passwordHash = `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
    const candidatePlans = [
      seed.createBrowserQaSeedPlan({
        profile: 'sourcing.existing-candidate.v1',
        email: 'browser.qa@example.test',
        passwordHash,
      }),
      seed.createBrowserQaSeedPlan({
        profile: 'products.listing-generation.v1',
        email: 'browser.qa@example.test',
        passwordHash,
      }),
    ];

    for (const plan of candidatePlans) {
      const supplier = parseAllowedSupplierUrl(plan.sourcingCandidate.sourceUrl);
      const offerId = extractSupplierOfferId(supplier);

      expect(supplier.platform).toBe('1688');
      expect(plan.sourcingCandidate.sourceUrl).toBe(supplier.normalizedUrl);
      expect(plan.sourcingCandidate.sourcePlatform).toBe('ALIBABA_1688');
      expect(plan.sourcingCandidate.externalOfferId).toBe(offerId);
      expect(plan.sourcingCandidate.sourceIdentityHash).toBe(canonicalSourcingCandidateIdentity({
        sourcePlatform: 'ALIBABA_1688',
        sourceUrl: supplier.normalizedUrl,
        validatedExternalOfferId: offerId,
        variantKeyNormalized: plan.sourcingCandidate.variantKeyNormalized,
      }));
    }
    expect(candidatePlans[0].variables.supplierUrl).toBe(candidatePlans[0].sourcingCandidate.sourceUrl);

    const replay = seed.createBrowserQaSeedPlan({
      profile: 'sourcing.existing-candidate.v1',
      email: 'browser.qa@example.test',
      passwordHash,
    });
    expect(replay.sourcingCandidate.sourceUrl).not.toBe(candidatePlans[0].sourcingCandidate.sourceUrl);

    const recommendationPlans = [
      seed.createBrowserQaSeedPlan({
        profile: 'sourcing.recommendation.v1',
        email: 'browser.qa@example.test',
        passwordHash,
      }),
      seed.createBrowserQaSeedPlan({
        profile: 'runtime.two-turn-restart.v1',
        email: 'browser.qa@example.test',
        passwordHash,
      }),
    ];
    for (const plan of recommendationPlans) {
      const supplier = parseAllowedSupplierUrl(plan.evidenceObservation.sourceUrl);
      const offerId = extractSupplierOfferId(supplier);

      expect(plan.evidenceObservation.sourceUrl).toBe(supplier.normalizedUrl);
      expect(plan.evidenceObservation.sourceEntityKey).toBe(offerId);
      expect(plan.recommendationItem.externalOfferId).toBe(offerId);
    }
    expect(recommendationPlans[0].evidenceObservation.sourceUrl)
      .not.toBe(recommendationPlans[1].evidenceObservation.sourceUrl);
  });

  it('returns the runtime supplier URL written to the existing candidate fixture', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const candidateFindFirst = vi.fn().mockResolvedValue(null);
    const candidateCreate = vi.fn().mockResolvedValue({ id: 'candidate-id' });
    const transaction = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: 'organization-id' }) },
      user: { upsert: vi.fn().mockResolvedValue({ id: 'user-id' }) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      sourcingCandidate: { findFirst: candidateFindFirst, create: candidateCreate },
    };
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
    };

    const result = await seed.runBrowserQaSeed({
      prisma,
      profile: 'sourcing.existing-candidate.v1',
      email: 'browser.qa@example.test',
      password: 'interactive-only-password',
      hashPassword: async () => 'scrypt$16384$fixture$hash',
    });
    const createdCandidate = candidateCreate.mock.calls[0]?.[0]?.data;
    const supplier = parseAllowedSupplierUrl(createdCandidate.sourceUrl);

    expect(result).toMatchObject({
      sourcingCandidateId: 'candidate-id',
      variables: { supplierUrl: createdCandidate.sourceUrl },
    });
    expect(createdCandidate.externalOfferId).toBe(extractSupplierOfferId(supplier));
  });

  it('persists a coherent frozen confirmed-listing fixture and returns only safe prompt references', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const transaction = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: 'organization-id' }) },
      user: { upsert: vi.fn().mockResolvedValue({ id: 'user-id' }) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'candidate-id' }),
      },
      contentWorkspace: {
        create: vi.fn().mockResolvedValue({ id: 'workspace-id' }),
      },
      channelAccount: {
        upsert: vi.fn().mockResolvedValue({ id: 'channel-account-id' }),
      },
      productPreparation: {
        create: vi.fn().mockResolvedValue({ id: 'preparation-id' }),
      },
      productRegistrationExecution: {
        create: vi.fn().mockResolvedValue({ id: 'registration-execution-id' }),
      },
    };
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) =>
        action(transaction),
    };

    const result = await seed.runBrowserQaSeed({
      prisma,
      profile: 'channels.confirmed-listing.v1',
      email: 'browser.qa@example.test',
      password: 'interactive-only-password',
      hashPassword: async () => 'scrypt$16384$fixture$hash',
    });

    expect(transaction.contentWorkspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'organization-id',
        sourceCandidateId: 'candidate-id',
        createdByUserId: 'user-id',
      }),
      select: { id: true },
    });
    expect(transaction.productPreparation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'organization-id',
        sourceCandidateId: 'candidate-id',
        channelAccountId: 'channel-account-id',
        sourceContentWorkspaceId: 'workspace-id',
        approvedByUserId: 'user-id',
        createdByUserId: 'user-id',
        status: 'submitting',
        providerOutcome: 'uncertain',
      }),
      select: { id: true },
    });
    expect(transaction.productRegistrationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'organization-id',
        productPreparationId: 'preparation-id',
        channelAccountId: 'channel-account-id',
        requestedByUserId: 'user-id',
        status: 'executing',
        providerOutcome: 'uncertain',
        expectedProviderAccountId: 'browser-qa-vendor',
      }),
      select: { id: true },
    });
    const persistedPreparation = transaction.productPreparation.create.mock.calls[0][0].data;
    const persistedExecution =
      transaction.productRegistrationExecution.create.mock.calls[0][0].data;
    const frozenPersistedPayload = freezeProductRegistrationPayload(
      persistedExecution.submissionPayloadJson,
    );
    expect(frozenPersistedPayload.payload).toMatchObject({
      channelAccountId: 'channel-account-id',
      displayName: persistedPreparation.displayName,
      registrationInput: persistedPreparation.registrationInput,
    });
    expect(persistedPreparation.submissionPayloadHash)
      .toBe(frozenPersistedPayload.hash);
    expect(persistedPreparation.reviewPayloadHash)
      .toBe(frozenPersistedPayload.hash);
    expect(persistedExecution.requestHash).toBe(frozenPersistedPayload.hash);
    expect(persistedExecution.submissionPayloadHash)
      .toBe(frozenPersistedPayload.hash);
    expect(result).toMatchObject({
      sourcingCandidateId: 'candidate-id',
      contentWorkspaceId: 'workspace-id',
      channelAccountId: 'channel-account-id',
      productPreparationId: 'preparation-id',
      productRegistrationExecutionId: 'registration-execution-id',
      variables: {
        registrationExecutionRef: expect.any(String),
        preparationRef: expect.any(String),
        externalListingRef: expect.stringMatching(/^browser-qa-listing-/),
        wingVendorRef: 'browser-qa-vendor',
      },
    });
    expect(Object.keys(result.variables).sort()).toEqual([
      'externalListingRef',
      'preparationRef',
      'registrationExecutionRef',
      'wingVendorRef',
    ]);
  });

  it('seeds no business rows for the auth-only general-chat profile', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const hashPassword = vi.fn(async () => `scrypt$16384$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`);
    const organizationUpsert = vi.fn().mockResolvedValue({ id: 'organization-id' });
    const userUpsert = vi.fn().mockResolvedValue({ id: 'user-id' });
    const membershipUpsert = vi.fn().mockResolvedValue({ id: 'membership-id' });
    const candidateFindFirst = vi.fn();
    const candidateCreate = vi.fn();
    const sellpiaInventorySkuUpsert = vi.fn();
    const sellpiaInventoryStateUpsert = vi.fn();
    const purchaseOrderFindFirst = vi.fn();
    const purchaseOrderCreate = vi.fn();
    const purchaseOrderUpdate = vi.fn();
    const purchaseOrderUpsert = vi.fn();
    const purchaseOrderItemFindFirst = vi.fn();
    const purchaseOrderItemCreate = vi.fn();
    const recommendationRunUpsert = vi.fn();
    const workspaceSnapshotUpsert = vi.fn();
    const transaction = {
      organization: { upsert: organizationUpsert },
      user: { upsert: userUpsert },
      organizationMembership: { upsert: membershipUpsert },
      sourcingCandidate: { findFirst: candidateFindFirst, create: candidateCreate },
      sellpiaInventorySku: { upsert: sellpiaInventorySkuUpsert },
      sellpiaInventoryState: { upsert: sellpiaInventoryStateUpsert },
      purchaseOrder: {
        findFirst: purchaseOrderFindFirst,
        create: purchaseOrderCreate,
        update: purchaseOrderUpdate,
        upsert: purchaseOrderUpsert,
      },
      purchaseOrderItem: {
        findFirst: purchaseOrderItemFindFirst,
        create: purchaseOrderItemCreate,
      },
      sourcingEvidenceIngestionRun: { upsert: vi.fn() },
      sourcingEvidenceObservation: { upsert: vi.fn() },
      sourcingRecommendationRun: { upsert: recommendationRunUpsert },
      sourcingRecommendationItem: { upsert: vi.fn() },
      sourcingRecommendationItemEvidence: { upsert: vi.fn() },
      sourcingWorkspaceSnapshot: { upsert: workspaceSnapshotUpsert },
    };
    let inTransaction = false;
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await action(transaction);
        } finally {
          inTransaction = false;
        }
      },
    };
    const formulaCalls: boolean[] = [];
    ensureFormula.mockReset().mockImplementation(async () => {
      formulaCalls.push(inTransaction);
    });

    const result = await seed.runBrowserQaSeed({
      prisma,
      profile: 'runtime.general-chat.v1',
      email: 'browser.qa@example.test',
      password: enteredValue,
      hashPassword,
    });

    // The QA database gets no data migrations, so the seed installs the ABC formula itself.
    expect(ensureFormula).toHaveBeenCalledTimes(1);
    expect(ensureFormula).toHaveBeenCalledWith(transaction, 'organization-id');
    expect(formulaCalls).toEqual([true]);
    expect(membershipUpsert.mock.invocationCallOrder[0])
      .toBeLessThan(ensureFormula.mock.invocationCallOrder[0]!);
    expect(hashPassword).toHaveBeenCalledWith(enteredValue);
    expect(userUpsert.mock.calls[0]?.[0].create).toMatchObject({
      passwordHash: expect.stringMatching(/^scrypt\$16384\$/),
    });
    expect(result).toEqual({
      profile: 'runtime.general-chat.v1',
      variables: {},
      organizationId: 'organization-id',
      userId: 'user-id',
      membershipId: 'membership-id',
    });
    expect(candidateFindFirst).not.toHaveBeenCalled();
    expect(candidateCreate).not.toHaveBeenCalled();
    expect(sellpiaInventorySkuUpsert).not.toHaveBeenCalled();
    expect(sellpiaInventoryStateUpsert).not.toHaveBeenCalled();
    expect(purchaseOrderFindFirst).not.toHaveBeenCalled();
    expect(purchaseOrderCreate).not.toHaveBeenCalled();
    expect(purchaseOrderUpdate).not.toHaveBeenCalled();
    expect(purchaseOrderUpsert).not.toHaveBeenCalled();
    expect(JSON.stringify({
      result,
      userCalls: userUpsert.mock.calls,
    })).not.toContain(enteredValue);
    expect(membershipUpsert).toHaveBeenCalledTimes(1);
    expect(membershipUpsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        organizationId: 'organization-id',
        userId: 'user-id',
      },
    });
    expect(recommendationRunUpsert).not.toHaveBeenCalled();
    expect(workspaceSnapshotUpsert).not.toHaveBeenCalled();
  });

  it('seeds bounded recommendation workspace and evidence rows', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const transaction = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: 'organization-id' }) },
      user: { upsert: vi.fn().mockResolvedValue({ id: 'user-id' }) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      sourcingEvidenceIngestionRun: { upsert: vi.fn().mockResolvedValue({ id: 'evidence-run-id' }) },
      sourcingEvidenceObservation: { upsert: vi.fn().mockResolvedValue({ id: 'evidence-observation-id' }) },
      sourcingRecommendationRun: { upsert: vi.fn().mockResolvedValue({ id: 'recommendation-run-id' }) },
      sourcingRecommendationItem: { upsert: vi.fn().mockResolvedValue({ id: 'recommendation-item-id' }) },
      sourcingRecommendationItemEvidence: { upsert: vi.fn().mockResolvedValue({ id: 'recommendation-item-evidence-id' }) },
      sourcingWorkspaceSnapshot: { upsert: vi.fn().mockResolvedValue({ id: 'workspace-snapshot-id' }) },
    };
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
    };

    const result = await seed.runBrowserQaSeed({
      prisma,
      profile: 'sourcing.recommendation.v1',
      email: 'browser.qa@example.test',
      password: 'interactive-only-password',
      hashPassword: async () => 'scrypt$16384$fixture$hash',
    });

    expect(result).toMatchObject({
      profile: 'sourcing.recommendation.v1',
      variables: {},
      evidenceIngestionRunId: 'evidence-run-id',
      evidenceObservationId: 'evidence-observation-id',
      recommendationRunId: 'recommendation-run-id',
      recommendationItemId: 'recommendation-item-id',
      workspaceSnapshotId: 'workspace-snapshot-id',
    });
    expect(transaction.sourcingEvidenceIngestionRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_sourceKey_idempotencyKey: {
            organizationId: 'organization-id',
            sourceKey: 'browser_qa',
            idempotencyKey: 'browser-qa-recommendation-evidence',
          },
        },
        create: expect.objectContaining({
          organizationId: 'organization-id',
          status: 'complete',
        }),
      }),
    );
    expect(transaction.sourcingEvidenceObservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: 'organization-id',
          supportsCandidate: true,
        }),
      }),
    );
    expect(transaction.sourcingRecommendationItemEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recommendationItemId: 'recommendation-item-id',
          evidenceObservationId: 'evidence-observation-id',
        }),
      }),
    );
    expect(transaction.sourcingWorkspaceSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: 'organization-id',
          scope: 'sourcing_agent_rag',
        }),
      }),
    );
  });

  it('finds then creates or updates the providerless purchase-order fixture without a partial-index upsert', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const purchaseOrderFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'purchase-order-id' });
    const purchaseOrderCreate = vi.fn().mockResolvedValue({ id: 'purchase-order-id' });
    const purchaseOrderUpdate = vi.fn().mockResolvedValue({ id: 'purchase-order-id' });
    const purchaseOrderUpsert = vi.fn();
    const purchaseOrderItemFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'purchase-order-item-id' });
    const transaction = {
      organization: { upsert: vi.fn().mockResolvedValue({ id: 'organization-id' }) },
      user: { upsert: vi.fn().mockResolvedValue({ id: 'user-id' }) },
      organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-id' }) },
      sellpiaInventorySku: { upsert: vi.fn().mockResolvedValue({ id: 'inventory-sku-id' }) },
      sellpiaInventoryState: { upsert: vi.fn().mockResolvedValue({ organizationId: 'organization-id' }) },
      purchaseOrder: {
        findFirst: purchaseOrderFindFirst,
        create: purchaseOrderCreate,
        update: purchaseOrderUpdate,
        upsert: purchaseOrderUpsert,
      },
      purchaseOrderItem: {
        findFirst: purchaseOrderItemFindFirst,
        create: vi.fn().mockResolvedValue({ id: 'purchase-order-item-id' }),
      },
    };
    const prisma = {
      $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) => action(transaction),
    };

    const first = await seed.runBrowserQaSeed({
      prisma,
      profile: 'supply.purchase-order-submit.v1',
      email: 'browser.qa@example.test',
      password: 'interactive-only-password',
      hashPassword: async () => 'scrypt$16384$fixture$hash',
    });
    const replay = await seed.runBrowserQaSeed({
      prisma,
      profile: 'supply.purchase-order-submit.v1',
      email: 'browser.qa@example.test',
      password: 'interactive-only-password',
      hashPassword: async () => 'scrypt$16384$fixture$hash',
    });

    const firstExternalOrderId = purchaseOrderCreate.mock.calls[0]?.[0]?.data?.externalOrderId;
    expect(firstExternalOrderId).toMatch(/^browser-qa-/);
    expect(first).toMatchObject({
      purchaseOrderId: 'purchase-order-id',
      purchaseOrderItemId: 'purchase-order-item-id',
      variables: {
        purchaseOrderRef: 'purchase-order-id',
        externalOrderId: firstExternalOrderId,
      },
    });
    expect(replay).toMatchObject({ purchaseOrderId: 'purchase-order-id' });
    expect(purchaseOrderFindFirst).toHaveBeenCalledTimes(2);
    expect(purchaseOrderCreate).toHaveBeenCalledTimes(1);
    expect(purchaseOrderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id_organizationId: {
          id: 'purchase-order-id',
          organizationId: 'organization-id',
        },
      },
      data: expect.objectContaining({
        status: 'draft',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: expect.stringMatching(/^browser-qa-/),
      }),
    }));
    expect(purchaseOrderUpsert).not.toHaveBeenCalled();
  });

  it('guards reset to the validated Testcontainer target before executing a destructive statement', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const executeRaw = vi.fn().mockResolvedValue(0);
    const target = seed.assertIsolatedBrowserQaSeedTarget(isolatedTarget(seed));

    await expect(seed.resetBrowserQaDatabase({
      prisma: { $executeRaw: executeRaw },
      target,
    })).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalledOnce();

    await expect(seed.resetBrowserQaDatabase({
      prisma: { $executeRaw: executeRaw },
      target: {
        ...target,
        databaseUrl: 'postgresql://qa_agent_os@127.0.0.1:55432/kiditem',
        databaseName: 'kiditem',
      },
    })).rejects.toThrow(/default development database/i);
    expect(executeRaw).toHaveBeenCalledOnce();
  });

  it('runs guarded reset before reseeding and reports only safe fixture IDs', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const target = isolatedTarget(seed);
    const input = interactiveInput();
    const promptWrites: string[] = [];
    const resultWrites: string[] = [];
    const enteredValue = Buffer.alloc(18, 120).toString('utf8');
    const events: string[] = [];
    const prisma = {
      $disconnect: vi.fn(async () => {
        events.push('disconnect');
      }),
    };
    const seeded = {
      profile: 'supply.purchase-order-submit.v1',
      variables: {
        purchaseOrderRef: 'purchase-order-id',
        externalOrderId: 'browser-qa-opaque-external-order-id',
      },
      organizationId: 'organization-id',
      userId: 'user-id',
      membershipId: 'membership-id',
      sellpiaInventorySkuId: 'inventory-sku-id',
      purchaseOrderId: 'purchase-order-id',
      purchaseOrderItemId: 'purchase-order-item-id',
    };
    const createPrisma = vi.fn(() => prisma);
    const resetDatabase = vi.fn(async () => {
      events.push('reset');
    });
    const runSeed = vi.fn(async () => {
      events.push('seed');
      return seeded;
    });

    const seededResult = seed.main({
      argv: [
        '--reset',
        '--profile',
        'supply.purchase-order-submit.v1',
        '--email',
        'browser.qa@example.test',
      ],
      environment: {
        DATABASE_URL: target.databaseUrl,
        [seed.BROWSER_QA_SEED_TARGET_ENV]: target.seedTarget,
      },
      input,
      output: { write: (value: string) => promptWrites.push(value) },
      resultOutput: { write: (value: string) => resultWrites.push(value) },
      createPrisma,
      resetDatabase,
      runSeed,
    });
    input.emit('data', Buffer.from(`${enteredValue}\r`, 'utf8'));

    await expect(seededResult).resolves.toEqual(seeded);
    expect(createPrisma).toHaveBeenCalledWith(target.databaseUrl);
    expect(resetDatabase).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      target: expect.objectContaining({
        databaseName: expect.stringContaining(seed.GENERATED_DATABASE_MARKER),
      }),
    }));
    expect(runSeed).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      email: 'browser.qa@example.test',
      password: enteredValue,
      profile: 'supply.purchase-order-submit.v1',
      variables: {},
    }));
    expect(events).toEqual(['reset', 'seed', 'disconnect']);
    expect(resultWrites.join('')).toContain('"purchaseOrderId":"purchase-order-id"');
    expect(JSON.stringify({ promptWrites, resultWrites, seeded })).not.toContain(enteredValue);
  });

  it('has no password environment input and uses the auth-domain hash implementation', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const source = readFileSync(seedPath, 'utf8');
    expect(source).toContain('hashAuthPassword');
    expect(source).not.toContain('KIDITEM_BROWSER_QA_PASSWORD');
    expect(source).not.toContain('process.env.PASSWORD');
  });

  it('fails a standalone invocation before prompting or connecting when clean-cutover context is absent', async () => {
    const seed = await loadSeed();
    if (!seed) return;

    const input = interactiveInput();
    const output = { write: vi.fn() };
    const target = isolatedTarget(seed);

    await expect(seed.main({
      argv: ['--email', 'browser.qa@example.test'],
      environment: { DATABASE_URL: target.databaseUrl },
      input,
      output,
    })).rejects.toThrow(/isolated clean-cutover target context/i);
    expect(input.setRawMode).not.toHaveBeenCalled();
    expect(output.write).not.toHaveBeenCalled();
  });
});
