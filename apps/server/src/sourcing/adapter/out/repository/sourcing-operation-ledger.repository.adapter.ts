import { Inject, Injectable } from '@nestjs/common';
import { sourcingWingCatalogKeywordIdentity } from '@kiditem/shared/sourcing';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { isAllowedSourcingCollectionSource } from '../../../domain/sourcing-collection-source-policy';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
} from '../../../application/port/out/cross-domain/sales-product-draft.port';
import type { SourcingBrowserSourceFailureAlert } from '../../../application/port/out/repository/sourcing-browser-source-attempt.repository.port';
import type {
  AuthorizedCollectionOutput,
  SourcingCollectionPermit,
} from '../../../application/port/out/repository/sourcing-collection.repository.port';
import type {
  SourcingOperationLedgerRepositoryPort,
  SourcingOperationPublicationInput,
  SourcingSourceAccessFailure,
} from '../../../application/port/out/repository/sourcing-operation-ledger.repository.port';
import { persistBrowserSourceAttemptFacts } from './sourcing-browser-source-attempt.persistence';
import { publishSourceSnapshot } from './sourcing-source-publication.repository.adapter';

/**
 * 확장 구동 소싱 kind(KID-360)의 finish 트랜잭션 persistence. 원장 쓰기는 옛 attempt 종료와 같은
 * `persistBrowserSourceAttemptFacts`, 발행은 `publishSourceSnapshot`, 원천 실패 알림은 `SourceFailureAlerts`다.
 * 모두 계약이 넘긴 owner 트랜잭션에서 돈다.
 */
@Injectable()
export class SourcingOperationLedgerRepositoryAdapter implements SourcingOperationLedgerRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(SALES_PRODUCT_DRAFT_PORT) private readonly drafts: SalesProductDraftPort,
  ) {}

  async sourceAccessFailure(
    organizationId: string,
    sourceKey: string,
    transaction?: OwnerTransaction,
  ): Promise<SourcingSourceAccessFailure | null> {
    if (!isAllowedSourcingCollectionSource(sourceKey)) return 'SOURCE_NOT_ALLOWED';
    const client = transaction ? ownerTransactionClient(transaction) : this.prisma;
    const control = await client.sourcingCollectionSourceControl.findUnique({
      where: { organizationId_sourceKey: { organizationId, sourceKey } },
      select: { enabled: true },
    });
    return control?.enabled === false ? 'SOURCE_DISABLED' : null;
  }

  async persistFacts(
    transaction: OwnerTransaction,
    permit: SourcingCollectionPermit,
    output: AuthorizedCollectionOutput,
    now: Date,
  ) {
    const persisted = await persistBrowserSourceAttemptFacts(ownerTransactionClient(transaction), permit, output, now, this.drafts);
    return { duplicateCount: persisted.duplicateCount, admitted: persisted.admitted };
  }

  async countWingCatalogSnapshots(transaction: OwnerTransaction, organizationId: string, operationId: string) {
    const groups = await ownerTransactionClient(transaction).sourcingWingCatalogProductSnapshot.groupBy({
      by: ['sourceKeywordNormalized'],
      where: { organizationId, operationId, schemaVersion: 'coupang-wing-catalog/v2' },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [sourcingWingCatalogKeywordIdentity(group.sourceKeywordNormalized), group._count._all]));
  }

  async publish(
    transaction: OwnerTransaction,
    organizationId: string,
    operationId: string,
    publication: SourcingOperationPublicationInput,
  ): Promise<void> {
    await publishSourceSnapshot(ownerTransactionClient(transaction), {
      organizationId,
      operationId,
      sourceKey: publication.sourceKey,
      scopeKey: publication.scopeKey,
      targetKey: publication.targetKey,
      collectorKey: publication.collectorKey,
      collectorVersion: publication.collectorVersion,
      plan: publication.plan,
      windowStartAt: publication.windowStartAt,
      windowEndAt: publication.windowEndAt,
      discoveredCount: publication.discoveredCount,
      acceptedCount: publication.acceptedCount,
      duplicateCount: publication.duplicateCount,
      coverage: null,
      contentChecksum: publication.contentChecksum,
      qualityReport: publication.qualityReport,
      completedAt: publication.completedAt,
    });
  }

  recordSourceFailure(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; alert: SourcingBrowserSourceFailureAlert; code: string; message: string },
  ): Promise<void> {
    return this.alerts.recordTerminalOutcome(ownerTransactionClient(transaction), {
      code: input.code,
      organizationId: input.organizationId,
      dedupeKey: input.alert.dedupeKey,
      sourceType: input.alert.sourceType,
      attemptId: input.operationId,
      title: input.alert.title,
      message: input.message,
      href: input.alert.href,
    });
  }

  resolveSourceFailure(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; alert: SourcingBrowserSourceFailureAlert },
  ): Promise<void> {
    return this.alerts.resolveSourceFailure(ownerTransactionClient(transaction), {
      organizationId: input.organizationId,
      dedupeKey: input.alert.dedupeKey,
      attemptId: input.operationId,
    });
  }
}
