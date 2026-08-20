import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { ActiveOperationAttemptTransaction } from '../../../../operations/application/port/active-browser-attempt-transaction';
import { isAllowedSourcingCollectionSource } from '../../../domain/sourcing-collection-source-policy';
import {
  isActiveCollectionStatus,
  terminalStatusForCollectionError,
} from '../../../domain/sourcing-collection-run';
import type {
  AuthorizedCollectionOutput,
  ClaimAuthorizedRunInput,
  ClaimAuthorizedRunResult,
  ClaimRecoverableRunResult,
  CommitAuthorizedCollectionInput,
  CommitAuthorizedCollectionResult,
  FailAuthorizedCollectionInput,
  SourcingCollectionPermit,
  SourcingCollectionRepositoryPort,
  SourcingExtensionCandidateProjection,
  SourcingTypedCollectionRecord,
} from '../../../application/port/out/repository/sourcing-collection.repository.port';

const MAX_LEASE_DURATION_MS = 15 * 60_000;

@Injectable()
export class SourcingCollectionRepositoryAdapter
  implements SourcingCollectionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async claimAuthorizedRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult> {
    validateClaim(input);
    return this.prisma.$transaction((tx) => this.claimAuthorizedRunTx(tx, input));
  }

  async claimAuthorizedRunInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult> {
    validateClaim(input);
    return this.claimAuthorizedRunTx(asTransaction(transaction), input);
  }

  private async claimAuthorizedRunTx(
    tx: Transaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult> {
      await lockCollectionTarget(tx, input);
      const now = await databaseClock(tx);

      const idempotent = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (idempotent) {
        if (idempotent.requestHash !== input.requestHash) {
          return { kind: 'idempotency_conflict' };
        }
        return { kind: 'existing', permit: toPermit(idempotent) };
      }

      const active = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          status: { in: ['collecting', 'cancel_requested'] },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (active && active.leaseExpiresAt > now && !active.cancelRequestedAt) {
        return { kind: 'existing', permit: toPermit(active) };
      }
      const nextGeneration = (active?.generation ?? 0) + 1;
      if (active) {
        await tx.sourcingEvidenceIngestionRun.update({
          where: { id: active.id },
          data: {
            status: active.cancelRequestedAt ? 'cancelled' : 'superseded',
            completedAt: now,
            errorCode: active.cancelRequestedAt
              ? 'COLLECTION_CANCELLED'
              : 'COLLECTION_LEASE_EXPIRED',
          },
        });
      }

      const sourceControl = await findEnabledSourceControl(tx, {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
      });
      if (!sourceControl.allowed) {
        return { kind: 'denied', reasonCode: sourceControl.reasonCode };
      }

      const leaseExpiresAt = new Date(
        now.getTime() + Math.min(input.leaseDurationMs, MAX_LEASE_DURATION_MS),
      );
      const run = await tx.sourcingEvidenceIngestionRun.create({
        data: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          collectorKey: input.collectorKey,
          collectorVersion: input.collectorVersion,
          triggerKind: input.triggerKind,
          triggeredByUserId: input.triggeredByUserId,
          status: 'collecting',
          leaseExpiresAt,
          sourceControlCheckedAt: now,
          generation: nextGeneration,
          startedAt: now,
          coverageNumerator: 0,
          qualityReport: {} as Prisma.InputJsonValue,
        },
      });
      return { kind: 'claimed', permit: toPermit(run) };
  }

  async resumeAuthorizedRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult> {
    validateClaim(input);
    return this.prisma.$transaction(async (tx) => {
      await lockCollectionTarget(tx, input);
      const now = await databaseClock(tx);
      const run = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (!run) return { kind: 'denied', reasonCode: 'source_collection_session_missing' };
      if (run.requestHash !== input.requestHash) return { kind: 'idempotency_conflict' };
      if (
        run.sourceKey !== input.sourceKey
        || run.scopeKey !== input.scopeKey
        || run.targetKey !== input.targetKey
      ) {
        return { kind: 'idempotency_conflict' };
      }
      if (run.cancelRequestedAt || run.status === 'cancel_requested') {
        return { kind: 'denied', reasonCode: 'source_collection_session_cancelled' };
      }
      if (run.status !== 'collecting' || run.leaseExpiresAt <= now) {
        return { kind: 'denied', reasonCode: 'source_collection_session_expired' };
      }
      const sourceControl = await findEnabledSourceControl(tx, {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
      });
      if (!sourceControl.allowed) {
        return { kind: 'denied', reasonCode: sourceControl.reasonCode };
      }
      return { kind: 'existing', permit: toPermit(run) };
    });
  }

  async claimRecoverableRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimRecoverableRunResult> {
    validateClaim(input);
    return this.prisma.$transaction((tx) => this.claimRecoverableRunTx(tx, input));
  }

  async claimRecoverableRunInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimRecoverableRunResult> {
    validateClaim(input);
    return this.claimRecoverableRunTx(asTransaction(transaction), input);
  }

  private async claimRecoverableRunTx(
    tx: Transaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimRecoverableRunResult> {
      await lockCollectionTarget(tx, input);
      const now = await databaseClock(tx);
      const existing = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existing) {
        if (!sameRecoverableIdentity(existing, input)) {
          return { kind: 'idempotency_conflict' };
        }
        if (existing.status === 'complete' || existing.status === 'partial') {
          return { kind: 'completed', runId: existing.id };
        }
        if (
          existing.status === 'collecting'
          && !existing.cancelRequestedAt
          && existing.leaseExpiresAt > now
        ) {
          return {
            kind: 'in_progress',
            runId: existing.id,
            leaseExpiresAt: existing.leaseExpiresAt,
          };
        }
        if (
          existing.cancelRequestedAt
          || existing.status === 'cancel_requested'
          || existing.status === 'cancelled'
          || existing.status === 'quarantined'
        ) {
          return {
            kind: 'denied',
            reasonCode: existing.status === 'quarantined'
              ? 'source_collection_quarantined'
              : 'source_collection_session_cancelled',
          };
        }

        const sourceControl = await findEnabledSourceControl(tx, {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
        });
        if (!sourceControl.allowed) {
          return { kind: 'denied', reasonCode: sourceControl.reasonCode };
        }
        const leaseToken = randomUUID();
        const leaseExpiresAt = new Date(
          now.getTime() + Math.min(input.leaseDurationMs, MAX_LEASE_DURATION_MS),
        );
        const generation = existing.generation + 1;
        const resumed = await tx.sourcingEvidenceIngestionRun.update({
          where: { id: existing.id },
          data: {
            status: 'collecting',
            leaseToken,
            leaseExpiresAt,
            sourceControlCheckedAt: now,
            generation,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            startedAt: now,
          },
        });
        return { kind: 'claimed', permit: toPermit(resumed) };
      }

      const active = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          status: { in: ['collecting', 'cancel_requested'] },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (active) return { kind: 'idempotency_conflict' };

      const sourceControl = await findEnabledSourceControl(tx, {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
      });
      if (!sourceControl.allowed) {
        return { kind: 'denied', reasonCode: sourceControl.reasonCode };
      }
      const leaseExpiresAt = new Date(
        now.getTime() + Math.min(input.leaseDurationMs, MAX_LEASE_DURATION_MS),
      );
      const created = await tx.sourcingEvidenceIngestionRun.create({
        data: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          collectorKey: input.collectorKey,
          collectorVersion: input.collectorVersion,
          triggerKind: input.triggerKind,
          triggeredByUserId: input.triggeredByUserId,
          status: 'collecting',
          leaseExpiresAt,
          sourceControlCheckedAt: now,
          generation: 1,
          startedAt: now,
          coverageNumerator: 0,
          qualityReport: {} as Prisma.InputJsonValue,
        },
      });
      return { kind: 'claimed', permit: toPermit(created) };
  }

  async checkpoint(
    permit: SourcingCollectionPermit,
  ): Promise<'continue' | 'cancel' | 'superseded'> {
    return this.prisma.$transaction(async (tx) => {
      const now = await databaseClock(tx);
      const run = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: { id: permit.runId, organizationId: permit.organizationId },
      });
      if (!run || run.leaseToken !== permit.leaseToken || run.generation !== permit.generation) {
        return 'superseded';
      }
      if (run.cancelRequestedAt || run.status === 'cancel_requested') return 'cancel';
      if (run.status !== 'collecting' || run.leaseExpiresAt <= now) return 'superseded';
      return 'continue';
    });
  }

  async commit(
    input: CommitAuthorizedCollectionInput,
  ): Promise<CommitAuthorizedCollectionResult> {
    return this.prisma.$transaction((tx) => this.commitTx(tx, input));
  }

  async commitInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: CommitAuthorizedCollectionInput,
  ): Promise<CommitAuthorizedCollectionResult> {
    return this.commitTx(asTransaction(transaction), input);
  }

  private async commitTx(
    tx: Transaction,
    input: CommitAuthorizedCollectionInput,
  ): Promise<CommitAuthorizedCollectionResult> {
      await lockCollectionPermit(tx, input.permit);
      const now = await databaseClock(tx);
      const run = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: { id: input.permit.runId, organizationId: input.permit.organizationId },
      });
      if (!run || run.leaseToken !== input.permit.leaseToken || run.generation !== input.permit.generation) {
        return { kind: 'lease_lost' };
      }
      if (run.cancelRequestedAt || run.status === 'cancel_requested') {
        await completeRun(tx, run.id, now, 'cancelled', {
          errorCode: 'COLLECTION_CANCELLED',
        });
        return { kind: 'cancelled' };
      }
      if (run.status !== 'collecting' || run.leaseExpiresAt <= now) {
        await completeRun(tx, run.id, now, 'superseded', {
          errorCode: 'COLLECTION_LEASE_EXPIRED',
        });
        return { kind: 'superseded' };
      }

      const sourceControl = await findEnabledSourceControl(tx, {
        organizationId: input.permit.organizationId,
        sourceKey: input.permit.sourceKey,
      });
      if (!sourceControl.allowed) {
        await completeRun(tx, run.id, now, 'quarantined', {
          errorCode: sourceControl.reasonCode.toUpperCase(),
        });
        return { kind: 'source_denied', reasonCode: sourceControl.reasonCode };
      }

      const observationResult = await appendObservations(tx, input.permit, input.output, now);
      const typedResult = await persistTypedRecords(tx, input.output.typedRecords);
      const acceptedCount = Math.max(
        0,
        input.output.discoveredCount - input.output.rejectedCount - typedResult.staleDiscardedCount,
      );
      const duplicateCount = observationResult.duplicateCount + typedResult.duplicateCount;
      await completeRun(tx, run.id, now, input.output.rejectedCount > 0 ? 'partial' : 'complete', {
        discoveredCount: input.output.discoveredCount,
        acceptedCount,
        rejectedCount: input.output.rejectedCount,
        duplicateCount,
        staleDiscardedCount: typedResult.staleDiscardedCount,
        qualityReport: input.output.qualityReport as Prisma.InputJsonValue,
      });
      return {
        kind: 'committed',
        runId: run.id,
        acceptedCount,
        duplicateCount,
        staleDiscardedCount: typedResult.staleDiscardedCount,
      };
  }

  async fail(input: FailAuthorizedCollectionInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockCollectionPermit(tx, input.permit);
      const now = await databaseClock(tx);
      const run = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: { id: input.permit.runId, organizationId: input.permit.organizationId },
      });
      if (!run || run.leaseToken !== input.permit.leaseToken || run.generation !== input.permit.generation) {
        return;
      }
      if (!isActiveCollectionStatus(run.status)) return;
      await completeRun(
        tx,
        run.id,
        now,
        terminalStatusForCollectionError(input.error),
        {
          errorCode: input.error.code,
          errorMessage: input.error.message,
        },
      );
    });
  }

  async requestCancel(input: {
    organizationId: string;
    runId: string;
    requestedByUserId: string;
  }): Promise<void> {
    await this.prisma.sourcingEvidenceIngestionRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: 'collecting',
      },
      data: { status: 'cancel_requested', cancelRequestedAt: new Date() },
    });
  }
}

