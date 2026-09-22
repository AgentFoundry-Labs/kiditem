import { ChannelIntegrityAdapter } from '../channels/adapter/out/integrity/channel-integrity.adapter';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../test-helpers/real-prisma';
import { freezeProductRegistrationPayload } from '../channels/domain/registration/registration-submission-payload';
import { registrationTargetCutoverMigration } from '../../../../scripts/data-migrations/v0.1.31/022_registration_target_cutover';

const channelIntegrity = new ChannelIntegrityAdapter();

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_TARGET_ID = '33333333-3333-4333-8333-444444444444';
const THIRD_TARGET_ID = '33333333-3333-4333-8333-555555555556';
const LISTING_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const EXISTING_EXECUTION_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_EXECUTION_ID = '77777777-7777-4777-8777-888888888888';
const LEASE_TOKEN = '88888888-8888-4888-8888-888888888888';
const UPDATED_AT = new Date('2026-09-20T12:00:00.000Z');
const CLOSED_AT = new Date('2026-09-19T12:00:00.000Z');
const DELETED_AT = new Date('2026-09-18T12:00:00.000Z');
const PAYLOAD = freezeProductRegistrationPayload({ kind: 'registration', name: 'Toy' }, channelIntegrity.sha256);
const RECEIPT = { externalListingId: 'provider-receipt' };

