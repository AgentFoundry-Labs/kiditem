import { hashRegistrationSubmissionPayload } from '../../../apps/server/src/channels/domain/registration-submission-payload';
import type { ProductRegistrationExecution } from '@prisma/client';
import type { DataMigration } from '../types';
import { importLegacyExecution, importLegacyRegisteredExecution, type LegacyRegistrationDraft } from '../helpers/legacy-registration-execution';

/** Move the former runtime legacy-import path ahead of schema contraction. */
export const consolidateRegistrationExecutionMigration: DataMigration = {
  id: 'v0.1.31:018_consolidate_registration_execution',
  releaseVersion: '0.1.31',
  name: 'Preserve legacy submissions in the registration execution ledger',
  phase: 'pre-schema',
  async run(tx) {
    await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS closed_at timestamptz`;
    const drafts = await tx.$queryRaw<Array<{ legacy: Record<string, unknown> }>>`
      -- queryraw-tenancy-exempt: inspect legacy submission evidence across all organizations during writer-stopped cutover.
      SELECT to_jsonb(preparation) AS legacy FROM product_preparations preparation
      ORDER BY organization_id, id
    `;
    let imported = 0;
    for (const { legacy } of drafts) {
      const organizationId = String(legacy.organization_id);
      const preparationId = String(legacy.id);
      const existing = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, productPreparationId: preparationId },
      });
      const status = String(legacy.status ?? (legacy.closed_at ? 'cancelled' : 'draft'));
      const terminal = ['registered', 'cancelled'].includes(status)
        || ['succeeded', 'cancelled'].includes(existing?.status ?? '');
      if (legacy.closed_at == null && (terminal || legacy.is_deleted === true)) {
        const closedAt = existing?.completedAt ?? new Date(String(legacy.deleted_at ?? legacy.updated_at));
        await tx.$executeRaw`
          UPDATE product_preparations SET closed_at = ${closedAt}
          WHERE id = ${preparationId}::uuid AND organization_id = ${organizationId}::uuid
            AND closed_at IS NULL
        `;
      }
      if (existing) {
        assertSafeClosure(legacy, existing);
        // A stale mirror may omit newer execution facts, but conflicting
        // retained provider identity or frozen content cannot be discarded.
        for (const [legacyKey, canonical] of [
          ['channel_account_id', existing.channelAccountId],
          ['channel_listing_id', existing.channelListingId],
          ['review_payload_hash', existing.requestHash],
          ['submission_key', existing.idempotencyKey],
          ['submission_payload_hash', existing.submissionPayloadHash],
          ['provider_submission_id', existing.providerSubmissionId],
          ['submission_lease_token', existing.leaseToken],
        ] as const) {
          if (legacy[legacyKey] != null && legacy[legacyKey] !== canonical) {
            throw new Error(`Registration contraction found conflicting ${legacyKey} for preparation ${preparationId}.`);
          }
        }
        if (legacy.provider_outcome != null && legacy.provider_outcome !== 'not_attempted'
          && legacy.provider_outcome !== existing.providerOutcome) {
          throw new Error(`Registration contraction found conflicting provider_outcome for preparation ${preparationId}.`);
        }
        if (legacy.submission_lease_claimed_at != null
          && new Date(String(legacy.submission_lease_claimed_at)).getTime() !== existing.leaseClaimedAt?.getTime()) {
          throw new Error(`Registration contraction found conflicting submission lease time for preparation ${preparationId}.`);
        }
        if (legacy.registration_result != null
          && hashRegistrationSubmissionPayload(legacy.registration_result) !== hashRegistrationSubmissionPayload(existing.resultJson)) {
          throw new Error(`Registration contraction found conflicting provider result for preparation ${preparationId}.`);
        }
        if (legacy.submission_payload_json != null
          && hashRegistrationSubmissionPayload(legacy.submission_payload_json) !== existing.submissionPayloadHash) {
          throw new Error(`Registration contraction found conflicting frozen payload for preparation ${preparationId}.`);
        }
        await tx.$executeRaw`
          UPDATE product_preparations SET review_payload_hash = ${existing.requestHash}
          WHERE id = ${preparationId}::uuid AND organization_id = ${organizationId}::uuid
            AND review_payload_hash IS NULL
        `;
        continue;
      }
      const hasProviderIdentity = legacy.provider_submission_id != null || legacy.registration_result != null;
      if (status === 'draft' && !hasProviderIdentity
        && legacy.review_payload_hash == null && legacy.submission_payload_json == null && legacy.submission_payload_hash == null
        && (legacy.provider_outcome == null || legacy.provider_outcome === 'not_attempted')) continue;
      if (status === 'cancelled' && !hasProviderIdentity && legacy.submission_payload_json == null
        && legacy.review_payload_hash == null && legacy.submission_payload_hash == null
        && (legacy.provider_outcome == null || ['not_attempted', 'definitive_failure'].includes(String(legacy.provider_outcome)))) continue;
      const draft: LegacyRegistrationDraft = {
        preparationId,
        sourceCandidateId: String(legacy.source_candidate_id ?? ''),
        channelAccountId: String(legacy.channel_account_id ?? ''),
        channelListingId: nullableString(legacy.channel_listing_id),
        submissionKey: nullableString(legacy.submission_key),
        submissionPayloadJson: legacy.submission_payload_json ?? null,
        submissionPayloadHash: nullableString(legacy.submission_payload_hash),
        resolvedProviderOutcome: nullableString(legacy.provider_outcome) ?? (hasProviderIdentity ? 'succeeded' : 'uncertain'),
        providerSubmissionId: nullableString(legacy.provider_submission_id),
        hasRegistrationResult: legacy.registration_result != null,
        registrationResult: legacy.registration_result ?? null,
        lastError: nullableString(legacy.last_error),
        submissionLeaseToken: nullableString(legacy.submission_lease_token),
        submissionLeaseClaimedAt: legacy.submission_lease_claimed_at ? new Date(String(legacy.submission_lease_claimed_at)) : null,
        approvedByUserId: nullableString(legacy.approved_by_user_id),
        updatedAt: new Date(String(legacy.updated_at)),
      };
      const execution = status === 'registered'
        ? await importLegacyRegisteredExecution(tx, draft, organizationId)
        : await importLegacyExecution(tx, draft, organizationId);
      assertSafeClosure(legacy, execution);
      if (legacy.review_payload_hash != null && legacy.review_payload_hash !== execution.requestHash) {
        throw new Error(`Registration contraction found conflicting approval for preparation ${preparationId}.`);
      }
      await tx.$executeRaw`
        UPDATE product_preparations SET review_payload_hash = ${execution.requestHash}
        WHERE id = ${preparationId}::uuid AND organization_id = ${organizationId}::uuid
          AND review_payload_hash IS NULL
      `;
      imported += 1;
    }
    const duplicates = await tx.$queryRaw<Array<{ count: bigint }>>`
      -- queryraw-tenancy-exempt: validate the replacement active-draft uniqueness before changing the index.
      SELECT count(*)::bigint AS count FROM (
        SELECT organization_id, source_candidate_id, channel_account_id
        FROM product_preparations WHERE closed_at IS NULL AND is_deleted = false
        GROUP BY organization_id, source_candidate_id, channel_account_id HAVING count(*) > 1
      ) conflicting_drafts
    `;
    if (Number(duplicates[0]?.count ?? 0) > 0) throw new Error('Multiple active registration drafts block schema contraction.');
    return { affectedRows: imported, details: { importedExecutions: imported } };
  },
};

/** A closed/archived draft must not release the account for another uncertain submission. */
function assertSafeClosure(legacy: Record<string, unknown>, execution: ProductRegistrationExecution): void {
  const closed = legacy.closed_at != null || legacy.is_deleted === true
    || ['registered', 'cancelled'].includes(String(legacy.status))
    || execution.status === 'cancelled';
  const unresolved = ['prepared', 'executing', 'reconciling'].includes(execution.status)
    || execution.providerOutcome === 'uncertain'
    || (execution.status !== 'succeeded' && (
      execution.providerSubmissionId !== null || execution.externalListingId !== null || execution.resultJson !== null
    ));
  if (closed && unresolved) {
    throw new Error(`Closed registration preparation ${execution.productPreparationId} retains an unresolved execution; reconcile it before schema contraction.`);
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
