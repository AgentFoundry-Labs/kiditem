import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { readRegistrationExecutionFacts } from '../repository/registration-execution.reader';
import {
  candidateRegistrationState,
  registrationDraftState,
  type CandidateRegistrationState,
} from '../../../domain/registration/registration-execution-state';
import type { RegistrationSubmissionJson } from '../../../domain/registration/registration-submission-payload';
import type {
  ProductPreparationRow,
  RegistrationStatePort,
} from '../../../application/port/in/registration-state.port';

/**
 * 판매상품마다 등록 설정과 그 등록 상태를 읽는다(KID-313).
 *
 * 등록 상태의 근거는 설정 줄이 아니라 울타리다(ADR-0014). 실행 장부는 Channels 것이라 등록된
 * 리더로만 읽는다(ADR-0009).
 */
@Injectable()
export class RegistrationStateRepositoryAdapter implements RegistrationStatePort {
  constructor(private readonly prisma: PrismaService) {}

  async readForSalesProducts(
    organizationId: string,
    salesProductIds: readonly string[],
  ): Promise<Awaited<ReturnType<RegistrationStatePort['readForSalesProducts']>>> {
    const ids = [...new Set(salesProductIds.filter((id): id is string => Boolean(id)))];
    const result = new Map<string, {
      preparations: ProductPreparationRow[];
      registrationState: CandidateRegistrationState;
    }>();
    if (ids.length === 0) return result;

    const drafts = await this.prisma.salesProduct.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, sourceRecordId: true },
    });
    const sourceRecordByProduct = new Map(drafts.map((draft) => [draft.id, draft.sourceRecordId]));
    for (const draft of drafts) result.set(draft.id, { preparations: [], registrationState: 'none' });
    if (sourceRecordByProduct.size === 0) return result;
    const targetRows = await this.prisma.registrationTarget.findMany({
      where: {
        organizationId,
        salesProductId: { in: [...sourceRecordByProduct.keys()] },
        archivedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        salesProductId: true,
        channelAccountId: true,
        archivedAt: true,
        selectedThumbnailAssetId: true,
        selectedDetailPageRevisionId: true,
        registrationInput: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // 이 조직에서 찾은 초안의 설정만 읽는다.
    const rows = targetRows.filter((row) => sourceRecordByProduct.has(row.salesProductId));
    if (rows.length === 0) return result;

    const facts = await readRegistrationExecutionFacts(this.prisma, {
      organizationId,
      registrationTargetIds: rows.map((row) => row.id),
    });
    // The registered reader returns newest-first. Keep the first fact for each
    // target; Map(facts.map(...)) would overwrite it with an older row.
    const latestByTarget = new Map<string, typeof facts[number]>();
    for (const fact of facts) {
      if (!latestByTarget.has(fact.registrationTargetId)) {
        latestByTarget.set(fact.registrationTargetId, fact);
      }
    }
    const productByTarget = new Map(rows.map((row) => [row.id, row.salesProductId]));
    const factsByProduct = new Map<string, typeof facts[number][]>();
    // Newest-first across all targets; keep one fact per target so the product
    // projection also uses its newest registration attempt.
    for (const fact of facts) {
      if (latestByTarget.get(fact.registrationTargetId)?.executionId !== fact.executionId) continue;
      const salesProductId = productByTarget.get(fact.registrationTargetId);
      if (!salesProductId) continue;
      const productFacts = factsByProduct.get(salesProductId);
      if (productFacts) productFacts.push(fact);
      else factsByProduct.set(salesProductId, [fact]);
    }
    for (const row of rows) {
      const product = result.get(row.salesProductId);
      if (!product) continue;
      const execution = latestByTarget.get(row.id);
      product.preparations.push({
        id: row.id,
        salesProductId: row.salesProductId,
        sourceRecordId: sourceRecordByProduct.get(row.salesProductId) ?? null,
        channelAccountId: row.channelAccountId,
        channelListingId: execution?.channelListingId ?? null,
        status: registrationDraftState(row.archivedAt, execution),
        selectedThumbnailAssetId: row.selectedThumbnailAssetId,
        selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
        registrationInput: row.registrationInput as RegistrationSubmissionJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    for (const [salesProductId, state] of result) {
      state.registrationState = candidateRegistrationState(factsByProduct.get(salesProductId) ?? []);
    }
    return result;
  }
}
