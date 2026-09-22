import { ChannelIntegrityAdapter } from '../../../apps/server/src/channels/adapter/out/integrity/channel-integrity.adapter';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { allocateKidItemCode } from '../../../apps/server/src/common/kid-item-code';
import {
  freezeProductRegistrationPayload,
  hashRegistrationSubmissionPayload,
} from '../../../apps/server/src/channels/domain/registration/registration-submission-payload';
import { alignAllocator } from './019_prepare_selling_catalog_sources';
import type { DataMigration } from '../types';

const channelIntegrity = new ChannelIntegrityAdapter();

type Row = Record<string, unknown>;
type StoredRow = { row: Row };
type Option = { id: string; values: string[]; sale_price: number; normal_price: number | null; sort_order: number };
/**
 * Writer-stopped replacement for 018/021. It reads legacy physical names,
 * moves execution and approval evidence, links the reusable target, then
 * renames the tables and foreign-key columns in place before schema push.
 */
export const registrationTargetCutoverMigration: DataMigration = {
  id: 'v0.1.31:022_registration_target_cutover',
  releaseVersion: '0.1.31',
  name: 'Preserve registration targets and execution evidence across schema contraction',
  phase: 'pre-schema',
  async run(tx) {
    const shape = await readShape(tx);
    if (shape.newTarget && !shape.oldTarget) {
      assertNewShape(shape);
      return { affectedRows: 0, details: { outcome: 'already_contracted' } };
    }
    if (!shape.oldTarget || shape.newTarget) {
      throw new Error('Registration target tables are absent or mixed; cutover stopped before mutation.');
    }
    assertOldShape(shape);

    const targets = await tx.$queryRaw<StoredRow[]>`
      -- queryraw-tenancy-exempt: validate all organizations in the writer-stopped registration cutover.
      SELECT to_jsonb(target) AS row FROM product_preparations target ORDER BY organization_id, id
    `;
    const sourceRows = targets.map(({ row }) => row);
    validateTargetArchiveState(sourceRows);
    const executionPlan = await planLegacyExecutions(tx, sourceRows);
    validateTargetApprovals(sourceRows, executionPlan);

    await expandSellingCatalog(tx);
    await expandExecutionApprovalColumns(tx);
    await alignAllocator(tx);
    const linkedTargets = await linkTargets(tx, sourceRows);
    const importedExecutions = await persistLegacyExecutions(tx, executionPlan);
    await moveTargetApprovals(tx, sourceRows);
    await preserveTargetArchiveState(tx, sourceRows);
    await assertExecutionFence(tx);
    await assertTargetCatalogFence(tx);
    await renameTargetSchema(tx);

    return {
      affectedRows: linkedTargets + importedExecutions,
      details: {
        linkedTargets,
        importedExecutions,
        outcome: 'contracted',
      },
    };
  },
};

async function readShape(tx: Prisma.TransactionClient) {
  const [tables] = await tx.$queryRaw<Array<{
    old_target: boolean; new_target: boolean; old_options: boolean; new_options: boolean;
    executions: boolean; old_execution_fk: boolean; new_execution_fk: boolean;
    old_option_fk: boolean; new_option_fk: boolean; new_option_relation_fk: boolean; closed_at: boolean; archived_at: boolean;
  }>>`
    SELECT to_regclass('product_preparations') IS NOT NULL AS old_target,
      to_regclass('registration_targets') IS NOT NULL AS new_target,
      to_regclass('product_preparation_options') IS NOT NULL AS old_options,
      to_regclass('registration_target_options') IS NOT NULL AS new_options,
      to_regclass('product_registration_executions') IS NOT NULL AS executions,
      CASE WHEN to_regclass('product_registration_executions') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_registration_executions')
          AND a.attname = 'product_preparation_id' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS old_execution_fk,
      CASE WHEN to_regclass('product_registration_executions') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_registration_executions')
          AND a.attname = 'registration_target_id' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS new_execution_fk,
      CASE WHEN to_regclass('product_preparation_options') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_preparation_options')
          AND a.attname = 'product_preparation_id' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS old_option_fk,
      CASE WHEN to_regclass('product_preparation_options') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_preparation_options')
          AND a.attname = 'registration_target_id' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS new_option_fk,
      CASE WHEN to_regclass('registration_target_options') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('registration_target_options')
          AND a.attname = 'registration_target_id' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS new_option_relation_fk,
      CASE WHEN to_regclass('product_preparations') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_preparations')
          AND a.attname = 'closed_at' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS closed_at,
      CASE WHEN to_regclass('product_preparations') IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('product_preparations')
          AND a.attname = 'archived_at' AND a.attnum > 0 AND NOT a.attisdropped
      ) END AS archived_at
  `;
  return {
    oldTarget: Boolean(tables?.old_target), newTarget: Boolean(tables?.new_target),
    oldOptions: Boolean(tables?.old_options), newOptions: Boolean(tables?.new_options),
    executions: Boolean(tables?.executions), oldExecutionFk: Boolean(tables?.old_execution_fk),
    newExecutionFk: Boolean(tables?.new_execution_fk), oldOptionFk: Boolean(tables?.old_option_fk),
    newOptionFk: Boolean(tables?.new_option_fk), newOptionRelationFk: Boolean(tables?.new_option_relation_fk),
    closedAt: Boolean(tables?.closed_at),
    archivedAt: Boolean(tables?.archived_at),
  };
}

type Shape = Awaited<ReturnType<typeof readShape>>;

function assertOldShape(shape: Shape): void {
  if (shape.newOptions || shape.newExecutionFk || shape.newOptionFk || shape.archivedAt) {
    throw new Error('Mixed legacy and registration-target columns block cutover.');
  }
  if (!shape.executions || !shape.oldExecutionFk || !shape.oldTarget) {
    throw new Error('Legacy registration execution foreign key is incomplete.');
  }
  if (shape.oldOptions && !shape.oldOptionFk) {
    throw new Error('Legacy registration option table has an incomplete foreign key.');
  }
}

