import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../test-helpers/real-prisma';
import { freezeProductRegistrationPayload } from '../channels/domain/registration-submission-payload';
import { consolidateRegistrationExecutionMigration } from '../../../../scripts/data-migrations/v0.1.31/018_consolidate_registration_execution';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '77777777-7777-4777-8777-777777777777';
const SOURCE_CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const SALES_PRODUCT_ID = '88888888-8888-4888-8888-888888888001';
const SALES_PRODUCT_OPTION_ID = '88888888-8888-4888-8888-888888888002';
const LISTING_ID = '33333333-3333-4333-8333-333333333333';
const ACTIVE_PREPARATION_ID = '44444444-4444-4444-8444-444444444001';
const REGISTERED_PREPARATION_ID = '44444444-4444-4444-8444-444444444002';
const EXISTING_PREPARATION_ID = '44444444-4444-4444-8444-444444444003';
const IMPORT_PREPARATION_ID = '44444444-4444-4444-8444-444444444004';
const CONFLICT_PREPARATION_ID = '44444444-4444-4444-8444-444444444005';
const EXISTING_EXECUTION_ID = '55555555-5555-4555-8555-555555555001';
const CONFLICT_EXECUTION_ID = '55555555-5555-4555-8555-555555555002';
const ACTIVE_LEASE_TOKEN = '66666666-6666-4666-8666-666666666001';
const EXISTING_LEASE_TOKEN = '66666666-6666-4666-8666-666666666002';
const UPDATED_AT = new Date('2026-09-21T00:00:00.000Z');

const ACTIVE_PAYLOAD = {
  registrationInput: { wingProduct: { productName: 'Legacy active toy' } },
};
const REGISTERED_PAYLOAD = {
  registrationInput: { wingProduct: { productName: 'Legacy registered toy' } },
};
const EXISTING_PAYLOAD = {
  registrationInput: { wingProduct: { productName: 'Existing canonical toy' } },
};
const EXISTING_RESULT = { externalListingId: 'existing-external' };
const REGISTERED_RESULT = { externalListingId: 'registered-external' };

const ACTIVE_FROZEN = freezeProductRegistrationPayload(ACTIVE_PAYLOAD);
const REGISTERED_FROZEN = freezeProductRegistrationPayload(REGISTERED_PAYLOAD);
const EXISTING_FROZEN = freezeProductRegistrationPayload(EXISTING_PAYLOAD);

