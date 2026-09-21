import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type ProductPreparation } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  blocksCandidateTerminalTransition as executionsBlockTerminalTransition,
  readRegistrationExecutionFacts,
  registrationDraftState,
} from '../../../../channels/read/registration-execution.reader';
import type {
  CreateOrGetActiveDraftInput,
  ProductPreparationCancelledResult,
  ProductPreparationDraftResult,
  ProductPreparationRepositoryPort,
  ReplaceDraftInputRequest,
  ResolveProductPreparationSelections,
} from '../../../application/port/out/repository/product-preparation.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import {
  blocksCandidateTerminalTransition,
} from '../../../domain/product-preparation-state';
import {
  assertActiveCandidate,
  assertRegistrationIdentity,
  isUniqueConstraintError,
  lockCandidate,
  lockPreparation,
  resolvedSelectionData,
  selectionResolutionInput,
  type OptionalSelectionKey,
} from './product-preparation-rows';

/**
 * 초안(`ProductPreparation`) 저장소.
 *
 * 제출 울타리는 Channels 것이라 여기에는 실행 행을 쓰는 경로가 없다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 울타리 상태가 필요한 자리에서는 등록된 리더로 읽는다(ADR-0009).
 */
@Injectable()
export class ProductPreparationRepositoryAdapter
  implements ProductPreparationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertCandidateTerminalTransitionAllowed(
    transaction: SourcingRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void> {
    const tx = transaction as Prisma.TransactionClient;
    const preparations = await tx.productPreparation.findMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        isDeleted: false,
      },
      select: {
        id: true,
        closedAt: true,
      },
    });
    // 울타리 쪽 근거는 Channels 리더로 읽는다. 실행 행은 Sourcing 것이 아니다.
    const executions = await readRegistrationExecutionFacts(tx, {
      organizationId: input.organizationId,
      productPreparationIds: preparations.map((row) => row.id),
    });
    if (executionsBlockTerminalTransition(executions)) {
      throw new ConflictException(
        'Candidate has an active registration execution or retained provider identity.',
      );
    }
    if (preparations.some((row) => blocksCandidateTerminalTransition({
      status: registrationDraftState(row.closedAt, executions.find((fact) => fact.productPreparationId === row.id)),
    }))) {
      throw new ConflictException(
        'Candidate has an active product preparation or retained provider identity.',
      );
    }
  }

  async createOrGetActiveDraft(
    input: CreateOrGetActiveDraftInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockCandidate(tx, input.organizationId, input.sourceCandidateId);
        const [candidate, account] = await Promise.all([
          tx.sourcingCandidate.findFirst({
            where: {
              id: input.sourceCandidateId,
              organizationId: input.organizationId,
              isDeleted: false,
            },
            select: { id: true, status: true },
          }),
          tx.channelAccount.findFirst({
            where: {
              id: input.input.channelAccountId,
              organizationId: input.organizationId,
              status: 'active',
            },
            select: { id: true },
          }),
        ]);
        if (!candidate) throw new NotFoundException('Sourcing candidate not found.');
        if (candidate.status !== 'sourced') {
          throw new UnprocessableEntityException(
            `Candidate cannot be prepared from status '${candidate.status}'.`,
          );
        }
        if (!account) throw new NotFoundException('Channel account not found.');

        const existing = await tx.productPreparation.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.input.channelAccountId,
            closedAt: null,
            isDeleted: false,
          },
          select: { id: true, closedAt: true, reviewPayloadHash: true, sourceContentWorkspaceId: true },
        });
        if (existing) {
          const [execution] = await readRegistrationExecutionFacts(tx, { organizationId: input.organizationId, productPreparationIds: [existing.id] });
          if (existing.reviewPayloadHash !== null || registrationDraftState(existing.closedAt, execution) !== 'draft') {
            throw new ConflictException('An active submission already exists for this account.');
          }
          return {
            preparationId: existing.id,
            status: 'draft' as const,
            sourceContentWorkspaceId: existing.sourceContentWorkspaceId ?? undefined,
          };
        }

        const sourceContentWorkspaceId = await resolveSourceWorkspace(
          tx as unknown as SourcingRepositoryTransaction,
        );
        const resolvedSelections = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(
            input.organizationId,
            sourceContentWorkspaceId,
            input.input,
          ),
        );
        const created = await tx.productPreparation.create({
          data: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.input.channelAccountId,
            sourceContentWorkspaceId,
            displayName: input.input.displayName,
            closedAt: null,
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
      if (!isUniqueConstraintError(error)) throw error;

      const winner = await this.prisma.productPreparation.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.input.channelAccountId,
          closedAt: null,
          isDeleted: false,
        },
        select: { id: true, closedAt: true, reviewPayloadHash: true, sourceContentWorkspaceId: true },
      });
      if (winner) {
        const [execution] = await readRegistrationExecutionFacts(this.prisma, {
          organizationId: input.organizationId,
          productPreparationIds: [winner.id],
        });
        if (winner.reviewPayloadHash !== null || registrationDraftState(winner.closedAt, execution) !== 'draft') {
          throw new ConflictException('An active submission already exists for this account.');
        }
        return {
          preparationId: winner.id,
          status: 'draft',
          sourceContentWorkspaceId: winner.sourceContentWorkspaceId ?? undefined,
        };
      }

      const candidateWideConflict = await this.prisma.productPreparation.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          isDeleted: false,
        },
        select: { channelAccountId: true },
      });
      if (candidateWideConflict) {
        throw new ConflictException(
          'Candidate already has a preparation for another channel account during the 0.1.8 expand compatibility window.',
        );
      }
      throw new ConflictException('A concurrent preparation command won.');
    }
  }

  async replaceDraftInput(
    input: ReplaceDraftInputRequest,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | ProductPreparationCancelledResult> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, input.organizationId, identity.sourceCandidateId);
      }
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');

      // 실행 장부는 Channels 것이다. 편집·취소를 막는지 리더로만 읽는다(ADR-0009).
      const executions = await readRegistrationExecutionFacts(tx, {
        organizationId: input.organizationId,
        productPreparationIds: [current.id],
      });
      const currentState = registrationDraftState(current.closedAt, executions[0]);
      if (current.reviewPayloadHash !== null && executions.length === 0) {
        throw new ConflictException('Approved preparation is missing its registration execution.');
      }
      if (executionsBlockTerminalTransition(executions)) {
        throw new ConflictException(
          'Preparation execution cannot be discarded or edited.',
        );
      }

      if (input.command.kind === 'cancel') {
        if (currentState !== 'draft' && currentState !== 'failed') {
          throw new ConflictException(`Preparation cannot be cancelled from '${currentState}'.`);
        }
        await tx.productPreparation.updateMany({
          where: { id: current.id, organizationId: input.organizationId, isDeleted: false },
          data: {
            closedAt: new Date(),
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        return { preparationId: current.id, status: 'cancelled' as const };
      }

      if (currentState !== 'draft' && currentState !== 'failed') {
        throw new ConflictException(`Preparation cannot be edited from '${currentState}'.`);
      }

      assertPatchFresh(current, input.command.input);
      assertRegistrationIdentity(current);
      await assertActiveCandidate(tx, input.organizationId, current.sourceCandidateId);
      const resolvedSelections = await resolveSelections(
        tx as unknown as SourcingRepositoryTransaction,
        selectionResolutionInput(
          input.organizationId,
          current.sourceContentWorkspaceId,
          mergedSelectionValues(current, input.command.input),
        ),
      );

      if (currentState === 'draft') {
        await tx.productPreparation.updateMany({
          where: {
            id: current.id,
            organizationId: input.organizationId,
            closedAt: null,
            isDeleted: false,
          },
          data: {
            ...editableUpdate(current, input.command.input),
            ...resolvedSelectionData(resolvedSelections),
          },
        });
        return { preparationId: current.id, status: 'draft' as const };
      }
      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          closedAt: null,
          isDeleted: false,
        },
        data: {
          closedAt: new Date(),
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
      const created = await tx.productPreparation.create({
        data: replacementCreateData(
          current,
          input.organizationId,
          input.userId,
          input.command.input,
          resolvedSelections,
        ),
        select: { id: true },
      });
      return { preparationId: created.id, status: 'draft' as const };
    });
  }
}

