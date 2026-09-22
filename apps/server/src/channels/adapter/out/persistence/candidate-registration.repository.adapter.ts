import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { REGISTRATION_SOURCE_PORT, type RegistrationSourcePort } from '../../../../sourcing/application/port/in/registration-source.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../ai/application/port/in/workspace/registration-content-workspace.port';
import {
  SALES_PRODUCT_THUMBNAIL_SOURCE_PORT,
  type SalesProductThumbnailSourcePort,
} from '../../../application/port/out/ai/sales-product-thumbnail-source.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  blocksCandidateTerminalTransition as executionsBlockTerminalTransition,
  candidateRegistrationState,
  readRegistrationExecutionFacts,
  registrationDraftState,
  type CandidateRegistrationState,
} from '../../../read/registration-execution.reader';
import {
  blocksCandidateTerminalTransition,
} from '../../../../sourcing/domain/product-preparation-state';
import {
  requireConfirmedProductForCandidate,
  findCandidateAccountPreparation,
  assertRegistrationIdentity,
  assertThumbnailBelongsToProduct,
  isUniqueConstraintError,
  lockPreparation,
  resolvedSelectionData,
  selectionResolutionInput,
  type OptionalSelectionKey,
} from './candidate-registration-rows';
import type { RegistrationSubmissionJson } from '../../../domain/registration/registration-submission-payload';
import type {
  CandidateRegistrationPort,
  ProductPreparationRow,
} from '../../../application/port/in/candidate-registration.port';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

/**
 * 초안(`RegistrationTarget`) 저장소.
 *
 * 제출 울타리는 Channels 것이라 여기에는 실행 행을 쓰는 경로가 없다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 울타리 상태가 필요한 자리에서는 등록된 리더로 읽는다(ADR-0009).
 */
