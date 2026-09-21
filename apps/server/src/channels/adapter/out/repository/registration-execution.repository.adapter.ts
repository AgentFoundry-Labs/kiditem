import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ProductRegistrationExecution } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  freezeProductRegistrationPayload,
  type RegistrationSubmissionJson,
} from '../../../domain/registration-submission-payload';
import {
  hasLiveExecutionLease,
  retainsProviderIdentity,
  type RegistrationExecutionProviderOutcome,
} from '../../../domain/registration-execution-state';
import {
  REGISTRATION_DRAFT_PORT,
  type FrozenRegistrationDraft,
  type RegistrationDraftPort,
} from '../../../application/port/out/cross-domain/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import type {
  ClosedRegistrationExecutionResult,
  FrozenRegistrationSubmission,
  PrepareRegistrationExecutionInput,
  RegistrationExecutionClaimResult,
  RegistrationExecutionRegisteredResult,
  RegistrationExecutionRepositoryPort,
  RegistrationExecutionResult,
} from '../../../application/port/out/repository/registration-execution.repository.port';

/**
 * 등록 실행 울타리의 저장소 어댑터.
 *
 * 울타리는 트랜잭션을 연다. 실행 행은 여기서 직접 쓰고, 같은 트랜잭션 안의 초안
 * 전이는 `RegistrationDraftPort` 로 Sourcing 에 맡긴다 — Channels 는 초안 행을
 * 직접 쓰지 않는다([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Injectable()
export class RegistrationExecutionRepositoryAdapter
  implements RegistrationExecutionRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRATION_DRAFT_PORT)
    private readonly drafts: RegistrationDraftPort,
  ) {}

  async cancelUnstartedExecutions(
    transaction: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      cancelledAt: Date;
    },
  ): Promise<number> {
    const tx = transaction as Prisma.TransactionClient;
    // 초안은 다른 owner 의 행이다. 관계 join 대신 초안 id 를 먼저 읽고 실행을
    // 그 id 로 좁힌다(ADR-0013).
    const preparationIds = await this.drafts.findDraftIds(transaction, {
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      isDeleted: false,
      fenceIdle: true,
    });
    const identities = preparationIds.length === 0 ? [] : await tx.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        status: 'prepared',
        providerOutcome: 'not_attempted',
        providerSubmissionId: null,
        externalListingId: null,
        resultJson: { equals: Prisma.DbNull },
        leaseToken: null,
        leaseClaimedAt: null,
        startedAt: null,
        completedAt: null,
        productPreparationId: { in: preparationIds },
      },
      select: { id: true, productPreparationId: true },
    });

    let cancelled = 0;
    for (const identity of identities) {
      await this.drafts.lockDraft(transaction, {
        organizationId: input.organizationId,
        preparationId: identity.productPreparationId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          productPreparationId: identity.productPreparationId,
        },
      });
      const draft = current
        ? await this.drafts.loadDraft(transaction, {
          organizationId: input.organizationId,
          preparationId: current.productPreparationId,
        })
        : null;
      if (!current || !draft || !isUnstartedExternalRegistrationIntent(
        current,
        draft,
        input.organizationId,
        input.sourceCandidateId,
      )) {
        continue;
      }

      const execution = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: 'prepared',
          providerOutcome: 'not_attempted',
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
          leaseToken: null,
          leaseClaimedAt: null,
          startedAt: null,
          completedAt: null,
        },
        data: {
          status: 'cancelled',
          completedAt: input.cancelledAt,
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      if (execution.count !== 1) continue;

      const draftCancelled = await this.drafts.applyExecutionState(transaction, {
        organizationId: input.organizationId,
        preparationId: current.productPreparationId,
        sourceCandidateId: input.sourceCandidateId,
        expect: {
          status: 'submitting',
          providerOutcome: 'not_attempted',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
          noProviderIdentity: true,
        },
        set: {
          status: 'cancelled',
          isDeleted: true,
          deletedAt: input.cancelledAt,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      if (draftCancelled !== 1) {
        throw new ConflictException(
          'Registration preparation changed while candidate deletion was being prepared.',
        );
      }
      cancelled += 1;
    }
    return cancelled;
  }

  async prepare(
    input: PrepareRegistrationExecutionInput,
  ): Promise<RegistrationExecutionResult> {
    const frozen = freezeProductRegistrationPayload({
      channelAccountId: input.channelAccountId,
      displayName: input.displayName,
      registrationInput: input.registrationInput,
    } as RegistrationSubmissionJson);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const handle = tx as unknown as ChannelsRepositoryTransaction;
        const replay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (replay) {
          if (replay.requestHash !== frozen.hash) {
            throw new ConflictException('External registration idempotency key was reused with a different payload.');
          }
          if (replay.channelAccountId !== input.channelAccountId
            || await this.executionCandidateId(handle, input.organizationId, replay) !== input.sourceCandidateId
            || replay.requestedByUserId !== input.requestedByUserId) {
            throw new ConflictException('External registration execution belongs to another account, candidate, or actor.');
          }
          return externalExecutionResult(replay);
        }
        await this.drafts.lockCandidate(handle, {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
        });
        const lockedReplay = await tx.productRegistrationExecution.findFirst({
          where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (lockedReplay) {
          if (lockedReplay.requestHash !== frozen.hash
            || lockedReplay.channelAccountId !== input.channelAccountId
            || await this.executionCandidateId(handle, input.organizationId, lockedReplay) !== input.sourceCandidateId
            || lockedReplay.requestedByUserId !== input.requestedByUserId) {
            throw new ConflictException('External registration idempotency key belongs to a different request.');
          }
          return externalExecutionResult(lockedReplay);
        }
        await this.drafts.requireActiveCandidate(handle, {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
        });
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
        const livePreparationIds = await this.drafts.findDraftIds(handle, {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          isDeleted: false,
        });
        const resumable = livePreparationIds.length === 0 ? null : await tx.productRegistrationExecution.findFirst({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            executionKind: 'external_wing',
            requestHash: frozen.hash,
            requestedByUserId: input.requestedByUserId,
            status: {
              in: input.providerAbsenceVerified === true
                ? ['prepared']
                : ['prepared', 'executing', 'reconciling'],
            },
            productPreparationId: { in: livePreparationIds },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (resumable) return externalExecutionResult(resumable);

        const draft = await this.drafts.findAccountDraft(handle, {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.channelAccountId,
          status: 'draft',
        });
        if (!draft) {
          await this.supersedeAbandonedDraft(tx, input, expectedProviderAccountId, frozen.hash);
        }
        const frozenDraft = await this.drafts.freezeForSubmission(handle, {
          organizationId: input.organizationId,
          sourceCandidateId: input.sourceCandidateId,
          channelAccountId: input.channelAccountId,
          displayName: input.displayName,
          registrationInput: input.registrationInput,
          submissionKey: input.idempotencyKey,
          frozenPayload: frozen.payload,
          frozenHash: frozen.hash,
          requestedByUserId: input.requestedByUserId,
        });
        const execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId: input.organizationId,
            productPreparationId: frozenDraft.preparationId,
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
      const handle = this.prisma as unknown as ChannelsRepositoryTransaction;
      const replay = await this.prisma.productRegistrationExecution.findFirst({
        where: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
      });
      if (!replay
        || replay.requestHash !== frozen.hash
        || replay.channelAccountId !== input.channelAccountId
        || await this.executionCandidateId(handle, input.organizationId, replay) !== input.sourceCandidateId
        || replay.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('Concurrent external registration preparation conflicted.');
      }
      return externalExecutionResult(replay);
    }
  }

  /**
   * 공급자에 닿은 적 없는 앞선 시도를 접고 새 시도에 자리를 내준다.
   *
   * 앞선 시도가 `prepared` 실행을 만들어 두고 제출까지 가지 못한 경우(예: 카테고리를
   * 고쳐 해시가 달라져 그 실행을 이어받을 수 없는 경우)다. 후보·초안·실행 잠금과
   * 잠금 뒤 재조회는 의도한 것이다 — 그 사이 `start` 가 같은 실행을
   * `executing/uncertain` 로 올릴 수 있다. 티 없는 외부 WING 의사 하나만 승계되고,
   * 살아 있는 리스나 공급자 흔적은 전부 충돌로 남는다.
   */
  private async supersedeAbandonedDraft(
    tx: Prisma.TransactionClient,
    input: PrepareRegistrationExecutionInput,
    expectedProviderAccountId: string,
    nextRequestHash: string,
  ): Promise<void> {
    const handle = tx as unknown as ChannelsRepositoryTransaction;
    const activeIdentity = await this.drafts.findAccountDraft(handle, {
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      channelAccountId: input.channelAccountId,
    });
    if (!activeIdentity) return;

    await this.drafts.lockDraft(handle, {
      organizationId: input.organizationId,
      preparationId: activeIdentity.preparationId,
    });
    const executionIdentities = await tx.productRegistrationExecution.findMany({
      where: {
        organizationId: input.organizationId,
        productPreparationId: activeIdentity.preparationId,
      },
      select: { id: true },
    });
    if (executionIdentities.length !== 1) {
      throw new ConflictException('An active registration preparation already exists.');
    }
    await lockExecution(tx, input.organizationId, executionIdentities[0]!.id);
    const active = await this.drafts.findAccountDraft(handle, {
      organizationId: input.organizationId,
      sourceCandidateId: input.sourceCandidateId,
      channelAccountId: input.channelAccountId,
    });
    const execution = await tx.productRegistrationExecution.findFirst({
      where: {
        id: executionIdentities[0]!.id,
        organizationId: input.organizationId,
        productPreparationId: activeIdentity.preparationId,
      },
    });
    if (
      !active
      || active.preparationId !== activeIdentity.preparationId
      || !execution
      || !(
        canSupersedePreparedExternalExecution({
          draft: active,
          execution,
          requestedByUserId: input.requestedByUserId,
          expectedProviderAccountId,
          nextRequestHash,
        })
        || canSupersedeFailedExternalExecution({
          draft: active,
          execution,
          requestedByUserId: input.requestedByUserId,
          expectedProviderAccountId,
        })
        || input.providerAbsenceVerified === true
          && canRestartVerifiedMissingExternalExecution({
            draft: active,
            execution,
            requestedByUserId: input.requestedByUserId,
            expectedProviderAccountId,
          })
      )
    ) {
      throw new ConflictException('An active registration preparation already exists.');
    }

    const supersededAt = new Date();
    const executionCancelled = await tx.productRegistrationExecution.updateMany({
      where: {
        id: execution.id,
        organizationId: input.organizationId,
        productPreparationId: active.preparationId,
        status: execution.status,
        providerOutcome: execution.providerOutcome,
        providerSubmissionId: null,
        externalListingId: null,
        channelListingId: null,
      },
      data: {
        status: 'cancelled',
        completedAt: supersededAt,
        leaseToken: null,
        leaseClaimedAt: null,
      },
    });
    if (executionCancelled.count !== 1) {
      throw new ConflictException(
        'Registration execution changed while it was being superseded.',
      );
    }
    const cancelled = await this.drafts.applyExecutionState(handle, {
      organizationId: input.organizationId,
      preparationId: active.preparationId,
      sourceCandidateId: input.sourceCandidateId,
      expect: {
        status: active.status,
        providerOutcome: active.providerOutcome,
        submissionLeaseToken: active.submissionLeaseToken,
        submissionLeaseClaimedAt: active.submissionLeaseClaimedAt,
      },
      set: {
        status: 'cancelled',
        isDeleted: true,
        deletedAt: supersededAt,
        submissionLeaseToken: null,
        submissionLeaseClaimedAt: null,
      },
    });
    if (cancelled !== 1) {
      throw new ConflictException(
        'Registration preparation changed while it was being superseded.',
      );
    }
  }

  async start(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      const identity = await this.findCandidateExecutionIdentity(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        executionId: input.executionId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockCandidate(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.productPreparationId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const execution = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          productPreparationId: identity.productPreparationId,
        },
      });
      const preparation = execution
        ? await this.drafts.loadDraft(handle, {
          organizationId: input.organizationId,
          preparationId: execution.productPreparationId,
        })
        : null;
      if (
        !execution
        || !preparation
        || preparation.sourceCandidateId !== input.sourceCandidateId
        || preparation.organizationId !== input.organizationId
      ) {
        throw new NotFoundException('External registration execution not found.');
      }
      if (execution.requestedByUserId !== input.requestedByUserId) {
        throw new ConflictException('External registration execution belongs to a different actor.');
      }
      if (
        preparation.isDeleted
        || preparation.status !== 'submitting'
        || preparation.channelAccountId !== execution.channelAccountId
      ) {
        throw new ConflictException(
          'External registration execution no longer has an active preparation.',
        );
      }
      if (execution.status === 'executing' && execution.providerOutcome === 'uncertain') {
        if (
          preparation.providerOutcome !== 'uncertain'
          || !execution.leaseToken
          || preparation.submissionLeaseToken !== execution.leaseToken
        ) {
          throw new ConflictException(
            'External registration execution drifted from its active preparation.',
          );
        }
        return externalExecutionResult(execution);
      }
      if (
        execution.status !== 'prepared'
        || execution.providerOutcome !== 'not_attempted'
        || execution.leaseToken !== null
        || execution.leaseClaimedAt !== null
        || execution.startedAt !== null
        || preparation.providerOutcome !== 'not_attempted'
        || preparation.providerSubmissionId !== null
        || preparation.hasRegistrationResult
        || preparation.submissionLeaseToken !== null
        || preparation.submissionLeaseClaimedAt !== null
      ) {
        throw new ConflictException('External registration execution cannot be started from its current state.');
      }
      const leaseToken = randomUUID();
      const startedAt = new Date();
      const updated = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: { status: 'executing', providerOutcome: 'uncertain', leaseToken, leaseClaimedAt: startedAt, startedAt },
      });
      const preparationUpdated = await this.drafts.applyExecutionState(handle, {
        organizationId: input.organizationId,
        preparationId: execution.productPreparationId,
        sourceCandidateId: input.sourceCandidateId,
        expect: {
          status: 'submitting',
          providerOutcome: 'not_attempted',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
        set: {
          status: 'submitting',
          providerOutcome: 'uncertain',
          submissionLeaseToken: leaseToken,
          submissionLeaseClaimedAt: startedAt,
        },
      });
      if (preparationUpdated !== 1) {
        throw new ConflictException(
          'External registration preparation changed while the execution was starting.',
        );
      }
      return externalExecutionResult(updated);
    });
  }

  async get(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
  }): Promise<RegistrationExecutionResult> {
    const handle = this.prisma as unknown as ChannelsRepositoryTransaction;
    const execution = await this.prisma.productRegistrationExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        requestedByUserId: input.requestedByUserId,
        productPreparationId: {
          in: await this.drafts.findDraftIds(handle, {
            organizationId: input.organizationId,
            sourceCandidateId: input.sourceCandidateId,
          }),
        },
      },
    });
    if (!execution) throw new NotFoundException('External registration execution not found.');
    return externalExecutionResult(execution);
  }

  async markUnresolved(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<RegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      const identity = await this.findCandidateExecutionIdentity(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        executionId: input.executionId,
        requestedByUserId: input.requestedByUserId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockCandidate(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.productPreparationId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          productPreparationId: identity.productPreparationId,
        },
      });
      if (!current) throw new NotFoundException('External registration execution not found.');
      if (current.providerOutcome === 'succeeded') {
        return externalExecutionResult(current);
      }
      if (!['executing', 'reconciling'].includes(current.status)) {
        throw new ConflictException('Only a started external registration may be reconciled.');
      }
      if (current.providerOutcome !== 'uncertain' || retainsProviderIdentity(current)) {
        throw new ConflictException('Recorded provider identity cannot become unresolved.');
      }
      const evidence = JSON.stringify(input.evidence ?? null).slice(0, 4_000);
      const changed = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: { in: ['executing', 'reconciling'] },
          providerOutcome: 'uncertain',
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
        },
        data: { status: 'reconciling', providerOutcome: 'uncertain', lastErrorMessage: evidence },
      });
      if (changed.count !== 1) {
        throw new ConflictException('External registration changed while it was being reconciled.');
      }
      const updated = await tx.productRegistrationExecution.findFirstOrThrow({
        where: { id: current.id, organizationId: input.organizationId },
      });
      return externalExecutionResult(updated);
    });
  }

  async markNotSubmitted(input: {
    organizationId: string;
    sourceCandidateId: string;
    executionId: string;
    requestedByUserId: string | null;
    evidence: unknown;
  }): Promise<ClosedRegistrationExecutionResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      const identity = await this.findCandidateExecutionIdentity(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        executionId: input.executionId,
        requestedByUserId: input.requestedByUserId,
      });
      if (!identity) throw new NotFoundException('External registration execution not found.');
      await this.drafts.lockCandidate(handle, {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
      });
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: identity.productPreparationId,
      });
      await lockExecution(tx, input.organizationId, identity.id);
      const current = await tx.productRegistrationExecution.findFirst({
        where: {
          id: identity.id,
          organizationId: input.organizationId,
          executionKind: 'external_wing',
          requestedByUserId: input.requestedByUserId,
          productPreparationId: identity.productPreparationId,
        },
      });
      if (!current) throw new NotFoundException('External registration execution not found.');
      const closed = (): ClosedRegistrationExecutionResult => ({
        executionId: current.id,
        preparationId: current.productPreparationId,
        status: 'failed',
        providerOutcome: 'definitive_failure',
      });
      if (current.status === 'failed') return closed();
      if (!['prepared', 'executing', 'reconciling'].includes(current.status)) {
        throw new ConflictException(
          'Only a prepared or started external registration may be closed as not submitted.',
        );
      }
      if (current.providerOutcome === 'succeeded' || retainsProviderIdentity(current)) {
        throw new ConflictException(
          'Recorded provider identity cannot be closed as not submitted.',
        );
      }
      const evidence = JSON.stringify(input.evidence ?? null).slice(0, 4_000);
      const changed = await tx.productRegistrationExecution.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: { in: ['prepared', 'executing', 'reconciling'] },
          providerSubmissionId: null,
          externalListingId: null,
          resultJson: { equals: Prisma.DbNull },
        },
        data: {
          status: 'failed',
          providerOutcome: 'definitive_failure',
          lastErrorMessage: evidence,
          leaseToken: null,
          leaseClaimedAt: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('External registration changed while it was being closed.');
      }
      // 준비도 함께 풀어 준다. `submitting` 으로 남으면 취소도 재시도도 막힌다.
      await this.drafts.applyExecutionState(handle, {
        organizationId: input.organizationId,
        preparationId: identity.productPreparationId,
        sourceCandidateId: input.sourceCandidateId,
        expect: { noProviderIdentity: true },
        set: {
          status: 'failed',
          providerOutcome: 'definitive_failure',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      return closed();
    });
  }

  async claimForSubmission(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<RegistrationExecutionClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      const identity = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!identity) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await this.drafts.lockCandidate(handle, {
          organizationId,
          sourceCandidateId: identity.sourceCandidateId,
        });
      }
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!current) throw new NotFoundException('Product preparation not found.');
      let execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, productPreparationId: current.preparationId },
      });
      if (execution) await lockExecution(tx, organizationId, execution.id);
      execution = await tx.productRegistrationExecution.findFirst({
        where: { organizationId, productPreparationId: current.preparationId },
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
          preparationId: current.preparationId,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      assertRegistrationIdentity(current);
      await this.drafts.requireActiveCandidate(handle, {
        organizationId,
        sourceCandidateId: current.sourceCandidateId,
      });
      const now = new Date();
      if (execution && ['prepared', 'executing', 'reconciling'].includes(execution.status) && hasLiveExecutionLease({
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
        const claimed = await this.drafts.claimForSubmission(handle, {
          organizationId,
          preparationId: current.preparationId,
          userId,
          submissionLeaseToken,
          now,
          reuseFrozenSubmission: false,
        });
        const frozen = claimed.frozen!;
        execution = await tx.productRegistrationExecution.create({
          data: {
            organizationId,
            productPreparationId: claimed.draft.preparationId,
            channelAccountId: claimed.draft.channelAccountId,
            idempotencyKey: frozen.submissionKey,
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
        return toFrozenSubmission(claimed.draft, execution);
      }

      if (execution.idempotencyKey !== current.submissionKey
        || execution.requestHash !== current.submissionPayloadHash) {
        throw new ConflictException('Registration execution idempotency key or request hash drifted.');
      }
      if (!execution.submissionPayloadJson || !execution.submissionPayloadHash) {
        throw new ConflictException('Registration execution is missing its frozen submission.');
      }
      const claimed = await this.drafts.claimForSubmission(handle, {
        organizationId,
        preparationId: current.preparationId,
        userId,
        submissionLeaseToken,
        now,
        reuseFrozenSubmission: true,
        providerOutcome: execution.providerOutcome,
      });
      if (execution.requestedByUserId !== userId) {
        throw new ConflictException('Registration execution belongs to a different actor.');
      }
      const refreshedExecution = await tx.productRegistrationExecution.update({
        where: { id: execution.id },
        data: { leaseToken: submissionLeaseToken, leaseClaimedAt: now },
      });
      return toFrozenSubmission(claimed.draft, refreshedExecution);
    });
  }

  async loadFrozenSubmission(
    organizationId: string,
    preparationId: string,
  ): Promise<FrozenRegistrationSubmission> {
    const handle = this.prisma as unknown as ChannelsRepositoryTransaction;
    const row = await this.drafts.loadDraft(handle, { organizationId, preparationId });
    if (!row || row.isDeleted) throw new NotFoundException('Frozen product preparation not found.');
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
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || current.status !== 'submitting' || current.isDeleted
        || execution.leaseToken !== submissionLeaseToken) {
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
      await this.drafts.applyExecutionState(handle, {
        organizationId,
        preparationId,
        set: { status: 'submitting', providerOutcome: 'uncertain', lastError: null },
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
  ): Promise<FrozenRegistrationSubmission> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (!current || current.status !== 'submitting' || current.isDeleted
        || execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Preparation is not awaiting this provider result.');
      }
      const registrationResult = freezeProductRegistrationPayload({
        providerSubmissionId: result.providerSubmissionId ?? null,
        externalListingId: result.externalListingId,
        channel: result.channel,
        rawResult: result.rawResult,
      } as RegistrationSubmissionJson).payload;
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
      await this.drafts.applyExecutionState(handle, {
        organizationId,
        preparationId,
        set: {
          providerSubmissionId: result.providerSubmissionId ?? result.externalListingId,
          registrationResult,
          providerOutcome: 'succeeded',
          lastError: null,
        },
      });
      const updated = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!updated) throw new ConflictException('Product preparation disappeared while recording the provider result.');
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
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      await this.drafts.lockDraft(handle, {
        organizationId: input.organizationId,
        preparationId: input.preparationId,
      });
      const current = await this.drafts.loadDraft(handle, {
        organizationId: input.organizationId,
        preparationId: input.preparationId,
      });
      if (!current || current.isDeleted) throw new NotFoundException('Product preparation not found.');
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
        return { preparationId: current.preparationId, status: 'failed' as const };
      }
      const currentOutcome = execution.providerOutcome as RegistrationExecutionProviderOutcome;
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
      await this.drafts.applyExecutionState(handle, {
        organizationId: input.organizationId,
        preparationId: current.preparationId,
        set: {
          status: 'failed',
          lastError: input.error,
          providerOutcome,
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      return { preparationId: current.preparationId, status: 'failed' as const };
    });
  }

  async finalizeRegistered(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    finalize: (
      tx: ChannelsRepositoryTransaction,
    ) => Promise<{ listingId: string }>,
  ): Promise<RegistrationExecutionRegisteredResult> {
    return this.prisma.$transaction(async (tx) => {
      const handle = tx as unknown as ChannelsRepositoryTransaction;
      const identity = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!identity || identity.isDeleted) throw new NotFoundException('Product preparation not found.');
      if (identity.sourceCandidateId) {
        await this.drafts.lockCandidate(handle, {
          organizationId,
          sourceCandidateId: identity.sourceCandidateId,
        });
      }
      await this.drafts.lockDraft(handle, { organizationId, preparationId });
      const current = await this.drafts.loadDraft(handle, { organizationId, preparationId });
      if (!current || current.isDeleted) throw new NotFoundException('Product preparation not found.');
      const execution = await requireExecution(tx, organizationId, preparationId);
      await lockExecution(tx, organizationId, execution.id);
      if (execution.status === 'succeeded' && execution.channelListingId) {
        return {
          preparationId: current.preparationId,
          status: 'registered' as const,
          listingId: execution.channelListingId,
        };
      }
      if (current.status !== 'submitting') {
        throw new ConflictException('Preparation is not ready for finalization.');
      }
      assertRegistrationIdentity(current);
      await this.drafts.requireActiveCandidate(handle, {
        organizationId,
        sourceCandidateId: current.sourceCandidateId,
      });
      if (execution.leaseToken !== submissionLeaseToken) {
        throw new ConflictException('Product registration submission lease was lost.');
      }
      if (!execution.resultJson || execution.providerOutcome !== 'succeeded') {
        throw new ConflictException('Provider success must be recorded before finalization.');
      }

      const result = await finalize(handle);
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
      const updated = await this.drafts.applyExecutionState(handle, {
        organizationId,
        preparationId: current.preparationId,
        expect: { status: 'submitting', submissionLeaseToken },
        set: {
          status: 'registered',
          channelListingId: listing.id,
          lastError: null,
          providerOutcome: 'succeeded',
          submissionLeaseToken: null,
          submissionLeaseClaimedAt: null,
        },
      });
      if (updated !== 1) {
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
        preparationId: current.preparationId,
        status: 'registered' as const,
        listingId: listing.id,
      };
    }, { timeout: 15_000 });
  }

  private async executionCandidateId(
    tx: ChannelsRepositoryTransaction,
    organizationId: string,
    execution: { productPreparationId: string },
  ): Promise<string | null> {
    const draft = await this.drafts.loadDraft(tx, {
      organizationId,
      preparationId: execution.productPreparationId,
    });
    return draft?.sourceCandidateId ?? null;
  }

  private async findCandidateExecutionIdentity(
    handle: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      executionId: string;
      requestedByUserId?: string | null;
    },
  ): Promise<{ id: string; productPreparationId: string } | null> {
    const tx = handle as Prisma.TransactionClient;
    const execution = await tx.productRegistrationExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        executionKind: 'external_wing',
        ...(input.requestedByUserId === undefined
          ? {}
          : { requestedByUserId: input.requestedByUserId }),
      },
      select: { id: true, productPreparationId: true },
    });
    if (!execution) return null;
    const candidateId = await this.executionCandidateId(handle, input.organizationId, execution);
    return candidateId === input.sourceCandidateId ? execution : null;
  }
}