describe('v0.1.31:022 registration target cutover (disposable PostgreSQL schema)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('converts a 0.1.30 target in place and is a no-op after the rename', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await seedTarget(tx, { office0130: true, registrationInput: { name: 'Office toy', salePrice: 1200 } });
      const first = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      const [target] = await tx.$queryRaw<Array<{ id: string; sales_product_id: string; archived_at: Date | null }>>`
        SELECT id::text AS id, sales_product_id::text AS sales_product_id, archived_at
        FROM registration_targets WHERE id = ${TARGET_ID}::uuid
      `;
      const [selection] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM registration_target_options WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
      const second = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return { first, target, selectionCount: Number(selection?.count ?? 0), second };
    }, 'office-0.1.30');

    expect(result.first).toEqual({ affectedRows: 1, details: { linkedTargets: 1, importedExecutions: 0, outcome: 'contracted' } });
    expect(result.target).toMatchObject({ id: TARGET_ID, sales_product_id: expect.any(String), archived_at: null });
    expect(result.selectionCount).toBe(1);
    expect(result.second).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
  }, 60_000);

  it('keeps 018/021 execution identity, moves the review hash, and preserves an uncertain receipt', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID,
        status: 'submitting',
        submissionKey: 'office-attempt',
        payload: PAYLOAD.payload,
        payloadHash: PAYLOAD.hash,
        reviewHash: PAYLOAD.hash,
        approvedAt: UPDATED_AT,
        approvedBy: EXISTING_EXECUTION_ID,
        providerOutcome: 'uncertain',
        providerSubmissionId: 'provider-123',
        registrationResult: RECEIPT,
        leaseToken: LEASE_TOKEN,
        leaseClaimedAt: UPDATED_AT,
      });
      await createLegacyOptionsTable(tx);
      await tx.$executeRaw`
        INSERT INTO sales_product_options (id, organization_id, sales_product_id, option_code, "values", option_key, sale_price)
        VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, ${ORGANIZATION_ID}::uuid,
          ${PRODUCT_ID}::uuid, 'LEGACY-OPTION', ARRAY['단품']::text[], '단품', 1000)
      `;
      await tx.$executeRaw`INSERT INTO product_preparation_options
        (id, organization_id, product_preparation_id, sales_product_option_id, sort_order)
        VALUES ('99999999-9999-4999-8999-999999999999'::uuid, ${ORGANIZATION_ID}::uuid, ${TARGET_ID}::uuid,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 0)`;
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID,
        idempotencyKey: 'office-attempt',
        requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload,
        payloadHash: PAYLOAD.hash,
        status: 'reconciling',
        providerOutcome: 'uncertain',
        providerSubmissionId: 'provider-123',
        resultJson: RECEIPT,
        leaseToken: LEASE_TOKEN,
        leaseClaimedAt: UPDATED_AT,
      });
      const first = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      const [execution] = await tx.$queryRaw<Array<{
        id: string; registration_target_id: string; status: string; provider_outcome: string;
        provider_submission_id: string | null; external_listing_id: string | null; review_payload_hash: string | null;
        approved_at: Date | null; approved_by_user_id: string | null;
      }>>`
        SELECT id::text AS id, registration_target_id::text AS registration_target_id,
          status, provider_outcome, provider_submission_id, external_listing_id, review_payload_hash,
          approved_at, approved_by_user_id::text AS approved_by_user_id
        FROM product_registration_executions WHERE id = ${EXISTING_EXECUTION_ID}::uuid
      `;
      const [option] = await tx.$queryRaw<Array<{ registration_target_id: string }>>`
        SELECT registration_target_id::text AS registration_target_id FROM registration_target_options
        WHERE id = ${'99999999-9999-4999-8999-999999999999'}::uuid
      `;
      const second = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return { first, execution, option, second };
    });

    expect(result.first).toEqual({ affectedRows: 0, details: { linkedTargets: 0, importedExecutions: 0, outcome: 'contracted' } });
    expect(result.execution).toEqual({
      id: EXISTING_EXECUTION_ID,
      registration_target_id: TARGET_ID,
      status: 'reconciling',
      provider_outcome: 'uncertain',
      provider_submission_id: 'provider-123',
      external_listing_id: 'provider-receipt',
      review_payload_hash: PAYLOAD.hash,
      approved_at: UPDATED_AT,
      approved_by_user_id: EXISTING_EXECUTION_ID,
    });
    expect(result.option).toEqual({ registration_target_id: TARGET_ID });
    expect(result.second).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
  }, 60_000);

  it('imports a registered success only when a scoped persisted listing exists', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID,
        status: 'registered',
        closedAt: CLOSED_AT,
        channelListingId: LISTING_ID,
        payload: PAYLOAD.payload,
        payloadHash: PAYLOAD.hash,
        providerSubmissionId: 'provider-registered',
      });
      await tx.$executeRaw`
        INSERT INTO channel_listings (id, organization_id, channel_account_id, source_candidate_id, external_id)
        VALUES (${LISTING_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${ACCOUNT_ID}::uuid, ${SOURCE_ID}::uuid, 'persisted-listing')
      `;
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      const [target] = await tx.$queryRaw<Array<{ archived_at: Date | null }>>`
        SELECT archived_at FROM registration_targets WHERE id = ${TARGET_ID}::uuid
      `;
      const [execution] = await tx.$queryRaw<Array<{
        status: string; provider_outcome: string; channel_listing_id: string | null; external_listing_id: string | null;
      }>>`
        SELECT status, provider_outcome, channel_listing_id::text AS channel_listing_id, external_listing_id
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
      return { target, execution };
    });
    expect(result.target?.archived_at).toBeNull();
    expect(result.execution).toEqual({
      status: 'succeeded', provider_outcome: 'succeeded', channel_listing_id: LISTING_ID,
      external_listing_id: 'persisted-listing',
    });
  }, 60_000);

  it('keeps an explicit cancellation archive even when the target has a persisted successful listing', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'cancelled', closedAt: CLOSED_AT,
        channelListingId: LISTING_ID, submissionKey: 'cancelled-success',
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
      });
      await tx.$executeRaw`
        INSERT INTO channel_listings (id, organization_id, channel_account_id, source_candidate_id, external_id)
        VALUES (${LISTING_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${ACCOUNT_ID}::uuid, ${SOURCE_ID}::uuid, 'persisted-listing')
      `;
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'cancelled-success', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'succeeded', providerOutcome: 'succeeded',
      });
      await tx.$executeRaw`
        UPDATE product_registration_executions SET channel_listing_id = ${LISTING_ID}::uuid,
          external_listing_id = 'persisted-listing' WHERE id = ${EXISTING_EXECUTION_ID}::uuid
      `;
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{ archived_at: Date | null; status: string; listing_id: string | null }>>`
        SELECT target.archived_at, execution.status, execution.channel_listing_id::text AS listing_id
        FROM registration_targets target
        JOIN product_registration_executions execution ON execution.registration_target_id = target.id
        WHERE target.id = ${TARGET_ID}::uuid
      `;
    });

    expect(result).toEqual([{
      archived_at: CLOSED_AT, status: 'succeeded', listing_id: LISTING_ID,
    }]);
  }, 60_000);

  it('keeps a registered target with a provider receipt reconciling when no listing is persisted', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'registered', registrationResult: RECEIPT,
        providerSubmissionId: 'provider-unpersisted',
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{ status: string; provider_outcome: string; channel_listing_id: string | null; external_listing_id: string | null }>>`
        SELECT status, provider_outcome, channel_listing_id::text AS channel_listing_id, external_listing_id
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
    });
    expect(result).toEqual([{
      status: 'reconciling', provider_outcome: 'uncertain', channel_listing_id: null,
      external_listing_id: 'provider-receipt',
    }]);
  }, 60_000);

  it.each([
    {
      label: 'registration-result-only receipt',
      providerSubmissionId: null,
      registrationResult: RECEIPT,
      existingProviderSubmissionId: null,
      existingResultJson: RECEIPT,
    },
    {
      label: 'provider-submission-id-only receipt',
      providerSubmissionId: 'provider-inferred',
      registrationResult: null,
      existingProviderSubmissionId: 'provider-inferred',
      existingResultJson: null,
    },
  ])('downgrades an 018-inferred $label to uncertain reconciliation', async ({
    providerSubmissionId, registrationResult, existingProviderSubmissionId, existingResultJson,
  }) => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'submitting', submissionKey: 'inferred-success',
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, providerOutcome: 'uncertain',
        providerSubmissionId,
        registrationResult,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'inferred-success', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'reconciling', providerOutcome: 'succeeded',
        providerSubmissionId: existingProviderSubmissionId, resultJson: existingResultJson,
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{ id: string; status: string; provider_outcome: string; channel_listing_id: string | null }>>`
        SELECT id::text AS id, status, provider_outcome, channel_listing_id::text AS channel_listing_id
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
    });
    expect(result).toEqual([{
      id: EXISTING_EXECUTION_ID, status: 'reconciling', provider_outcome: 'uncertain', channel_listing_id: null,
    }]);
  }, 60_000);

  it.each([
    { label: 'cancelled', status: 'cancelled', closedAt: CLOSED_AT, isDeleted: false, deletedAt: null },
    { label: 'deleted', status: 'submitting', closedAt: null, isDeleted: true, deletedAt: DELETED_AT },
  ])('imports a frozen pre-submit attempt as terminal for $label targets', async ({ status, closedAt, isDeleted, deletedAt }) => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status, closedAt, isDeleted, deletedAt,
        submissionKey: 'pre-submit-terminal', payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
        reviewHash: PAYLOAD.hash,
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{
        status: string; provider_outcome: string; provider_submission_id: string | null;
        result_json: unknown; lease_token: string | null; completed_at: Date | null;
      }>>`
        SELECT status, provider_outcome, provider_submission_id, result_json, lease_token, completed_at
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
    });
    expect(result).toEqual([{
      status: 'cancelled', provider_outcome: 'not_attempted', provider_submission_id: null,
      result_json: null, lease_token: null, completed_at: isDeleted ? DELETED_AT : CLOSED_AT,
    }]);
  }, 60_000);

  it('aborts and rolls back when a legacy lease token has no matching execution evidence', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'submitting', submissionKey: 'leased-attempt',
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, providerOutcome: 'uncertain',
        leaseToken: LEASE_TOKEN, leaseClaimedAt: UPDATED_AT,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'leased-attempt', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'reconciling', providerOutcome: 'uncertain',
      });

      await tx.$executeRaw`SAVEPOINT registration_target_lease_conflict`;
      await expect(registrationTargetCutoverMigration.run(tx, { target: 'office' }))
        .rejects.toThrow(/conflicting submission_lease_token/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT registration_target_lease_conflict`;

      const [target] = await tx.$queryRaw<Array<{ submission_lease_token: string | null }>>`
        SELECT submission_lease_token::text FROM product_preparations WHERE id = ${TARGET_ID}::uuid
      `;
      const [execution] = await tx.$queryRaw<Array<{ lease_token: string | null }>>`
        SELECT lease_token::text FROM product_registration_executions WHERE id = ${EXISTING_EXECUTION_ID}::uuid
      `;
      const [shape] = await tx.$queryRaw<Array<{ legacy_target: boolean; registration_target: boolean }>>`
        SELECT to_regclass('product_preparations') IS NOT NULL AS legacy_target,
          to_regclass('registration_targets') IS NOT NULL AS registration_target
      `;
      return { target, execution, shape };
    });

    expect(result).toEqual({
      target: { submission_lease_token: LEASE_TOKEN },
      execution: { lease_token: null },
      shape: { legacy_target: true, registration_target: false },
    });
  }, 60_000);

  it.each([
    {
      label: 'idempotency key', legacyKey: 'legacy-conflicting-key', existingKey: 'canonical-key',
      existingRequestHash: PAYLOAD.hash, legacyOutcome: 'uncertain', existingOutcome: 'uncertain',
      existingStatus: 'reconciling', error: /conflicting idempotency_key/,
    },
    {
      label: 'request hash', legacyKey: 'same-key', existingKey: 'same-key',
      existingRequestHash: 'f'.repeat(64), legacyOutcome: 'uncertain', existingOutcome: 'uncertain',
      existingStatus: 'reconciling', error: /conflicting request_hash/,
    },
    {
      label: 'provider outcome', legacyKey: 'failed-key', existingKey: 'failed-key',
      existingRequestHash: PAYLOAD.hash, legacyOutcome: 'uncertain', existingOutcome: 'definitive_failure',
      existingStatus: 'failed', error: /conflicting provider_outcome/,
    },
  ])('rejects conflicting execution $label evidence without importing earlier attempts', async ({
    legacyKey, existingKey, existingRequestHash, legacyOutcome, existingOutcome, existingStatus, error,
  }) => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        id: TARGET_ID, salesProductId: PRODUCT_ID, status: 'submitting',
        submissionKey: 'import-before-conflict', payload: PAYLOAD.payload,
        payloadHash: PAYLOAD.hash, providerOutcome: 'uncertain',
      });
      await seedTarget(tx, {
        id: SECOND_TARGET_ID, salesProductId: PRODUCT_ID, status: 'submitting',
        submissionKey: legacyKey, payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
        providerOutcome: legacyOutcome,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, targetId: SECOND_TARGET_ID,
        idempotencyKey: existingKey, requestHash: existingRequestHash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
        status: existingStatus, providerOutcome: existingOutcome,
      });

      await tx.$executeRaw`SAVEPOINT registration_target_evidence_conflict`;
      await expect(registrationTargetCutoverMigration.run(tx, { target: 'office' })).rejects.toThrow(error);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT registration_target_evidence_conflict`;

      const executions = await tx.$queryRaw<Array<{
        id: string; product_preparation_id: string; idempotency_key: string; request_hash: string;
        status: string; provider_outcome: string;
      }>>`
        SELECT id::text AS id, product_preparation_id::text AS product_preparation_id,
          idempotency_key, request_hash, status, provider_outcome
        FROM product_registration_executions ORDER BY id
      `;
      const [shape] = await tx.$queryRaw<Array<{ legacyTarget: boolean; registrationTarget: boolean }>>`
        SELECT to_regclass('product_preparations') IS NOT NULL AS "legacyTarget",
          to_regclass('registration_targets') IS NOT NULL AS "registrationTarget"
      `;
      return { executions, shape };
    });

    expect(result.executions).toEqual([{
      id: EXISTING_EXECUTION_ID, product_preparation_id: SECOND_TARGET_ID,
      idempotency_key: existingKey, request_hash: existingRequestHash,
      status: existingStatus, provider_outcome: existingOutcome,
    }]);
    expect(result.shape).toEqual({ legacyTarget: true, registrationTarget: false });
  }, 60_000);

  it.each([
    { label: 'wrong-organization product', invalidRelationship: 'wrong-organization-product' },
    { label: 'missing product', invalidRelationship: 'missing-product' },
    { label: 'option from another product', invalidRelationship: 'wrong-product-option' },
  ])('rolls back a $label relationship before renaming targets', async ({ invalidRelationship }) => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await createLegacyOptionsTable(tx);
      await seedTarget(tx, { salesProductId: PRODUCT_ID });

      if (invalidRelationship === 'wrong-organization-product') {
        await tx.$executeRaw`
          UPDATE sales_products SET organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
          WHERE id = ${PRODUCT_ID}::uuid
        `;
      } else if (invalidRelationship === 'missing-product') {
        await tx.$executeRaw`DELETE FROM sales_products WHERE id = ${PRODUCT_ID}::uuid`;
      } else {
        await tx.$executeRaw`
          INSERT INTO sales_products (id, organization_id, code, name)
          VALUES ('99999999-9999-4999-8999-999999999998'::uuid, ${ORGANIZATION_ID}::uuid, 'KID00000002', 'Other toy')
        `;
        await tx.$executeRaw`
          INSERT INTO sales_product_options (id, organization_id, sales_product_id, option_code, option_key, sale_price)
          VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, ${ORGANIZATION_ID}::uuid,
            '99999999-9999-4999-8999-999999999998'::uuid, 'OTHER-OPTION', 'Other option', 1000)
        `;
        await tx.$executeRaw`
          INSERT INTO product_preparation_options (id, organization_id, product_preparation_id, sales_product_option_id)
          VALUES ('99999999-9999-4999-8999-999999999997'::uuid, ${ORGANIZATION_ID}::uuid, ${TARGET_ID}::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
        `;
      }

      await tx.$executeRaw`SAVEPOINT registration_target_catalog_conflict`;
      await expect(registrationTargetCutoverMigration.run(tx, { target: 'office' }))
        .rejects.toThrow(/Registration target\/product or selected product-option relationship blocks cutover/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT registration_target_catalog_conflict`;

      const [shape] = await tx.$queryRaw<Array<{ legacyTarget: boolean; registrationTarget: boolean }>>`
        SELECT to_regclass('product_preparations') IS NOT NULL AS "legacyTarget",
          to_regclass('registration_targets') IS NOT NULL AS "registrationTarget"
      `;
      const [target] = await tx.$queryRaw<Array<{ salesProductId: string | null }>>`
        SELECT sales_product_id::text AS "salesProductId" FROM product_preparations WHERE id = ${TARGET_ID}::uuid
      `;
      const [catalog] = await tx.$queryRaw<Array<{ products: number; options: number; selections: number }>>`
        SELECT (SELECT count(*)::int FROM sales_products) AS products,
          (SELECT count(*)::int FROM sales_product_options) AS options,
          (SELECT count(*)::int FROM product_preparation_options) AS selections
      `;
      return { shape, target, catalog };
    });

    expect(result.shape).toEqual({ legacyTarget: true, registrationTarget: false });
    expect(result.target).toEqual({ salesProductId: PRODUCT_ID });
    expect(result.catalog.products).toBe(invalidRelationship === 'missing-product' ? 0 : invalidRelationship === 'wrong-product-option' ? 2 : 1);
    expect(result.catalog.options).toBe(invalidRelationship === 'wrong-product-option' ? 1 : 0);
    expect(result.catalog.selections).toBe(invalidRelationship === 'wrong-product-option' ? 1 : 0);
  }, 60_000);

  it('rolls back earlier target links when a later target conflicts on a shared candidate', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        id: TARGET_ID, registrationInput: { name: 'First product', salePrice: 1200 },
      });
      await seedTarget(tx, {
        id: SECOND_TARGET_ID, registrationInput: { name: 'Conflicting product', salePrice: 1200 },
      });

      await tx.$executeRaw`SAVEPOINT registration_target_cutover`;
      await expect(registrationTargetCutoverMigration.run(tx, { target: 'office' }))
        .rejects.toThrow(/Ambiguous canonical registration product metadata/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT registration_target_cutover`;

      const [first] = await tx.$queryRaw<Array<{ sales_product_id: string | null }>>`
        SELECT sales_product_id::text AS sales_product_id FROM product_preparations
        WHERE id = ${TARGET_ID}::uuid
      `;
      const [createdProductCount] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM sales_products WHERE source_candidate_id = ${SOURCE_ID}::uuid
      `;
      const [renamed] = await tx.$queryRaw<Array<{ present: boolean }>>`
        SELECT to_regclass('registration_targets') IS NOT NULL AS present
      `;
      const [selectionTable] = await tx.$queryRaw<Array<{ present: boolean }>>`
        SELECT to_regclass('product_preparation_options') IS NOT NULL AS present
      `;
      return { first, createdProductCount: Number(createdProductCount?.count ?? 0), renamed: renamed?.present, selectionTable: selectionTable?.present };
    });

    expect(result).toEqual({
      first: { sales_product_id: null }, createdProductCount: 0, renamed: false, selectionTable: false,
    });
  }, 60_000);

  it('allows target display and price overrides when canonical shared-product metadata agrees', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        id: TARGET_ID, displayName: 'Account one target label',
        registrationInput: { name: 'Shared canonical product', salePrice: 1200 },
      });
      await seedTarget(tx, {
        id: SECOND_TARGET_ID, displayName: 'Account two target label',
        registrationInput: { name: 'Shared canonical product', salePrice: 1500 },
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{
        target_id: string; target_name: string; sales_product_id: string; target_sale_price: number;
      }>>`
        SELECT target.id::text AS target_id, target.display_name AS target_name,
          target.sales_product_id::text AS sales_product_id, selection.sale_price AS target_sale_price
        FROM registration_targets target
        JOIN registration_target_options selection ON selection.registration_target_id = target.id
        ORDER BY target.id
      `;
    });

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.target_name)).toEqual(['Account one target label', 'Account two target label']);
    expect(result[0].sales_product_id).toBe(result[1].sales_product_id);
    expect(result.map((row) => row.target_sale_price)).toEqual([1200, 1500]);
  }, 60_000);

  it('migrates legacy override prices and leaves an already-linked target untouched on rerun', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await createLegacyOptionsTable(tx);
      await tx.$executeRaw`ALTER TABLE sales_products ADD COLUMN sale_price integer`;
      await tx.$executeRaw`ALTER TABLE sales_products ADD COLUMN tag_price integer`;
      await tx.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN extra_price integer`;
      await tx.$executeRaw`UPDATE sales_products SET sale_price = 10000, tag_price = 16000 WHERE id = ${PRODUCT_ID}::uuid`;
      await tx.$executeRaw`
        INSERT INTO sales_product_options (id, organization_id, sales_product_id, option_code, "values", option_key, sale_price, extra_price)
        VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, ${ORGANIZATION_ID}::uuid,
          ${PRODUCT_ID}::uuid, 'LEGACY-OVERRIDE-1', ARRAY['남색']::text[], '남색', 10000, 2000)
      `;
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID,
        displayName: 'Edited existing target',
        registrationInput: { preserve: 'target' },
      });
      await tx.$executeRaw`
        INSERT INTO product_preparation_options
          (id, organization_id, product_preparation_id, sales_product_option_id, sort_order, sale_price, normal_price, supply_price)
        VALUES ('99999999-9999-4999-8999-999999999996'::uuid, ${ORGANIZATION_ID}::uuid, ${TARGET_ID}::uuid,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 9, 77777, 88888, 66666)
      `;
      await tx.$executeRaw`CREATE TEMP TABLE sales_product_channel_overrides (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL, channel_account_id uuid NOT NULL,
        name text, adapter_values jsonb, detail_html text, promo_text text, notice_category text, stock_percent integer,
        sale_price integer, price_rate_bp integer
      ) ON COMMIT DROP`;
      await insertLegacyOverride(tx, TARGET_ID, 11000, null);
      await insertLegacyOverride(tx, SECOND_TARGET_ID, 11000, null);
      await insertLegacyOverride(tx, THIRD_TARGET_ID, null, 12500);

      const first = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      const [preservedTarget] = await tx.$queryRaw<Array<{ display_name: string; registration_input: unknown }>>`
        SELECT display_name, registration_input FROM registration_targets WHERE id = ${TARGET_ID}::uuid
      `;
      const selections = await tx.$queryRaw<Array<{
        target_id: string; sort_order: number; sale_price: number | null; normal_price: number | null; supply_price: number | null;
      }>>`
        SELECT registration_target_id::text AS target_id, sort_order, sale_price, normal_price, supply_price
        FROM registration_target_options
        WHERE registration_target_id IN (${TARGET_ID}::uuid, ${SECOND_TARGET_ID}::uuid, ${THIRD_TARGET_ID}::uuid)
        ORDER BY registration_target_id
      `;
      const second = await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      const rerunTarget = await tx.$queryRaw<Array<{ display_name: string; registration_input: unknown }>>`
        SELECT display_name, registration_input FROM registration_targets WHERE id = ${TARGET_ID}::uuid
      `;
      const rerunSelections = await tx.$queryRaw<Array<{
        target_id: string; sort_order: number; sale_price: number | null; normal_price: number | null; supply_price: number | null;
      }>>`
        SELECT registration_target_id::text AS target_id, sort_order, sale_price, normal_price, supply_price
        FROM registration_target_options
        WHERE registration_target_id IN (${TARGET_ID}::uuid, ${SECOND_TARGET_ID}::uuid, ${THIRD_TARGET_ID}::uuid)
        ORDER BY registration_target_id
      `;
      return { first, preservedTarget, selections, second, rerunTarget, rerunSelections };
    });

    expect(result.first).toEqual({ affectedRows: 2, details: { linkedTargets: 2, importedExecutions: 0, outcome: 'contracted' } });
    expect(result.preservedTarget).toEqual({
      display_name: 'Edited existing target', registration_input: { preserve: 'target' },
    });
    expect(result.selections).toEqual([
      { target_id: TARGET_ID, sort_order: 9, sale_price: 77777, normal_price: 88888, supply_price: 66666 },
      { target_id: SECOND_TARGET_ID, sort_order: 0, sale_price: 13000, normal_price: null, supply_price: null },
      { target_id: THIRD_TARGET_ID, sort_order: 0, sale_price: 14500, normal_price: null, supply_price: null },
    ]);
    expect(result.second).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
    expect(result.rerunTarget).toEqual([result.preservedTarget]);
    expect(result.rerunSelections).toEqual(result.selections);
  }, 60_000);

  it.each([
    { label: 'cancelled', status: 'cancelled', closedAt: CLOSED_AT, isDeleted: false, deletedAt: null },
    { label: 'deleted', status: 'submitting', closedAt: null, isDeleted: true, deletedAt: DELETED_AT },
  ])('preserves unresolved receipt history on an archived $label target', async ({ status, closedAt, isDeleted, deletedAt }) => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status, closedAt, isDeleted, deletedAt,
        submissionKey: 'terminal-attempt', payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
        providerOutcome: 'uncertain', providerSubmissionId: 'provider-terminal', registrationResult: RECEIPT,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'terminal-attempt', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'reconciling', providerOutcome: 'uncertain',
        providerSubmissionId: 'provider-terminal', resultJson: RECEIPT,
      });

      await registrationTargetCutoverMigration.run(tx, { target: 'office' });

      const [target] = await tx.$queryRaw<Array<{ archived_at: Date | null }>>`
        SELECT archived_at FROM registration_targets WHERE id = ${TARGET_ID}::uuid
      `;
      const executions = await tx.$queryRaw<Array<{
        id: string; registration_target_id: string; status: string; provider_outcome: string;
        provider_submission_id: string | null; result_json: unknown;
      }>>`
        SELECT id::text AS id, registration_target_id::text AS registration_target_id, status,
          provider_outcome, provider_submission_id, result_json
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
      return { target, executions };
    });

    expect(result.target).toEqual({ archived_at: isDeleted ? DELETED_AT : CLOSED_AT });
    expect(result.executions).toEqual([{
      id: EXISTING_EXECUTION_ID, registration_target_id: TARGET_ID, status: 'reconciling',
      provider_outcome: 'uncertain', provider_submission_id: 'provider-terminal', result_json: RECEIPT,
    }]);
  }, 60_000);

  it('rejects multiple, partial, and conflicting approval destinations before changing the schema', async () => {
    const conflict = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await createExecutionApprovalColumns(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'submitting', reviewHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, submissionKey: 'approved-attempt',
        approvedAt: UPDATED_AT, approvedBy: null,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'approved-attempt', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'prepared', providerOutcome: 'not_attempted',
        destinationReviewHash: 'different-hash',
      });
      await tx.$executeRaw`SAVEPOINT registration_target_cutover`;
      await expect(registrationTargetCutoverMigration.run(tx, { target: 'office' }))
        .rejects.toThrow(/approval destination conflicts/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT registration_target_cutover`;
      const [target] = await tx.$queryRaw<Array<{ review_payload_hash: string | null }>>`
        SELECT review_payload_hash FROM product_preparations WHERE id = ${TARGET_ID}::uuid
      `;
      const [executionCount] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM product_registration_executions
        WHERE product_preparation_id = ${TARGET_ID}::uuid
      `;
      const [renamed] = await tx.$queryRaw<Array<{ present: boolean }>>`
        SELECT to_regclass('registration_targets') IS NOT NULL AS present
      `;
      return { target, executionCount: Number(executionCount?.count ?? 0), renamed: renamed?.present };
    });
    expect(conflict).toEqual({
      target: { review_payload_hash: PAYLOAD.hash }, executionCount: 1, renamed: false,
    });

    await expect(withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, { salesProductId: PRODUCT_ID, approvedAt: UPDATED_AT });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/no review hash/);

    await expect(withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'submitting', reviewHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, submissionKey: 'approved-attempt',
        approvedBy: EXISTING_EXECUTION_ID,
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'approved-attempt', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'prepared', providerOutcome: 'not_attempted',
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/no approval time/);
  }, 60_000);

  it('moves a review hash to the unique execution planned by this cutover', async () => {
    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'draft', reviewHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash,
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{
        registration_target_id: string; status: string; request_hash: string;
        review_payload_hash: string | null; approved_at: Date | null; approved_by_user_id: string | null;
      }>>`
        SELECT registration_target_id::text AS registration_target_id, status, request_hash,
          review_payload_hash, approved_at, approved_by_user_id::text AS approved_by_user_id
        FROM product_registration_executions WHERE registration_target_id = ${TARGET_ID}::uuid
      `;
    });

    expect(result).toEqual([{
      registration_target_id: TARGET_ID, status: 'prepared', request_hash: PAYLOAD.hash,
      review_payload_hash: PAYLOAD.hash, approved_at: null, approved_by_user_id: null,
    }]);
  }, 60_000);

  it('rejects multiple matching executions and mixed physical table names', async () => {
    await expect(withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, {
        salesProductId: PRODUCT_ID, status: 'submitting', reviewHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, submissionKey: 'same-request',
      });
      await seedExecution(tx, {
        id: EXISTING_EXECUTION_ID, idempotencyKey: 'same-request', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'reconciling', providerOutcome: 'uncertain',
      });
      await seedExecution(tx, {
        id: OTHER_EXECUTION_ID, idempotencyKey: 'another-key', requestHash: PAYLOAD.hash,
        payload: PAYLOAD.payload, payloadHash: PAYLOAD.hash, status: 'failed', providerOutcome: 'definitive_failure',
      });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/Multiple registration executions/);

    await expect(withLegacyOffice(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE registration_targets (id uuid) ON COMMIT DROP`;
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/absent or mixed/);
  }, 60_000);

  it('does not guess a deleted archive time and preserves unrelated closure timestamps', async () => {
    await expect(withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, { salesProductId: PRODUCT_ID, isDeleted: true, deletedAt: null });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/no exact deleted_at/);

    await expect(withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, { salesProductId: PRODUCT_ID, status: 'cancelled', closedAt: null });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow(/no exact closed_at/);

    const result = await withLegacyOffice(async (tx) => {
      await createLegacySellingCatalog(tx);
      await seedTarget(tx, { salesProductId: PRODUCT_ID, closedAt: CLOSED_AT });
      await seedTarget(tx, { id: SECOND_TARGET_ID, salesProductId: PRODUCT_ID, isDeleted: true, deletedAt: DELETED_AT });
      await registrationTargetCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{ id: string; archived_at: Date | null }>>`
        SELECT id::text AS id, archived_at FROM registration_targets ORDER BY id
      `;
    });
    expect(result).toEqual([
      { id: TARGET_ID, archived_at: CLOSED_AT },
      { id: SECOND_TARGET_ID, archived_at: DELETED_AT },
    ]);
  }, 60_000);

  it('accepts an already fresh registration-target schema without modifying it', async () => {
    const result = await withTempSchema(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE registration_targets (id uuid PRIMARY KEY, archived_at timestamptz) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE registration_target_options (id uuid PRIMARY KEY, registration_target_id uuid) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE product_registration_executions (id uuid PRIMARY KEY, registration_target_id uuid) ON COMMIT DROP`;
      return registrationTargetCutoverMigration.run(tx, { target: 'local' });
    });
    expect(result).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
  });

  async function withLegacyOffice<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    shape: 'office-0.1.30' | 'post-021' = 'post-021',
  ): Promise<T> {
    return withTempSchema(async (tx) => {
      await createLegacySchema(tx);
      if (shape === 'post-021') {
        await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN sales_product_id uuid`;
        await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN closed_at timestamptz`;
      }
      return work(tx);
    });
  }

  async function withTempSchema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL search_path TO pg_temp`;
      await tx.$executeRaw`CREATE TEMP SEQUENCE kid_item_code_seq AS integer MINVALUE 1 MAXVALUE 99999999 START WITH 1 INCREMENT BY 1 NO CYCLE`;
      const result = await work(tx);
      await tx.$executeRaw`DROP TABLE IF EXISTS registration_targets, registration_target_options,
        product_preparations, product_preparation_options, product_registration_executions,
        sales_products, sales_product_options, channel_accounts, channel_listings,
        master_products, channel_listing_options CASCADE`;
      await tx.$executeRaw`DROP SEQUENCE IF EXISTS kid_item_code_seq`;
      return result;
    }, { timeout: 60_000 });
  }

  async function createLegacySchema(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`CREATE TEMP TABLE channel_accounts (id uuid PRIMARY KEY, organization_id uuid NOT NULL, UNIQUE(id, organization_id)) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE channel_listings (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, channel_account_id uuid NOT NULL,
      source_candidate_id uuid, external_id text NOT NULL
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE product_preparations (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, source_candidate_id uuid,
      channel_account_id uuid NOT NULL, source_content_workspace_id uuid, display_name text,
      registration_input jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'draft', is_deleted boolean NOT NULL DEFAULT false, deleted_at timestamptz,
      channel_listing_id uuid, review_payload_hash text, approved_at timestamptz, approved_by_user_id uuid,
      submission_key text, submission_payload_json jsonb, submission_payload_hash text, provider_outcome text,
      provider_submission_id text, registration_result jsonb, last_error text, submission_lease_token uuid,
      submission_lease_claimed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, organization_id),
      CONSTRAINT product_preparations_id_org_account_key UNIQUE(id, organization_id, channel_account_id)
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE product_registration_executions (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, product_preparation_id uuid,
      channel_account_id uuid NOT NULL, channel_listing_id uuid, execution_kind text NOT NULL DEFAULT 'create',
      idempotency_key text NOT NULL, request_hash text NOT NULL, submission_payload_json jsonb,
      submission_payload_hash text, status text NOT NULL, provider_outcome text NOT NULL,
      provider_submission_id text, external_listing_id text, result_json jsonb, last_error_message text,
      lease_token uuid, lease_claimed_at timestamptz, requested_by_user_id uuid, started_at timestamptz,
      completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT product_registration_executions_product_preparation_id_fkey
        FOREIGN KEY (product_preparation_id, organization_id, channel_account_id)
        REFERENCES product_preparations(id, organization_id, channel_account_id)
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE INDEX product_registration_executions_product_preparation_id_idx ON product_registration_executions(product_preparation_id)`;
    await tx.$executeRaw`CREATE TEMP TABLE master_products (code text) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE channel_listing_options (kid_item_code text) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO channel_accounts (id, organization_id) VALUES (${ACCOUNT_ID}::uuid, ${ORGANIZATION_ID}::uuid)`;
  }

  async function createLegacySellingCatalog(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS sales_product_id uuid`;
    await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS closed_at timestamptz`;
    await tx.$executeRaw`CREATE TEMP TABLE sales_products (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, code varchar(60) NOT NULL, name varchar(255) NOT NULL,
      source_candidate_id uuid, option_axes text[] NOT NULL DEFAULT '{}', image_urls text[] NOT NULL DEFAULT '{}',
      detail_html text, source_raw jsonb, status text NOT NULL DEFAULT 'active', version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, organization_id)
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE sales_product_options (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL, option_code varchar(80) NOT NULL,
      "values" text[] NOT NULL DEFAULT '{}', option_key varchar(500) NOT NULL, sale_price integer NOT NULL,
      normal_price integer, supply_status text NOT NULL DEFAULT 'selling', sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO sales_products (id, organization_id, code, name) VALUES
      (${PRODUCT_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'KID00000001', 'Existing toy')`;
  }

  async function createLegacyOptionsTable(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`CREATE TEMP TABLE product_preparation_options (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, product_preparation_id uuid NOT NULL,
      sales_product_option_id uuid NOT NULL, sort_order integer NOT NULL DEFAULT 0,
      sale_price integer, normal_price integer, supply_price integer,
      CONSTRAINT product_preparation_options_product_preparation_id_fkey
        FOREIGN KEY (product_preparation_id, organization_id) REFERENCES product_preparations(id, organization_id)
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE INDEX product_preparation_options_sales_product_option_id_idx
      ON product_preparation_options(sales_product_option_id)`;
  }

  async function createExecutionApprovalColumns(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN review_payload_hash text`;
    await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN approved_at timestamptz`;
    await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN approved_by_user_id uuid`;
  }

  async function seedTarget(tx: Prisma.TransactionClient, input: {
    id?: string; salesProductId?: string | null; status?: string; isDeleted?: boolean;
    deletedAt?: Date | null; closedAt?: Date | null; channelListingId?: string | null;
    reviewHash?: string | null; approvedAt?: Date | null; approvedBy?: string | null;
    submissionKey?: string | null; payload?: unknown | null; payloadHash?: string | null;
    providerOutcome?: string | null; providerSubmissionId?: string | null; registrationResult?: unknown | null;
    leaseToken?: string | null; leaseClaimedAt?: Date | null; registrationInput?: unknown;
    displayName?: string; office0130?: boolean;
  } = {}): Promise<void> {
    if (input.office0130) {
      await tx.$executeRaw`
        INSERT INTO product_preparations (
          id, organization_id, source_candidate_id, channel_account_id, display_name, registration_input,
          status, is_deleted, deleted_at, channel_listing_id, review_payload_hash, approved_at,
          approved_by_user_id, submission_key, submission_payload_json, submission_payload_hash,
          provider_outcome, provider_submission_id, registration_result, submission_lease_token,
          submission_lease_claimed_at, updated_at
        ) VALUES (
          ${input.id ?? TARGET_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${SOURCE_ID}::uuid, ${ACCOUNT_ID}::uuid,
          ${input.displayName ?? 'Legacy target'}, ${JSON.stringify(input.registrationInput ?? {})}::jsonb,
          ${input.status ?? 'draft'}, ${input.isDeleted ?? false}, ${input.deletedAt ?? null},
          ${input.channelListingId ?? null}::uuid, ${input.reviewHash ?? null}, ${input.approvedAt ?? null},
          ${input.approvedBy ?? null}::uuid, ${input.submissionKey ?? null},
          ${input.payload == null ? null : JSON.stringify(input.payload)}::jsonb, ${input.payloadHash ?? null},
          ${input.providerOutcome ?? null}, ${input.providerSubmissionId ?? null},
          ${input.registrationResult == null ? null : JSON.stringify(input.registrationResult)}::jsonb,
          ${input.leaseToken ?? null}::uuid, ${input.leaseClaimedAt ?? null}, ${UPDATED_AT}
        )
      `;
      return;
    }
    await tx.$executeRaw`
      INSERT INTO product_preparations (
        id, organization_id, source_candidate_id, channel_account_id, display_name, registration_input,
        sales_product_id, status, is_deleted, deleted_at, closed_at, channel_listing_id,
        review_payload_hash, approved_at, approved_by_user_id, submission_key, submission_payload_json,
        submission_payload_hash, provider_outcome, provider_submission_id, registration_result,
        submission_lease_token, submission_lease_claimed_at, updated_at
      ) VALUES (
        ${input.id ?? TARGET_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${SOURCE_ID}::uuid, ${ACCOUNT_ID}::uuid,
        ${input.displayName ?? 'Legacy target'}, ${JSON.stringify(input.registrationInput ?? {})}::jsonb,
        ${input.salesProductId ?? null}::uuid, ${input.status ?? 'draft'}, ${input.isDeleted ?? false},
        ${input.deletedAt ?? null}, ${input.closedAt ?? null}, ${input.channelListingId ?? null}::uuid,
        ${input.reviewHash ?? null}, ${input.approvedAt ?? null}, ${input.approvedBy ?? null}::uuid,
        ${input.submissionKey ?? null}, ${input.payload == null ? null : JSON.stringify(input.payload)}::jsonb,
        ${input.payloadHash ?? null}, ${input.providerOutcome ?? null}, ${input.providerSubmissionId ?? null},
        ${input.registrationResult == null ? null : JSON.stringify(input.registrationResult)}::jsonb,
        ${input.leaseToken ?? null}::uuid, ${input.leaseClaimedAt ?? null}, ${UPDATED_AT}
      )
    `;
  }

  async function seedExecution(tx: Prisma.TransactionClient, input: {
    id: string; targetId?: string; idempotencyKey: string; requestHash: string; payload?: unknown | null; payloadHash?: string | null;
    status: string; providerOutcome: string; providerSubmissionId?: string | null; resultJson?: unknown | null;
    leaseToken?: string | null; leaseClaimedAt?: Date | null; destinationReviewHash?: string | null;
  }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO product_registration_executions (
        id, organization_id, product_preparation_id, channel_account_id, idempotency_key, request_hash,
        submission_payload_json, submission_payload_hash, status, provider_outcome, provider_submission_id,
        external_listing_id, result_json, lease_token, lease_claimed_at, created_at, updated_at
        ${input.destinationReviewHash === undefined ? Prisma.empty : Prisma.sql`, review_payload_hash`}
      ) VALUES (
        ${input.id}::uuid, ${ORGANIZATION_ID}::uuid, ${input.targetId ?? TARGET_ID}::uuid, ${ACCOUNT_ID}::uuid,
        ${input.idempotencyKey}, ${input.requestHash},
        ${input.payload == null ? null : JSON.stringify(input.payload)}::jsonb, ${input.payloadHash ?? null},
        ${input.status}, ${input.providerOutcome}, ${input.providerSubmissionId ?? null},
        ${input.resultJson == null ? null : 'provider-receipt'},
        ${input.resultJson == null ? null : JSON.stringify(input.resultJson)}::jsonb,
        ${input.leaseToken ?? null}::uuid, ${input.leaseClaimedAt ?? null}, ${UPDATED_AT}, ${UPDATED_AT}
        ${input.destinationReviewHash === undefined ? Prisma.empty : Prisma.sql`, ${input.destinationReviewHash}`}
      )
    `;
  }

  async function insertLegacyOverride(
    tx: Prisma.TransactionClient,
    id: string,
    salePrice: number | null,
    priceRateBp: number | null,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO sales_product_channel_overrides (
        id, organization_id, sales_product_id, channel_account_id, name, adapter_values,
        sale_price, price_rate_bp, detail_html, promo_text, notice_category, stock_percent
      ) VALUES (
        ${id}::uuid, ${ORGANIZATION_ID}::uuid, ${PRODUCT_ID}::uuid, ${ACCOUNT_ID}::uuid,
        'Legacy override', ${JSON.stringify({ title: 'Preserve adapter values' })}::jsonb,
        ${salePrice}, ${priceRateBp}, '<p>legacy detail</p>', 'legacy promo', '01', 80
      )
    `;
  }
});