function assertNewShape(shape: Shape): void {
  if (shape.oldOptions || shape.oldExecutionFk || shape.oldOptionFk || shape.closedAt) {
    throw new Error('Mixed legacy and registration-target columns block cutover.');
  }
  if (!shape.newOptions || !shape.executions || !shape.newExecutionFk || !shape.newOptionRelationFk || shape.newOptionFk) {
    throw new Error('Fresh registration-target schema is incomplete.');
  }
}

type PlannedExecution = {
  target: Row;
  organizationId: string;
  targetId: string;
  accountId: string;
  executionId: string;
  requestHash: string;
  idempotencyKey: string;
  payload: unknown | null;
  payloadHash: string | null;
  status: 'prepared' | 'reconciling' | 'failed' | 'succeeded' | 'cancelled';
  providerOutcome: 'not_attempted' | 'uncertain' | 'definitive_failure' | 'succeeded';
  providerSubmissionId: string | null;
  externalListingId: string | null;
  listingId: string | null;
  resultJson: unknown | null;
  lastError: string | null;
  leaseToken: string | null;
  leaseClaimedAt: Date | null;
  requestedByUserId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  legacyStatus: string;
  legacyOutcome: string | null;
  hasReceipt: boolean;
  insert: boolean;
  downgradeInferred018Success: boolean;
  existing?: Row;
};