function isUnstartedExternalRegistrationIntent(
  execution: ProductRegistrationExecution,
  draft: FrozenRegistrationDraft,
  organizationId: string,
  sourceCandidateId: string,
): boolean {
  return execution.organizationId === organizationId
    && execution.executionKind === 'external_wing'
    && execution.status === 'prepared'
    && execution.providerOutcome === 'not_attempted'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.resultJson === null
    && execution.leaseToken === null
    && execution.leaseClaimedAt === null
    && execution.startedAt === null
    && execution.completedAt === null
    && draft.organizationId === organizationId
    && draft.sourceCandidateId === sourceCandidateId
    && draft.status === 'submitting'
    && draft.providerOutcome === 'not_attempted'
    && draft.providerSubmissionId === null
    && !draft.hasRegistrationResult
    && draft.submissionLeaseToken === null
    && draft.submissionLeaseClaimedAt === null
    && draft.isDeleted === false;
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

function canSupersedePreparedExternalExecution(input: {
  draft: FrozenRegistrationDraft;
  execution: ProductRegistrationExecution;
  requestedByUserId: string | null;
  expectedProviderAccountId: string;
  nextRequestHash: string;
}): boolean {
  const { draft, execution } = input;
  return draft.status === 'submitting'
    && draft.providerOutcome === 'not_attempted'
    && draft.providerSubmissionId === null
    && !draft.hasRegistrationResult
    && draft.channelListingId === null
    && draft.submissionLeaseToken === null
    && draft.submissionLeaseClaimedAt === null
    && draft.hasSubmissionPayload
    && draft.submissionPayloadHash === execution.requestHash
    && draft.submissionKey === execution.idempotencyKey
    && draft.approvedByUserId === input.requestedByUserId
    && execution.executionKind === 'external_wing'
    && execution.status === 'prepared'
    && execution.providerOutcome === 'not_attempted'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.channelListingId === null
    && execution.resultJson === null
    && execution.leaseToken === null
    && execution.leaseClaimedAt === null
    && execution.startedAt === null
    && execution.completedAt === null
    && execution.submissionPayloadJson !== null
    && execution.submissionPayloadHash === execution.requestHash
    && execution.requestedByUserId === input.requestedByUserId
    && execution.expectedProviderAccountId === input.expectedProviderAccountId
    && execution.requestHash !== input.nextRequestHash;
}

function canRestartVerifiedMissingExternalExecution(input: {
  draft: FrozenRegistrationDraft;
  execution: ProductRegistrationExecution;
  requestedByUserId: string | null;
  expectedProviderAccountId: string;
}): boolean {
  const { draft, execution } = input;
  return draft.status === 'submitting'
    && draft.providerOutcome === 'uncertain'
    && draft.providerSubmissionId === null
    && !draft.hasRegistrationResult
    && draft.channelListingId === null
    && draft.submissionLeaseToken !== null
    && draft.submissionLeaseToken === execution.leaseToken
    && draft.submissionLeaseClaimedAt !== null
    && draft.hasSubmissionPayload
    && draft.submissionPayloadHash === execution.requestHash
    && draft.submissionKey === execution.idempotencyKey
    && draft.approvedByUserId === input.requestedByUserId
    && execution.executionKind === 'external_wing'
    && ['executing', 'reconciling'].includes(execution.status)
    && execution.providerOutcome === 'uncertain'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.channelListingId === null
    && execution.resultJson === null
    && execution.leaseToken !== null
    && execution.leaseClaimedAt !== null
    && execution.startedAt !== null
    && execution.completedAt === null
    && execution.submissionPayloadJson !== null
    && execution.submissionPayloadHash === execution.requestHash
    && execution.requestedByUserId === input.requestedByUserId
    && execution.expectedProviderAccountId === input.expectedProviderAccountId;
}

/**
 * 마켓에 아무것도 제출되지 않은 채 확정 실패로 닫힌 외부 등록은 새 시도가 이어받는다.
 *
 * `markNotSubmitted` 가 만드는 상태다. 확장이 WING 폼을 채우다 실패하면 제출 단계에
 * 닿지도 못한 것이라 재시도가 안전한데, 이 경로가 없으면 준비가 `failed` 로 남아
 * `prepare` 가 "이미 활성 준비가 있다"로 막아버린다.
 * (라이브 사례: reconciling 을 풀었더니 곧바로 여기서 다시 막혔다)
 *
 * `startedAt` 은 비어 있지 않다 — start 까지는 갔다가 채우기에서 멈춘 것이기
 * 때문이다. 중복 등록을 막는 실제 근거는 **공급자 식별자가 하나도 없다**는 것이고,
 * 그 조건은 아래에서 전부 확인한다.
 */
function canSupersedeFailedExternalExecution(input: {
  draft: FrozenRegistrationDraft;
  execution: ProductRegistrationExecution;
  requestedByUserId: string | null;
  expectedProviderAccountId: string;
}): boolean {
  const { draft, execution } = input;
  return draft.status === 'failed'
    && draft.providerOutcome === 'definitive_failure'
    && draft.providerSubmissionId === null
    && !draft.hasRegistrationResult
    && draft.channelListingId === null
    && draft.submissionLeaseToken === null
    && draft.submissionLeaseClaimedAt === null
    && draft.approvedByUserId === input.requestedByUserId
    && execution.executionKind === 'external_wing'
    && execution.status === 'failed'
    && execution.providerOutcome === 'definitive_failure'
    && execution.providerSubmissionId === null
    && execution.externalListingId === null
    && execution.channelListingId === null
    && execution.resultJson === null
    && execution.leaseToken === null
    && execution.leaseClaimedAt === null
    && execution.requestedByUserId === input.requestedByUserId
    && execution.expectedProviderAccountId === input.expectedProviderAccountId;
}

function externalExecutionResult(
  execution: ProductRegistrationExecution,
): RegistrationExecutionResult {
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
  draft: FrozenRegistrationDraft,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(draft);
  if (
    !draft.submissionKey
    || !draft.submissionPayloadJson
    || !draft.submissionPayloadHash
  ) {
    throw new ConflictException(
      'Legacy submitting preparation is missing frozen submission data and cannot be safely imported.',
    );
  }
  const frozen = freezeProductRegistrationPayload(
    draft.submissionPayloadJson as RegistrationSubmissionJson,
  );
  if (frozen.hash !== draft.submissionPayloadHash) {
    throw new ConflictException('Legacy frozen submission hash does not match its payload.');
  }
  const legacyOutcome = draft.resolvedProviderOutcome;
  const hasProviderIdentity = draft.providerSubmissionId !== null || draft.hasRegistrationResult;
  const providerOutcome = legacyOutcome === 'succeeded' || hasProviderIdentity
    ? 'succeeded'
    : legacyOutcome === 'definitive_failure'
      ? 'definitive_failure'
      : 'uncertain';
  const status = providerOutcome === 'definitive_failure' ? 'failed' : 'reconciling';
  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: draft.preparationId,
      channelAccountId: draft.channelAccountId,
      idempotencyKey: draft.submissionKey,
      requestHash: frozen.hash,
      submissionPayloadJson: frozen.payload as Prisma.InputJsonValue,
      submissionPayloadHash: frozen.hash,
      status,
      providerOutcome,
      providerSubmissionId: draft.providerSubmissionId,
      externalListingId: legacyExternalListingId(draft.registrationResult),
      resultJson: draft.registrationResult == null
        ? Prisma.JsonNull
        : draft.registrationResult as Prisma.InputJsonValue,
      lastErrorMessage: draft.lastError,
      leaseToken: draft.submissionLeaseToken,
      leaseClaimedAt: draft.submissionLeaseClaimedAt,
      requestedByUserId: draft.approvedByUserId,
      startedAt: draft.submissionLeaseClaimedAt,
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
  draft: FrozenRegistrationDraft,
  organizationId: string,
): Promise<ProductRegistrationExecution> {
  assertRegistrationIdentity(draft);
  if (!draft.channelListingId) {
    throw new ConflictException('Registered preparation is missing its persisted listing identity.');
  }
  const listing = await tx.channelListing.findFirst({
    where: {
      id: draft.channelListingId,
      organizationId,
      channelAccountId: draft.channelAccountId,
      sourceCandidateId: draft.sourceCandidateId,
    },
    select: { id: true, externalId: true },
  });
  if (!listing) {
    throw new ConflictException('Registered preparation listing is outside its persisted account scope.');
  }

  let submissionPayloadJson: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  let submissionPayloadHash: string | null = null;
  let requestHash: string;
  if (draft.submissionPayloadJson && draft.submissionPayloadHash) {
    const frozen = freezeProductRegistrationPayload(
      draft.submissionPayloadJson as RegistrationSubmissionJson,
    );
    if (frozen.hash !== draft.submissionPayloadHash) {
      throw new ConflictException('Legacy registered submission hash does not match its payload.');
    }
    submissionPayloadJson = frozen.payload as Prisma.InputJsonValue;
    submissionPayloadHash = frozen.hash;
    requestHash = frozen.hash;
  } else {
    requestHash = freezeProductRegistrationPayload({
      kind: 'legacy_registered_replay',
      preparationId: draft.preparationId,
      channelListingId: listing.id,
      channelAccountId: draft.channelAccountId,
      externalListingId: listing.externalId,
    } as RegistrationSubmissionJson).hash;
  }

  return tx.productRegistrationExecution.create({
    data: {
      organizationId,
      productPreparationId: draft.preparationId,
      channelAccountId: draft.channelAccountId,
      channelListingId: listing.id,
      idempotencyKey: draft.submissionKey || `legacy-registered:${draft.preparationId}`,
      requestHash,
      submissionPayloadJson,
      submissionPayloadHash,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      providerSubmissionId: draft.providerSubmissionId ?? listing.externalId,
      externalListingId: listing.externalId,
      resultJson: draft.registrationResult == null
        ? Prisma.DbNull
        : draft.registrationResult as Prisma.InputJsonValue,
      requestedByUserId: draft.approvedByUserId,
      completedAt: draft.updatedAt,
    },
  });
}

function assertRegistrationIdentity(
  draft: FrozenRegistrationDraft,
): asserts draft is FrozenRegistrationDraft & {
  sourceCandidateId: string;
  channelAccountId: string;
} {
  if (!draft.sourceCandidateId || !draft.channelAccountId) {
    throw new ConflictException('Product preparation is missing its registration identity.');
  }
}

/**
 * 실행이 동결한 제출본을 되읽는다.
 *
 * 표시명 · 선택된 콘텐츠는 **동결 payload** 에서 읽는다 — 초안이 그 뒤에 편집돼도
 * 제출된 것은 바뀌지 않는다. 행 쪽에서 읽으면 그 보장이 사라진다.
 */
function toFrozenSubmission(
  draft: FrozenRegistrationDraft,
  execution: ProductRegistrationExecution,
): FrozenRegistrationSubmission {
  assertRegistrationIdentity(draft);
  if (!execution.idempotencyKey || !execution.submissionPayloadJson || !execution.submissionPayloadHash) {
    throw new ConflictException('Preparation submission has not been frozen.');
  }
  const frozen = freezeProductRegistrationPayload(
    execution.submissionPayloadJson as RegistrationSubmissionJson,
  );
  if (frozen.hash !== execution.submissionPayloadHash || frozen.hash !== execution.requestHash) {
    throw new ConflictException('Frozen registration execution payload hash does not match its JSON.');
  }
  const payload = frozen.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ConflictException('Frozen preparation payload must be an object.');
  }
  const frozenChannelAccountId = frozenRequiredString(payload, 'channelAccountId');
  if (frozenChannelAccountId !== draft.channelAccountId) {
    throw new ConflictException('Frozen preparation account does not match the row identity.');
  }
  return {
    executionId: execution.id,
    preparationId: draft.preparationId,
    sourceCandidateId: draft.sourceCandidateId,
    channelAccountId: frozenChannelAccountId,
    sourceContentWorkspaceId: draft.sourceContentWorkspaceId,
    displayName: frozenRequiredString(payload, 'displayName'),
    status: draft.status as FrozenRegistrationSubmission['status'],
    submissionKey: execution.idempotencyKey,
    submissionPayloadJson: frozen.payload,
    submissionPayloadHash: execution.submissionPayloadHash,
    providerSubmissionId: execution.providerSubmissionId,
    registrationResult: execution.resultJson ?? null,
    providerOutcome: execution.providerOutcome as RegistrationExecutionProviderOutcome,
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
  payload: RegistrationSubmissionJson,
  key: string,
): string {
  const value = (payload as Record<string, RegistrationSubmissionJson>)[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConflictException(`Frozen preparation payload is missing '${key}'.`);
  }
  return value;
}

function frozenNullableString(
  payload: RegistrationSubmissionJson,
  key: string,
): string | null {
  const value = (payload as Record<string, RegistrationSubmissionJson>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ConflictException(`Frozen preparation payload field '${key}' is invalid.`);
  }
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
