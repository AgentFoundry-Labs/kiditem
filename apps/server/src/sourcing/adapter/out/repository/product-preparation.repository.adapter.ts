import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  type ProductPreparation,
  type ProductRegistrationExecution,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateOrGetActiveDraftInput,
  FrozenProductPreparationSubmission,
  ProductPreparationClaimResult,
  ProductPreparationDraftResult,
  ProductPreparationRepositoryPort,
  ExternalRegistrationExecutionResult,
  PrepareExternalRegistrationExecutionInput,
  ResolveProductPreparationSelections,
  ReplaceDraftInputRequest,
} from '../../../application/port/out/repository/product-preparation.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import {
  freezeProductPreparationPayload,
  type ProductPreparationJson,
} from '../../../domain/product-preparation-payload';
import {
  blocksCandidateTerminalTransition,
  canDiscardProviderIdentity,
  canStartProviderCreate,
  hasLiveSubmissionLease,
  type ProductPreparationProviderOutcome,
  resolveProviderOutcome,
} from '../../../domain/product-preparation-state';

const ACTIVE_PREPARATION_STATUSES = ['draft', 'submitting', 'failed'] as const;

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
    const executions = await tx.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        productPreparation: {
          sourceCandidateId: input.sourceCandidateId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      },
      select: {
        status: true,
        providerOutcome: true,
        providerSubmissionId: true,
        externalListingId: true,
        resultJson: true,
      },
    });
    if (executions.some((execution) =>
      ['prepared', 'executing', 'reconciling', 'succeeded'].includes(execution.status)
      || execution.providerSubmissionId !== null
      || execution.externalListingId !== null
      || execution.resultJson !== null,
    )) {
      throw new ConflictException(
        'Candidate has an active registration execution or retained provider identity.',
      );
    }
    const preparations = await tx.productPreparation.findMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        status: { in: [...ACTIVE_PREPARATION_STATUSES] },
        isDeleted: false,
      },
      select: {
        status: true,
        providerOutcome: true,
        submissionKey: true,
        providerSubmissionId: true,
        registrationResult: true,
      },
    });
    if (preparations.some((row) => blocksCandidateTerminalTransition({
      status: row.status,
      outcome: resolveProviderOutcome(row),
      submissionKey: row.submissionKey,
      providerSubmissionId: row.providerSubmissionId,
      registrationResult: row.registrationResult,
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
            status: { in: [...ACTIVE_PREPARATION_STATUSES] },
            isDeleted: false,
          },
          select: { id: true, status: true, sourceContentWorkspaceId: true },
        });
        if (existing) {
          if (existing.status !== 'draft') {
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
            status: 'draft',
            submissionKey: randomUUID(),
            registrationInput: input.input.registrationInput as Prisma.InputJsonValue,
            ...resolvedSelectionData(resolvedSelections),
            providerOutcome: 'not_attempted',
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
          status: 'draft',
          isDeleted: false,
        },
        select: { id: true, sourceContentWorkspaceId: true },
      });
      if (winner) {
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

  async prepareExternalExecution(
    input: PrepareExternalRegistrationExecutionInput,
    resolveSourceWorkspace: (tx: SourcingRepositoryTransaction) => Promise<string>,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ExternalRegistrationExecutionResult> {
    const frozen = freezeProductPreparationPayload({
      channelAccountId: input.channelAccountId,
      displayName: input.displayName,
      registrationInput: input.registrationInput,
    } as ProductPreparationJson);
    try {
      return await this.prisma.$transaction(async (tx) => {
      const replay = await tx.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        include: { productPreparation: { select: { sourceCandidateId: true } } },
      });
      if (replay) {
        if (replay.requestHash !== frozen.hash) {
          throw new ConflictException('External registration idempotency key was reused with a different payload.');
        }
        if (replay.channelAccountId !== input.channelAccountId
          || replay.productPreparation.sourceCandidateId !== input.sourceCandidateId
          || replay.requestedByUserId !== input.requestedByUserId) {
          throw new ConflictException('External registration execution belongs to another account, candidate, or actor.');
        }
        return externalExecutionResult(replay);
      }
      await lockCandidate(tx, input.organizationId, input.sourceCandidateId);
      const lockedReplay = await tx.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        include: { productPreparation: { select: { sourceCandidateId: true } } },
      });
      if (lockedReplay) {
        if (lockedReplay.requestHash !== frozen.hash
          || lockedReplay.channelAccountId !== input.channelAccountId
          || lockedReplay.productPreparation.sourceCandidateId !== input.sourceCandidateId
          || lockedReplay.requestedByUserId !== input.requestedByUserId) {
          throw new ConflictException('External registration idempotency key belongs to a different request.');
        }
        return externalExecutionResult(lockedReplay);
      }
      await assertActiveCandidate(tx, input.organizationId, input.sourceCandidateId);
      const account = await tx.channelAccount.findFirst({
        where: { id: input.channelAccountId, organizationId: input.organizationId, status: 'active' },
        select: { id: true, channel: true, vendorId: true, externalAccountId: true },
      });
      if (!account) throw new NotFoundException('Channel account not found.');
      const expectedProviderAccountId = account.vendorId?.trim() || account.externalAccountId?.trim() || '';
      if (account.channel !== 'coupang' || !expectedProviderAccountId) {
        throw new ConflictException('External WING registration requires an active Coupang account with a vendor identity.');
      }
      // 브라우저 새로고침/재진입은 새 UI idempotency key를 만들 수 있다. 같은 후보·계정·
      // 사용자·동일 frozen payload의 미종결 외부 실행이 있으면 새 준비를 만들지 않고
      // 그 실행을 돌려줘 수동 완료/정산 UI가 이어받게 한다.
      const resumable = await tx.productRegistrationExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          executionKind: 'external_wing',
          requestHash: frozen.hash,
          requestedByUserId: input.requestedByUserId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
          productPreparation: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            isDeleted: false,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (resumable) return externalExecutionResult(resumable);
      let preparation = await tx.productPreparation.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.channelAccountId,
          isDeleted: false,
          status: 'draft',
        },
      });
      let sourceContentWorkspaceId: string;
      if (!preparation) {
        const active = await tx.productPreparation.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.channelAccountId,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (active) throw new ConflictException('An active registration preparation already exists.');
        sourceContentWorkspaceId = await resolveSourceWorkspace(tx as unknown as SourcingRepositoryTransaction);
        const resolved = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(input.organizationId, sourceContentWorkspaceId, {}),
        );
        preparation = await tx.productPreparation.create({
          data: {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
            channelAccountId: input.channelAccountId,
            sourceContentWorkspaceId,
            displayName: input.displayName,
            status: 'submitting',
            submissionKey: input.idempotencyKey,
            registrationInput: input.registrationInput as Prisma.InputJsonValue,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            reviewPayloadHash: frozen.hash,
            approvedAt: new Date(),
            approvedByUserId: input.requestedByUserId,
            providerOutcome: 'not_attempted',
            createdByUserId: input.requestedByUserId,
            ...resolvedSelectionData(resolved),
          },
        });
      } else {
        sourceContentWorkspaceId = preparation.sourceContentWorkspaceId;
        const resolved = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(input.organizationId, sourceContentWorkspaceId, {}),
        );
        preparation = await tx.productPreparation.update({
          where: { id: preparation.id },
          data: {
            displayName: input.displayName,
            registrationInput: input.registrationInput as Prisma.InputJsonValue,
            status: 'submitting',
            submissionKey: input.idempotencyKey,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            reviewPayloadHash: frozen.hash,
            approvedAt: new Date(),
            approvedByUserId: input.requestedByUserId,
            providerOutcome: 'not_attempted',
            ...resolvedSelectionData(resolved),
          },
        });
      }
      const execution = await tx.productRegistrationExecution.create({
        data: {
          organizationId: input.organizationId,
          productPreparationId: preparation.id,
          channelAccountId: input.channelAccountId,
          executionKind: 'external_wing',
          expectedProviderAccountId,
          idempotencyKey: input.idempotencyKey,
          requestHash: frozen.hash,
          submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
          submissionPayloadHash: frozen.hash,
          status: 'prepared',
          providerOutcome: 'not_attempted',
          requestedByUserId: input.requestedByUserId,
        },
      });
      return externalExecutionResult(execution);
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.prisma.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        include: { productPreparation: { select: { sourceCandidateId: true } } },
      });
      if (!replay
        || replay.requestHash !== frozen.hash
        || replay.channelAccountId !== input.channelAccountId
        || replay.productPreparation.sourceCandidateId !== input.sourceCandidateId
        || replay.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Concurrent external registration preparation conflicted.');
      }
      return externalExecutionResult(replay);
    }
  }

  async startExternalExecution(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<ExternalRegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const execution = await tx.productRegistrationExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          productPreparation: { sourceCandidateId: input.sourceCandidateId, organizationId: input.organizationId },
        },
      });
      if (!execution) throw new NotFoundException('External registration execution not found.');
      await lockExecution(tx, input.organizationId, execution.id);
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('External registration execution belongs to a different actor.');
      }
      if (execution.status === 'executing' && execution.providerOutcome === 'uncertain') {
        return externalExecutionResult(execution);
      }
      if (execution.status !== 'prepared' || execution.providerOutcome !== 'not_attempted') {
        throw new ConflictException('External registration execution cannot be started from its current state.');
      }
      const leaseToken = randomUUID();
      const startedAt = new Date();
      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: { status: 'executing', providerOutcome: 'uncertain', leaseToken, leaseClaimedAt: startedAt, startedAt },
      });
      await tx.productPreparation.updateMany({
        where: { id: execution.productPreparationId, organizationId: input.organizationId, isDeleted: false },
        data: { status: 'submitting', providerOutcome: 'uncertain', submissionLeaseToken: leaseToken, submissionLeaseClaimedAt: startedAt },
      });
      return externalExecutionResult(updated);
    });
  }

  async getExternalExecution(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<ExternalRegistrationExecutionResult> {
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        requestedByUserId: input.requestedByUserId,
        productPreparation: { sourceCandidateId: input.sourceCandidateId, organizationId: input.organizationId },
      },
    });
    if (!execution) throw new NotFoundException('External registration execution not found.');
    return externalExecutionResult(execution);
  }

  async markExternalExecutionUnresolved(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ExternalRegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          productPreparation: { sourceCandidateId: input.sourceCandidateId, organizationId: input.organizationId },
        },
      });
      if (!current) throw new NotFoundException('External registration execution not found.');
      await lockExecution(tx, input.organizationId, current.id);
      if (!['executing', 'reconciling'].includes(current.status)) {
        throw new ConflictException('Only a started external registration may be reconciled.');
      }
      const evidence = JSON.stringify(input.evidence ?? null).slice(0, 4_000);
      const updated = await tx.productRegistrationExecution.update({
        where: { id: current.id },
        data: { status: 'reconciling', providerOutcome: 'uncertain', lastErrorMessage: evidence },
      });
      return externalExecutionResult(updated);
    });
  }

  async replaceDraftInput(
    input: ReplaceDraftInputRequest,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationDraftResult | { preparationId: string; status: 'cancelled' }> {
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

      const existingExecution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, productPreparationId: current.id },
        select: {
          status: true,
          providerSubmissionId: true,
          externalListingId: true,
          resultJson: true,
        },
      });
      if (existingExecution && (
        ['prepared', 'executing', 'reconciling', 'succeeded'].includes(existingExecution.status)
        || existingExecution.providerSubmissionId !== null
        || existingExecution.externalListingId !== null
        || existingExecution.resultJson !== null
      )) {
        throw new ConflictException(
          'Preparation execution cannot be discarded or edited.',
        );
      }

      const providerOutcome = resolveProviderOutcome(current);
      const providerIdentityCanBeDiscarded = canDiscardProviderIdentity({
        outcome: providerOutcome,
        providerSubmissionId: current.providerSubmissionId,
        registrationResult: current.registrationResult,
      });

      if (input.command.kind === 'cancel') {
        if (current.status !== 'draft' && current.status !== 'failed') {
          throw new ConflictException(`Preparation cannot be cancelled from '${current.status}'.`);
        }
        if (!providerIdentityCanBeDiscarded) {
          throw new ConflictException(
            'Preparation provider identity cannot be discarded by cancellation.',
          );
        }
        await tx.productPreparation.updateMany({
          where: { id: current.id, organizationId: input.organizationId, isDeleted: false },
          data: {
            status: 'cancelled',
            isDeleted: true,
            deletedAt: new Date(),
            submissionLeaseToken: null,
            submissionLeaseClaimedAt: null,
          },
        });
        return { preparationId: current.id, status: 'cancelled' as const };
      }

      if (current.status !== 'draft' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot be edited from '${current.status}'.`);
      }

      if (!providerIdentityCanBeDiscarded) {
        throw new ConflictException(
          'Preparation provider identity cannot be discarded or edited.',
        );
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

      if (current.status === 'draft') {
        await tx.productPreparation.updateMany({
          where: {
            id: current.id,
            organizationId: input.organizationId,
            status: 'draft',
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
          status: 'failed',
          isDeleted: false,
        },
        data: {
          status: 'cancelled',
          isDeleted: true,
          deletedAt: new Date(),
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
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

  async claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
    resolveSelections: ResolveProductPreparationSelections,
  ): Promise<ProductPreparationClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, organizationId, identity.sourceCandidateId);
      }
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      let execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, productPreparationId: current.id },
      });
      if (execution) await lockExecution(tx, organizationId, execution.id);
      execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, productPreparationId: current.id },
      });
      if (execution?.executionKind === 'external_wing') {
        throw new ConflictException('External WING executions must use their explicit start/completion contract.');
      }
      if (!execution && current.status === 'registered') {
        execution = await importLegacyRegisteredExecution(tx, current, organizationId);
      }
      if (!execution && ['submitting', 'failed'].includes(current.status)) {
        execution = await importLegacyExecution(tx, current, organizationId);
      }
      if (execution?.status === 'succeeded') {
        if (!execution.channelListingId) {
          throw new ConflictException('Succeeded execution is missing its listing identity.');
        }
        return {
          preparationId: current.id,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      assertRegistrationIdentity(current);
      await assertActiveCandidate(tx, organizationId, current.sourceCandidateId);
      const now = new Date();
      if (execution && ['prepared', 'executing', 'reconciling'].includes(execution.status) && hasLiveSubmissionLease({
        token: execution.leaseToken,
        claimedAt: execution.leaseClaimedAt,
        now,
      })) {
        throw new ConflictException('Product registration submission is already in progress.');
      }
      if (execution?.status === 'cancelled' || execution?.status === 'failed') {
        throw new ConflictException(`Registration execution cannot be submitted from '${execution.status}'.`);
      }
      if (current.status === 'registered' && !execution) {
        throw new ConflictException('Registered preparation is missing its registration execution.');
      }
      if (!['draft', 'submitting', 'failed', 'registered'].includes(current.status)) {
        throw new ConflictException(`Preparation cannot be submitted from '${current.status}'.`);
      }
      const submissionLeaseToken = randomUUID();

      if (!execution) {
        const resolvedSelections = await resolveSelections(
          tx as unknown as SourcingRepositoryTransaction,
          selectionResolutionInput(
            organizationId,
            current.sourceContentWorkspaceId,
            current,
          ),
        );
        const resolvedCurrent = {
          ...current,
          ...resolvedSelectionData(resolvedSelections),
        } as ProductPreparation;
        const frozen = freezeProductPreparationPayload(
          buildSubmissionPayload(resolvedCurrent),
        );
        const submissionKey = current.submissionKey || randomUUID();
        const updated = await updatePreparationAndLoad(
          tx,
          organizationId,
          current.id,
          {
            status: 'submitting',
            submissionKey,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            providerOutcome: 'not_attempted',
            submissionLeaseToken,
            submissionLeaseClaimedAt: now,
            lastError: null,
            reviewPayloadHash: frozen.hash,
            approvedAt: now,
            approvedByUserId: userId,
            ...resolvedSelectionData(resolvedSelections),
          },
        );
        execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId,
            productPreparationId: updated.id,
            channelAccountId: updated.channelAccountId,
            idempotencyKey: submissionKey,
            requestHash: frozen.hash,
            submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
            submissionPayloadHash: frozen.hash,
            status: 'prepared',
            providerOutcome: 'not_attempted',
            leaseToken: submissionLeaseToken,
            leaseClaimedAt: now,
            requestedByUserId: userId,
          },
        });
        return toFrozenSubmission(updated, execution);
      }

      if (execution.idempotencyKey !== current.submissionKey
        || execution.requestHash !== current.submissionPayloadHash) {
        throw new ConflictException('Registration execution idempotency key or request hash drifted.');
      }
      if (!execution.submissionPayloadJson || !execution.submissionPayloadHash) {
        throw new ConflictException('Registration execution is missing its frozen submission.');
      }
      const updated = await updatePreparationAndLoad(
        tx,
        organizationId,
        current.id,
        {
          status: 'submitting',
          providerOutcome: execution.providerOutcome,
          submissionLeaseToken,
          submissionLeaseClaimedAt: now,
        },
      );
      if (execution.requestedByUserId !== userId) {
        throw new ConflictException('Registration execution belongs to a different actor.');
      }
      const refreshedExecution = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: { leaseToken: submissionLeaseToken, leaseClaimedAt: now },
      });
      return toFrozenSubmission(updated, refreshedExecution);
    });
  }

  async loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenProductPreparationSubmission> {
    const row = await this.prisma.productPreparation.findFirst({
      where: {
        id: preparationId,
        organizationId,
        isDeleted: false,
      },
    });
    if (!row) throw new NotFoundException('Frozen product preparation not found.');
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: { organizationId, productPreparationId: preparationId },
    });
    if (!execution) throw new NotFoundException('Product registration execution not found.');
    return toFrozenSubmission(row, execution);
  }

  async markProviderAttemptStarted(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          status: 'submitting',
          isDeleted: false,
        },
      });
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (execution.status !== 'prepared' || execution.providerOutcome !== 'not_attempted') {
        throw new ConflictException(
          'Provider create is not allowed while the prior outcome is uncertain or succeeded.',
        );
      }
      const started = await tx.productRegistrationExecution.updateMany({
        where: {
          id: execution.id,
          organizationId,
          status: 'prepared',
          leaseToken: submissionLeaseToken,
        },
        data: {
          status: 'executing', providerOutcome: 'uncertain', startedAt: new Date(),
          lastErrorCode: null, lastErrorMessage: null,
        },
      });
      if (started.count !== 1) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      await tx.productPreparation.updateMany({
        where: { id: preparationId, organizationId, isDeleted: false },
        data: { status: 'submitting', providerOutcome: 'uncertain', lastError: null },
      });
    });
  }

  async recordProviderResult(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    result: {
      providerSubmissionId?: string | null;
      externalListingId: string;
      channel: string;
      rawResult: unknown;
    },
  ): Promise<FrozenProductPreparationSubmission> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          status: 'submitting',
          isDeleted: false,
        },
      });
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Preparation is not awaiting this provider result.');
      }
      const registrationResult = freezeProductPreparationPayload({
        providerSubmissionId: result.providerSubmissionId ?? null,
        externalListingId: result.externalListingId,
        channel: result.channel,
        rawResult: result.rawResult,
      } as ProductPreparationJson).payload;
      const updatedExecution = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          externalListingId: result.externalListingId,
          resultJson: registrationResult as Prisma.InputJsonValue,
          providerOutcome: 'succeeded',
          status: 'executing',
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      const updated = await updatePreparationAndLoad(
        tx,
        organizationId,
        current.id,
        {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          registrationResult: registrationResult as Prisma.InputJsonValue,
          providerOutcome: 'succeeded',
          lastError: null,
        },
      );
      return toFrozenSubmission(updated, updatedExecution);
    });
  }

  async markFailed(input: {
    organizationId: string;
    preparationId: string;
    submissionLeaseToken: string;
    error: string;
    providerOutcome?: 'definitive_failure';
  }): Promise<{ preparationId: string; status: 'failed' }> {
    return this.prisma.$transaction(async (tx) => {
      await lockPreparation(tx, input.organizationId, input.preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: input.preparationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      const execution = await requireExecution(tx, input.organizationId, input.preparationId);
      await lockExecution(tx, input.organizationId, execution.id);
      if (current.status !== 'submitting' && current.status !== 'failed') {
        throw new ConflictException(`Preparation cannot fail from '${current.status}'.`);
      }
      if (
        current.status === 'submitting'
        && execution.leaseToken !== input.submissionLeaseToken
      ) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (current.status === 'failed' && execution.leaseToken === null) {
        return { preparationId: current.id, status: 'failed' as const };
      }
      const currentOutcome = execution.providerOutcome;
      if (
        input.providerOutcome === 'definitive_failure'
        && (currentOutcome === 'succeeded'
          || execution.providerSubmissionId !== null
          || execution.resultJson !== null)
      ) {
        throw new ConflictException('Recorded provider success cannot become a definitive failure.');
      }
      const providerOutcome = input.providerOutcome
        ?? (currentOutcome === 'not_attempted' ? 'uncertain' : currentOutcome);
      const executionStatus = providerOutcome === 'definitive_failure' ? 'failed' : 'reconciling';
      await tx.productRegistrationExecution.updateMany({
        where: { id: execution.id, organizationId: input.organizationId, leaseToken: input.submissionLeaseToken },
        data: {
          status: executionStatus, providerOutcome,
          lastErrorMessage: input.error, leaseToken: null, leaseClaimedAt: null,
        },
      });
      await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: {
          status: 'failed',
          lastError: input.error,
          providerOutcome,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      return { preparationId: current.id, status: 'failed' as const };
    });
  }

  async finalizeRegistered(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    finalize: (
      tx: SourcingRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<{ preparationId: string; status: 'registered'; listingId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.productPreparation.findFirst({
        where: { id: preparationId, organizationId, isDeleted: false },
        select: { sourceCandidateId: true },
      });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await lockCandidate(tx, organizationId, identity.sourceCandidateId);
      }
      await lockPreparation(tx, organizationId, preparationId);
      const current = await tx.productPreparation.findFirst({
        where: {
          id: preparationId,
          organizationId,
          isDeleted: false,
        },
      });
      if (!current) throw new NotFoundException('Product preparation not found.');
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (execution.status === 'succeeded' && execution.channelListingId) {
        return {
          preparationId: current.id,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      if (current.status !== 'submitting') {
        throw new ConflictException('Preparation is not ready for finalization.');
      }
      assertRegistrationIdentity(current);
      await assertActiveCandidate(tx, organizationId, current.sourceCandidateId);
      if (execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (!execution.resultJson || execution.providerOutcome !== 'succeeded') {
        throw new ConflictException('Provider success must be recorded before finalization.');
      }

      const result = await finalize(tx as unknown as SourcingRepositoryTransaction);
      const listing = await tx.channelListing.findFirst({
        where: {
          id: result.listingId,
          organizationId,
          channelAccountId: current.channelAccountId,
          sourceCandidateId: current.sourceCandidateId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!listing) {
        throw new ConflictException('Final listing is outside the preparation account or source.');
      }
      const updated = await tx.productPreparation.updateMany({
        where: {
          id: current.id,
          organizationId,
          status: 'submitting',
          submissionLeaseToken,
          isDeleted: false,
        },
        data: {
          status: 'registered',
          channelListingId: listing.id,
          lastError: null,
          providerOutcome: 'succeeded',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Product registration finalization lease was lost.');
      }
      await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: {
          channelListingId: listing.id,
          status: 'succeeded',
          providerOutcome: 'succeeded',
          completedAt: new Date(),
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      return {
        preparationId: current.id,
        status: 'registered' as const,
        listingId: listing.id,
      };
    }, { timeout: 15_000 });
  }
}

async function lockPreparation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM product_preparations
    WHERE id = ${preparationId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

async function lockExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  executionId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM product_registration_executions
    WHERE id = ${executionId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

async function requireExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
): Promise<ProductRegistrationExecution> {
  const execution = await tx.productRegistrationExecution.findFirst({
    where: { organizationId, productPreparationId: preparationId },
  });
  if (!execution) throw new ConflictException('Product registration execution is missing.');
  return execution;
}

function externalExecutionResult(
  execution: ProductRegistrationExecution,
): import('../../../application/port/out/repository/product-preparation.repository.port').ExternalRegistrationExecutionResult {
  if (!['prepared', 'executing', 'reconciling', 'succeeded'].includes(execution.status)
    || !['not_attempted', 'uncertain', 'succeeded'].includes(execution.providerOutcome)) {
    throw new ConflictException('External registration execution has an unsupported lifecycle state.');
  }
  return {
    executionId: execution.id,
    preparationId: execution.productPreparationId,
    requestHash: execution.requestHash,
    status: execution.status as 'prepared' | 'executing' | 'reconciling' | 'succeeded',
    providerOutcome: execution.providerOutcome as 'not_attempted' | 'uncertain' | 'succeeded',
    submissionLeaseToken: execution.leaseToken,
    expectedProviderAccountId: execution.expectedProviderAccountId ?? '',
    listingId: execution.channelListingId,
  };
}

/**
 * Compatibility fence for preparations created before the execution ledger was
 * introduced. A legacy submission may already have reached provider IO, so it
 * must never be reborn as a fresh create operation.
 */
async function importLegacyExecution(
  tx: Prisma.TransactionClient,
  preparation: ProductPreparation,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(preparation);
  if (
    !preparation.submissionKey
    || !preparation.submissionPayloadJson
    || !preparation.submissionPayloadHash
  ) {
    throw new ConflictException(
      'Legacy submitting preparation is missing frozen submission data and cannot be safely imported.',
    );
  }
  const frozen = freezeProductPreparationPayload(
    preparation.submissionPayloadJson as ProductPreparationJson,
  );
  if (frozen.hash !== preparation.submissionPayloadHash) {
    throw new ConflictException('Legacy frozen submission hash does not match its payload.');
  }
  const legacyOutcome = resolveProviderOutcome(preparation);
  const hasProviderIdentity = preparation.providerSubmissionId !== null
    || preparation.registrationResult !== null;
  const providerOutcome = legacyOutcome === 'succeeded' || hasProviderIdentity
    ? 'succeeded'
    : legacyOutcome === 'definitive_failure'
      ? 'definitive_failure'
      : 'uncertain';
  const status = providerOutcome === 'definitive_failure' ? 'failed' : 'reconciling';
  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: preparation.id,
      channelAccountId: preparation.channelAccountId,
      idempotencyKey: preparation.submissionKey,
      requestHash: frozen.hash,
      submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      status,
      providerOutcome,
      providerSubmissionId: preparation.providerSubmissionId,
      externalListingId: legacyExternalListingId(preparation.registrationResult),
      resultJson: preparation.registrationResult === null
        ? Prisma.JsonNull
        : preparation.registrationResult as Prisma.InputJsonValue,
      lastErrorMessage: preparation.lastError,
      leaseToken: preparation.submissionLeaseToken,
      leaseClaimedAt: preparation.submissionLeaseClaimedAt,
      requestedByUserId: preparation.approvedByUserId,
      startedAt: preparation.submissionLeaseClaimedAt,
    },
  });
}

function legacyExternalListingId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const externalListingId = (value as Record<string, unknown>).externalListingId;
  return typeof externalListingId === 'string' && externalListingId.trim()
    ? externalListingId.trim()
    : null;
}

/** Imports a pre-ledger registered row as a completed replay without provider IO. */
async function importLegacyRegisteredExecution(
  tx: Prisma.TransactionClient,
  preparation: ProductPreparation,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(preparation);
  if (!preparation.channelListingId) {
    throw new ConflictException('Registered preparation is missing its persisted listing identity.');
  }
  const listing = await tx.channelListing.findFirst({
    where: {
      id: preparation.channelListingId,
      organizationId,
      channelAccountId: preparation.channelAccountId,
      sourceCandidateId: preparation.sourceCandidateId,
    },
    select: { id: true, externalId: true },
  });
  if (!listing) {
    throw new ConflictException('Registered preparation listing is outside its persisted account scope.');
  }

  let submissionPayloadJson: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let submissionPayloadHash: string | null = null;
  let requestHash: string;
  if (preparation.submissionPayloadJson && preparation.submissionPayloadHash) {
    const frozen = freezeProductPreparationPayload(
      preparation.submissionPayloadJson as ProductPreparationJson,
    );
    if (frozen.hash !== preparation.submissionPayloadHash) {
      throw new ConflictException('Legacy registered submission hash does not match its payload.');
    }
    submissionPayloadJson = frozen.payload as Prisma.InputJsonValue;
    submissionPayloadHash = frozen.hash;
    requestHash = frozen.hash;
  } else {
    requestHash = freezeProductPreparationPayload({
      kind: 'legacy_registered_replay',
      preparationId: preparation.id,
      channelListingId: listing.id,
      channelAccountId: preparation.channelAccountId,
      externalListingId: listing.externalId,
    } as ProductPreparationJson).hash;
  }

  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: preparation.id,
      channelAccountId: preparation.channelAccountId,
      channelListingId: listing.id,
      idempotencyKey: preparation.submissionKey || `legacy-registered:${preparation.id}`,
      requestHash,
      submissionPayloadJson,
      submissionPayloadHash,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      providerSubmissionId: preparation.providerSubmissionId ?? listing.externalId,
      externalListingId: listing.externalId,
      resultJson: preparation.registrationResult === null
        ? Prisma.DbNull
        : preparation.registrationResult as Prisma.InputJsonValue,
      requestedByUserId: preparation.approvedByUserId,
      completedAt: preparation.updatedAt,
    },
  });
}

async function lockCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM sourcing_candidates
    WHERE id = ${sourceCandidateId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `);
}