type Transaction = Prisma.TransactionClient;

function asTransaction(
  transaction: ActiveOperationAttemptTransaction,
): Transaction {
  return transaction as unknown as Transaction;
}

async function findEnabledSourceControl(
  tx: Transaction,
  input: { organizationId: string; sourceKey: string },
): Promise<
  | { allowed: true }
  | { allowed: false; reasonCode: 'source_not_allowed' | 'source_disabled' }
> {
  if (!isAllowedSourcingCollectionSource(input.sourceKey)) {
    return { allowed: false, reasonCode: 'source_not_allowed' };
  }
  const row = await tx.sourcingCollectionSourceControl.findUnique({
    where: {
      organizationId_sourceKey: {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
      },
    },
    select: { enabled: true },
  });
  return row?.enabled === false
    ? { allowed: false, reasonCode: 'source_disabled' }
    : { allowed: true };
}

async function appendObservations(
  tx: Transaction,
  permit: SourcingCollectionPermit,
  output: AuthorizedCollectionOutput,
  now: Date,
): Promise<{ duplicateCount: number }> {
  let duplicateCount = 0;
  for (const observation of output.observations) {
    if (
      observation.organizationId !== permit.organizationId ||
      observation.ingestionRunId !== permit.runId ||
      observation.sourceKey !== permit.sourceKey
    ) {
      throw new Error('Collection observation does not match its authorized permit.');
    }
    await lockObservation(tx, observation.organizationId, observation.observationKey);
    const existing = await tx.sourcingEvidenceObservation.findFirst({
      where: {
        organizationId: observation.organizationId,
        observationKey: observation.observationKey,
        revision: observation.revision,
      },
      select: { id: true, envelopeHash: true },
    });
    const envelopeHash = hashCanonicalJson({
      sourceKey: observation.sourceKey,
      sourceEntityType: observation.sourceEntityType,
      sourceEntityId: observation.sourceEntityId,
      platform: observation.platform,
      evidenceFamily: observation.evidenceFamily,
      signalRole: observation.signalRole,
      granularity: observation.granularity,
      conceptKey: observation.conceptKey,
      supportsCandidate: observation.supportsCandidate,
      sourceUrl: observation.sourceUrl,
      eventAt: observation.eventAt,
      observedAt: observation.observedAt,
      availableAt: observation.availableAt,
      revisionAt: observation.revisionAt,
      payloadHash: observation.payloadHash,
    });
    if (existing) {
      if (existing.envelopeHash !== envelopeHash) {
        throw new Error(`Collection observation ${observation.observationKey} conflicts with immutable provenance.`);
      }
      duplicateCount += 1;
      continue;
    }
    await tx.sourcingEvidenceObservation.create({
      data: {
        organizationId: observation.organizationId,
        ingestionRunId: observation.ingestionRunId,
        sourceKey: observation.sourceKey,
        platform: observation.platform,
        evidenceFamily: observation.evidenceFamily,
        signalRole: observation.signalRole,
        conceptKey: observation.conceptKey,
        supportsCandidate: observation.supportsCandidate,
        observationKey: observation.observationKey,
        revision: observation.revision,
        sourceEntityType: observation.sourceEntityType,
        sourceEntityKey: observation.sourceEntityId,
        observationType: observation.evidenceFamily,
        schemaVersion: observation.schemaVersion,
        evidenceClass: observation.granularity,
        eventAt: observation.eventAt,
        observedAt: observation.observedAt,
        availableAt: observation.availableAt,
        revisionAt: observation.revisionAt,
        businessDate: observation.eventAt,
        sourceUrl: observation.sourceUrl,
        payloadHash: observation.payloadHash,
        envelopeHash,
        payload: observation.rawPayload as Prisma.InputJsonValue,
        ingestedAt: now,
      },
    });
  }
  return { duplicateCount };
}