type ReplaceInput = Extract<
  ReplaceDraftInputRequest['command'],
  { kind: 'replace' }
>['input'];

type ResolvedSelections = Awaited<ReturnType<ResolveProductPreparationSelections>>;

function editableUpdate(
  current: ProductPreparation,
  input: ReplaceInput,
): Prisma.ProductPreparationUncheckedUpdateInput {
  return {
    reviewPayloadHash: null,
    approvedAt: null,
    approvedByUserId: null,
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

function replacementCreateData(
  current: ProductPreparation,
  organizationId: string,
  userId: string | null,
  update: ReplaceInput,
  resolvedSelections: ResolvedSelections,
): Prisma.ProductPreparationUncheckedCreateInput {
  return {
    organizationId,
    sourceCandidateId: current.sourceCandidateId,
    channelAccountId: current.channelAccountId,
    sourceContentWorkspaceId: current.sourceContentWorkspaceId,
    displayName: update.displayName ?? current.displayName,
    closedAt: null,
    registrationInput: (update.registrationInput === undefined
      ? current.registrationInput
      : mergeRegistrationInput(current.registrationInput, update.registrationInput)
    ) as Prisma.InputJsonValue,
    ...resolvedSelectionData(resolvedSelections),
    createdByUserId: userId,
  };
}

function assertPatchFresh(
  current: Pick<ProductPreparation, 'updatedAt'>,
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
  current: ProductPreparation,
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
  current: ProductPreparation,
): string | null {
  return input[key] !== undefined ? input[key] ?? null : current[key];
}
