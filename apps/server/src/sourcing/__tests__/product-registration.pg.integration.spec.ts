import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import type { SourcingRepositoryTransaction } from '../application/port/out/transaction/repository-transaction';
import { PRODUCT_PREPARATION_SUBMISSION_LEASE_MS } from '../domain/product-preparation-state';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ProductPreparationRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ProductPreparationRepositoryAdapter;
  let candidateRepository: SourcingCandidateRepositoryAdapter;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ProductPreparationRepositoryAdapter(prisma as unknown as PrismaService);
    candidateRepository = new SourcingCandidateRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
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

  it('keeps independent active drafts for separate channel accounts', async () => {
    const first = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    const second = await repository.createOrGetActiveDraft(
      createInput(SECOND_ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    expect(second.preparationId).not.toBe(first.preparationId);
    expect(await prisma.productPreparation.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        status: 'draft',
      },
    })).toBe(2);
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
    await expect(prisma.productRegistrationExecution.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: draft.preparationId,
      },
      select: {
        idempotencyKey: true,
        requestHash: true,
        submissionPayloadHash: true,
        status: true,
        providerOutcome: true,
      },
    })).resolves.toEqual({
      idempotencyKey: first.submissionKey,
      requestHash: first.submissionPayloadHash,
      submissionPayloadHash: first.submissionPayloadHash,
      status: 'prepared',
      providerOutcome: 'not_attempted',
    });

    await repository.markFailed({
      organizationId: TEST_ORGANIZATION_ID,
      preparationId: draft.preparationId,
      submissionLeaseToken: first.submissionLeaseToken!,
      error: 'provider unavailable',
      providerOutcome: 'definitive_failure',
    });
    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    )).rejects.toThrow("cannot be submitted from 'failed'");
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
    )).rejects.toThrow('execution cannot be discarded or edited');
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

    await prisma.productRegistrationExecution.update({
      where: { organizationId_productPreparationId: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(
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
    expect(reclaimed.executionId).toBe(first.executionId);
    expect(reclaimed.submissionLeaseToken).not.toBe(first.submissionLeaseToken);
    expect(reclaimed.providerOutcome).toBe('not_attempted');
  });

  it('rejects an idempotency-key replay when the compatibility payload hash drifts', async () => {
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
    await prisma.productRegistrationExecution.update({
      where: { organizationId_productPreparationId: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(Date.now() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS),
      },
    });
    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: { submissionPayloadHash: 'drifted-request-hash' },
    });

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('imports an execution-less legacy submitting row as uncertain rather than preparing a new create', async () => {
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
    await prisma.productRegistrationExecution.delete({ where: { id: claimed.executionId } });
    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: {
        status: 'submitting',
        providerOutcome: 'not_attempted',
        submissionLeaseClaimedAt: new Date(
          Date.now() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS,
        ),
      },
    });

    const imported = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    );
    if (imported.status === 'registered') throw new Error('unexpected registered state');
    expect(imported.providerOutcome).toBe('uncertain');
    await expect(prisma.productRegistrationExecution.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, productPreparationId: draft.preparationId },
      select: { status: true, providerOutcome: true, requestHash: true },
    })).resolves.toEqual({
      status: 'reconciling',
      providerOutcome: 'uncertain',
      requestHash: claimed.submissionPayloadHash,
    });
  });

  it('replays an execution-less legacy registered preparation from its persisted listing', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const listingId = await prisma.$transaction((transaction) => createListingBranch(
      transaction,
      '427011920',
    ));
    await prisma.productPreparation.update({
      where: { id: draft.preparationId },
      data: {
        status: 'registered',
        channelListingId: listingId,
        submissionPayloadJson: Prisma.DbNull,
        submissionPayloadHash: null,
      },
    });

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
      resolveSelections,
    )).resolves.toEqual({
      preparationId: draft.preparationId,
      status: 'registered',
      listingId,
    });
    await expect(prisma.productRegistrationExecution.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, productPreparationId: draft.preparationId },
      select: {
        status: true,
        providerOutcome: true,
        channelListingId: true,
        externalListingId: true,
        requestHash: true,
      },
    })).resolves.toEqual({
      status: 'succeeded',
      providerOutcome: 'succeeded',
      channelListingId: listingId,
      externalListingId: '427011920',
      requestHash: expect.any(String),
    });
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
    await prisma.productRegistrationExecution.update({
      where: { organizationId_productPreparationId: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(
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
    await expect(prisma.productRegistrationExecution.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: draft.preparationId,
      },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'reconciling', providerOutcome: 'uncertain' });

    await expect(repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { displayName: 'Unsafe replacement' } },
      },
      resolveSelections,
    )).rejects.toThrow('execution cannot be discarded or edited');
    await expect(repository.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'cancel' },
      },
      resolveSelections,
    )).rejects.toThrow('execution cannot be discarded or edited');
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

  it('durably prepares, starts, reconciles, and finalizes one external WING execution', async () => {
    const idempotencyKey = randomUUID();
    const prepared = await repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    }, ensureWorkspace, resolveSelections);
    expect(prepared).toMatchObject({
      status: 'prepared', providerOutcome: 'not_attempted', expectedProviderAccountId: 'account-0',
    });
    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, TEST_USER_ID, resolveSelections,
    )).rejects.toBeInstanceOf(ConflictException);

    const replay = await repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    }, ensureWorkspace, resolveSelections);
    expect(replay.executionId).toBe(prepared.executionId);
    await expect(repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Changed name',
      registrationInput: { wingProduct: { productName: 'Changed name' } },
      idempotencyKey,
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);

    const started = await repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(started).toMatchObject({ status: 'executing', providerOutcome: 'uncertain' });
    expect((await repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).executionId).toBe(prepared.executionId);
    await expect(repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).rejects.toBeInstanceOf(ConflictException);

    const unresolved = await repository.markExternalExecutionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'browser_timeout' },
    });
    expect(unresolved).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });

    const frozen = await repository.loadFrozenSubmission(TEST_ORGANIZATION_ID, prepared.preparationId);
    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      { externalListingId: '427011919', channel: 'coupang', rawResult: { source: 'wing' } },
    );
    const completed = await repository.finalizeRegistered(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      async (opaqueTx) => ({ listingId: await createListingBranch(tx(opaqueTx), '427011919') }),
    );
    expect(completed.status).toBe('registered');
    await expect(repository.getExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'succeeded', listingId: completed.listingId });
  });

  it('does not downgrade provider success when an unresolved report was waiting on the execution lock', async () => {
    const prepared = await repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);
    await repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    let releaseSuccessWriter!: () => void;
    let reportExecutionLocked!: () => void;
    const successWriterRelease = new Promise<void>((resolve) => {
      releaseSuccessWriter = resolve;
    });
    const executionLocked = new Promise<void>((resolve) => {
      reportExecutionLocked = resolve;
    });
    const successWriter = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id
        FROM product_registration_executions
        WHERE id = ${prepared.executionId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
      reportExecutionLocked();
      await successWriterRelease;
      await transaction.productRegistrationExecution.update({
        where: { id: prepared.executionId },
        data: {
          status: 'executing',
          providerOutcome: 'succeeded',
          providerSubmissionId: '427011919',
          externalListingId: '427011919',
          resultJson: { source: 'wing' },
        },
      });
    });
    await executionLocked;

    const unresolved = repository.markExternalExecutionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'late_browser_timeout' },
    });
    const observation = await Promise.race([
      unresolved.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    expect(observation).toBe('blocked');

    releaseSuccessWriter();
    await successWriter;
    await expect(unresolved).resolves.toMatchObject({
      status: 'executing',
      providerOutcome: 'succeeded',
    });
    await expect(repository.getExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({
      status: 'executing',
      providerOutcome: 'succeeded',
      listingId: null,
    });
  });

  it('replays a concurrent same-hash external preparation after the candidate lock', async () => {
    const idempotencyKey = randomUUID();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    };
    const [left, right] = await Promise.all([
      repository.prepareExternalExecution(input, ensureWorkspace, resolveSelections),
      repository.prepareExternalExecution(input, ensureWorkspace, resolveSelections),
    ]);
    expect(left.executionId).toBe(right.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, idempotencyKey },
    })).toBe(1);
  });

  it('resumes the same prepared manual execution after the browser page is reopened', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
    };
    const prepared = await repository.prepareExternalExecution({
      ...base,
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);

    const resumed = await repository.prepareExternalExecution({
      ...base,
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);

    expect(resumed.executionId).toBe(prepared.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, productPreparationId: prepared.preparationId },
    })).toBe(1);
  });

  it('abandons a never-submitted prepared execution and prepares fresh when a later attempt changes the payload', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const staleIdempotencyKey = randomUUID();
    const stale = await repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    }, ensureWorkspace, resolveSelections);

    // A later attempt with a changed payload (e.g. an edited category) freezes a
    // different hash, so the prepared execution can no longer resume. Because the
    // stale intent never reached the provider, it is abandoned and a fresh
    // preparation/execution is created instead of hard-conflicting.
    const fresh = await repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots (edited)',
      registrationInput: { wingProduct: { productName: 'Kids rain boots', wingCategoryKey: '64687' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);

    expect(fresh.status).toBe('prepared');
    expect(fresh.executionId).not.toBe(stale.executionId);
    expect(fresh.preparationId).not.toBe(stale.preparationId);
    await expect(prisma.productPreparation.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { status: true, isDeleted: true, deletedAt: true },
    })).resolves.toEqual({
      status: 'cancelled',
      isDeleted: true,
      deletedAt: expect.any(Date),
    });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: {
        status: true,
        providerOutcome: true,
        completedAt: true,
        leaseToken: true,
        leaseClaimedAt: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'not_attempted',
      completedAt: expect.any(Date),
      leaseToken: null,
      leaseClaimedAt: null,
    });
    expect(await prisma.productPreparation.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        isDeleted: false,
      },
    })).toBe(1);

    // Superseding never erases the frozen idempotency ledger. Retrying the old
    // request must surface its terminal cancellation instead of reviving it.
    await expect(repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never revives a legacy active preparation whose execution ledger is missing', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);
    // Simulate a pre-ledger/partially migrated active row. The production path
    // must reconcile or reject it, never treat `every([])` as safe to replace.
    await prisma.productRegistrationExecution.delete({ where: { id: stale.executionId } });

    await expect(repository.prepareExternalExecution({
      ...base,
      displayName: 'Changed without a ledger',
      registrationInput: { wingProduct: { productName: 'Changed without a ledger' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.productPreparation.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { status: true, isDeleted: true },
    })).resolves.toEqual({ status: 'submitting', isDeleted: false });
  });

  it('never supersedes an ordinary create execution or its live claim lease', async () => {
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
    if (claimed.status === 'registered') throw new Error('unexpected registered claim');

    await expect(repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Changed into manual WING flow',
      registrationInput: { wingProduct: { productName: 'Changed into manual WING flow' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: claimed.executionId },
      select: {
        executionKind: true,
        status: true,
        providerOutcome: true,
        leaseToken: true,
      },
    })).resolves.toEqual({
      executionKind: 'create',
      status: 'prepared',
      providerOutcome: 'not_attempted',
      leaseToken: claimed.submissionLeaseToken,
    });
  });

  it('still blocks a changed-payload attempt once the existing external execution has started', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const prepared = await repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);
    // Once started, the execution is uncertain (may have reached Coupang); a
    // changed-payload retry must never silently replace it.
    await repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    await expect(repository.prepareExternalExecution({
      ...base,
      displayName: 'Changed after start',
      registrationInput: { wingProduct: { productName: 'Changed after start' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes start behind a concurrent supersede and never resurrects the stale execution', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);

    let releaseSupersede!: () => void;
    let reportCandidateLocked!: () => void;
    const supersedeRelease = new Promise<void>((resolve) => {
      releaseSupersede = resolve;
    });
    const candidateLocked = new Promise<void>((resolve) => {
      reportCandidateLocked = resolve;
    });
    let didPause = false;
    const pausedPrisma = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await transaction.$queryRaw<R>(query);
              if (!didPause) {
                didPause = true;
                reportCandidateLocked();
                await supersedeRelease;
              }
              return rows;
            };
          },
        }))),
    };
    const pausedRepository = new ProductPreparationRepositoryAdapter(
      pausedPrisma as unknown as PrismaService,
    );
    const supersede = pausedRepository.prepareExternalExecution({
      ...base,
      displayName: 'Kids rain boots (edited while start races)',
      registrationInput: {
        wingProduct: {
          productName: 'Kids rain boots',
          wingCategoryKey: '64687',
        },
      },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections);
    await candidateLocked;

    const start = repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    const startState = await Promise.race([
      start.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    expect(startState).toBe('blocked');
    releaseSupersede();

    const fresh = await supersede;
    await expect(start).rejects.toBeInstanceOf(ConflictException);
    expect(fresh.executionId).not.toBe(stale.executionId);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: { status: true, providerOutcome: true, startedAt: true },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'not_attempted',
      startedAt: null,
    });
  });

  it('rejects external preparation when the persisted account is not a vendor-identified Wing account', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT_ID },
      data: { channel: 'rocket', vendorId: null, externalAccountId: null },
    });
    await expect(repository.prepareExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    }, ensureWorkspace, resolveSelections)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not expose ordinary create executions through the external WING lifecycle', async () => {
    const draft = await repository.createOrGetActiveDraft(
      createInput(ACCOUNT_ID), ensureWorkspace, resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID, draft.preparationId, TEST_USER_ID, resolveSelections,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered claim');
    await expect(repository.startExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.getExternalExecution({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.markExternalExecutionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidateId,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'must-not-reconcile-create-execution' },
    })).rejects.toBeInstanceOf(NotFoundException);
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