async function persistTypedRecords(
  tx: Transaction,
  records: SourcingTypedCollectionRecord[],
): Promise<{ duplicateCount: number; staleDiscardedCount: number }> {
  let duplicateCount = 0;
  let staleDiscardedCount = 0;
  for (const record of records) {
    const outcome = await persistTypedRecord(tx, record);
    if (outcome === 'duplicate') duplicateCount += 1;
    if (outcome === 'stale') staleDiscardedCount += 1;
  }
  return { duplicateCount, staleDiscardedCount };
}

async function persistTypedRecord(
  tx: Transaction,
  record: SourcingTypedCollectionRecord,
): Promise<'accepted' | 'duplicate' | 'stale'> {
  if (record.kind === 'extension_candidate') {
    return persistExtensionCandidateProjection(tx, record.row);
  }
  if (record.kind === 'offer_1688_keyword_observation') {
    const row = record.row;
    await lockTypedIdentity(
      tx,
      `1688-keyword-observation:${row.organizationId}:${row.businessDate.toISOString()}:${row.sourceKeyword}:${row.offerId}:${row.capturedAt.toISOString()}`,
    );
    const evidence = await tx.sourcingEvidenceObservation.findFirst({
      where: {
        organizationId: row.organizationId,
        observationKey: row.evidenceObservationKey,
        revision: row.evidenceRevision,
      },
      select: { id: true },
    });
    if (!evidence) {
      throw new Error('1688 offer observation is missing its immutable evidence row.');
    }
    const created = await tx.sourcing1688OfferKeywordObservation.createMany({
      data: {
        organizationId: row.organizationId,
        evidenceObservationId: evidence.id,
        ingestionRunId: row.ingestionRunId,
        businessDate: row.businessDate,
        sourceKeywordNormalized: row.sourceKeyword,
        externalOfferId: row.offerId,
        variantKeyNormalized: '',
        sourceUrl: row.sourceUrl,
        title: row.title,
        supplierName: row.supplierName,
        imageUrl: row.imageUrl,
        rank: row.rank,
        priceCny: row.priceCny,
        monthlySales: row.monthlySales,
        rawOffer: {
          offerId: row.offerId,
          sourceKeyword: row.sourceKeyword,
          rank: row.rank,
          title: row.title,
          priceCny: row.priceCny,
          monthlySales: row.monthlySales,
          repurchaseRate: row.repurchaseRate,
          tradeScore: row.tradeScore,
          supplierName: row.supplierName,
          imageUrl: row.imageUrl,
          sourceUrl: row.sourceUrl,
          ...(row.searchMetadata ? row.searchMetadata : {}),
        } as Prisma.InputJsonValue,
        capturedAt: row.capturedAt,
      },
      skipDuplicates: true,
    });
    return created.count === 1 ? 'accepted' : 'duplicate';
  }
  if (record.kind === 'naver_keyword') {
    const row = record.row;
    await lockTypedIdentity(tx, `naver-keyword:${row.organizationId}:${row.keyword}:${row.businessDate.toISOString()}`);
    const existing = await tx.naverKeywordDailySnapshot.findUnique({
      where: {
        organizationId_keyword_businessDate: {
          organizationId: row.organizationId,
          keyword: row.keyword,
          businessDate: row.businessDate,
        },
      },
      select: { capturedAt: true },
    });
    if (existing && existing.capturedAt >= row.capturedAt) return existing.capturedAt.getTime() === row.capturedAt.getTime() ? 'duplicate' : 'stale';
    await tx.naverKeywordDailySnapshot.upsert({
      where: {
        organizationId_keyword_businessDate: {
          organizationId: row.organizationId,
          keyword: row.keyword,
          businessDate: row.businessDate,
        },
      },
      create: row,
      update: {
        monthlyTotalSearchCount: row.monthlyTotalSearchCount,
        monthlyPcSearchCount: row.monthlyPcSearchCount,
        monthlyMobileSearchCount: row.monthlyMobileSearchCount,
        competitionIndex: row.competitionIndex,
        averageAdRank: row.averageAdRank,
        trendRatio: row.trendRatio,
        trendDelta: row.trendDelta,
        capturedAt: row.capturedAt,
      },
    });
    return 'accepted';
  }
  if (record.kind === 'naver_popular_keyword') {
    const row = record.row;
    await lockTypedIdentity(tx, `naver-popular:${row.organizationId}:${row.boardKey}:${row.businessDate.toISOString()}:${row.keyword}`);
    const existing = await tx.naverPopularKeywordDailySnapshot.findUnique({
      where: {
        organizationId_boardKey_businessDate_keyword: {
          organizationId: row.organizationId,
          boardKey: row.boardKey,
          businessDate: row.businessDate,
          keyword: row.keyword,
        },
      },
      select: { capturedAt: true },
    });
    if (existing && existing.capturedAt >= row.capturedAt) return existing.capturedAt.getTime() === row.capturedAt.getTime() ? 'duplicate' : 'stale';
    await tx.naverPopularKeywordDailySnapshot.upsert({
      where: {
        organizationId_boardKey_businessDate_keyword: {
          organizationId: row.organizationId,
          boardKey: row.boardKey,
          businessDate: row.businessDate,
          keyword: row.keyword,
        },
      },
      create: row,
      update: {
        boardLabel: row.boardLabel,
        cid: row.cid,
        rank: row.rank,
        linkId: row.linkId,
        capturedAt: row.capturedAt,
      },
    });
    return 'accepted';
  }
  if (record.kind === 'shorts') {
    const row = record.row;
    await lockTypedIdentity(tx, `shorts:${row.organizationId}:${row.businessDate.toISOString()}:${row.videoKey}`);
    const existing = await tx.shortsTrendDailySnapshot.findUnique({
      where: {
        organizationId_businessDate_videoKey: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          videoKey: row.videoKey,
        },
      },
      select: { capturedAt: true },
    });
    if (existing && existing.capturedAt >= row.capturedAt) return existing.capturedAt.getTime() === row.capturedAt.getTime() ? 'duplicate' : 'stale';
    await tx.shortsTrendDailySnapshot.upsert({
      where: {
        organizationId_businessDate_videoKey: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          videoKey: row.videoKey,
        },
      },
      create: row,
      update: {
        rank: row.rank,
        title: row.title,
        channelName: row.channelName,
        viewCount: row.viewCount,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        keyword: row.keyword,
        publishedAt: row.publishedAt,
        thumbnailUrl: row.thumbnailUrl,
        videoUrl: row.videoUrl,
        capturedAt: row.capturedAt,
      },
    });
    return 'accepted';
  }
  if (record.kind === 'live_commerce_broadcast') {
    const row = record.row;
    await lockTypedIdentity(
      tx,
      `live-broadcast:${row.organizationId}:${row.businessDate.toISOString()}:${row.source}:${row.broadcastId}`,
    );
    const existing = await tx.liveCommerceBroadcastDailySnapshot.findUnique({
      where: {
        organizationId_businessDate_source_broadcastId: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          source: row.source,
          broadcastId: row.broadcastId,
        },
      },
      select: { capturedAt: true },
    });
    if (existing && existing.capturedAt >= row.capturedAt) {
      return existing.capturedAt.getTime() === row.capturedAt.getTime()
        ? 'duplicate'
        : 'stale';
    }
    await tx.liveCommerceBroadcastDailySnapshot.upsert({
      where: {
        organizationId_businessDate_source_broadcastId: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          source: row.source,
          broadcastId: row.broadcastId,
        },
      },
      create: row,
      update: {
        title: row.title,
        broadcasterId: row.broadcasterId,
        broadcasterName: row.broadcasterName,
        status: row.status,
        viewerCount: row.viewerCount,
        likeCount: row.likeCount,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        coverImageUrl: row.coverImageUrl,
        sourceUrl: row.sourceUrl,
        capturedAt: row.capturedAt,
      },
    });
    return 'accepted';
  }
  if (record.kind === 'live_commerce_product') {
    const row = record.row;
    await lockTypedIdentity(
      tx,
      `live-product:${row.organizationId}:${row.businessDate.toISOString()}:${row.source}:${row.broadcastId}:${row.productId}`,
    );
    const existing = await tx.liveCommerceProductDailySnapshot.findUnique({
      where: {
        organizationId_businessDate_source_broadcastId_productId: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          source: row.source,
          broadcastId: row.broadcastId,
          productId: row.productId,
        },
      },
      select: { capturedAt: true },
    });
    if (existing && existing.capturedAt >= row.capturedAt) {
      return existing.capturedAt.getTime() === row.capturedAt.getTime()
        ? 'duplicate'
        : 'stale';
    }
    await tx.liveCommerceProductDailySnapshot.upsert({
      where: {
        organizationId_businessDate_source_broadcastId_productId: {
          organizationId: row.organizationId,
          businessDate: row.businessDate,
          source: row.source,
          broadcastId: row.broadcastId,
          productId: row.productId,
        },
      },
      create: row,
      update: {
        rank: row.rank,
        title: row.title,
        priceCny: row.priceCny,
        salesCount: row.salesCount,
        imageUrl: row.imageUrl,
        sourceUrl: row.sourceUrl,
        capturedAt: row.capturedAt,
      },
    });
    return 'accepted';
  }
  const row = record.row;
  await lockTypedIdentity(tx, `tiktok:${row.organizationId}:${row.businessDate.toISOString()}:${row.region}:${row.trendType}:${row.entityKey}`);
  const existing = await tx.tiktokCreativeTrendDailySnapshot.findUnique({
    where: {
      organizationId_businessDate_region_trendType_entityKey: {
        organizationId: row.organizationId,
        businessDate: row.businessDate,
        region: row.region,
        trendType: row.trendType,
        entityKey: row.entityKey,
      },
    },
    select: { capturedAt: true },
  });
  if (existing && existing.capturedAt >= row.capturedAt) return existing.capturedAt.getTime() === row.capturedAt.getTime() ? 'duplicate' : 'stale';
  await tx.tiktokCreativeTrendDailySnapshot.upsert({
    where: {
      organizationId_businessDate_region_trendType_entityKey: {
        organizationId: row.organizationId,
        businessDate: row.businessDate,
        region: row.region,
        trendType: row.trendType,
        entityKey: row.entityKey,
      },
    },
    create: {
      ...row,
      viewCount: row.viewCount == null ? null : BigInt(Math.trunc(row.viewCount)),
    },
    update: {
      rank: row.rank,
      label: row.label,
      industry: row.industry,
      sourceKeyword: row.sourceKeyword,
      postCount: row.postCount,
      viewCount: row.viewCount == null ? null : BigInt(Math.trunc(row.viewCount)),
      growthPct: row.growthPct,
      thumbnailUrl: row.thumbnailUrl,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
    },
  });
  return 'accepted';
}