describe('v0.1.31:018 registration execution contraction (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedAccountsAndListing();
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('preserves uncertain and registered legacy submissions without recreating provider work', async () => {
    await createCanonicalExecution({
      id: EXISTING_EXECUTION_ID,
      preparationId: EXISTING_PREPARATION_ID,
      idempotencyKey: 'existing-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'uncertain',
      status: 'reconciling',
      providerSubmissionId: 'existing-provider',
      resultJson: EXISTING_RESULT,
      leaseToken: EXISTING_LEASE_TOKEN,
    });
    const existingBefore = await readExecution(EXISTING_PREPARATION_ID);

    const first = await prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [
        {
          id: ACTIVE_PREPARATION_ID,
          status: 'submitting',
          channelAccountId: SECOND_ACCOUNT_ID,
          submissionKey: 'active-key',
          submissionPayloadJson: ACTIVE_FROZEN.payload,
          submissionPayloadHash: ACTIVE_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          registrationResult: null,
          lastError: 'provider timeout',
          submissionLeaseToken: ACTIVE_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
        {
          id: REGISTERED_PREPARATION_ID,
          status: 'registered',
          submissionKey: 'registered-key',
          submissionPayloadJson: REGISTERED_FROZEN.payload,
          submissionPayloadHash: REGISTERED_FROZEN.hash,
          providerOutcome: 'succeeded',
          providerSubmissionId: 'registered-provider',
          registrationResult: REGISTERED_RESULT,
          lastError: null,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
          channelListingId: LISTING_ID,
        },
        {
          id: EXISTING_PREPARATION_ID,
          status: 'submitting',
          submissionKey: 'existing-key',
          submissionPayloadJson: EXISTING_FROZEN.payload,
          submissionPayloadHash: EXISTING_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: 'existing-provider',
          registrationResult: EXISTING_RESULT,
          lastError: null,
          submissionLeaseToken: EXISTING_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
      ]);
      const migration = await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
      const reviewHashes = await tx.$queryRaw<Array<{ id: string; review_payload_hash: string | null }>>`
        SELECT id::text AS id, review_payload_hash
        FROM product_preparations
        WHERE id IN (
          ${ACTIVE_PREPARATION_ID}::uuid,
          ${REGISTERED_PREPARATION_ID}::uuid,
          ${EXISTING_PREPARATION_ID}::uuid
        )
        ORDER BY id
      `;
      return { migration, reviewHashes };
    });

    expect(first.migration).toEqual({ affectedRows: 2, details: { importedExecutions: 2 } });
    expect(first.reviewHashes).toEqual([
      { id: ACTIVE_PREPARATION_ID, review_payload_hash: ACTIVE_FROZEN.hash },
      { id: REGISTERED_PREPARATION_ID, review_payload_hash: REGISTERED_FROZEN.hash },
      { id: EXISTING_PREPARATION_ID, review_payload_hash: EXISTING_FROZEN.hash },
    ]);
    await expectActiveExecution();
    await expectRegisteredExecution();
    const existingAfter = await readExecution(EXISTING_PREPARATION_ID);
    expect(existingAfter).toEqual(existingBefore);
    expect(existingAfter?.resultJson).toEqual(EXISTING_RESULT);

    const second = await prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [
        {
          id: ACTIVE_PREPARATION_ID,
          status: 'submitting',
          channelAccountId: SECOND_ACCOUNT_ID,
          submissionKey: 'active-key',
          submissionPayloadJson: ACTIVE_FROZEN.payload,
          submissionPayloadHash: ACTIVE_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          registrationResult: null,
          lastError: 'provider timeout',
          submissionLeaseToken: ACTIVE_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
        {
          id: REGISTERED_PREPARATION_ID,
          status: 'registered',
          submissionKey: 'registered-key',
          submissionPayloadJson: REGISTERED_FROZEN.payload,
          submissionPayloadHash: REGISTERED_FROZEN.hash,
          providerOutcome: 'succeeded',
          providerSubmissionId: 'registered-provider',
          registrationResult: REGISTERED_RESULT,
          lastError: null,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
          channelListingId: LISTING_ID,
        },
        {
          id: EXISTING_PREPARATION_ID,
          status: 'submitting',
          submissionKey: 'existing-key',
          submissionPayloadJson: EXISTING_FROZEN.payload,
          submissionPayloadHash: EXISTING_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: 'existing-provider',
          registrationResult: EXISTING_RESULT,
          lastError: null,
          submissionLeaseToken: EXISTING_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
      ]);
      return consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    });

    expect(second).toEqual({ affectedRows: 0, details: { importedExecutions: 0 } });
    expect(await prisma.productRegistrationExecution.count()).toBe(3);
    expect(await readExecution(EXISTING_PREPARATION_ID)).toEqual(existingBefore);
  }, 60_000);

  it('rolls back earlier imports when an existing execution conflicts', async () => {
    await createCanonicalExecution({
      id: CONFLICT_EXECUTION_ID,
      preparationId: CONFLICT_PREPARATION_ID,
      idempotencyKey: 'canonical-conflict-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'succeeded',
      status: 'succeeded',
      providerSubmissionId: 'canonical-provider',
      resultJson: EXISTING_RESULT,
      leaseToken: null,
    });

    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [
        {
          id: IMPORT_PREPARATION_ID,
          status: 'submitting',
          submissionKey: 'import-before-conflict',
          submissionPayloadJson: ACTIVE_FROZEN.payload,
          submissionPayloadHash: ACTIVE_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          registrationResult: null,
          lastError: null,
          submissionLeaseToken: ACTIVE_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
        {
          id: CONFLICT_PREPARATION_ID,
          status: 'submitting',
          submissionKey: 'legacy-conflicting-key',
          submissionPayloadJson: EXISTING_FROZEN.payload,
          submissionPayloadHash: EXISTING_FROZEN.hash,
          providerOutcome: 'succeeded',
          providerSubmissionId: 'canonical-provider',
          registrationResult: EXISTING_RESULT,
          lastError: null,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
          channelListingId: null,
        },
      ]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/conflicting submission_key/);

    expect(await prisma.productRegistrationExecution.count()).toBe(1);
    expect(await readExecution(IMPORT_PREPARATION_ID)).toBeNull();
    await expect(readExecution(CONFLICT_PREPARATION_ID)).resolves.toMatchObject({
      id: CONFLICT_EXECUTION_ID,
      idempotencyKey: 'canonical-conflict-key',
      resultJson: EXISTING_RESULT,
    });
  }, 60_000);

  it('aborts a cancelled legacy submission with uncertain provider evidence', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [{
        id: ACTIVE_PREPARATION_ID,
        status: 'cancelled',
        submissionKey: 'cancelled-uncertain-key',
        submissionPayloadJson: ACTIVE_FROZEN.payload,
        submissionPayloadHash: ACTIVE_FROZEN.hash,
        providerOutcome: 'uncertain',
        providerSubmissionId: null,
        registrationResult: null,
        lastError: 'provider timeout',
        submissionLeaseToken: ACTIVE_LEASE_TOKEN,
        submissionLeaseClaimedAt: UPDATED_AT,
        channelListingId: null,
      }]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/Closed registration preparation/);

    expect(await prisma.productRegistrationExecution.count()).toBe(0);
    expect(await prisma.productPreparation.count()).toBe(0);
  }, 60_000);

  it.each([
    { label: 'cancelled', status: 'cancelled', isDeleted: false },
    { label: 'archived', status: 'submitting', isDeleted: true },
  ])('aborts an existing reconciling execution when the legacy draft is $label', async ({ status, isDeleted }) => {
    await createCanonicalExecution({
      id: EXISTING_EXECUTION_ID,
      preparationId: EXISTING_PREPARATION_ID,
      idempotencyKey: 'existing-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'uncertain',
      status: 'reconciling',
      providerSubmissionId: 'existing-provider',
      resultJson: EXISTING_RESULT,
      leaseToken: EXISTING_LEASE_TOKEN,
    });
    const canonicalBefore = await readExecution(EXISTING_PREPARATION_ID);

    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [{
        id: EXISTING_PREPARATION_ID,
        status,
        isDeleted,
        submissionKey: 'existing-key',
        submissionPayloadJson: EXISTING_FROZEN.payload,
        submissionPayloadHash: EXISTING_FROZEN.hash,
        providerOutcome: 'uncertain',
        providerSubmissionId: 'existing-provider',
        registrationResult: EXISTING_RESULT,
        lastError: null,
        submissionLeaseToken: EXISTING_LEASE_TOKEN,
        submissionLeaseClaimedAt: UPDATED_AT,
        channelListingId: null,
      }]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/Closed registration preparation/);

    expect(await prisma.productRegistrationExecution.count()).toBe(1);
    await expect(readExecution(EXISTING_PREPARATION_ID)).resolves.toEqual(canonicalBefore);
  }, 60_000);

  it('rolls back closure backfill when an open legacy draft meets a cancelled uncertain execution', async () => {
    await createCanonicalExecution({
      id: EXISTING_EXECUTION_ID,
      preparationId: EXISTING_PREPARATION_ID,
      idempotencyKey: 'cancelled-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'uncertain',
      status: 'cancelled',
      providerSubmissionId: null,
      resultJson: null,
      leaseToken: EXISTING_LEASE_TOKEN,
    });
    const canonicalBefore = await readExecution(EXISTING_PREPARATION_ID);

    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [{
        id: EXISTING_PREPARATION_ID,
        status: 'submitting',
        isDeleted: false,
        closedAt: null,
        submissionKey: 'cancelled-key',
        submissionPayloadJson: EXISTING_FROZEN.payload,
        submissionPayloadHash: EXISTING_FROZEN.hash,
        providerOutcome: 'uncertain',
        providerSubmissionId: null,
        registrationResult: null,
        lastError: null,
        submissionLeaseToken: EXISTING_LEASE_TOKEN,
        submissionLeaseClaimedAt: UPDATED_AT,
        channelListingId: null,
      }]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/Closed registration preparation/);

    expect(await prisma.productRegistrationExecution.count()).toBe(1);
    await expect(readExecution(EXISTING_PREPARATION_ID)).resolves.toEqual(canonicalBefore);
  }, 60_000);

  it.each([
    { label: 'provider outcome', leaseToken: null, leaseClaimedAt: null, error: /conflicting provider_outcome/ },
    { label: 'lease token', leaseToken: ACTIVE_LEASE_TOKEN, leaseClaimedAt: UPDATED_AT, error: /conflicting submission_lease_token/ },
  ])('rejects a canonical failed execution against a legacy uncertain $label', async ({ leaseToken, leaseClaimedAt, error }) => {
    await createCanonicalExecution({
      id: EXISTING_EXECUTION_ID,
      preparationId: EXISTING_PREPARATION_ID,
      idempotencyKey: 'failed-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'definitive_failure',
      status: 'failed',
      providerSubmissionId: null,
      resultJson: null,
      leaseToken: null,
    });
    const canonicalBefore = await readExecution(EXISTING_PREPARATION_ID);

    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [{
        id: EXISTING_PREPARATION_ID,
        status: 'submitting',
        submissionKey: 'failed-key',
        submissionPayloadJson: EXISTING_FROZEN.payload,
        submissionPayloadHash: EXISTING_FROZEN.hash,
        providerOutcome: 'uncertain',
        providerSubmissionId: null,
        registrationResult: null,
        lastError: 'legacy uncertain outcome',
        submissionLeaseToken: leaseToken,
        submissionLeaseClaimedAt: leaseClaimedAt,
        channelListingId: null,
      }]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(error);

    expect(await prisma.productRegistrationExecution.count()).toBe(1);
    await expect(readExecution(EXISTING_PREPARATION_ID)).resolves.toEqual(canonicalBefore);
  }, 60_000);

  it('backfills approval hashes and rolls back an import on conflicting approval evidence', async () => {
    await createCanonicalExecution({
      id: CONFLICT_EXECUTION_ID,
      preparationId: CONFLICT_PREPARATION_ID,
      idempotencyKey: 'canonical-conflict-key',
      payload: EXISTING_FROZEN,
      providerOutcome: 'uncertain',
      status: 'reconciling',
      providerSubmissionId: 'canonical-provider',
      resultJson: EXISTING_RESULT,
      leaseToken: EXISTING_LEASE_TOKEN,
    });
    const canonicalBefore = await readExecution(CONFLICT_PREPARATION_ID);

    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [
        {
          id: IMPORT_PREPARATION_ID,
          status: 'submitting',
          channelAccountId: SECOND_ACCOUNT_ID,
          submissionKey: 'import-before-approval-conflict',
          submissionPayloadJson: ACTIVE_FROZEN.payload,
          submissionPayloadHash: ACTIVE_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          registrationResult: null,
          lastError: null,
          submissionLeaseToken: ACTIVE_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
        {
          id: CONFLICT_PREPARATION_ID,
          status: 'submitting',
          reviewPayloadHash: 'approval-hash-from-stale-mirror',
          submissionKey: 'canonical-conflict-key',
          submissionPayloadJson: EXISTING_FROZEN.payload,
          submissionPayloadHash: EXISTING_FROZEN.hash,
          providerOutcome: 'uncertain',
          providerSubmissionId: 'canonical-provider',
          registrationResult: EXISTING_RESULT,
          lastError: null,
          submissionLeaseToken: EXISTING_LEASE_TOKEN,
          submissionLeaseClaimedAt: UPDATED_AT,
          channelListingId: null,
        },
      ]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow(/conflicting (?:review_payload_hash|approval)/);

    expect(await prisma.productRegistrationExecution.count()).toBe(1);
    await expect(readExecution(IMPORT_PREPARATION_ID)).resolves.toBeNull();
    await expect(readExecution(CONFLICT_PREPARATION_ID)).resolves.toEqual(canonicalBefore);
  }, 60_000);

  it('aborts an approved legacy draft when its frozen execution evidence is missing', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await createLegacyPreparationShadow(tx);
      await insertLegacyRows(tx, [{
        id: ACTIVE_PREPARATION_ID,
        status: 'draft',
        reviewPayloadHash: ACTIVE_FROZEN.hash,
        submissionKey: null,
        submissionPayloadJson: null,
        submissionPayloadHash: null,
        providerOutcome: 'not_attempted',
        providerSubmissionId: null,
        registrationResult: null,
        lastError: null,
        submissionLeaseToken: null,
        submissionLeaseClaimedAt: null,
        channelListingId: null,
      }]);
      await consolidateRegistrationExecutionMigration.run(tx, { target: 'local' });
    })).rejects.toThrow('Legacy submitting preparation is missing frozen submission data');

    expect(await prisma.productRegistrationExecution.count()).toBe(0);
  }, 60_000);

  it('allows a new active preparation after the prior preparation is successfully closed', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        displayName: 'Legacy registration candidate',
        normalizedTitle: 'legacy registration candidate',
        createdByUserId: TEST_USER_ID,
      },
    });
    const closedAt = new Date('2026-09-21T00:10:00.000Z');
    const closed = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: workspace.id,
        displayName: 'Closed legacy preparation',
        registrationInput: {},
        closedAt,
        isDeleted: false,
        createdByUserId: TEST_USER_ID,
      },
    });

    const replacement = await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: workspace.id,
        displayName: 'Replacement preparation',
        registrationInput: {},
        closedAt: null,
        isDeleted: false,
        createdByUserId: TEST_USER_ID,
      },
    });

    expect(replacement.id).not.toBe(closed.id);
    await expect(prisma.productPreparation.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        channelAccountId: ACCOUNT_ID,
        closedAt: null,
        isDeleted: false,
      },
    })).resolves.toBe(1);
  });

  async function seedAccountsAndListing(): Promise<void> {
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'legacy-account',
        name: 'Legacy account',
      },
    });
    await prisma.channelAccount.create({
      data: {
        id: SECOND_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        externalAccountId: 'legacy-account-2',
        name: 'Legacy account 2',
      },
    });
    await prisma.sourcingCandidate.create({
      data: {
        id: SOURCE_CANDIDATE_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://example.test/legacy-registration',
        sourcePlatform: 'test',
        rawData: {},
        name: 'Legacy registration candidate',
        status: 'sourced',
      },
    });
    await prisma.salesProduct.create({
      data: {
        id: SALES_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        code: 'REGISTRATION-EXECUTION-CONTRACTION',
        name: 'Legacy registration candidate',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        id: SALES_PRODUCT_OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        optionCode: 'REGISTRATION-EXECUTION-CONTRACTION-1',
        values: ['단품'],
        optionKey: '단품',
        salePrice: 1000,
      },
    });
    await prisma.channelListing.create({
      data: {
        id: LISTING_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        externalId: 'listing-external',
        displayName: 'Legacy registered listing',
      },
    });
  }

  async function createCanonicalExecution(input: {
    id: string;
    preparationId: string;
    idempotencyKey: string;
    payload: ReturnType<typeof freezeProductRegistrationPayload>;
    providerOutcome: string;
    status: string;
    providerSubmissionId: string | null;
    resultJson: Record<string, string> | null;
    leaseToken: string | null;
  }): Promise<void> {
    await prisma.productPreparation.upsert({
      where: { id: input.preparationId },
      create: {
        id: input.preparationId,
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: SALES_PRODUCT_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        channelAccountId: ACCOUNT_ID,
        registrationInput: {},
      },
      update: {},
    });
    await prisma.productRegistrationExecution.create({
      data: {
        id: input.id,
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId: input.preparationId,
        channelAccountId: ACCOUNT_ID,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.payload.hash,
        submissionPayloadJson: input.payload.payload as Prisma.InputJsonValue,
        submissionPayloadHash: input.payload.hash,
        status: input.status,
        providerOutcome: input.providerOutcome,
        providerSubmissionId: input.providerSubmissionId,
        resultJson: input.resultJson === null
          ? Prisma.DbNull
          : input.resultJson as Prisma.InputJsonValue,
        lastErrorMessage: input.status === 'reconciling' ? 'provider timeout' : null,
        leaseToken: input.leaseToken,
        leaseClaimedAt: input.leaseToken ? UPDATED_AT : null,
        requestedByUserId: TEST_USER_ID,
        startedAt: input.leaseToken ? UPDATED_AT : null,
      },
    });
  }

  async function createLegacyPreparationShadow(tx: Prisma.TransactionClient): Promise<void> {
    // The final ProductPreparation table no longer has provider/runtime
    // columns. This transaction-local table recreates only the old evidence
    // shape that migration 018 reads through to_jsonb(preparation).
    await tx.$executeRaw`
      CREATE TEMPORARY TABLE product_preparations (
        id uuid NOT NULL,
        organization_id uuid NOT NULL,
        source_candidate_id uuid NOT NULL,
        channel_account_id uuid NOT NULL,
        channel_listing_id uuid,
        status text NOT NULL,
        is_deleted boolean NOT NULL DEFAULT false,
        closed_at timestamptz,
        deleted_at timestamptz,
        review_payload_hash text,
        submission_key text,
        submission_payload_json jsonb,
        submission_payload_hash text,
        provider_outcome text,
        provider_submission_id text,
        registration_result jsonb,
        last_error text,
        submission_lease_token uuid,
        submission_lease_claimed_at timestamptz,
        approved_by_user_id uuid,
        updated_at timestamptz NOT NULL
      ) ON COMMIT DROP
    `;
  }

  async function insertLegacyRows(
    tx: Prisma.TransactionClient,
    rows: ReadonlyArray<LegacyRow>,
  ): Promise<void> {
    for (const row of rows) {
      await tx.$executeRaw`
        INSERT INTO public.product_preparations
          (id, organization_id, sales_product_id, source_candidate_id, channel_account_id, registration_input)
        VALUES (${row.id}::uuid, ${TEST_ORGANIZATION_ID}::uuid, ${SALES_PRODUCT_ID}::uuid,
          ${SOURCE_CANDIDATE_ID}::uuid, ${(row.channelAccountId ?? ACCOUNT_ID)}::uuid, '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;
      const payloadJson = row.submissionPayloadJson === null
        ? null
        : JSON.stringify(row.submissionPayloadJson);
      const resultJson = row.registrationResult === null
        ? null
        : JSON.stringify(row.registrationResult);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO product_preparations (
          id, organization_id, source_candidate_id, channel_account_id,
          channel_listing_id, status, is_deleted, closed_at, deleted_at,
          review_payload_hash, submission_key, submission_payload_json,
          submission_payload_hash, provider_outcome, provider_submission_id,
          registration_result, last_error, submission_lease_token,
          submission_lease_claimed_at, approved_by_user_id, updated_at
        ) VALUES (
          ${row.id}::uuid, ${TEST_ORGANIZATION_ID}::uuid,
          ${SOURCE_CANDIDATE_ID}::uuid, ${(row.channelAccountId ?? ACCOUNT_ID)}::uuid,
          ${row.channelListingId}::uuid, ${row.status}, ${row.isDeleted ?? false},
          ${row.closedAt ?? null}, ${row.deletedAt ?? null},
          ${row.reviewPayloadHash}, ${row.submissionKey},
          ${payloadJson}::jsonb, ${row.submissionPayloadHash},
          ${row.providerOutcome}, ${row.providerSubmissionId},
          ${resultJson}::jsonb, ${row.lastError},
          ${row.submissionLeaseToken}::uuid, ${row.submissionLeaseClaimedAt},
          ${TEST_USER_ID}::uuid, ${UPDATED_AT}
        )
      `);
    }
  }

  async function readExecution(preparationId: string) {
    return prisma.productRegistrationExecution.findFirst({
      where: { organizationId: TEST_ORGANIZATION_ID, productPreparationId: preparationId },
      select: {
        id: true,
        productPreparationId: true,
        channelAccountId: true,
        channelListingId: true,
        idempotencyKey: true,
        requestHash: true,
        submissionPayloadJson: true,
        submissionPayloadHash: true,
        status: true,
        providerOutcome: true,
        providerSubmissionId: true,
        externalListingId: true,
        resultJson: true,
        lastErrorMessage: true,
        leaseToken: true,
        leaseClaimedAt: true,
        requestedByUserId: true,
        startedAt: true,
        completedAt: true,
      },
    });
  }

  async function expectActiveExecution(): Promise<void> {
    await expect(readExecution(ACTIVE_PREPARATION_ID)).resolves.toMatchObject({
      productPreparationId: ACTIVE_PREPARATION_ID,
      idempotencyKey: 'active-key',
      requestHash: ACTIVE_FROZEN.hash,
      submissionPayloadHash: ACTIVE_FROZEN.hash,
      status: 'reconciling',
      providerOutcome: 'uncertain',
      providerSubmissionId: null,
      externalListingId: null,
      lastErrorMessage: 'provider timeout',
      leaseToken: ACTIVE_LEASE_TOKEN,
      leaseClaimedAt: UPDATED_AT,
      requestedByUserId: TEST_USER_ID,
      startedAt: UPDATED_AT,
    });
  }

  async function expectRegisteredExecution(): Promise<void> {
    await expect(readExecution(REGISTERED_PREPARATION_ID)).resolves.toMatchObject({
      productPreparationId: REGISTERED_PREPARATION_ID,
      channelListingId: LISTING_ID,
      idempotencyKey: 'registered-key',
      requestHash: REGISTERED_FROZEN.hash,
      submissionPayloadHash: REGISTERED_FROZEN.hash,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      providerSubmissionId: 'registered-provider',
      externalListingId: 'listing-external',
      resultJson: REGISTERED_RESULT,
      leaseToken: null,
      leaseClaimedAt: null,
      startedAt: null,
      completedAt: UPDATED_AT,
    });
  }
});

type LegacyRow = {
  id: string;
  status: string;
  submissionKey: string | null;
  submissionPayloadJson: unknown;
  submissionPayloadHash: string | null;
  providerOutcome: string | null;
  providerSubmissionId: string | null;
  registrationResult: Record<string, string> | null;
  lastError: string | null;
  submissionLeaseToken: string | null;
  submissionLeaseClaimedAt: Date | null;
  channelListingId: string | null;
  channelAccountId?: string;
  reviewPayloadHash?: string | null;
  isDeleted?: boolean;
  closedAt?: Date | null;
  deletedAt?: Date | null;
};