async function planLegacyExecutions(tx: Prisma.TransactionClient, targets: Row[]): Promise<PlannedExecution[]> {
  const result: PlannedExecution[] = [];
  for (const target of targets) {
    const organizationId = requiredString(target.organization_id, 'registration organization');
    const targetId = requiredString(target.id, 'registration target');
    const accountId = requiredString(target.channel_account_id, 'registration account');
    const legacyStatus = optionalString(target.status) ?? (target.closed_at != null ? 'cancelled' : 'draft');
    const legacyOutcome = optionalString(target.provider_outcome);
    const payloadJson = target.submission_payload_json ?? null;
    const suppliedPayloadHash = optionalString(target.submission_payload_hash);
    const reviewedHash = optionalString(target.review_payload_hash);
    let payload: unknown | null = payloadJson;
    let payloadHash = suppliedPayloadHash;
    let requestHash: string;
    if (payloadJson != null) {
      const frozen = freezeProductRegistrationPayload(payloadJson as Parameters<typeof freezeProductRegistrationPayload>[0], channelIntegrity.sha256);
      if (suppliedPayloadHash != null && suppliedPayloadHash !== frozen.hash) {
        throw new Error(`Registration payload hash conflicts for target ${targetId}.`);
      }
      payload = frozen.payload;
      payloadHash = frozen.hash;
      requestHash = frozen.hash;
    } else if (suppliedPayloadHash != null) {
      requestHash = suppliedPayloadHash;
    } else if (reviewedHash != null) {
      requestHash = reviewedHash;
    } else {
      requestHash = hashRegistrationSubmissionPayload({ kind: 'legacy_registration_receipt', targetId, accountId }, channelIntegrity.sha256);
    }
    if (reviewedHash != null && reviewedHash !== requestHash) {
      throw new Error(`Registration approval hash conflicts with request evidence for target ${targetId}.`);
    }

    const submissionKey = optionalString(target.submission_key);
    const idempotencyKey = submissionKey ?? `legacy-target:${targetId}:${requestHash.slice(0, 32)}`;
    const existingRows = await tx.$queryRaw<StoredRow[]>`
      -- queryraw-tenancy-exempt: match preserved ledger evidence during the writer-stopped cutover.
      SELECT to_jsonb(execution) AS row FROM product_registration_executions execution
      WHERE execution.organization_id = ${organizationId}::uuid
        AND execution.product_preparation_id = ${targetId}::uuid
      ORDER BY execution.created_at, execution.id
    `;
    const matching = existingRows.filter(({ row }) => row.idempotency_key === idempotencyKey
      || row.request_hash === requestHash);
    if (matching.length > 1) throw new Error(`Multiple registration executions match target ${targetId}.`);
    const existing = matching[0]?.row;
    const isTargetAttempt = !['draft', 'cancelled'].includes(legacyStatus) || submissionKey != null
      || reviewedHash != null || payloadJson != null
      || suppliedPayloadHash != null || target.provider_submission_id != null || target.registration_result != null
      || target.submission_lease_token != null || target.submission_lease_claimed_at != null
      || (legacyOutcome != null && legacyOutcome !== 'not_attempted');
    if (!existing && !isTargetAttempt) continue;

    const sourceListingId = optionalString(target.channel_listing_id) ?? optionalString(existing?.channel_listing_id);
    const scopedListing = sourceListingId
      ? await readScopedListing(tx, organizationId, accountId, optionalString(target.source_candidate_id), sourceListingId)
      : null;
    const hasReceipt = target.provider_submission_id != null || target.registration_result != null;
    const sourceRegistered = legacyStatus === 'registered';
    const safeSuccess = (sourceRegistered || existing?.status === 'succeeded') && scopedListing !== null;
    if ((sourceRegistered || existing?.status === 'succeeded') && sourceListingId && !scopedListing) {
      const foreign = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM channel_listings WHERE id = ${sourceListingId}::uuid
      `;
      if (foreign.length) throw new Error(`Registered target ${targetId} points to a listing outside its account scope.`);
    }

    let status: PlannedExecution['status'];
    let providerOutcome: PlannedExecution['providerOutcome'];
    if (safeSuccess) {
      status = 'succeeded';
      providerOutcome = 'succeeded';
    } else if (legacyOutcome === 'definitive_failure') {
      status = 'failed';
      providerOutcome = 'definitive_failure';
    } else if ((target.is_deleted === true || target.closed_at != null || legacyStatus === 'cancelled')
      && !hasUnresolvedProviderEvidence(target, existing, legacyOutcome, hasReceipt)) {
      status = 'cancelled';
      providerOutcome = 'not_attempted';
    } else if ((legacyStatus !== 'draft' && legacyStatus !== 'cancelled') || hasReceipt
      || hasUnresolvedProviderEvidence(target, existing, legacyOutcome, hasReceipt)) {
      status = 'reconciling';
      providerOutcome = 'uncertain';
    } else if (isTargetAttempt) {
      status = 'prepared';
      providerOutcome = 'not_attempted';
    } else {
      status = 'prepared';
      providerOutcome = 'not_attempted';
    }

    let downgradeInferred018Success = false;
    if (existing) {
      downgradeInferred018Success = isProvable018InferredSuccess({
        existing,
        target,
        legacyOutcome,
        sourceRegistered,
        hasReceipt,
        submissionKey,
        requestHash,
        payloadHash,
      });
      validateExistingExecution(existing, target, {
        organizationId, targetId, accountId, requestHash, idempotencyKey,
        payloadHash, sourceListingId: safeSuccess ? scopedListing!.id : null,
        sourceExternalListingId: safeSuccess ? scopedListing!.external_id : null,
      }, downgradeInferred018Success);
      if (existing.status === 'succeeded' && !safeSuccess) {
        if (downgradeInferred018Success) {
          status = 'reconciling';
          providerOutcome = 'uncertain';
        } else {
          throw new Error(`Canonical success conflicts with missing scoped listing evidence for target ${targetId}.`);
        }
      }
    }

    const existingId = existing ? requiredString(existing.id, 'execution id') : randomUUID();
    const completedAt = safeSuccess
      ? (dateValue(target.updated_at) ?? new Date())
      : status === 'cancelled'
        ? (target.is_deleted === true ? dateValue(target.deleted_at) : dateValue(target.closed_at))
        : null;
    result.push({
      target, organizationId, targetId, accountId, executionId: existingId, requestHash, idempotencyKey,
      payload, payloadHash, status, providerOutcome,
      providerSubmissionId: optionalString(target.provider_submission_id),
      externalListingId: safeSuccess ? scopedListing!.external_id : resultExternalListingId(target.registration_result),
      listingId: safeSuccess ? scopedListing!.id : null,
      resultJson: target.registration_result ?? null,
      lastError: optionalString(target.last_error),
      leaseToken: optionalString(target.submission_lease_token),
      leaseClaimedAt: dateValue(target.submission_lease_claimed_at),
      requestedByUserId: optionalString(target.approved_by_user_id),
      startedAt: dateValue(target.submission_lease_claimed_at),
      completedAt,
      legacyStatus, legacyOutcome, hasReceipt, insert: existing == null, existing,
      downgradeInferred018Success,
    });
  }
  return result;
}

async function readScopedListing(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountId: string,
  sourceCandidateId: string | null,
  listingId: string,
): Promise<{ id: string; external_id: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; external_id: string }>>`
    -- queryraw-tenancy-exempt: the writer-stopped cutover verifies persisted registration success scope.
    SELECT id, external_id FROM channel_listings WHERE id = ${listingId}::uuid
      AND organization_id = ${organizationId}::uuid AND channel_account_id = ${accountId}::uuid
      AND source_candidate_id IS NOT DISTINCT FROM ${sourceCandidateId}::uuid
  `;
  return rows[0] ?? null;
}

function validateExistingExecution(existing: Row, target: Row, expected: {
  organizationId: string; targetId: string; accountId: string; requestHash: string; idempotencyKey: string;
  payloadHash: string | null; sourceListingId: string | null; sourceExternalListingId: string | null;
}, allowInferred018Outcome = false): void {
  if (existing.channel_account_id !== expected.accountId) {
    throw new Error(`Registration cutover found conflicting channel_account_id for target ${expected.targetId}.`);
  }
  if (existing.request_hash !== expected.requestHash) {
    throw new Error(`Registration cutover found conflicting request_hash for target ${expected.targetId}.`);
  }
  const sourceIdempotencyKey = optionalString(target.submission_key);
  if (sourceIdempotencyKey != null && existing.idempotency_key !== sourceIdempotencyKey) {
    throw new Error(`Registration cutover found conflicting idempotency_key for target ${expected.targetId}.`);
  }
  const sourcePayloadHash = optionalString(target.submission_payload_hash) ?? expected.payloadHash;
  if (sourcePayloadHash != null && existing.submission_payload_hash !== sourcePayloadHash) {
    throw new Error(`Registration cutover found conflicting submission_payload_hash for target ${expected.targetId}.`);
  }
  if (target.submission_payload_json != null) {
    const canonicalPayloadHash = expected.payloadHash;
    if (canonicalPayloadHash == null || existing.submission_payload_json == null
      || existing.submission_payload_hash !== canonicalPayloadHash
      || hashRegistrationSubmissionPayload(existing.submission_payload_json, channelIntegrity.sha256) !== canonicalPayloadHash) {
      throw new Error(`Registration cutover found missing or conflicting submission_payload_json for target ${expected.targetId}.`);
    }
  }
  const sourceListingId = optionalString(target.channel_listing_id);
  if (sourceListingId != null && existing.channel_listing_id !== sourceListingId) {
    throw new Error(`Registration cutover found conflicting channel_listing_id for target ${expected.targetId}.`);
  }
  const sourceProviderId = optionalString(target.provider_submission_id);
  if (sourceProviderId != null && existing.provider_submission_id !== sourceProviderId) {
    throw new Error(`Registration cutover found conflicting provider_submission_id for target ${expected.targetId}.`);
  }
  if (expected.sourceListingId != null && existing.channel_listing_id != null && existing.channel_listing_id !== expected.sourceListingId) {
    throw new Error(`Registration cutover found conflicting channel_listing_id for target ${expected.targetId}.`);
  }
  if (expected.sourceExternalListingId != null && existing.external_listing_id != null
    && existing.external_listing_id !== expected.sourceExternalListingId) {
    throw new Error(`Registration cutover found conflicting external_listing_id for target ${expected.targetId}.`);
  }
  if (target.registration_result != null) {
    if (existing.result_json == null
      || hashRegistrationSubmissionPayload(target.registration_result, channelIntegrity.sha256)
        !== hashRegistrationSubmissionPayload(existing.result_json, channelIntegrity.sha256)) {
      throw new Error(`Registration cutover found conflicting provider result for target ${expected.targetId}.`);
    }
    const sourceExternalListingId = resultExternalListingId(target.registration_result);
    if (sourceExternalListingId != null && existing.external_listing_id !== sourceExternalListingId) {
      throw new Error(`Registration cutover found conflicting external_listing_id for target ${expected.targetId}.`);
    }
  }
  const sourceLeaseToken = optionalString(target.submission_lease_token);
  if (sourceLeaseToken != null && existing.lease_token !== sourceLeaseToken) {
    throw new Error(`Registration cutover found conflicting submission_lease_token for target ${expected.targetId}.`);
  }
  const sourceLeaseClaimedAt = dateValue(target.submission_lease_claimed_at);
  if (sourceLeaseClaimedAt != null && !sameValue(existing.lease_claimed_at, sourceLeaseClaimedAt)) {
    throw new Error(`Registration cutover found conflicting submission lease time for target ${expected.targetId}.`);
  }
  const sourceOutcome = optionalString(target.provider_outcome);
  if (sourceOutcome != null && sourceOutcome !== 'not_attempted'
    && existing.provider_outcome !== sourceOutcome
    && !allowInferred018Outcome) {
    throw new Error(`Registration cutover found conflicting provider_outcome for target ${expected.targetId}.`);
  }
}

function isProvable018InferredSuccess(input: {
  existing: Row;
  target: Row;
  legacyOutcome: string | null;
  sourceRegistered: boolean;
  hasReceipt: boolean;
  submissionKey: string | null;
  requestHash: string;
  payloadHash: string | null;
}): boolean {
  const { existing, target } = input;
  const providerSubmissionId = optionalString(target.provider_submission_id);
  const existingProviderSubmissionId = optionalString(existing.provider_submission_id);
  const targetResult = target.registration_result;
  const existingResult = existing.result_json;
  return !input.sourceRegistered
    && (input.legacyOutcome == null || input.legacyOutcome === 'uncertain')
    && input.hasReceipt
    && ['reconciling', 'succeeded'].includes(String(existing.status))
    && existing.provider_outcome === 'succeeded'
    && input.submissionKey != null
    && existing.idempotency_key === input.submissionKey
    && existing.request_hash === input.requestHash
    && (input.payloadHash == null || existing.submission_payload_hash === input.payloadHash)
    && target.channel_listing_id == null
    && existing.channel_listing_id == null
    && existingProviderSubmissionId === providerSubmissionId
    && (targetResult != null
      ? existingResult != null && hashRegistrationSubmissionPayload(targetResult, channelIntegrity.sha256)
        === hashRegistrationSubmissionPayload(existingResult, channelIntegrity.sha256)
      : existingResult == null && providerSubmissionId != null);
}

function hasUnresolvedProviderEvidence(
  target: Row,
  existing: Row | undefined,
  legacyOutcome: string | null,
  hasReceipt: boolean,
): boolean {
  return hasReceipt
    || target.submission_lease_token != null || target.submission_lease_claimed_at != null
    || legacyOutcome === 'uncertain' || legacyOutcome === 'succeeded'
    || ['executing', 'reconciling'].includes(String(existing?.status ?? ''))
    || existing?.provider_outcome === 'uncertain'
    || existing?.provider_submission_id != null || existing?.external_listing_id != null
    || existing?.result_json != null || existing?.lease_token != null || existing?.lease_claimed_at != null;
}

function validateTargetApprovals(targets: Row[], executions: PlannedExecution[]): void {
  for (const target of targets) {
    const targetId = requiredString(target.id, 'registration target');
    const requestHash = optionalString(target.review_payload_hash);
    const approvedAt = dateValue(target.approved_at);
    const approvedBy = optionalString(target.approved_by_user_id);
    if (requestHash == null) {
      if (approvedAt != null || approvedBy != null) {
        throw new Error(`Partial registration approval tuple has no review hash for target ${targetId}.`);
      }
      continue;
    }
    if (approvedBy != null && approvedAt == null) {
      throw new Error(`Partial registration approval tuple has no approval time for target ${targetId}.`);
    }
    const candidates = executions.filter((execution) => execution.targetId === targetId
      && execution.organizationId === String(target.organization_id)
      && execution.requestHash === requestHash);
    if (candidates.length !== 1) {
      throw new Error(`Registration review hash must match exactly one target execution for target ${targetId}.`);
    }
    const existing = candidates[0].existing;
    if (!existing) continue;
    for (const [field, destination, source] of [
      ['review_payload_hash', existing.review_payload_hash, requestHash],
      ['approved_at', dateValue(existing.approved_at), approvedAt],
      ['approved_by_user_id', existing.approved_by_user_id, approvedBy],
    ] as const) {
      if (destination != null && (source == null || !sameValue(destination, source))) {
        throw new Error(`Registration approval destination conflicts for ${field} on target ${targetId}.`);
      }
    }
  }
}

function validateTargetArchiveState(targets: Row[]): void {
  for (const target of targets) {
    const targetId = requiredString(target.id, 'registration target');
    const status = optionalString(target.status) ?? (target.closed_at != null ? 'cancelled' : 'draft');
    if (target.is_deleted === true && dateValue(target.deleted_at) == null) {
      throw new Error(`Deleted registration target ${targetId} has no exact deleted_at timestamp.`);
    }
    if (target.is_deleted !== true && status === 'cancelled' && dateValue(target.closed_at) == null) {
      throw new Error(`Cancelled registration target ${targetId} has no exact closed_at timestamp.`);
    }
  }
}

async function persistLegacyExecutions(tx: Prisma.TransactionClient, plans: PlannedExecution[]): Promise<number> {
  let imported = 0;
  for (const plan of plans) {
    if (plan.insert) {
      await tx.$executeRaw`
        INSERT INTO product_registration_executions (
          id, organization_id, product_preparation_id, channel_account_id, channel_listing_id,
          execution_kind, idempotency_key, request_hash, submission_payload_json, submission_payload_hash,
          status, provider_outcome, provider_submission_id, external_listing_id, result_json,
          last_error_message, lease_token, lease_claimed_at, requested_by_user_id, started_at,
          completed_at, created_at, updated_at
        ) VALUES (
          ${plan.executionId}::uuid, ${plan.organizationId}::uuid, ${plan.targetId}::uuid, ${plan.accountId}::uuid,
          ${plan.listingId}::uuid, 'create', ${plan.idempotencyKey}, ${plan.requestHash},
          ${plan.payload == null ? null : JSON.stringify(plan.payload)}::jsonb, ${plan.payloadHash},
          ${plan.status}, ${plan.providerOutcome}, ${plan.providerSubmissionId}, ${plan.externalListingId},
          ${plan.resultJson == null ? null : JSON.stringify(plan.resultJson)}::jsonb,
          ${plan.lastError}, ${plan.leaseToken}::uuid, ${plan.leaseClaimedAt}, ${plan.requestedByUserId}::uuid,
          ${plan.startedAt}, ${plan.completedAt}, now(), now()
        )
      `;
      imported++;
      continue;
    }
    if (plan.downgradeInferred018Success && plan.status === 'reconciling'
      && plan.existing?.provider_outcome === 'succeeded') {
      await tx.$executeRaw`
        UPDATE product_registration_executions SET status = 'reconciling', provider_outcome = 'uncertain', completed_at = NULL
        WHERE id = ${plan.executionId}::uuid AND organization_id = ${plan.organizationId}::uuid
          AND product_preparation_id = ${plan.targetId}::uuid AND provider_outcome = 'succeeded'
          AND status IN ('reconciling', 'succeeded')
      `;
      imported++;
    } else if (plan.listingId != null && plan.status === 'succeeded'
      && (plan.existing?.status !== 'succeeded' || plan.existing?.channel_listing_id == null
        || plan.existing?.external_listing_id == null)) {
      await tx.$executeRaw`
        UPDATE product_registration_executions SET status = 'succeeded', provider_outcome = 'succeeded',
          channel_listing_id = ${plan.listingId}::uuid, external_listing_id = ${plan.externalListingId},
          completed_at = COALESCE(completed_at, ${plan.completedAt})
        WHERE id = ${plan.executionId}::uuid AND organization_id = ${plan.organizationId}::uuid
          AND product_preparation_id = ${plan.targetId}::uuid
      `;
      imported++;
    }
  }
  return imported;
}

async function moveTargetApprovals(tx: Prisma.TransactionClient, targets: Row[]): Promise<void> {
  for (const target of targets) {
    const requestHash = optionalString(target.review_payload_hash);
    if (requestHash == null) continue;
    const organizationId = requiredString(target.organization_id, 'registration organization');
    const targetId = requiredString(target.id, 'registration target');
    const approvedAt = dateValue(target.approved_at);
    const approvedBy = optionalString(target.approved_by_user_id);
    await tx.$executeRaw`
      UPDATE product_registration_executions SET
        review_payload_hash = ${requestHash}, approved_at = ${approvedAt}, approved_by_user_id = ${approvedBy}::uuid
      WHERE organization_id = ${organizationId}::uuid AND product_preparation_id = ${targetId}::uuid
        AND request_hash = ${requestHash}
    `;
  }
}

async function preserveTargetArchiveState(tx: Prisma.TransactionClient, targets: Row[]): Promise<void> {
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS closed_at timestamptz`;
  for (const target of targets) {
    const organizationId = requiredString(target.organization_id, 'registration organization');
    const targetId = requiredString(target.id, 'registration target');
    if (target.is_deleted === true) {
      const deletedAt = dateValue(target.deleted_at);
      if (!deletedAt) throw new Error(`Deleted registration target ${targetId} has no exact deleted_at timestamp.`);
      await tx.$executeRaw`
        UPDATE product_preparations SET closed_at = ${deletedAt}
        WHERE id = ${targetId}::uuid AND organization_id = ${organizationId}::uuid
      `;
      continue;
    }
    const plan = await tx.$queryRaw<Array<{ succeeded: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM product_registration_executions execution
        WHERE execution.organization_id = ${organizationId}::uuid
          AND execution.product_preparation_id = ${targetId}::uuid
          AND execution.status = 'succeeded' AND execution.channel_listing_id IS NOT NULL) AS succeeded
    `;
    if (optionalString(target.status) === 'registered' && plan[0]?.succeeded) {
      await tx.$executeRaw`
        UPDATE product_preparations SET closed_at = NULL
        WHERE id = ${targetId}::uuid AND organization_id = ${organizationId}::uuid
      `;
    }
  }
}

async function assertExecutionFence(tx: Prisma.TransactionClient): Promise<void> {
  const [invalid] = await tx.$queryRaw<Array<{ invalid: boolean }>>`
    -- queryraw-tenancy-exempt: verify every account and execution target scope before renaming the target relation.
    SELECT EXISTS(
      SELECT 1 FROM product_preparations target
      LEFT JOIN channel_accounts account ON account.id = target.channel_account_id AND account.organization_id = target.organization_id
      WHERE account.id IS NULL
    ) OR EXISTS(
      SELECT 1 FROM product_registration_executions execution
      LEFT JOIN product_preparations target ON target.id = execution.product_preparation_id
        AND target.organization_id = execution.organization_id AND target.channel_account_id = execution.channel_account_id
      WHERE execution.product_preparation_id IS NOT NULL AND target.id IS NULL
    ) AS invalid
  `;
  if (invalid?.invalid) throw new Error('Registration account or execution target scope blocks cutover.');
}

async function assertTargetCatalogFence(tx: Prisma.TransactionClient): Promise<void> {
  const [invalid] = await tx.$queryRaw<Array<{ invalid: boolean }>>`
    -- queryraw-tenancy-exempt: verify all target/product/option relationships before Prisma adds required owner foreign keys.
    SELECT EXISTS(
      SELECT 1 FROM product_preparations target
      LEFT JOIN sales_products product ON product.id = target.sales_product_id
        AND product.organization_id = target.organization_id
      WHERE target.sales_product_id IS NULL OR product.id IS NULL
    ) OR EXISTS(
      SELECT 1 FROM product_preparation_options selected
      LEFT JOIN product_preparations target ON target.id = selected.product_preparation_id
        AND target.organization_id = selected.organization_id
      LEFT JOIN sales_product_options option_row ON option_row.id = selected.sales_product_option_id
        AND option_row.organization_id = selected.organization_id
      WHERE target.id IS NULL OR option_row.id IS NULL
        OR option_row.sales_product_id IS DISTINCT FROM target.sales_product_id
    ) AS invalid
  `;
  if (invalid?.invalid) {
    throw new Error('Registration target/product or selected product-option relationship blocks cutover.');
  }
}

async function expandExecutionApprovalColumns(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN IF NOT EXISTS review_payload_hash text`;
  await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN IF NOT EXISTS approved_at timestamptz`;
  await tx.$executeRaw`ALTER TABLE product_registration_executions ADD COLUMN IF NOT EXISTS approved_by_user_id uuid`;
}

async function expandSellingCatalog(tx: Prisma.TransactionClient): Promise<void> {
  // Minimal pre-schema shapes; Prisma supplies remaining nullable/defaulted columns.
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS sales_products (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, code varchar(60) NOT NULL, name varchar(255) NOT NULL,
    source_candidate_id uuid, option_axes text[] NOT NULL DEFAULT '{}', image_urls text[] NOT NULL DEFAULT '{}', detail_html text, source_raw jsonb,
    status text NOT NULL DEFAULT 'active', version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS sales_product_options (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL, option_code varchar(80) NOT NULL,
    "values" text[] NOT NULL DEFAULT '{}', option_key varchar(500) NOT NULL, sale_price integer NOT NULL, normal_price integer,
    supply_status text NOT NULL DEFAULT 'selling', sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS product_preparation_options (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, product_preparation_id uuid NOT NULL, sales_product_option_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0, sale_price integer, normal_price integer, supply_price integer)`;
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS sales_product_id uuid`;
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN source_candidate_id DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN source_content_workspace_id DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN display_name DROP NOT NULL`;
  const [legacyPrice] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('sales_products')
      AND attname = 'sale_price' AND attnum > 0 AND NOT attisdropped) AS present
  `;
  if (legacyPrice?.present) await tx.$executeRaw`ALTER TABLE sales_products ALTER COLUMN sale_price DROP NOT NULL`;
}

async function linkTargets(tx: Prisma.TransactionClient, targets: Row[]): Promise<number> {
  let linked = 0;
  const createdByCandidate = new Map<string, string>();
  for (const row of targets) {
    const organizationId = requiredString(row.organization_id, 'registration organization');
    const targetId = requiredString(row.id, 'registration target');
    if (row.sales_product_id != null) continue;
    const input = asRecord(row.registration_input);
    const sourceCandidateId = optionalString(row.source_candidate_id);
    const matches = sourceCandidateId ? await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM sales_products WHERE organization_id = ${organizationId}::uuid
        AND source_candidate_id = ${sourceCandidateId}::uuid
    ` : [];
    if (matches.length > 1) throw new Error('Multiple selling products match one registration target candidate.');
    const plan = registrationBootstrapPlan(input, row.display_name);
    let productId = matches[0]?.id;
    const candidateKey = `${organizationId}:${sourceCandidateId}`;
    if (!productId) {
      productId = randomUUID();
      const code = await allocateKidItemCode(tx);
      await tx.$executeRaw`
        INSERT INTO sales_products (id, organization_id, code, name, source_candidate_id, option_axes, image_urls, detail_html, source_raw)
        VALUES (${productId}::uuid, ${organizationId}::uuid, ${code}, ${plan.name}, ${sourceCandidateId}::uuid,
          ${plan.axes}::text[], ${plan.images}::text[], ${plan.detailHtml},
          ${JSON.stringify({ preparationBootstrap: targetId })}::jsonb)
      `;
      for (const [index, option] of plan.options.entries()) {
        const optionId = randomUUID();
        const optionCode = await allocateKidItemCode(tx);
        await tx.$executeRaw`
          INSERT INTO sales_product_options (id, organization_id, sales_product_id, option_code, "values", option_key, sale_price, normal_price, sort_order)
          VALUES (${optionId}::uuid, ${organizationId}::uuid, ${productId}::uuid, ${optionCode}, ${option.values}::text[],
            ${option.values.join(':')}, ${option.salePrice}, ${option.normalPrice}, ${index})
        `;
      }
      if (sourceCandidateId) createdByCandidate.set(candidateKey, canonicalRegistrationProductMetadata(plan));
    } else if (createdByCandidate.has(candidateKey)
      && createdByCandidate.get(candidateKey) !== canonicalRegistrationProductMetadata(plan)) {
      throw new Error('Ambiguous canonical registration product metadata blocks shared-candidate cutover.');
    }
    const options = await tx.$queryRaw<Option[]>`
      SELECT id, "values", sale_price, normal_price, sort_order FROM sales_product_options
      WHERE organization_id = ${organizationId}::uuid AND sales_product_id = ${productId}::uuid AND supply_status <> 'unused'
      ORDER BY sort_order, id
    `;
    const [product] = await tx.$queryRaw<Array<{ option_axes: string[] }>>`
      SELECT option_axes FROM sales_products WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (JSON.stringify(product?.option_axes) !== JSON.stringify(plan.axes)) {
      throw new Error('Registration option axes conflict with its selling product.');
    }
    for (const [index, option] of plan.options.entries()) {
      const candidates = options.filter((item) => JSON.stringify(item.values) === JSON.stringify(option.values));
      if (candidates.length !== 1) throw new Error('Registration option cannot be linked unambiguously.');
      await insertTargetOption(tx, organizationId, targetId, candidates[0].id, index, option.salePrice, option.normalPrice);
    }
    await tx.$executeRaw`
      UPDATE product_preparations SET sales_product_id = ${productId}::uuid
      WHERE id = ${targetId}::uuid AND organization_id = ${organizationId}::uuid AND sales_product_id IS NULL
    `;
    linked++;
  }
  const overrideCount = await migrateLegacyOverrides(tx);
  return linked + overrideCount;
}

function canonicalRegistrationProductMetadata(plan: ReturnType<typeof registrationBootstrapPlan>): string {
  return JSON.stringify({
    name: plan.name,
    axes: plan.axes,
    images: plan.images,
    detailHtml: plan.detailHtml,
    optionValues: plan.options.map((option) => option.values),
  });
}

function registrationBootstrapPlan(input: Row, fallbackName: unknown) {
  const wing = asRecord(input.wingProduct);
  const name = requiredString(input.name ?? wing.sellerProductName ?? wing.productName ?? fallbackName, 'selling product name');
  const variants = Array.isArray(wing.variants) ? wing.variants : null;
  if (variants?.length === 0) throw new Error('Empty registration variants block cutover.');
  if (!variants && ((Array.isArray(input.optionNames) && input.optionNames.length > 1) || input.options != null)) {
    throw new Error('Registration options have no explicit priced variants.');
  }
  const options = (variants ?? [{ salePrice: input.salePrice, origPrice: input.originalPrice }]).map((raw) => {
    const variant = asRecord(raw);
    const pairs = variant.purchaseOptions ?? variant.options ?? [];
    if (!Array.isArray(pairs)) throw new Error('Invalid registration option values.');
    const axes = pairs.map((pair) => requiredString(asRecord(pair).type, 'registration option axis'));
    const values = pairs.map((pair) => requiredString(asRecord(pair).value, 'registration option value'));
    if (axes.length > 3 || new Set(axes).size !== axes.length) throw new Error('Ambiguous registration option axes.');
    return {
      axes, values, salePrice: numberAmount(variant.salePrice, true),
      normalPrice: variant.origPrice == null ? null : numberAmount(variant.origPrice),
    };
  });
  const axes = options[0]?.axes ?? [];
  if (options.some((option) => JSON.stringify(option.axes) !== JSON.stringify(axes))
    || new Set(options.map((option) => option.values.join(':'))).size !== options.length) {
    throw new Error('Conflicting or duplicate registration options block cutover.');
  }
  if (options.length === 1 && input.salePrice != null && numberAmount(input.salePrice, true) !== options[0].salePrice) {
    throw new Error('Registration prices conflict.');
  }
  const images = [...new Set([
    ...(Array.isArray(input.registrationImages) ? input.registrationImages : []),
    ...(Array.isArray(input.thumbnailUrls) ? input.thumbnailUrls : []),
    ...options.map((_, index) => asRecord(variants?.[index]).representativeImageUrl),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0))];
  return {
    name, axes, images, detailHtml: nullableString(input.description),
    options: options.map(({ values, salePrice, normalPrice }) => ({ values, salePrice, normalPrice })),
  };
}

async function migrateLegacyOverrides(tx: Prisma.TransactionClient): Promise<number> {
  const [shape] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('sales_product_channel_overrides') IS NOT NULL AS present
  `;
  if (!shape?.present) return 0;
  const overrides = await tx.$queryRaw<StoredRow[]>`
    -- queryraw-tenancy-exempt: transfer old account-specific settings in the writer-stopped cutover.
    SELECT to_jsonb(override_row) AS row FROM sales_product_channel_overrides override_row ORDER BY organization_id, id
  `;
  let count = 0;
  for (const { row } of overrides) {
    const organizationId = requiredString(row.organization_id, 'legacy override organization');
    const id = requiredString(row.id, 'legacy override target');
    const productId = requiredString(row.sales_product_id, 'legacy override product');
    const accountId = requiredString(row.channel_account_id, 'legacy override account');
    const existing = await tx.$queryRaw<Array<{ sales_product_id: string; channel_account_id: string }>>`
      SELECT sales_product_id, channel_account_id FROM product_preparations
      WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (existing.length) {
      if (existing[0].sales_product_id !== productId || existing[0].channel_account_id !== accountId) {
        throw new Error('Legacy registration override target identity conflicts.');
      }
      continue;
    }
    const [product] = await tx.$queryRaw<StoredRow[]>`
      SELECT to_jsonb(item) AS row FROM sales_products item
      WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (!product) throw new Error('Legacy override selling product is missing.');
    const options = await tx.$queryRaw<StoredRow[]>`
      SELECT to_jsonb(item) AS row FROM sales_product_options item
      WHERE sales_product_id = ${productId}::uuid AND organization_id = ${organizationId}::uuid AND supply_status <> 'unused'
      ORDER BY sort_order, id
    `;
    const input = {
      mallRegisterValues: asRecord(row.adapter_values), detailHtml: row.detail_html ?? null,
      promoText: row.promo_text ?? null, noticeCategory: row.notice_category ?? null, stockPercent: row.stock_percent ?? null,
    };
    await tx.$executeRaw`
      INSERT INTO product_preparations (id, organization_id, sales_product_id, channel_account_id, display_name, registration_input, created_at, updated_at)
      VALUES (${id}::uuid, ${organizationId}::uuid, ${productId}::uuid, ${accountId}::uuid, ${nullableString(row.name)}, ${JSON.stringify(input)}::jsonb, now(), now())
    `;
    for (const { row: option } of options) {
      let salePrice: number | null = null;
      if (row.sale_price != null || row.price_rate_bp != null) {
        const base = numberAmount(product.row.sale_price);
        const extra = option.extra_price == null ? numberAmount(option.sale_price) - base : integerValue(option.extra_price);
        const overrideBase = row.sale_price == null
          ? Math.round(base * integerValue(row.price_rate_bp) / 10_000) : numberAmount(row.sale_price);
        salePrice = numberAmount(Math.max(0, overrideBase + extra));
      }
      await insertTargetOption(tx, organizationId, id, requiredString(option.id, 'legacy override option'),
        integerValue(option.sort_order), salePrice, null);
    }
    count++;
  }
  return count;
}

async function insertTargetOption(
  tx: Prisma.TransactionClient, organizationId: string, targetId: string, optionId: string,
  sortOrder: number, salePrice: number | null, normalPrice: number | null,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO product_preparation_options
      (id, organization_id, product_preparation_id, sales_product_option_id, sort_order, sale_price, normal_price, supply_price)
    VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, ${targetId}::uuid, ${optionId}::uuid, ${sortOrder}, ${salePrice}, ${normalPrice}, NULL)
  `;
}

function asRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label} blocks registration cutover.`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : requiredString(value, 'registration content');
}

function numberAmount(value: unknown, positive = false): number {
  const result = integerValue(value);
  if (result < (positive ? 1 : 0) || result > 1_000_000_000) throw new Error('Invalid registration price blocks cutover.');
  return result;
}

function integerValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Invalid registration number blocks cutover.');
  return value;
}