async function persistExtensionCandidateProjection(
  tx: Transaction,
  row: SourcingExtensionCandidateProjection,
): Promise<'accepted' | 'duplicate' | 'stale'> {
  await lockTypedIdentity(
    tx,
    `extension-candidate:${row.organizationId}:${row.sourcePlatform}:${row.sourceIdentityHash}`,
  );
  if (row.pageType === 'description') {
    const existing = await tx.sourcingCandidate.findFirst({
      where: {
        organizationId: row.organizationId,
        sourceUrl: row.sourceUrl,
        isDeleted: false,
        status: 'sourced',
      },
      select: { id: true, rawData: true, description: true, thumbnailUrl: true, imageUrl: true },
    });
    if (!existing) return 'duplicate';
    await tx.sourcingCandidate.update({
      where: { id: existing.id },
      data: {
        rawData: mergeProjectionJson(existing.rawData, row.rawData) as Prisma.InputJsonValue,
        description: row.description ?? existing.description,
        thumbnailUrl: existing.thumbnailUrl ?? row.thumbnailUrl,
        imageUrl: existing.imageUrl ?? row.imageUrl,
      },
    });
    await ensureProjectedCandidateImages(tx, existing.id, row);
    return 'accepted';
  }

  const existing = await tx.sourcingCandidate.findFirst({
    where: {
      organizationId: row.organizationId,
      sourcePlatform: row.sourcePlatform,
      sourceIdentityHash: row.sourceIdentityHash,
      isDeleted: false,
      status: 'sourced',
    },
    select: { id: true, rawData: true },
  });
  const data = {
    sourcePlatform: row.sourcePlatform,
    externalOfferId: row.externalOfferId,
    variantKeyNormalized: row.variantKeyNormalized,
    sourceIdentityHash: row.sourceIdentityHash,
    rawData: mergeProjectionJson(existing?.rawData, row.rawData) as Prisma.InputJsonValue,
    name: row.name ?? row.externalOfferId,
    description: row.description ?? '',
    category: row.category,
    tags: row.tags as Prisma.InputJsonValue,
    thumbnailUrl: row.thumbnailUrl,
    imageUrl: row.imageUrl,
    costCny: row.costCny ?? undefined,
  };
  const candidate = existing
    ? await tx.sourcingCandidate.update({ where: { id: existing.id }, data })
    : await tx.sourcingCandidate.create({
        data: {
          organizationId: row.organizationId,
          sourceUrl: row.sourceUrl,
          triggeredByUserId: row.triggeredByUserId,
          status: 'sourced',
          ...data,
        },
      });
  await ensureProjectedCandidateImages(tx, candidate.id, row);
  return 'accepted';
}

