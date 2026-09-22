import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type RegistrationTarget } from '@prisma/client';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { REGISTRATION_SOURCE_PORT, type RegistrationSourcePort } from '../../../../sourcing/application/port/in/registration-source.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../../sourcing/application/port/in/registration-content-workspace.port';
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
  isUniqueConstraintError,
  lockPreparation,
  resolvedSelectionData,
  selectionResolutionInput,
  type OptionalSelectionKey,
} from './candidate-registration-rows';
import type { RegistrationSubmissionJson } from '../../../domain/registration/registration-submission-payload';
import type {
  CreateOrGetActiveDraftInput,
  ProductPreparationCancelledResult,
  ProductPreparationDraftResult,
  CandidateRegistrationPort,
  ProductPreparationRow,
  ReplaceDraftInputRequest,
  ResolveProductPreparationSelections,
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
    private readonly contentWorkspaces: RegistrationContentWorkspacePort) {}

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

  async createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: OwnerTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const handle = ownerTransaction(tx);
        await this.source.lock(handle, input.organizationId, input.sourceCandidateId);
        await this.source.requireActive(handle, input.organizationId, input.sourceCandidateId);
        const account = await tx.channelAccount.findFirst({
          where: { id: input.input.channelAccountId, organizationId: input.organizationId, status: 'active' },
          select: { id: true },
        });
        if (!account) throw new NotFoundException('Channel account not found.');

        const product = await requireConfirmedProductForCandidate(tx, input.organizationId, input.sourceCandidateId);
        const existing = await findCandidateAccountPreparation(tx, input.organizationId, product.id, input.input.channelAccountId);
        if (existing) {
          const [execution] = await readRegistrationExecutionFacts(tx, { organizationId: input.organizationId, registrationTargetIds: [existing.id] });
          if (registrationDraftState(existing.archivedAt, execution) !== 'draft') {
            throw new ConflictException('An active submission already exists for this account.');
          }
          return { preparationId: existing.id, status: 'draft' as const };
        }

        const sourceContentWorkspaceId = await resolveSourceWorkspace(
          handle,
        );
        const resolvedSelections = await resolveSelections(
          handle,
          selectionResolutionInput(
            input.organizationId,
            sourceContentWorkspaceId,
            input.input,
          ),
        );
        const created = await tx.registrationTarget.create({
          data: {
            organizationId: input.organizationId,
            salesProductId: product.id,
            selectedOptions: { createMany: { data: product.options.map((option, sortOrder) => ({
              salesProductOptionId: option.id, sortOrder,
            })) } },
            channelAccountId: input.input.channelAccountId,
            displayName: input.input.displayName,
            registrationInput: input.input.registrationInput as Prisma.InputJsonValue,
            ...resolvedSelectionData(resolvedSelections),
            createdByUserId: input.createdByUserId,
          },
          select: { id: true },
        });
        return {
          preparationId: created.id,
          status: 'draft' as const,
          sourceContentWorkspaceId,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException('등록 설정을 만드는 동안 충돌했습니다. 다시 확인해주세요.');
      throw error;
    }
  }

  async replaceDraftInput(
    input: ReplaceDraftInputRequest,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | ProductPreparationCancelledResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = ownerTransaction(tx);
      const identity = await tx.registrationTarget.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          archivedAt: null,
        },
        select: { salesProduct: { select: { sourceCandidateId: true } } },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      const sourceCandidateId = identity.salesProduct?.sourceCandidateId ?? null;
      if (sourceCandidateId) await this.source.lock(handle, input.organizationId, sourceCandidateId);
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.registrationTarget.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          archivedAt: null,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');

      // 실행 장부는 Channels 것이다. 편집·취소를 막는지 리더로만 읽는다(ADR-0009).
      const executions = await readRegistrationExecutionFacts(tx, {
        organizationId: input.organizationId,
        registrationTargetIds: [current.id],
      });
      if (input.command.kind === 'cancel') {
        if (executions.some(execution => ['prepared', 'executing', 'reconciling'].includes(execution.status))) {
          throw new ConflictException('An active execution must be resolved before archiving its target.');
        }
        await tx.registrationTarget.updateMany({
          where: { id: current.id, organizationId: input.organizationId, archivedAt: null },
          data: { archivedAt: new Date() },
        });
        return { preparationId: current.id, status: 'cancelled' as const };
      }

      if (current.archivedAt !== null) throw new ConflictException('Archived registration target cannot be edited.');

      assertPatchFresh(current, input.command.input);
      assertRegistrationIdentity(current);
      if (sourceCandidateId) await this.source.requireActive(handle, input.organizationId, sourceCandidateId);
      const workspaceId = sourceCandidateId
        ? await this.contentWorkspaces.findCandidateWorkspaceId({
          organizationId: input.organizationId,
          sourceCandidateId,
        })
        : null;
      const resolvedSelections = await resolveSelections(
        handle,
        selectionResolutionInput(
          input.organizationId,
          workspaceId ?? '',
          mergedSelectionValues(current, input.command.input),
        ),
      );

      // Editing only changes future submissions. All past and running payloads stay frozen.
      await tx.registrationTarget.update({
        where: { id: current.id, organizationId: input.organizationId },
        data: {
          ...editableUpdate(current, input.command.input),
          ...resolvedSelectionData(resolvedSelections),
          version: { increment: 1 },
        },
      });
      return { preparationId: current.id, status: 'draft' as const };
    });
  }
}