async function assertActiveCandidate(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  const candidate = await tx.sourcingCandidate.findFirst({
    where: {
      id: sourceCandidateId,
      organizationId,
      status: 'sourced',
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!candidate) {
    throw new ConflictException('Source candidate is not active for registration.');
  }
}

async function updatePreparationAndLoad(
  tx: Prisma.TransactionClient,
  organizationId: string,
  preparationId: string,
  data: Prisma.ProductPreparationUncheckedUpdateManyInput,
): Promise<ProductPreparation> {
  const updated = await tx.productPreparation.updateMany({
    where: {
      id: preparationId,
      organizationId,
      isDeleted: false,
    },
    data,
  });
  if (updated.count !== 1) {
    throw new ConflictException('Product preparation changed during its locked update.');
  }
  const row = await tx.productPreparation.findFirst({
    where: { id: preparationId, organizationId, isDeleted: false },
  });
  if (!row) throw new NotFoundException('Product preparation not found.');
  return row;
}

function assertRegistrationIdentity(
  row: Pick<
    ProductPreparation,
    'sourceCandidateId' | 'channelAccountId' | 'sourceContentWorkspaceId'
  >,
): asserts row is typeof row & {
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
} {
  if (!row.sourceCandidateId || !row.channelAccountId || !row.sourceContentWorkspaceId) {
    throw new ConflictException('Preparation is missing account-scoped registration identity.');
  }
}

function buildSubmissionPayload(row: ProductPreparation): ProductPreparationJson {
  assertRegistrationIdentity(row);
  return {
    channelAccountId: row.channelAccountId,
    displayName: row.displayName,
    registrationInput: row.registrationInput as ProductPreparationJson,
    selectedThumbnailUrl: row.selectedThumbnailUrl,
    selectedThumbnailGenerationId: row.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
  };
}

function toFrozenSubmission(
  row: ProductPreparation,
  execution: ProductRegistrationExecution,
): FrozenProductPreparationSubmission {
  assertRegistrationIdentity(row);
  if (!execution.idempotencyKey || !execution.submissionPayloadJson || !execution.submissionPayloadHash) {
    throw new ConflictException('Preparation submission has not been frozen.');
  }
  const frozen = freezeProductPreparationPayload(
    execution.submissionPayloadJson as ProductPreparationJson,
  );
  if (frozen.hash !== execution.submissionPayloadHash || frozen.hash !== execution.requestHash) {
    throw new ConflictException('Frozen registration execution payload hash does not match its JSON.');
  }
  const payload = frozen.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConflictException('Frozen preparation payload must be an object.');
  }
  const frozenChannelAccountId = frozenRequiredString(payload, 'channelAccountId');
  if (frozenChannelAccountId !== row.channelAccountId) {
    throw new ConflictException('Frozen preparation account does not match the row identity.');
  }
  return {
    executionId: execution.id,
    preparationId: row.id,
    sourceCandidateId: row.sourceCandidateId,
    channelAccountId: frozenChannelAccountId,
    sourceContentWorkspaceId: row.sourceContentWorkspaceId,
    displayName: frozenRequiredString(payload, 'displayName'),
    status: row.status as FrozenProductPreparationSubmission['status'],
    submissionKey: execution.idempotencyKey,
    submissionPayloadJson: frozen.payload,
    submissionPayloadHash: execution.submissionPayloadHash,
    providerSubmissionId: execution.providerSubmissionId,
    registrationResult: execution.resultJson as ProductPreparationJson | null,
    providerOutcome: execution.providerOutcome as ProductPreparationProviderOutcome,
    submissionLeaseToken: execution.leaseToken,
    isRetry: execution.lastErrorMessage !== null || execution.providerOutcome !== 'not_attempted',
    selectedThumbnailUrl: frozenNullableString(payload, 'selectedThumbnailUrl'),
    selectedThumbnailGenerationId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationId',
    ),
    selectedThumbnailGenerationCandidateId: frozenNullableString(
      payload,
      'selectedThumbnailGenerationCandidateId',
    ),
    selectedDetailPageArtifactId: frozenNullableString(
      payload,
      'selectedDetailPageArtifactId',
    ),
    selectedDetailPageRevisionId: frozenNullableString(
      payload,
      'selectedDetailPageRevisionId',
    ),
    selectedDetailPageGenerationId: frozenNullableString(
      payload,
      'selectedDetailPageGenerationId',
    ),
  };
}