async function ensureProjectedCandidateImages(
  tx: Transaction,
  candidateId: string,
  row: SourcingExtensionCandidateProjection,
): Promise<void> {
  if (row.images.length === 0) return;
  const existing = await tx.candidateImage.count({
    where: { candidateId, organizationId: row.organizationId, isDeleted: false },
  });
  if (existing > 0) return;
  await tx.candidateImage.createMany({
    data: row.images.map((image) => ({
      organizationId: row.organizationId,
      candidateId,
      url: image.url,
      role: image.role,
      label: image.label,
      sortOrder: image.sortOrder,
      source: image.source,
      isPrimary: image.isPrimary,
    })),
  });
}

function mergeProjectionJson(previous: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  return { ...base, ...incoming };
}

async function completeRun(
  tx: Transaction,
  runId: string,
  completedAt: Date,
  status: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await tx.sourcingEvidenceIngestionRun.update({
    where: { id: runId },
    data: { status, completedAt, ...fields },
  });
}

function toPermit(row: {
  id: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  leaseToken: string;
  generation: number;
  leaseExpiresAt: Date;
}): SourcingCollectionPermit {
  return {
    runId: row.id,
    organizationId: row.organizationId,
    sourceKey: row.sourceKey,
    scopeKey: row.scopeKey,
    targetKey: row.targetKey,
    leaseToken: row.leaseToken,
    generation: row.generation,
    leaseExpiresAt: row.leaseExpiresAt,
  };
}