function dateValue(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid registration timestamp blocks cutover.');
  return date;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    const leftDate = dateValue(left);
    const rightDate = dateValue(right);
    return leftDate?.getTime() === rightDate?.getTime();
  }
  return left === right;
}

function resultExternalListingId(value: unknown): string | null {
  const externalId = asRecord(value).externalListingId;
  return typeof externalId === 'string' && externalId.trim() ? externalId.trim() : null;
}

async function renameTargetSchema(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`ALTER TABLE product_preparations RENAME COLUMN closed_at TO archived_at`;
  const [optionColumn] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('product_preparation_options')
      AND attname = 'product_preparation_id' AND attnum > 0 AND NOT attisdropped) AS present
  `;
  if (optionColumn?.present) {
    await tx.$executeRaw`ALTER TABLE product_preparation_options RENAME COLUMN product_preparation_id TO registration_target_id`;
  }
  await tx.$executeRaw`ALTER TABLE product_registration_executions RENAME COLUMN product_preparation_id TO registration_target_id`;
  await renameLegacyIdentifiers(tx, 'product_preparations');
  if (await relationExists(tx, 'product_preparation_options')) {
    await renameLegacyIdentifiers(tx, 'product_preparation_options');
  }
  await renameExecutionIdentifiers(tx);
  if (await relationExists(tx, 'product_preparation_options')) {
    await tx.$executeRaw`ALTER TABLE product_preparation_options RENAME TO registration_target_options`;
  }
  await tx.$executeRaw`ALTER TABLE product_preparations RENAME TO registration_targets`;
}

async function renameLegacyIdentifiers(tx: Prisma.TransactionClient, oldName: string): Promise<void> {
  if (oldName === 'product_preparations') {
    await renameCatalogNames(tx, 'product_preparations', 'registration_targets');
  } else {
    await renameCatalogNames(tx, 'product_preparation_options', 'registration_target_options');
  }
}

async function renameCatalogNames(tx: Prisma.TransactionClient, oldPart: string, newPart: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ name: string; kind: string }>>`
    SELECT c.conname AS name, 'constraint' AS kind FROM pg_constraint c
      WHERE c.conrelid = to_regclass(${oldPart}) AND c.conname LIKE ${`${oldPart}%`}
    UNION ALL
    SELECT i.relname AS name, 'index' AS kind FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
      WHERE x.indrelid = to_regclass(${oldPart}) AND i.relname LIKE ${`${oldPart}%`}
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
  `;
  for (const { name, kind } of rows) {
    const renamed = safeIdentifier(name.replace(oldPart, newPart).replace('product_preparation_id', 'registration_target_id'));
    if (await identifierExists(tx, renamed)) continue;
    const from = quoteIdentifier(name), to = quoteIdentifier(renamed);
    if (kind === 'constraint') {
      await tx.$executeRaw`ALTER TABLE ${Prisma.raw(quoteIdentifier(oldPart))} RENAME CONSTRAINT ${Prisma.raw(from)} TO ${Prisma.raw(to)}`;
    } else {
      await tx.$executeRaw`ALTER INDEX ${Prisma.raw(from)} RENAME TO ${Prisma.raw(to)}`;
    }
  }
}

async function renameExecutionIdentifiers(tx: Prisma.TransactionClient): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ name: string; kind: string }>>`
    SELECT c.conname AS name, 'constraint' AS kind FROM pg_constraint c
      WHERE c.conrelid = to_regclass('product_registration_executions')
        AND c.conname LIKE 'product_registration_executions%product_preparation%'
    UNION ALL
    SELECT i.relname AS name, 'index' AS kind FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
      WHERE x.indrelid = to_regclass('product_registration_executions')
        AND i.relname LIKE 'product_registration_executions%product_preparation%'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
  `;
  for (const { name, kind } of rows) {
    const renamed = safeIdentifier(name.replace('product_preparation', 'registration_target'));
    if (await identifierExists(tx, renamed)) continue;
    const from = quoteIdentifier(name), to = quoteIdentifier(renamed);
    if (kind === 'constraint') {
      await tx.$executeRaw`ALTER TABLE product_registration_executions RENAME CONSTRAINT ${Prisma.raw(from)} TO ${Prisma.raw(to)}`;
    } else {
      await tx.$executeRaw`ALTER INDEX ${Prisma.raw(from)} RENAME TO ${Prisma.raw(to)}`;
    }
  }
}

async function relationExists(tx: Prisma.TransactionClient, relation: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass(${relation}) IS NOT NULL AS present`;
  return Boolean(row?.present);
}

async function identifierExists(tx: Prisma.TransactionClient, identifier: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM pg_class WHERE relname = ${identifier}
      AND relnamespace = current_schema()::regnamespace) AS present
  `;
  return Boolean(row?.present);
}

function safeIdentifier(value: string): string {
  return value.slice(0, 63);
}

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value)) throw new Error('Unsafe catalog identifier in registration cutover.');
  return `"${value}"`;
}