function frozenRequiredString(
  payload: ProductPreparationJson,
  key: string,
): string {
  const value = (payload as Record<string, ProductPreparationJson>)[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConflictException(`Frozen preparation payload is missing '${key}'.`);
  }
  return value;
}

function frozenNullableString(
  payload: ProductPreparationJson,
  key: string,
): string | null {
  const value = (payload as Record<string, ProductPreparationJson>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ConflictException(`Frozen preparation payload field '${key}' is invalid.`);
  }
  return value;
}

function editableUpdate(
  current: ProductPreparation,
  input: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Prisma.ProductPreparationUncheckedUpdateInput;
function editableUpdate(
  current: ProductPreparation,
  input: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
): Prisma.ProductPreparationUncheckedUpdateInput {
  return {
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
  update: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
  resolvedSelections: ResolvedSelections,
): Prisma.ProductPreparationUncheckedCreateInput {
  return {
    organizationId,
    sourceCandidateId: current.sourceCandidateId,
    channelAccountId: current.channelAccountId,
    sourceContentWorkspaceId: current.sourceContentWorkspaceId,
    displayName: update.displayName ?? current.displayName,
    status: 'draft',
    submissionKey: randomUUID(),
    registrationInput: (update.registrationInput === undefined
      ? current.registrationInput
      : mergeRegistrationInput(current.registrationInput, update.registrationInput)
    ) as Prisma.InputJsonValue,
    ...resolvedSelectionData(resolvedSelections),
    providerOutcome: 'not_attempted',
    submissionLeaseToken: null,
    submissionLeaseClaimedAt: null,
    createdByUserId: userId,
  };
}

function assertPatchFresh(
  current: Pick<ProductPreparation, 'updatedAt'>,
  input: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
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

type ResolvedSelections = Awaited<ReturnType<ResolveProductPreparationSelections>>;

function selectionResolutionInput(
  organizationId: string,
  sourceWorkspaceId: string,
  selections: Partial<Record<OptionalSelectionKey, string | null | undefined>>,
) {
  return {
    organizationId,
    sourceWorkspaceId,
    selectedThumbnailUrl: selections.selectedThumbnailUrl ?? null,
    selectedThumbnailGenerationId: selections.selectedThumbnailGenerationId ?? null,
    selectedThumbnailGenerationCandidateId:
      selections.selectedThumbnailGenerationCandidateId ?? null,
    selectedDetailPageArtifactId: selections.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId: selections.selectedDetailPageRevisionId ?? null,
    selectedDetailPageGenerationId: selections.selectedDetailPageGenerationId ?? null,
  };
}

function mergedSelectionValues(
  current: ProductPreparation,
  update: Extract<ReplaceDraftInputRequest['command'], { kind: 'replace' }>['input'],
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

function resolvedSelectionData(
  resolved: ResolvedSelections,
): Record<OptionalSelectionKey, string | null> {
  return {
    selectedThumbnailUrl: resolved.selectedThumbnailUrl,
    selectedThumbnailGenerationId: resolved.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId:
      resolved.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: resolved.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: resolved.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: resolved.selectedDetailPageGenerationId,
  };
}

type OptionalSelectionKey =
  | 'selectedThumbnailUrl'
  | 'selectedThumbnailGenerationId'
  | 'selectedThumbnailGenerationCandidateId'
  | 'selectedDetailPageArtifactId'
  | 'selectedDetailPageRevisionId'
  | 'selectedDetailPageGenerationId';

function valueOrCurrent(
  input: Partial<Record<OptionalSelectionKey, string | null>>,
  key: OptionalSelectionKey,
  current: ProductPreparation,
): string | null {
  return input[key] !== undefined ? input[key] ?? null : current[key];
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002');
}