function sameRecoverableIdentity(
  row: {
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
    requestHash: string;
    collectorKey: string;
    collectorVersion: string;
  },
  input: ClaimAuthorizedRunInput,
): boolean {
  return row.sourceKey === input.sourceKey
    && row.scopeKey === input.scopeKey
    && row.targetKey === input.targetKey
    && row.requestHash === input.requestHash
    && row.collectorKey === input.collectorKey
    && row.collectorVersion === input.collectorVersion;
}

function validateClaim(input: ClaimAuthorizedRunInput): void {
  if (!input.idempotencyKey || !input.requestHash || !input.collectorKey) {
    throw new TypeError('A collection claim needs idempotency, request, and collector identity.');
  }
  if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
    throw new TypeError('A collection lease duration must be a positive integer.');
  }
}

async function databaseClock(tx: Transaction): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  return rows[0].now;
}

async function lockCollectionTarget(
  tx: Transaction,
  input: Pick<ClaimAuthorizedRunInput, 'organizationId' | 'sourceKey' | 'scopeKey' | 'targetKey'>,
): Promise<void> {
  await advisoryLock(tx, `sourcing-collection:${input.organizationId}:${input.sourceKey}:${input.scopeKey}:${input.targetKey}`);
}

async function lockCollectionPermit(tx: Transaction, permit: SourcingCollectionPermit): Promise<void> {
  await advisoryLock(tx, `sourcing-collection-run:${permit.organizationId}:${permit.runId}`);
}

async function lockObservation(tx: Transaction, organizationId: string, observationKey: string): Promise<void> {
  await advisoryLock(tx, `sourcing-observation:${organizationId}:${observationKey}`);
}

async function lockTypedIdentity(tx: Transaction, identity: string): Promise<void> {
  await advisoryLock(tx, `sourcing-typed:${identity}`);
}

async function advisoryLock(tx: Transaction, key: string): Promise<void> {
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"
  `;
}

function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
