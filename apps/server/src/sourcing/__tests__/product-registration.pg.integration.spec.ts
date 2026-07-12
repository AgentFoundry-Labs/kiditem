import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductPreparationRepositoryAdapter } from '../adapter/out/repository/product-preparation.repository.adapter';
import type { SourcingRepositoryTransaction } from '../application/port/out/transaction/repository-transaction';
import { PRODUCT_PREPARATION_SUBMISSION_LEASE_MS } from '../domain/product-preparation-state';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ProductPreparationRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ProductPreparationRepositoryAdapter;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ProductPreparationRepositoryAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [ACCOUNT_ID, SECOND_ACCOUNT_ID].map((id, index) => ({
        id,
        organizationId: TEST_ORGANIZATION_ID,
        channel: index === 0 ? 'coupang' : 'rocket',
        externalAccountId: `account-${index}`,
        name: `Account ${index}`,
        status: 'active',
      })),
    });
    candidateId = (await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
        status: 'sourced',
      },
    })).id;
  });

  it('returns one draft under concurrent same-account creation', async () => {
    const input = createInput(ACCOUNT_ID);
    const [left, right] = await Promise.all([
      repository.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections),
      repository.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections),
    ]);

    expect(left.preparationId).toBe(right.preparationId);
    expect(await prisma.productPreparation.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId },
    })).toBe(1);
  });

  it('translates the retained 0.1.8 candidate-wide unique into a deterministic second-account conflict', async () => {
    await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    await expect(
      repository.createOrGetActiveDraft(
        createInput(SECOND_ACCOUNT_ID),
        ensureWorkspace,
        resolveSelections,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adopts the retained accountless draft instead of conflicting with legacy selection writes', async () => {
    const legacy = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        displayName: 'Legacy selection',
        status: 'draft',
        registrationInput: { salePrice: 19900 },
        selectedThumbnailUrl: 'https://cdn.example.com/legacy.png',
      },
    });

    const result = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    expect(result.preparationId).toBe(legacy.id);
    expect(await prisma.productPreparation.findFirst({
      where: { id: legacy.id, organizationId: TEST_ORGANIZATION_ID },
      select: { channelAccountId: true, sourceContentWorkspaceId: true },
    })).toMatchObject({
      channelAccountId: ACCOUNT_ID,
      sourceContentWorkspaceId: expect.any(String),
    });
  });

  it('freezes one canonical hash/key across retries and creates a new key after a failed edit', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    expect(first.status).toBe('submitting');
    if (first.status === 'registered') throw new Error('unexpected registered state');

    await repository.markFailed({
      organizationId: TEST_ORGANIZATION_ID,
      preparationId: draft.preparationId,
      submissionLeaseToken: first.submissionLeaseToken!,
      error: 'provider unavailable',
      providerOutcome: 'definitive_failure',
    });
    const retry = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (retry.status === 'registered') throw new Error('unexpected registered state');
    expect(retry.submissionKey).toBe(first.submissionKey);
    expect(retry.submissionPayloadHash).toBe(first.submissionPayloadHash);

    await repository.markFailed({
      organizationId: TEST_ORGANIZATION_ID,
      preparationId: draft.preparationId,
      submissionLeaseToken: retry.submissionLeaseToken!,
      error: 'edit requested',
      providerOutcome: 'definitive_failure',
    });
    const replacement = await repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { registrationInput: { salePrice: 22900 } } },
      },
      resolveSelections,
    );
    expect(replacement.status).toBe('draft');
    expect(replacement.preparationId).not.toBe(draft.preparationId);
    const edited = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      replacement.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (edited.status === 'registered') throw new Error('unexpected registered state');
    expect(edited.submissionKey).not.toBe(first.submissionKey);
    expect(edited.submissionPayloadHash).not.toBe(first.submissionPayloadHash);
  });

  it('projects finalization inputs from frozen JSON instead of mutable compatibility columns', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: {
        displayName: 'MUTATED AFTER FREEZE',
        selectedThumbnailUrl: 'https://attacker.invalid/mutated.png',
      },
    });

    const loaded = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
    );
    expect(loaded.displayName).toBe('Kids rain boots');
    expect(loaded.selectedThumbnailUrl).toBeNull();
  });

  it('rejects a second claim while an unrecorded provider submission is in flight', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    )).rejects.toThrow('already in progress');
  });

  it('rejects editing a submitting preparation before resolving mutable draft selections', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    const unexpectedResolver = vi.fn().mockRejectedValue(
      new Error('resolver must not run for a non-editable state'),
    );

    await expect(repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { displayName: 'Unsafe replacement' } },
      },
      unexpectedResolver,
    )).rejects.toThrow("cannot be edited from 'submitting'");
    expect(unexpectedResolver).not.toHaveBeenCalled();
  });

  it.each([
    ['rejected', { status: 'rejected' }],
    ['deleted', { isDeleted: true, deletedAt: new Date() }],
  ])('blocks provider submission after the source candidate is %s', async (_label, candidateData) => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    await prisma.sourcingCandidate.update({
      where: { id: candidateId },
      data: candidateData,
    });

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    )).rejects.toThrow('not active');
  });

  it('rolls listing/workspace creation back with finalization and reuses the recorded provider identity', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
      {
      providerSubmissionId: 'provider-1',
      externalListingId: '427011919',
      channel: 'coupang',
      rawResult: { code: 'SUCCESS' },
      },
    );

    await expect(repository.finalizeRegistered(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
      async (opaqueTx) => {
        await createListingBranch(tx(opaqueTx), '427011919');
        throw new Error('local failure after provider success');
      },
    )).rejects.toThrow('local failure after provider success');
    expect(await prisma.channelListing.count({ where: { externalId: '427011919' } })).toBe(0);
    expect((await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
    )).providerSubmissionId).toBe('provider-1');

    await repository.markFailed({
      organizationId: TEST_ORGANIZATION_ID,
      preparationId: draft.preparationId,
      submissionLeaseToken: claimed.submissionLeaseToken!,
      error: 'local failure after provider success',
    });
    const retry = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (retry.status === 'registered') throw new Error('unexpected registered state');
    expect(retry.submissionKey).toBe(claimed.submissionKey);
    expect(retry.providerSubmissionId).toBe('provider-1');

    const registered = await repository.finalizeRegistered(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      retry.submissionLeaseToken!,
      async (opaqueTx) => ({ listingId: await createListingBranch(tx(opaqueTx), '427011919') }),
    );
    expect(registered.status).toBe('registered');
    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, channelListingId: registered.listingId },
    })).toBe(1);

    await expect(repository.finalizeRegistered(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      retry.submissionLeaseToken!,
      async () => {
        throw new Error('registered finalization callback must not run twice');
      },
    )).resolves.toEqual(registered);
  });

  it('persists transaction-resolved selections before a draft can be frozen', async () => {
    const requestedUrl = 'https://cdn.example.com/requested.png';
    const canonicalUrl = 'https://cdn.example.com/canonical.png';
    const baseInput = createInput(ACCOUNT_ID);
    const input = {
      ...baseInput,
      input: { ...baseInput.input, selectedThumbnailUrl: requestedUrl },
    };

    const draft = await repository.createOrGetActiveDraft(
      input,
      ensureWorkspace,
      async (_tx, selections) => ({
        ...selections,
        selectedThumbnailUrl: canonicalUrl,
      }),
    );
    const row = await prisma.productPreparation.findFirstOrThrow({
      where: { id: draft.preparationId, organizationId: TEST_ORGANIZATION_ID },
    });
    expect(row.selectedThumbnailUrl).toBe(canonicalUrl);

    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    expect(claimed.selectedThumbnailUrl).toBe(canonicalUrl);
  });

  it('reclaims an expired pre-provider lease with the same frozen key and hash', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (first.status === 'registered') throw new Error('unexpected registered state');
    expect(first.providerOutcome).toBe('not_attempted');
    expect(first.submissionLeaseToken).toEqual(expect.any(String));

    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: {
        submissionLeaseClaimedAt: new Date(
          Date.now() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS,
        ),
      },
    });
    const reclaimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (reclaimed.status === 'registered') throw new Error('unexpected registered state');

    expect(reclaimed.submissionKey).toBe(first.submissionKey);
    expect(reclaimed.submissionPayloadHash).toBe(first.submissionPayloadHash);
    expect(reclaimed.submissionLeaseToken).not.toBe(first.submissionLeaseToken);
    expect(reclaimed.providerOutcome).toBe('not_attempted');
  });

  it('reclaims an expired in-provider lease as uncertain and retains the same submission identity', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (first.status === 'registered') throw new Error('unexpected registered state');
    await repository.markProviderAttemptStarted(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      first.submissionLeaseToken!,
    );
    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: {
        submissionLeaseClaimedAt: new Date(
          Date.now() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS,
        ),
      },
    });

    const reclaimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (reclaimed.status === 'registered') throw new Error('unexpected registered state');
    expect(reclaimed.providerOutcome).toBe('uncertain');
    expect(reclaimed.submissionKey).toBe(first.submissionKey);
    expect(reclaimed.submissionLeaseToken).not.toBe(first.submissionLeaseToken);
  });

  it('rejects edit and cancellation after an uncertain or succeeded provider identity exists', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await repository.markProviderAttemptStarted(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
    );
    await repository.markFailed({
      organizationId: TEST_ORGANIZATION_ID,
      preparationId: draft.preparationId,
      submissionLeaseToken: claimed.submissionLeaseToken!,
      error: 'request timed out',
    });

    await expect(repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { displayName: 'Unsafe replacement' } },
      },
      resolveSelections,
    )).rejects.toThrow('provider identity');
    await expect(repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'cancel' },
      },
      resolveSelections,
    )).rejects.toThrow('provider identity');
  });

  it('rechecks the locked candidate before finalization and never invokes the callback after rejection', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await repository.markProviderAttemptStarted(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
    );
    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
      {
        providerSubmissionId: 'provider-1',
        externalListingId: '427011919',
        channel: 'coupang',
        rawResult: { code: 'SUCCESS' },
      },
    );
    await prisma.sourcingCandidate.update({
      where: { id: candidateId },
      data: { status: 'rejected' },
    });
    const finalize = vi.fn().mockResolvedValue({ listingId: randomUUID() });

    await expect(repository.finalizeRegistered(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      claimed.submissionLeaseToken!,
      finalize,
    )).rejects.toThrow('not active');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('serializes candidate terminal initiation ahead of a concurrent submission claim', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    let releaseTerminal!: () => void;
    let reportCandidateLocked!: () => void;
    const terminalRelease = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    const candidateLocked = new Promise<void>((resolve) => {
      reportCandidateLocked = resolve;
    });
    const terminal = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id FROM sourcing_candidates
        WHERE id = ${candidateId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
      reportCandidateLocked();
      await terminalRelease;
      return repository.assertCandidateTerminalTransitionAllowed(
        transaction as unknown as SourcingRepositoryTransaction,
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceCandidateId: candidateId,
        },
      );
    });
    await candidateLocked;
    const claim = repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    const observation = await Promise.race([
      claim.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    releaseTerminal();

    await expect(terminal).rejects.toBeInstanceOf(ConflictException);
    await expect(claim).resolves.toMatchObject({ status: 'submitting' });
    expect(observation).toBe('blocked');
  });

  function createInput(channelAccountId: string) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      createdByUserId: TEST_USER_ID,
      input: {
        channelAccountId,
        displayName: 'Kids rain boots',
        registrationInput: { salePrice: 21900, notices: ['age'] },
      },
    };
  }

  async function ensureWorkspace(opaqueTx: SourcingRepositoryTransaction): Promise<string> {
    const client = tx(opaqueTx);
    const existing = await client.contentWorkspace.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        status: 'active',
        isDeleted: false,
      },
    });
    if (existing) return existing.id;
    return (await client.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidateId,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  }

  async function resolveSelections(
    _opaqueTx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      selectedDetailPageArtifactId: string | null;
      selectedDetailPageRevisionId: string | null;
      selectedDetailPageGenerationId: string | null;
    },
  ) {
    return input;
  }

  async function createListingBranch(
    client: Prisma.TransactionClient,
    externalId: string,
  ): Promise<string> {
    const listing = await client.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceCandidateId: candidateId,
        channel: 'coupang',
        externalId,
        displayName: 'Kids rain boots',
        status: 'active',
      },
    });
    await client.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        channelListingId: listing.id,
        originWorkspaceId: (await client.contentWorkspace.findFirstOrThrow({
          where: { organizationId: TEST_ORGANIZATION_ID, sourceCandidateId: candidateId },
        })).id,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    });
    return listing.id;
  }
});

function tx(value: SourcingRepositoryTransaction): Prisma.TransactionClient {
  return value as unknown as Prisma.TransactionClient;
}