type ReplaceInput = Extract<
  ReplaceDraftInputRequest['command'],
  { kind: 'replace' }
>['input'];

function editableUpdate(
  current: RegistrationTarget,
  input: ReplaceInput,
): Prisma.RegistrationTargetUncheckedUpdateInput {
  return {
    // Legacy approval remains tied to the already frozen execution, not this edit.
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.registrationInput !== undefined
      ? {
          registrationInput: mergeRegistrationInput(
            current.registrationInput,
            input.registrationInput,
          ) as Prisma.InputJsonValue,
        }
      : {}),
    ...(input.selectedThumbnailUrl !== undefined
      ? { selectedThumbnailUrl: input.selectedThumbnailUrl }
      : {}),
    ...(input.selectedThumbnailGenerationId !== undefined
      ? { selectedThumbnailGenerationId: input.selectedThumbnailGenerationId }
      : {}),
    ...(input.selectedThumbnailGenerationCandidateId !== undefined
      ? {
          selectedThumbnailGenerationCandidateId:
            input.selectedThumbnailGenerationCandidateId,
        }
      : {}),
    ...(input.selectedDetailPageArtifactId !== undefined
      ? { selectedDetailPageArtifactId: input.selectedDetailPageArtifactId }
      : {}),
    ...(input.selectedDetailPageRevisionId !== undefined
      ? { selectedDetailPageRevisionId: input.selectedDetailPageRevisionId }
      : {}),
    ...(input.selectedDetailPageGenerationId !== undefined
      ? { selectedDetailPageGenerationId: input.selectedDetailPageGenerationId }
      : {}),
  };
}

function assertPatchFresh(
  current: Pick<RegistrationTarget, 'updatedAt'>,
  input: ReplaceInput,
): void {
  if (!Object.prototype.hasOwnProperty.call(input, 'basePreparationUpdatedAt')) return;
  const baseUpdatedAt = input.basePreparationUpdatedAt ?? null;
  if (!baseUpdatedAt) throw stalePreparationConflict();
  const parsed = Date.parse(baseUpdatedAt);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException('basePreparationUpdatedAt must be an ISO date string');
  }
  if (current.updatedAt.getTime() !== parsed) throw stalePreparationConflict();
}

function stalePreparationConflict(): ConflictException {
  return new ConflictException(
    '상품 기본정보가 다른 탭에서 먼저 변경되었습니다. 새로고침 후 다시 저장해주세요.',
  );
}

function mergeRegistrationInput(
  current: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const currentRecord = jsonRecord(current);
  const merged: Record<string, unknown> = { ...currentRecord };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = isJsonRecord(value) && isJsonRecord(currentRecord[key])
      ? mergeRegistrationInput(currentRecord[key], value)
      : value;
  }
  return merged;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {};
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergedSelectionValues(
  current: RegistrationTarget,
  update: ReplaceInput,
): Record<OptionalSelectionKey, string | null> {
  return {
    selectedThumbnailUrl: valueOrCurrent(update, 'selectedThumbnailUrl', current),
    selectedThumbnailGenerationId:
      valueOrCurrent(update, 'selectedThumbnailGenerationId', current),
    selectedThumbnailGenerationCandidateId:
      valueOrCurrent(update, 'selectedThumbnailGenerationCandidateId', current),
    selectedDetailPageArtifactId:
      valueOrCurrent(update, 'selectedDetailPageArtifactId', current),
    selectedDetailPageRevisionId:
      valueOrCurrent(update, 'selectedDetailPageRevisionId', current),
    selectedDetailPageGenerationId:
      valueOrCurrent(update, 'selectedDetailPageGenerationId', current),
  };
}

function valueOrCurrent(
  input: Partial<Record<OptionalSelectionKey, string | null>>,
  key: OptionalSelectionKey,
  current: RegistrationTarget,
): string | null {
  return input[key] !== undefined ? input[key] ?? null : current[key];
}
