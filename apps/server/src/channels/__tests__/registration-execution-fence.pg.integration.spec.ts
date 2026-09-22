import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
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
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';
import { hashRegistrationSubmissionPayload } from '../domain/registration/registration-submission-payload';
import { ProductPreparationRepositoryAdapter } from '../adapter/out/persistence/candidate-registration.repository.adapter';
import { RegistrationDraftAdapter } from '../adapter/out/persistence/candidate-registration-draft.adapter';
import { SourcingCandidateRepositoryAdapter } from '../../sourcing/adapter/out/repository/sourcing-candidate.repository.adapter';
import { RegistrationSourceAdapter } from '../../sourcing/adapter/out/repository/registration-source.adapter';
import { REGISTRATION_EXECUTION_LEASE_MS } from '../domain/registration/registration-execution-state';
import { ownerTransaction, ownerTransactionClient } from '../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../common/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';

const channelIntegrity = new ChannelIntegrityAdapter();

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const BUNDLE_MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const SALES_PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const SALES_PRODUCT_OPTION_ID = '55555555-5555-4555-8555-555555555555';
/** 직접 작성한 판매상품 — 원천 기록(후보)이 없다. */
const DIRECT_SALES_PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const DIRECT_SALES_PRODUCT_OPTION_ID = '77777777-7777-4777-8777-777777777777';