@Injectable()
export class ProductPreparationRepositoryAdapter
  implements CandidateRegistrationPort
{
  constructor(private readonly prisma: PrismaService,
    @Inject(REGISTRATION_SOURCE_PORT) private readonly source: RegistrationSourcePort,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
    @Optional() @Inject(SALES_PRODUCT_THUMBNAIL_SOURCE_PORT)
    private readonly thumbnailSources?: SalesProductThumbnailSourcePort) {}

  /**
   * 몰에 나갈 대표 사진은 그 판매상품의 사진이어야 한다(KID-310). 손으로 적은 주소나 다른 상품의
   * 사진을 그대로 얼리면 몰에서 엉뚱한 상품이 되고 되돌릴 방법이 없다.
   */
  private assertThumbnailBelongsToProduct(
    organizationId: string,
    salesProductId: string,
    selectedThumbnailUrl: string | null,
  ): Promise<void> {
    return assertThumbnailBelongsToProduct(
      this.prisma, this.thumbnailSources, organizationId, salesProductId, selectedThumbnailUrl,
    );
  }

  async readForCandidates(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Awaited<ReturnType<CandidateRegistrationPort['readForCandidates']>>> {
    const ids = [...new Set(candidateIds.filter((id): id is string => Boolean(id)))];
    const result = new Map<string, {
      preparations: ProductPreparationRow[];
      registrationState: CandidateRegistrationState;
    }>();
    for (const candidateId of ids) {
      result.set(candidateId, { preparations: [], registrationState: 'none' });
    }
    if (ids.length === 0) return result;

    // 후보 → 초안(판매상품) → 등록 설정. owner 를 넘는 조인이 아니라 Channels 안의 조인이다.
    const drafts = await this.prisma.salesProduct.findMany({
      where: { organizationId, sourceCandidateId: { in: ids } },
      select: { id: true, sourceCandidateId: true },
    });
    const candidateByProduct = new Map(drafts.map((draft) => [draft.id, draft.sourceCandidateId!]));
    if (candidateByProduct.size === 0) return result;
    const rows = await this.prisma.registrationTarget.findMany({
      where: {
        organizationId,
        salesProductId: { in: [...candidateByProduct.keys()] },
        archivedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        salesProductId: true,
        channelAccountId: true,
        displayName: true,
        archivedAt: true,
        selectedThumbnailUrl: true,
        selectedThumbnailGenerationId: true,
        selectedThumbnailGenerationCandidateId: true,
        selectedDetailPageArtifactId: true,
        selectedDetailPageRevisionId: true,
        selectedDetailPageGenerationId: true,
        registrationInput: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const validRows = rows
      .map((row) => ({ ...row, sourceCandidateId: candidateByProduct.get(row.salesProductId) }))
      .filter((row): row is typeof row & { sourceCandidateId: string } => typeof row.sourceCandidateId === 'string');
    if (validRows.length === 0) return result;

    const facts = await readRegistrationExecutionFacts(this.prisma, {
      organizationId,
      registrationTargetIds: validRows.map((row) => row.id),
    });
    // The registered reader returns newest-first. Keep the first fact for each
    // preparation; Map(facts.map(...)) would overwrite it with an older row.
    const latestByPreparation = new Map<string, typeof facts[number]>();
    for (const fact of facts) {
      if (!latestByPreparation.has(fact.registrationTargetId)) {
        latestByPreparation.set(fact.registrationTargetId, fact);
      }
    }
    const candidateByPreparation = new Map(
      validRows.map((row) => [row.id, row.sourceCandidateId]),
    );
    const factsByCandidate = new Map<string, typeof facts[number][]>();
    // The registered reader is newest-first across all preparations. Preserve
    // that order after retaining one fact per preparation so the candidate
    // projection also uses its newest registration attempt.
    for (const fact of facts) {
      if (latestByPreparation.get(fact.registrationTargetId)?.executionId !== fact.executionId) {
        continue;
      }
      const candidateId = candidateByPreparation.get(fact.registrationTargetId);
      if (!candidateId) continue;
      const candidateFacts = factsByCandidate.get(candidateId);
      if (candidateFacts) candidateFacts.push(fact);
      else factsByCandidate.set(candidateId, [fact]);
    }
    for (const row of validRows) {
      const candidate = result.get(row.sourceCandidateId);
      if (!candidate) continue;
      const execution = latestByPreparation.get(row.id);
      candidate.preparations.push({
        id: row.id,
        salesProductId: row.salesProductId,
        sourceCandidateId: row.sourceCandidateId,
        channelAccountId: row.channelAccountId,
        channelListingId: execution?.channelListingId ?? null,
        displayName: row.displayName,
        status: registrationDraftState(row.archivedAt, execution),
        selectedThumbnailUrl: row.selectedThumbnailUrl,
        selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
        selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
        selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
        selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
        selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
        registrationInput: row.registrationInput as RegistrationSubmissionJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    for (const [candidateId, state] of result) {
      state.registrationState = candidateRegistrationState(factsByCandidate.get(candidateId) ?? []);
    }
    return result;
  }

  async assertCandidateTerminalTransitionAllowed(
    transaction: OwnerTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const preparations = await tx.registrationTarget.findMany({
      where: {
        organizationId: input.organizationId,
        salesProduct: { organizationId: input.organizationId, sourceCandidateId: input.sourceCandidateId },
        archivedAt: null,
      },
      select: {
        id: true,
        archivedAt: true,
      },
    });
    // 울타리 쪽 근거는 Channels 리더로 읽는다. 실행 행은 Sourcing 것이 아니다.
    const executions = await readRegistrationExecutionFacts(tx, {
      organizationId: input.organizationId,
      registrationTargetIds: preparations.map((row) => row.id),
    });
    if (executionsBlockTerminalTransition(executions)) {
      throw new ConflictException(
        'Candidate has an active registration execution or retained provider identity.',
      );
    }
    if (preparations.some((row) => blocksCandidateTerminalTransition({
      status: registrationDraftState(row.archivedAt, executions.find((fact) => fact.registrationTargetId === row.id)),
    }))) {
      throw new ConflictException(
        'Candidate has an active product preparation or retained provider identity.',
      );
    }
  }

}