describe('registration execution fence (PG integration)', () => {
  let prisma: PrismaClient;
  let drafts: ProductPreparationRepositoryAdapter;
  let repository: RegistrationExecutionRepositoryAdapter;
  let candidateRepository: SourcingCandidateRepositoryAdapter;
  let candidateId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const registrationSource = new RegistrationSourceAdapter();
    drafts = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService,
      registrationSource,
      workspaceFake(),
    );
    // 울타리는 실행 행만 쓰고 초안은 Sourcing 어댑터를 통해 만진다(ADR-0014).
    // 실제 두 어댑터를 그대로 엮어야 한 트랜잭션 계약이 여기서 검증된다.
    repository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      new RegistrationDraftAdapter(registrationSource, workspaceFake()),
    );
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
    await prisma.salesProduct.create({
      data: {
        id: SALES_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        code: 'CANDIDATE-REGISTRATION-FENCE',
        name: 'Kids rain boots',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: SALES_PRODUCT_OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        optionCode: 'KID-FENCE-0001',
        optionKey: '단일',
        values: [],
        salePrice: 12900,
        normalPrice: 15900,
        supplyStatus: 'selling',
        sortOrder: 0,
      },
    });
  });

  it('requires the candidate-linked non-archived sales product to have final prices before draft creation', async () => {
    const input = createInput(ACCOUNT_ID);

    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { sourceCandidateId: null },
    });
    await expect(drafts.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections))
      .rejects.toThrow('이 수집상품의 판매상품이 없습니다.');

    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { sourceCandidateId: candidateId, status: 'archived' },
    });
    await expect(drafts.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections))
      .rejects.toThrow('보관한 판매상품');

    await prisma.salesProduct.update({
      where: { id: SALES_PRODUCT_ID },
      data: { status: 'active' },
    });
    await prisma.salesProductOption.update({
      where: { id: SALES_PRODUCT_OPTION_ID },
      data: { salePrice: 0 },
    });
    await expect(drafts.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections))
      .rejects.toThrow('아직 판매가를 정하지 않은 초안');
  });

  it('returns one draft under concurrent same-account creation', async () => {
    const input = createInput(ACCOUNT_ID);
    const [left, right] = await Promise.all([
      drafts.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections),
      drafts.createOrGetActiveDraft(input, ensureWorkspace, resolveSelections),
    ]);

    expect(left.preparationId).toBe(right.preparationId);
    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID },
    })).toBe(1);
  });

  it('keeps independent active drafts for separate channel accounts', async () => {
    const first = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    const second = await drafts.createOrGetActiveDraft(
      createInput(SECOND_ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );

    expect(second.preparationId).not.toBe(first.preparationId);
    expect(await prisma.registrationTarget.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        archivedAt: null,
      },
    })).toBe(2);
  });

  it('keeps a failed execution frozen while reusing its editable registration settings', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    expect(first.status).toBe('submitting');
    if (first.status === 'registered') throw new Error('unexpected registered state');
    await expect(prisma.productRegistrationExecution.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: draft.preparationId,
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
    )).rejects.toThrow("cannot be submitted from 'failed'");
    const failedSnapshot = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: first.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true, idempotencyKey: true },
    });
    const replacement = await drafts.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { registrationInput: { salePrice: 22900 } } },
      },
      resolveSelections,
    );
    expect(replacement.status).toBe('draft');
    expect(replacement.preparationId).toBe(draft.preparationId);
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: draft.preparationId },
      select: { registrationInput: true },
    })).resolves.toMatchObject({ registrationInput: { salePrice: 22900 } });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: first.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true, idempotencyKey: true },
    })).resolves.toEqual(failedSnapshot);
    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    )).rejects.toThrow("cannot be submitted from 'failed'");
  });

  it('projects finalization inputs from frozen JSON instead of mutable compatibility columns', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await prisma.registrationTarget.update({
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
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    )).rejects.toThrow('already in progress');
  });

  it('keeps an in-flight execution frozen when registration settings are edited', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (!('executionId' in claimed)) throw new Error('Expected a frozen execution');
    const frozenSnapshot = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: claimed.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true },
    });
    const edited = await drafts.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { displayName: 'Unsafe replacement' } },
      },
      resolveSelections,
    );
    expect(edited).toMatchObject({ preparationId: draft.preparationId, status: 'draft' });
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: draft.preparationId },
      select: { displayName: true },
    })).resolves.toEqual({ displayName: 'Unsafe replacement' });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: claimed.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true },
    })).resolves.toEqual(frozenSnapshot);
    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    )).rejects.toThrow('already in progress');
  });

  it.each([
    ['rejected', { status: 'rejected' }],
    ['deleted', { isDeleted: true, deletedAt: new Date() }],
  ])('blocks provider submission after the source candidate is %s', async (_label, candidateData) => {
    const draft = await drafts.createOrGetActiveDraft(
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
    )).rejects.toThrow('not active');
  });

  it('rolls listing/workspace creation back with finalization and reuses the recorded provider identity', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
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

    const draft = await drafts.createOrGetActiveDraft(
      input,
      ensureWorkspace,
      async (_tx, selections) => ({
        ...selections,
        selectedThumbnailUrl: canonicalUrl,
      }),
    );
    const row = await prisma.registrationTarget.findFirstOrThrow({
      where: { id: draft.preparationId, organizationId: TEST_ORGANIZATION_ID },
    });
    expect(row.selectedThumbnailUrl).toBe(canonicalUrl);

    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    expect(claimed.selectedThumbnailUrl).toBe(canonicalUrl);
  });

  it('reclaims an expired pre-provider lease with the same frozen key and hash', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (first.status === 'registered') throw new Error('unexpected registered state');
    expect(first.providerOutcome).toBe('not_attempted');
    expect(first.submissionLeaseToken).toEqual(expect.any(String));
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: first.executionId },
      select: { reviewPayloadHash: true, approvedAt: true, approvedByUserId: true },
    })).resolves.toEqual({
      reviewPayloadHash: first.submissionPayloadHash,
      approvedAt: expect.any(Date),
      approvedByUserId: TEST_USER_ID,
    });

    await prisma.productRegistrationExecution.update({
      where: { organizationId_registrationTargetId: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(
          Date.now() - REGISTRATION_EXECUTION_LEASE_MS,
        ),
      },
    });
    const reclaimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (reclaimed.status === 'registered') throw new Error('unexpected registered state');

    expect(reclaimed.submissionKey).toBe(first.submissionKey);
    expect(reclaimed.submissionPayloadHash).toBe(first.submissionPayloadHash);
    expect(reclaimed.executionId).toBe(first.executionId);
    expect(reclaimed.submissionLeaseToken).not.toBe(first.submissionLeaseToken);
    expect(reclaimed.providerOutcome).toBe('not_attempted');
  });

  it('rejects an idempotency-key replay when the compatibility payload hash drifts', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered state');
    await prisma.productRegistrationExecution.update({
      where: { organizationId_registrationTargetId: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(Date.now() - REGISTRATION_EXECUTION_LEASE_MS),
      },
    });
    await prisma.productRegistrationExecution.update({
      where: { organizationId_registrationTargetId: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: draft.preparationId,
      } },
      data: { reviewPayloadHash: 'drifted-request-hash' },
    });

    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a closed preparation without an execution instead of creating a new submission', async () => {
    const draft = await drafts.createOrGetActiveDraft(createInput(ACCOUNT_ID), ensureWorkspace, resolveSelections);
    const archivedAt = new Date('2026-07-30T12:00:00.000Z');
    await prisma.registrationTarget.update({
      where: { id: draft.preparationId },
      data: { archivedAt },
    });
    await expect(repository.claimForSubmission(TEST_ORGANIZATION_ID, draft.preparationId, TEST_USER_ID))
      .rejects.toThrow("Preparation cannot be submitted from 'cancelled'");
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: draft.preparationId } })).toBe(0);
  });

  it('reclaims an expired in-provider lease as uncertain and retains the same submission identity', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const first = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (first.status === 'registered') throw new Error('unexpected registered state');
    await repository.markProviderAttemptStarted(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      first.submissionLeaseToken!,
    );
    await prisma.productRegistrationExecution.update({
      where: { organizationId_registrationTargetId: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId: draft.preparationId,
      } },
      data: {
        leaseClaimedAt: new Date(
          Date.now() - REGISTRATION_EXECUTION_LEASE_MS,
        ),
      },
    });

    const reclaimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (reclaimed.status === 'registered') throw new Error('unexpected registered state');
    expect(reclaimed.providerOutcome).toBe('uncertain');
    expect(reclaimed.submissionKey).toBe(first.submissionKey);
    expect(reclaimed.submissionLeaseToken).not.toBe(first.submissionLeaseToken);
  });

  it('allows settings edits without changing an uncertain execution and blocks new submissions', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
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
        registrationTargetId: draft.preparationId,
      },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'reconciling', providerOutcome: 'uncertain' });

    const frozenSnapshot = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: claimed.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true },
    });
    const edited = await drafts.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'replace', input: { displayName: 'Unsafe replacement' } },
      },
      resolveSelections,
    );
    expect(edited).toMatchObject({ preparationId: draft.preparationId, status: 'draft' });
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: draft.preparationId },
      select: { displayName: true },
    })).resolves.toEqual({ displayName: 'Unsafe replacement' });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: claimed.executionId },
      select: { submissionPayloadJson: true, submissionPayloadHash: true },
    })).resolves.toEqual(frozenSnapshot);
    const replay = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (!('submissionLeaseToken' in replay)) throw new Error('Expected a frozen replay');
    expect(replay).toMatchObject({
      executionId: claimed.executionId,
      providerOutcome: 'uncertain',
      submissionPayloadHash: frozenSnapshot.submissionPayloadHash,
    });
    await expect(repository.markProviderAttemptStarted(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      replay.submissionLeaseToken!,
    )).rejects.toThrow('prior outcome is uncertain or succeeded');
    await expect(drafts.replaceDraftInput(
      {
        organizationId: TEST_ORGANIZATION_ID,
        preparationId: draft.preparationId,
        userId: TEST_USER_ID,
        command: { kind: 'cancel' },
      },
      resolveSelections,
    )).rejects.toThrow('An active execution must be resolved before archiving its target.');
  });

  it('rechecks the locked candidate before finalization and never invokes the callback after rejection', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
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
    const draft = await drafts.createOrGetActiveDraft(
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
      return drafts.assertCandidateTerminalTransitionAllowed(
        ownerTransaction(transaction),
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

  it('cancels an unstarted external WING intent before a candidate terminal transition', async () => {
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    const cancelledAt = new Date('2026-07-30T12:00:00.000Z');

    const cancelled = await candidateRepository.runInTransaction(async (transaction, ownerTx) => {
      await candidateRepository.lockCandidate(transaction, {
        id: candidateId,
        organizationId: TEST_ORGANIZATION_ID,
      });
      const count = await repository.cancelUnstartedExecutions(
        ownerTx,
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceCandidateId: candidateId,
          cancelledAt,
        },
      );
      await drafts.assertCandidateTerminalTransitionAllowed(ownerTx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
      });
      return count;
    });

    expect(cancelled).toBe(1);
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: prepared.preparationId },
      select: { archivedAt: true },
    })).resolves.toEqual({ archivedAt: cancelledAt });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { status: true, completedAt: true },
    })).resolves.toEqual({ status: 'cancelled', completedAt: cancelledAt });
  });

  it('keeps a started external WING execution as a candidate deletion blocker', async () => {
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    await expect(candidateRepository.runInTransaction(async (transaction, ownerTx) => {
      await candidateRepository.lockCandidate(transaction, {
        id: candidateId,
        organizationId: TEST_ORGANIZATION_ID,
      });
      const cancelled = await repository.cancelUnstartedExecutions(
        ownerTx,
        {
          organizationId: TEST_ORGANIZATION_ID,
          sourceCandidateId: candidateId,
          cancelledAt: new Date('2026-07-30T12:00:00.000Z'),
        },
      );
      expect(cancelled).toBe(0);
      return drafts.assertCandidateTerminalTransitionAllowed(ownerTx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
      });
    })).rejects.toBeInstanceOf(ConflictException);

    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'executing', providerOutcome: 'uncertain' });
  });

  it('durably prepares, starts, reconciles, and finalizes one external WING execution', async () => {
    const idempotencyKey = randomUUID();
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    });
    expect(prepared).toMatchObject({
      status: 'prepared', providerOutcome: 'not_attempted', expectedProviderAccountId: 'account-0',
    });
    await expect(repository.claimForSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, TEST_USER_ID,
    )).rejects.toBeInstanceOf(ConflictException);

    const replay = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    });
    expect(replay.executionId).toBe(prepared.executionId);
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Changed name',
      registrationInput: { wingProduct: { productName: 'Changed name' } },
      idempotencyKey,
    })).rejects.toBeInstanceOf(ConflictException);

    const started = await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    expect(started).toMatchObject({ status: 'executing', providerOutcome: 'uncertain' });
    expect((await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).executionId).toBe(prepared.executionId);
    await expect(repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).rejects.toBeInstanceOf(ConflictException);

    const unresolved = await repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'browser_timeout' },
    });
    expect(unresolved).toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain' });

    const frozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      prepared.preparationId,
      prepared.executionId,
    );
    expect(frozen.executionId).toBe(prepared.executionId);
    expect(frozen.preparationId).toBe(prepared.preparationId);
    const frozenRow = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: {
        registrationTargetId: true,
        channelAccountId: true,
        submissionPayloadJson: true,
        submissionPayloadHash: true,
        leaseToken: true,
      },
    });
    expect(frozenRow).toMatchObject({
      registrationTargetId: prepared.preparationId,
      channelAccountId: ACCOUNT_ID,
    });
    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      { externalListingId: '427011919', channel: 'coupang', rawResult: { source: 'wing' } },
      prepared.executionId,
    );
    const completed = await repository.finalizeRegistered(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      async (opaqueTx) => ({ listingId: await createListingBranch(tx(opaqueTx), '427011919') }),
      prepared.executionId,
    );
    expect(completed.status).toBe('registered');
    await expect(repository.get({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'succeeded', listingId: completed.listingId });
  });

  it('runs the same fence for a directly authored product that has no source candidate', async () => {
    await createDirectlyAuthoredProduct();

    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Direct rain boots',
      registrationInput: { wingProduct: { productName: 'Direct rain boots' } },
      idempotencyKey: randomUUID(),
    });
    expect(prepared).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(await prisma.registrationTarget.findUniqueOrThrow({
      where: { id: prepared.preparationId },
      select: { salesProductId: true, channelAccountId: true },
    })).toEqual({ salesProductId: DIRECT_SALES_PRODUCT_ID, channelAccountId: ACCOUNT_ID });

    await expect(repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'executing', providerOutcome: 'uncertain' });

    const frozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, prepared.executionId,
    );
    expect(frozen).toMatchObject({
      salesProductId: DIRECT_SALES_PRODUCT_ID,
      sourceCandidateId: null,
    });

    await repository.recordProviderResult(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      { externalListingId: '427011920', channel: 'coupang', rawResult: { source: 'wing' } },
      prepared.executionId,
    );
    await expect(repository.finalizeRegistered(
      TEST_ORGANIZATION_ID, prepared.preparationId, frozen.submissionLeaseToken!,
      async (opaqueTx) => ({
        listingId: await createListingBranch(tx(opaqueTx), '427011920', DIRECT_SALES_PRODUCT_ID),
      }),
      prepared.executionId,
    )).resolves.toMatchObject({ status: 'registered' });

    // 원천 기록이 없는 상품은 후보 삭제 준비가 볼 것도 없다.
    await expect(candidateRepository.runInTransaction(async (_transaction, ownerTx) =>
      repository.cancelUnstartedExecutions(ownerTx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        cancelledAt: new Date('2026-07-30T12:00:00.000Z'),
      }))).resolves.toBe(0);
  });

  it('keeps the source candidate as execution provenance and still refuses a rejected source', async () => {
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });

    await prisma.sourcingCandidate.update({
      where: { id: candidateId },
      data: { status: 'rejected' },
    });

    // 이미 남은 실행의 출처 표시는 그대로다.
    await expect(repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID, prepared.preparationId, prepared.executionId,
    )).resolves.toMatchObject({
      salesProductId: SALES_PRODUCT_ID,
      sourceCandidateId: candidateId,
    });

    // 그래도 거절된 원천으로 새 준비를 열지는 않는다.
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: SECOND_ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not downgrade provider success when an unresolved report was waiting on the execution lock', async () => {
    const prepared = await repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
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

    const unresolved = repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
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
    await expect(repository.get({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
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
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey,
    };
    const [left, right] = await Promise.all([
      repository.prepare(input),
      repository.prepare(input),
    ]);
    expect(left.executionId).toBe(right.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, idempotencyKey },
    })).toBe(1);
  });

  it('resumes the same prepared manual execution after the browser page is reopened', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
    };
    const prepared = await repository.prepare({
      ...base,
      idempotencyKey: randomUUID(),
    });

    const resumed = await repository.prepare({
      ...base,
      idempotencyKey: randomUUID(),
    });

    expect(resumed.executionId).toBe(prepared.executionId);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: prepared.preparationId },
    })).toBe(1);
  });

  it('allocates a bundle KID in the candidate-locked transaction and freezes its full payload hash', async () => {
    const input = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const prepared = await repository.prepare(input);
    if (!prepared.kidItemCode) throw new Error('bundle preparation did not return an assigned KID');

    const execution = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: {
        requestHash: true,
        submissionPayloadHash: true,
        submissionPayloadJson: true,
      },
    });
    const payload = execution.submissionPayloadJson as {
      registrationInput: {
        kidItemCode: string;
        sellpiaMatch: { code: string };
        wingProduct: { variants: Array<{ vendorItemCode: string }> };
      };
    };

    expect(prepared.kidItemCode).toMatch(/^KID[0-9]{8}$/);
    expect(payload.registrationInput.sellpiaMatch.code).toBe('KID00000001');
    expect(payload.registrationInput.kidItemCode).toBe(prepared.kidItemCode);
    expect(payload.registrationInput.wingProduct.variants[0]?.vendorItemCode)
      .toBe(prepared.kidItemCode);
    expect(execution.requestHash).toBe(execution.submissionPayloadHash);
    expect(execution.requestHash).toBe(hashRegistrationSubmissionPayload(payload, channelIntegrity.sha256));
    expect(prepared.requestHash).toBe(execution.requestHash);
  });

  it('replays a bundle preparation by key and rejects a changed request under that key', async () => {
    const idempotencyKey = randomUUID();
    const input = createExternalRegistrationInput(idempotencyKey, { quantity: 2 });
    const first = await repository.prepare(input);
    const replay = await repository.prepare(input);

    expect(replay).toMatchObject({
      executionId: first.executionId,
      preparationId: first.preparationId,
      kidItemCode: first.kidItemCode,
      requestHash: first.requestHash,
    });

    await expect(repository.prepare({
      ...input,
      displayName: 'Changed bundle request',
      registrationInput: {
        ...input.registrationInput,
        wingProduct: { productName: 'Changed bundle request', variants: [{ vendorItemCode: 'KID00000001' }] },
      },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent bundle preparations with distinct keys and reuses one assigned KID', async () => {
    const firstInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const secondInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const [first, second] = await Promise.all([
      repository.prepare(firstInput),
      repository.prepare(secondInput),
    ]);

    expect(second.executionId).toBe(first.executionId);
    expect(second.preparationId).toBe(first.preparationId);
    expect(second.kidItemCode).toBe(first.kidItemCode);
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: first.preparationId },
    })).toBe(1);
  });

  it('resumes a prepared bundle under a new key without changing its assigned KID', async () => {
    const first = await repository.prepare(createExternalRegistrationInput(randomUUID(), { quantity: 2 }));
    const resumed = await repository.prepare(createExternalRegistrationInput(randomUUID(), { quantity: 2 }));

    expect(resumed).toMatchObject({
      executionId: first.executionId,
      preparationId: first.preparationId,
      kidItemCode: first.kidItemCode,
      requestHash: first.requestHash,
    });
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: first.preparationId },
    })).toBe(1);
  });

  it('reuses the bundle KID after a definitive pre-provider failure', async () => {
    const sourceInput = createExternalRegistrationInput(randomUUID(), { quantity: 2 });
    const first = await repository.prepare(sourceInput);
    const firstFrozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      first.preparationId,
      first.executionId,
    );
    expect(firstFrozen.executionId).toBe(first.executionId);
    expect(firstFrozen.submissionPayloadJson).toMatchObject({
      registrationInput: { kidItemCode: first.kidItemCode },
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: first.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await repository.markNotSubmitted({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: first.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'extension_failed_before_provider_submission' },
    });

    const retry = await repository.prepare({
      ...sourceInput,
      idempotencyKey: randomUUID(),
    });

    expect(retry.executionId).not.toBe(first.executionId);
    expect(retry.preparationId).toBe(first.preparationId);
    expect(retry.kidItemCode).toBe(first.kidItemCode);
    const retryFrozen = await repository.loadFrozenSubmission(
      TEST_ORGANIZATION_ID,
      retry.preparationId,
      retry.executionId,
    );
    expect(retryFrozen.executionId).toBe(retry.executionId);
    expect(retryFrozen.submissionPayloadJson).toMatchObject({
      registrationInput: { kidItemCode: retry.kidItemCode },
    });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: first.executionId },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'failed', providerOutcome: 'definitive_failure' });
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: retry.executionId },
      select: { status: true, providerOutcome: true },
    })).resolves.toEqual({ status: 'prepared', providerOutcome: 'not_attempted' });
  });

  it('uses the source Master KID for a singleton instead of allocating a bundle code', async () => {
    const sourceCode = 'KID00000007';
    const prepared = await repository.prepare(createExternalRegistrationInput(randomUUID(), {
      quantity: 1,
      sourceCode,
    }));
    if (!prepared.kidItemCode) throw new Error('singleton preparation did not return a KID');

    const execution = await prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: prepared.executionId },
      select: { submissionPayloadJson: true },
    });
    const payload = execution.submissionPayloadJson as {
      registrationInput: {
        kidItemCode: string;
        sellpiaMatch: { code: string };
        wingProduct: { variants: Array<{ vendorItemCode: string }> };
      };
    };
    expect(prepared.kidItemCode).toBe(sourceCode);
    expect(payload.registrationInput.kidItemCode).toBe(sourceCode);
    expect(payload.registrationInput.sellpiaMatch.code).toBe(sourceCode);
    expect(payload.registrationInput.wingProduct.variants[0]?.vendorItemCode).toBe(sourceCode);
  });

  it('rolls back a failed bundle allocation without leaving an execution or preparation', async () => {
    const failingDrafts = new RegistrationDraftAdapter(new RegistrationSourceAdapter(), workspaceFake());
    vi.spyOn(failingDrafts, 'freezeForSubmission').mockRejectedValueOnce(
      new Error('forced transaction rollback after allocation'),
    );
    const failingRepository = new RegistrationExecutionRepositoryAdapter(
      prisma as unknown as PrismaService,
      failingDrafts,
    );
    const input = createExternalRegistrationInput(randomUUID(), { quantity: 2 });

    await expect(failingRepository.prepare(input)).rejects.toThrow(
      'forced transaction rollback after allocation',
    );
    expect(await prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: SALES_PRODUCT_ID },
    })).toBe(0);

    await expect(repository.prepare({
      ...input,
      idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({ status: 'prepared', kidItemCode: expect.stringMatching(/^KID[0-9]{8}$/) });
  });

  it('abandons a never-submitted execution and reuses its target for a changed payload', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const staleIdempotencyKey = randomUUID();
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    });

    // A later attempt with a changed payload (e.g. an edited category) freezes a
    // different hash, so the prepared execution can no longer resume. Because the
    // stale intent never reached the provider, the execution is abandoned while
    // the durable registration target remains the same.
    const fresh = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots (edited)',
      registrationInput: { wingProduct: { productName: 'Kids rain boots', wingCategoryKey: '64687' } },
      idempotencyKey: randomUUID(),
    });

    expect(fresh.status).toBe('prepared');
    expect(fresh.executionId).not.toBe(stale.executionId);
    expect(fresh.preparationId).toBe(stale.preparationId);
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { archivedAt: true },
    })).resolves.toEqual({
      archivedAt: null,
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
    expect(await prisma.registrationTarget.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        archivedAt: null,
      },
    })).toBe(1);

    // Superseding never erases the frozen idempotency ledger. Retrying the old
    // request must surface its terminal cancellation instead of reviving it.
    await expect(repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: staleIdempotencyKey,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a claim when the execution has lost its frozen approval snapshot', async () => {
    const draft = await drafts.createOrGetActiveDraft(createInput(ACCOUNT_ID), ensureWorkspace, resolveSelections);
    const first = await repository.claimForSubmission(TEST_ORGANIZATION_ID, draft.preparationId, TEST_USER_ID);
    if (first.status === 'registered') throw new Error('unexpected registered state');

    await prisma.productRegistrationExecution.update({
      where: { id: first.executionId },
      data: {
        reviewPayloadHash: null,
        approvedAt: null,
        approvedByUserId: null,
        leaseClaimedAt: new Date(Date.now() - REGISTRATION_EXECUTION_LEASE_MS),
      },
    });

    await expect(repository.claimForSubmission(TEST_ORGANIZATION_ID, draft.preparationId, TEST_USER_ID))
      .rejects.toThrow('Registration execution does not match its frozen approval.');
    await expect(prisma.productRegistrationExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, registrationTargetId: draft.preparationId },
    })).resolves.toBe(1);
  });

  it('never supersedes an ordinary create execution or its live claim lease', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID),
      ensureWorkspace,
      resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID,
      draft.preparationId,
      TEST_USER_ID,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered claim');

    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Changed into manual WING flow',
      registrationInput: { wingProduct: { productName: 'Changed into manual WING flow' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
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

  it('restarts a reconciled unknown WING attempt only after the channel absence was verified', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
    });
    await repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: stale.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'browser_timeout' },
    });

    await expect(repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({
      executionId: stale.executionId,
      status: 'reconciling',
      providerOutcome: 'uncertain',
    });

    const fresh = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
      providerAbsenceVerified: true,
    });

    expect(fresh).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(fresh.executionId).not.toBe(stale.executionId);
    expect(fresh.preparationId).toBe(stale.preparationId);
    await expect(prisma.productRegistrationExecution.findUniqueOrThrow({
      where: { id: stale.executionId },
      select: { status: true, providerOutcome: true, completedAt: true, leaseToken: true },
    })).resolves.toEqual({
      status: 'cancelled',
      providerOutcome: 'uncertain',
      completedAt: expect.any(Date),
      leaseToken: null,
    });
    await expect(prisma.registrationTarget.findUniqueOrThrow({
      where: { id: stale.preparationId },
      select: { archivedAt: true },
    })).resolves.toEqual({
      archivedAt: null,
    });
  });

  it('restarts a started unknown attempt only after the channel absence was verified', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const prepared = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });
    // Without a fresh provider lookup, a started execution remains protected.
    await repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: prepared.executionId,
      requestedByUserId: TEST_USER_ID,
    });

    await expect(repository.prepare({
      ...base,
      displayName: 'Changed after start',
      registrationInput: { wingProduct: { productName: 'Changed after start' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);

    const fresh = await repository.prepare({
      ...base,
      displayName: 'Changed after verified absence',
      registrationInput: { wingProduct: { productName: 'Changed after verified absence' } },
      idempotencyKey: randomUUID(),
      providerAbsenceVerified: true,
    });

    expect(fresh).toMatchObject({ status: 'prepared', providerOutcome: 'not_attempted' });
    expect(fresh.executionId).not.toBe(prepared.executionId);
  });

  it('serializes start behind a concurrent supersede and never resurrects the stale execution', async () => {
    const base = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
    };
    const stale = await repository.prepare({
      ...base,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    });

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
    const pausedRepository = new RegistrationExecutionRepositoryAdapter(
      pausedPrisma as unknown as PrismaService,
      new RegistrationDraftAdapter(new RegistrationSourceAdapter(), workspaceFake()),
    );
    const supersede = pausedRepository.prepare({
      ...base,
      displayName: 'Kids rain boots (edited while start races)',
      registrationInput: {
        wingProduct: {
          productName: 'Kids rain boots',
          wingCategoryKey: '64687',
        },
      },
      idempotencyKey: randomUUID(),
    });
    await candidateLocked;

    const start = repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
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
    await expect(repository.prepare({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { wingProduct: { productName: 'Kids rain boots' } },
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not expose ordinary create executions through the external WING lifecycle', async () => {
    const draft = await drafts.createOrGetActiveDraft(
      createInput(ACCOUNT_ID), ensureWorkspace, resolveSelections,
    );
    const claimed = await repository.claimForSubmission(
      TEST_ORGANIZATION_ID, draft.preparationId, TEST_USER_ID,
    );
    if (claimed.status === 'registered') throw new Error('unexpected registered claim');
    await expect(repository.start({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.get({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(repository.markUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      executionId: claimed.executionId,
      requestedByUserId: TEST_USER_ID,
      evidence: { reason: 'must-not-reconcile-create-execution' },
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  function createExternalRegistrationInput(
    idempotencyKey: string,
    options: { quantity: number; sourceCode?: string },
  ) {
    const sourceCode = options.sourceCode ?? 'KID00000001';
    return {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: SALES_PRODUCT_ID,
      requestedByUserId: TEST_USER_ID,
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: {
        sellpiaMatch: {
          sellpiaInventorySkuId: BUNDLE_MASTER_PRODUCT_ID,
          code: sourceCode,
          name: 'Kids rain boots',
          optionName: 'Blue / 130',
          quantity: options.quantity,
        },
        wingProduct: {
          productName: 'Kids rain boots',
          variants: [{ vendorItemCode: sourceCode }],
        },
      },
      idempotencyKey,
    };
  }

  async function createDirectlyAuthoredProduct(): Promise<void> {
    await prisma.salesProduct.create({
      data: {
        id: DIRECT_SALES_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'DIRECTLY-AUTHORED-FENCE',
        name: 'Direct rain boots',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: DIRECT_SALES_PRODUCT_OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: DIRECT_SALES_PRODUCT_ID,
        optionCode: 'KID-DIRECT-0001',
        optionKey: '단일',
        values: [],
        salePrice: 19900,
        supplyStatus: 'selling',
        sortOrder: 0,
      },
    });
  }

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

  /**
   * AI 공개 작업공간 port 의 대역. 초안 하나에 작업공간 하나이고, 등록은 그 작업공간을
   * 복제하지 않고 listing 을 가리키게만 한다(KID-310).
   */
  function workspaceFake() {
    return {
      findSalesProductWorkspaceId: async () => null,
      resolveSourceSelections: async (_opaqueTx: OwnerTransaction, input: unknown) => input,
      validateSourceSelections: async () => undefined,
      ensureSalesProductWorkspace: async (
        ownerTx: OwnerTransaction,
        input: { salesProductId: string },
      ) => ({
        workspaceId: await ensureWorkspace(ownerTx, input.salesProductId),
      }),
      attachToListing: async () => ({ workspaceId: '' }),
    } as never;
  }

  /** 콘텐츠 작업공간은 판매상품 초안이 가진다(KID-310). 후보는 그 초안이 가리킨다. */
  async function ensureWorkspace(
    ownerTx: OwnerTransaction,
    salesProductId: string = SALES_PRODUCT_ID,
  ): Promise<string> {
    const client = ownerTransactionClient(ownerTx);
    const existing = await client.contentWorkspace.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        status: 'active',
        isDeleted: false,
      },
    });
    if (existing) return existing.id;
    return (await client.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  }

  async function resolveSelections(
    _opaqueTx: OwnerTransaction,
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
    salesProductId: string = SALES_PRODUCT_ID,
  ): Promise<string> {
    const listing = await client.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        salesProductId,
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
          where: { organizationId: TEST_ORGANIZATION_ID, salesProductId },
        })).id,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    });
    return listing.id;
  }
});

function tx(
  value: OwnerTransaction,
): Prisma.TransactionClient {
  return ownerTransactionClient(value);
}
