import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from "@prisma/client";
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';
import { canonicalizeOwnerInput, deriveOwnerIdempotencyKey } from '../../../../../common/owner-idempotency-key';
import {
  currentAgentVersion,
  activatedTaskVersion,
  assertActiveMembership,
  lockSession,
  lockSessionOwner,
  lockedOwnedSession,
  lockAttempt,
  lockTask,
  rejectAgentWork as rejection,
  type AgentWorkTransaction,
} from "./internal/agent-work-transaction.guards";
import type { OperationRunnerPort } from '../../../../../operations/application/port/in/operation-runner.port';
import type {
  AdmitRootAttemptInput,
  AdmitRootAttemptResult,
  AdmitAttemptInput,
  AdmitAttemptResult,
  DelegateTaskInput,
  DelegateTaskResult,
  ApprovalDecisionInput,
  ApprovalDecisionResult,
  ApprovalExpiryInput,
  MutationClaimInput,
  MutationFinalizeInput,
  InlineInvocationFinalizeInput,
  MutationWorkSnapshot,
  ReconciliationInput,
  ReconciliationResult,
  InvocationAuthorizationInput,
  InvocationAuthorizationResult,
  TaskLifecycleTransitionInput,
  TaskLifecycleTransitionResult,
  AttemptLifecycleTransitionInput,
  TerminalSessionDeleteInput,
  FinalizeTaskFromAttemptInput,
} from "../../../../application/port/out/work/agent-work-persistence.types";
import type { AgentWorkAdmissionPort } from "../../../../application/port/out/work/agent-work-admission.port";
import type { AgentWorkInvocationApprovalPort } from "../../../../application/port/out/work/agent-work-invocation-approval.port";
import type { AgentWorkLifecyclePort } from "../../../../application/port/out/work/agent-work-lifecycle.port";
import type { AgentWorkMutationPort } from "../../../../application/port/out/work/agent-work-mutation.port";

/**
 * One shared Prisma atomicity kernel for every Agent Work persistence seam.
 * The public Interfaces are deliberately narrow; transaction and row-lock
 * guards remain here so their ordering cannot drift between invariant clusters.
 */
export class PrismaAgentWorkTransaction
  implements
    AgentWorkAdmissionPort,
    AgentWorkInvocationApprovalPort,
    AgentWorkMutationPort,
    AgentWorkLifecyclePort
{
  constructor(private readonly prisma: PrismaClient, private readonly operations?: Pick<OperationRunnerPort, 'get'>) {}

  async admitRootAttempt(
    input: AdmitRootAttemptInput,
  ): Promise<AdmitRootAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.createdByUserId,
      );
      const session = input.sessionId
        ? await createOrLockOwnedSession(tx, input.organizationId, input.sessionId, input.createdByUserId)
        : await tx.agentSession.create({
            data: {
              organizationId: input.organizationId,
              createdByUserId: input.createdByUserId,
            },
          });
      const existing = await tx.agentTask.count({
        where: { sessionId: session.id },
      });
      if (existing) throw rejection("root_task_already_exists");
      const version = await currentAgentVersion(
        tx,
        input.assignedAgentVersionId,
      );
      const task = await tx.agentTask.create({
        data: {
          organizationId: input.organizationId,
          sessionId: session.id,
          assignedAgentVersionId: input.assignedAgentVersionId,
          objective: input.objective,
          completionCriteria: input.completionCriteria,
          inputResourceRefs: input.inputResourceRefs as Prisma.InputJsonValue,
        },
      });
      const attempt = await tx.agentAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: session.id,
          taskId: task.id,
          agentVersionId: input.assignedAgentVersionId,
          ordinal: 1,
          input: input.input as Prisma.InputJsonValue,
          runtimeType: version.runtimeType,
          instructionProfileRef: version.instructionProfileRef,
          applicationVersion: input.applicationVersion,
          authorizingGitSha: input.authorizingGitSha,
          cliVersion: input.cliVersion,
          reportedModel: input.reportedModel,
        },
      });
      return {
        session: { id: session.id, organizationId: session.organizationId },
        task: {
          id: task.id,
          organizationId: task.organizationId,
          sessionId: task.sessionId,
        },
        attempt: { id: attempt.id, ordinal: attempt.ordinal },
      };
    });
  }

  async admitAttempt(input: AdmitAttemptInput): Promise<AdmitAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.requestedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.requestedByUserId,
      );
      const tasks = await tx.$queryRaw<
        {
          id: string;
          status: string;
          assigned_agent_version_id: string;
        }[]
      >`
        SELECT id, status, assigned_agent_version_id FROM agent_work_tasks
        WHERE id = ${input.taskId}::uuid AND session_id = ${input.sessionId}::uuid
          AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE`;
      const task = tasks[0];
      if (!task) throw rejection("task_not_found");
      const intent = input.intent;
      if (task.status !== "open") {
        if (
          !["completed", "failed", "cancelled"].includes(task.status) ||
          !intent ||
          (task.status === "cancelled" && intent !== "reopen")
        )
          throw rejection("task_not_open");
        await tx.agentTask.update({
          where: { id: task.id },
          data: { status: "open", finishedAt: null },
        });
      }
      const version = await activatedTaskVersion(
        tx,
        task.assigned_agent_version_id,
      );
      const predecessor = await tx.agentAttempt.findFirst({
        where: {
          id: input.predecessorAttemptId,
          taskId: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          agentVersionId: task.assigned_agent_version_id,
        },
      });
      if (
        !predecessor ||
        !["succeeded", "failed", "process_interrupted", "cancelled"].includes(
          predecessor.status,
        )
      ) {
        throw rejection("attempt_predecessor_not_terminal");
      }
      const live = await tx.agentAttempt.findFirst({
        where: {
          taskId: input.taskId,
          status: { in: ["starting", "running"] },
        },
      });
      if (live) throw rejection("attempt_already_running");
      const latest = await tx.agentAttempt.findFirst({
        where: { taskId: input.taskId },
        orderBy: { ordinal: "desc" },
        select: { id: true },
      });
      if (latest?.id !== predecessor.id)
        throw rejection("attempt_predecessor_stale");
      const aggregate = await tx.agentAttempt.aggregate({
        where: { taskId: input.taskId },
        _max: { ordinal: true },
      });
      const attempt = await tx.agentAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          agentVersionId: task.assigned_agent_version_id,
          ordinal: (aggregate._max.ordinal ?? 0) + 1,
          predecessorAttemptId: predecessor.id,
          input: input.input as Prisma.InputJsonValue,
          runtimeType: version.runtimeType,
          instructionProfileRef: version.instructionProfileRef,
          applicationVersion: input.applicationVersion,
          authorizingGitSha: input.authorizingGitSha,
          cliVersion: input.cliVersion,
          reportedModel: input.reportedModel,
        },
      });
      return {
        attemptId: attempt.id,
        taskId: attempt.taskId,
        sessionId: attempt.sessionId,
        ordinal: attempt.ordinal,
      };
    });
  }

  async findDelegationReplay(
    input: Pick<
      DelegateTaskInput,
      | "organizationId"
      | "sessionId"
      | "parentTaskId"
      | "delegatingAttemptId"
      | "requestedByUserId"
      | "idempotencyKey"
      | "requestHash"
    >,
  ): Promise<DelegateTaskResult | null> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.requestedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.requestedByUserId,
      );
      const existing = await tx.agentTask.findFirst({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          delegatedFromAttemptId: input.delegatingAttemptId,
          delegationIdempotencyKey: input.idempotencyKey,
        },
        include: { attempts: { orderBy: { ordinal: "asc" }, take: 1 } },
      });
      if (!existing) return null;
      if (
        existing.delegationRequestHash !== input.requestHash ||
        !existing.attempts[0]
      ) {
        throw rejection("delegation_idempotency_conflict");
      }
      return {
        childTaskId: existing.id,
        firstAttemptId: existing.attempts[0].id,
        replayed: true,
      };
    });
  }

  async delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.requestedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.requestedByUserId,
      );
      const parent = await lockTask(
        tx,
        input.organizationId,
        input.sessionId,
        input.parentTaskId,
      );
      if (parent.status !== "open")
        throw rejection(
          parent.status === "cancelled" ? "task_cancelled" : "task_not_open",
        );
      const existing = await tx.agentTask.findFirst({
        where: {
          parentTaskId: input.parentTaskId,
          delegationIdempotencyKey: input.idempotencyKey,
        },
        include: { attempts: { orderBy: { ordinal: "asc" }, take: 1 } },
      });
      if (existing) {
        if (
          existing.delegationRequestHash !== input.requestHash ||
          !existing.attempts[0]
        )
          throw rejection("delegation_idempotency_conflict");
        return {
          childTaskId: existing.id,
          firstAttemptId: existing.attempts[0].id,
          replayed: true,
        };
      }
      const attempt = await tx.agentAttempt.findFirst({
        where: {
          id: input.delegatingAttemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.parentTaskId,
          status: { in: ["starting", "running"] },
        },
      });
      if (!attempt) throw rejection("delegating_attempt_not_live");
      const version = await currentAgentVersion(
        tx,
        input.targetAgentVersionId,
      );
      const child = await tx.agentTask.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          parentTaskId: input.parentTaskId,
          assignedAgentVersionId: input.targetAgentVersionId,
          objective: input.objective,
          completionCriteria: input.completionCriteria,
          inputResourceRefs: input.inputResourceRefs as Prisma.InputJsonValue,
          delegatedFromAttemptId: input.delegatingAttemptId,
          delegationIdempotencyKey: input.idempotencyKey,
          delegationRequestHash: input.requestHash,
        },
      });
      const first = await tx.agentAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: child.id,
          agentVersionId: input.targetAgentVersionId,
          ordinal: 1,
          input: input.input as Prisma.InputJsonValue,
          runtimeType: version.runtimeType,
          instructionProfileRef: version.instructionProfileRef,
          applicationVersion: input.applicationVersion,
          authorizingGitSha: input.authorizingGitSha,
          cliVersion: input.cliVersion,
          reportedModel: input.reportedModel,
        },
      });
      return {
        childTaskId: child.id,
        firstAttemptId: first.id,
        replayed: false,
      };
    });
  }

  async authorizeInvocation(
    input: InvocationAuthorizationInput,
  ): Promise<InvocationAuthorizationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.initiatingUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.initiatingUserId,
      );
      const task = await lockTask(
        tx,
        input.organizationId,
        input.sessionId,
        input.taskId,
      );
      const attempt = await tx.agentAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          agentVersionId: input.agentVersionId,
        },
      });
      if (!attempt) throw rejection("attempt_not_live");
      if (
        attempt.agentVersionId !== task.assigned_agent_version_id ||
        input.agentVersionId !== task.assigned_agent_version_id
      )
        throw rejection("attempt_version_mismatch");
      const version = await activatedTaskVersion(
        tx,
        task.assigned_agent_version_id,
      );
      const capabilityKeys = version.capabilityKeys as unknown[];
      const assignedDomains = version.assignedDomains as unknown[];
      const mutation = input.effects.some((effect) =>
        ["db_write", "external_write", "job_enqueue"].includes(effect),
      );
      const ownDomain = assignedDomains.includes(input.ownerDomain);
      const defaultScope =
        ownDomain && capabilityKeys.includes(input.capabilityKey);
      const delegatedChild = Boolean(
        task.parent_task_id && task.delegated_from_attempt_id,
      );
      if (
        (input.authorizationKind === "agent_default_scope" && !defaultScope) ||
        (input.authorizationKind === "cross_domain_read_grant" &&
          (mutation || ownDomain)) ||
        (input.authorizationKind === "explicit_execution_grant" &&
          (!mutation || !delegatedChild || !ownDomain)) ||
        ![
          "agent_default_scope",
          "cross_domain_read_grant",
          "explicit_execution_grant",
        ].includes(input.authorizationKind)
      )
        throw rejection("capability_routing_denied");
      const existing = await findIdempotentInvocation(tx, input);
      if (existing) return replayInvocation(existing, input);
      if (task.status !== "open") throw rejection("task_not_open");
      if (!["starting", "running"].includes(attempt.status))
        throw rejection("attempt_not_live");
      const invocation = await tx.agentCapabilityInvocation.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          attemptId: input.attemptId,
          agentVersionId: input.agentVersionId,
          initiatingUserId: input.initiatingUserId,
          capabilityKey: input.capabilityKey,
          ownerDomain: input.ownerDomain,
          authorizationKind: input.authorizationKind,
          authorizationExpiresAt: input.authorizationExpiresAt,
          inputHash: input.inputHash,
          canonicalInput: input.canonicalInput as
            Prisma.InputJsonValue | undefined,
          effects: input.effects as Prisma.InputJsonValue,
          approvalRisk: input.approvalRisk,
          idempotencyRequirement: input.idempotencyRequirement,
          ownerIdempotencyKey: input.ownerIdempotencyKey,
          applicationVersion: attempt.applicationVersion,
          authorizingGitSha: attempt.authorizingGitSha,
          capabilityContractFingerprint: input.capabilityContractFingerprint,
          runtimeType: attempt.runtimeType,
          reportedModel: attempt.reportedModel,
          status: input.initialStatus,
          approval: input.approval ? { create: input.approval } : undefined,
        },
        include: { approval: true },
      });
      return {
        invocationId: invocation.id,
        approvalId: invocation.approval?.id ?? null,
        invocationStatus:
          invocation.status as InvocationAuthorizationResult["invocationStatus"],
        approvalStatus: invocation.approval
          ?.status as InvocationAuthorizationResult["approvalStatus"],
        applicationVersion: invocation.applicationVersion,
        authorizingGitSha: invocation.authorizingGitSha,
        runtimeType: invocation.runtimeType,
      };
      });
    } catch (error) {
      if (!isInvocationIdempotencyRace(error, input)) throw error;
      return this.prisma.$transaction(async (tx) => {
        const existing = await findIdempotentInvocation(tx, input);
        if (!existing) throw error;
        return replayInvocation(existing, input);
      });
    }
  }

  async decideApproval(
    input: ApprovalDecisionInput,
  ): Promise<ApprovalDecisionResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.decidedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.decidedByUserId,
      );
      const invocation = await tx.agentCapabilityInvocation.findFirst({
        where: {
          id: input.invocationId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
      });
      const approval = await tx.agentCapabilityApproval.findFirst({
        where: {
          id: input.approvalId,
          invocationId: input.invocationId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
      });
      if (
        !invocation ||
        !approval ||
        approval.status !== "pending" ||
        invocation.status !== "approval_pending" ||
        approval.inputHash !== input.inputHash ||
        invocation.inputHash !== input.inputHash ||
        invocation.initiatingUserId !== input.decidedByUserId
      )
        throw rejection("approval_context_changed");
      if (
        approval.expiresAt <= input.decidedAt ||
        invocation.authorizationExpiresAt <= input.decidedAt
      )
        throw rejection("approval_expired");
      const invocationStatus =
        input.decision === "approved" ? "ready" : "failed";
      await tx.agentCapabilityApproval.update({
        where: { id: approval.id },
        data: {
          status: input.decision === "approved" ? "approved" : "rejected",
          decidedByUserId: input.decidedByUserId,
          decisionReason: input.decisionReason,
          decidedAt: input.decidedAt,
        },
      });
      const changed = await tx.agentCapabilityInvocation.updateMany({
        where: {
          id: invocation.id,
          organizationId: input.organizationId,
          status: "approval_pending",
        },
        data:
          input.decision === "approved"
            ? { status: invocationStatus }
            : {
                status: invocationStatus,
                error: {
                  code: "approval_rejected",
                  message: "Approval was rejected.",
                },
                finishedAt: input.decidedAt,
              },
      });
      if (changed.count !== 1) throw rejection("approval_context_changed");
      return {
        approvalStatus: input.decision === "approved" ? "approved" : "rejected",
        invocationStatus:
          invocationStatus as ApprovalDecisionResult["invocationStatus"],
      };
    });
  }

  async expireApproval(input: ApprovalExpiryInput): Promise<{ won: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const ownerId = await lockSessionOwner(
        tx,
        input.organizationId,
        input.sessionId,
      );
      const invocation = await tx.agentCapabilityInvocation.findFirst({
        where: {
          id: input.invocationId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
      });
      const approval = await tx.agentCapabilityApproval.findFirst({
        where: {
          id: input.approvalId,
          invocationId: input.invocationId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
        },
      });
      if (invocation) {
        await assertActiveMembership(
          tx,
          input.organizationId,
          invocation.initiatingUserId,
        );
        if (invocation.initiatingUserId !== ownerId) return { won: false };
      }
      if (
        !invocation ||
        !approval ||
        invocation.status !== "approval_pending" ||
        invocation.inputHash !== input.inputHash ||
        approval.status !== "pending" ||
        approval.inputHash !== input.inputHash ||
        (approval.expiresAt > input.expiredAt &&
          invocation.authorizationExpiresAt > input.expiredAt)
      )
        return { won: false };
      const updated = await tx.agentCapabilityInvocation.updateMany({
        where: { id: input.invocationId, status: "approval_pending" },
        data: {
          status: "failed",
          error: { code: "approval_expired", message: "Approval expired." },
          finishedAt: input.expiredAt,
        },
      });
      if (updated.count !== 1) return { won: false };
      await tx.agentCapabilityApproval.update({
        where: { id: approval.id },
        data: { status: "expired", decidedAt: input.expiredAt },
      });
      return { won: true };
    });
  }

  /**
   * Atomically takes one ready row, or an abandoned expired lease. Post-restart
   * replay is intentionally the same invocation and owner idempotency key.
   */
  async claimMutation(input: MutationClaimInput): Promise<MutationWorkSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      for (let skipped = 0; skipped < 100; skipped += 1) {
        const rows = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
        SELECT id, organization_id AS "organizationId" FROM agent_capability_invocations
        WHERE canonical_input IS NOT NULL
          AND (
            status = 'ready'
            OR (status = 'executing' AND lease_expires_at <= ${input.claimedAt})
          )
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
        const candidate = rows[0];
        if (!candidate) return null;
        const invocation = await tx.agentCapabilityInvocation.findFirst({
        where: { id: candidate.id, organizationId: candidate.organizationId },
        });
        if (!invocation) continue;
        if (invocation.authorizationExpiresAt <= input.claimedAt) {
          const expired = await tx.agentCapabilityInvocation.updateMany({
            where: {
              id: invocation.id,
              organizationId: invocation.organizationId,
              OR: [
                { status: 'ready' },
                { status: 'executing', leaseExpiresAt: { lte: input.claimedAt } },
              ],
            },
            data: {
              status: 'failed',
              error: { code: 'authorization_expired', message: 'Capability authorization expired.' },
              finishedAt: input.claimedAt,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          });
          if (expired.count !== 1) continue;
          continue;
        }
        const context = await mutationContextStatus(tx, invocation);
        if (!context.valid) {
          await tx.agentCapabilityInvocation.updateMany({
          where: { id: invocation.id, organizationId: invocation.organizationId },
          data: {
            status: 'failed',
            error: context.error,
            finishedAt: input.claimedAt,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
          });
          continue;
        }
        const updated = await tx.agentCapabilityInvocation.updateMany({
        where: {
          id: invocation.id,
          organizationId: invocation.organizationId,
          OR: [
            { status: 'ready' },
            { status: 'executing', leaseExpiresAt: { lte: input.claimedAt } },
          ],
        },
        data: {
          status: 'executing',
          leaseOwner: input.workerId,
          leaseExpiresAt: input.leaseExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
        if (updated.count !== 1) continue;
        return {
        invocationId: invocation.id,
        organizationId: invocation.organizationId,
        sessionId: invocation.sessionId,
        taskId: invocation.taskId,
        attemptId: invocation.attemptId,
        agentVersionId: invocation.agentVersionId,
        initiatingUserId: invocation.initiatingUserId,
        capabilityKey: invocation.capabilityKey,
        ownerDomain: invocation.ownerDomain,
        authorizationKind: invocation.authorizationKind as MutationWorkSnapshot['authorizationKind'],
        authorizationExpiresAt: invocation.authorizationExpiresAt,
        inputHash: invocation.inputHash,
        canonicalInput: invocation.canonicalInput,
        effects: invocation.effects as MutationWorkSnapshot['effects'],
        approvalRisk: invocation.approvalRisk as MutationWorkSnapshot['approvalRisk'],
        idempotencyRequirement: invocation.idempotencyRequirement as MutationWorkSnapshot['idempotencyRequirement'],
        ownerIdempotencyKey: invocation.ownerIdempotencyKey as string,
        applicationVersion: invocation.applicationVersion,
        authorizingGitSha: invocation.authorizingGitSha,
        capabilityContractFingerprint: invocation.capabilityContractFingerprint,
        runtimeType: invocation.runtimeType,
        reportedModel: invocation.reportedModel,
        attemptCount: invocation.attemptCount + 1,
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        };
      }
      return null;
    });
  }

  async finalizeMutation(input: MutationFinalizeInput): Promise<{ won: boolean }> {
    const updated = await this.prisma.agentCapabilityInvocation.updateMany({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
        status: 'executing',
        leaseOwner: input.leaseOwner,
      },
      data: {
        status: input.outcome,
        ...(input.result === undefined ? {} : { result: input.result as Prisma.InputJsonValue }),
        ...(input.error === undefined ? {} : { error: input.error as Prisma.InputJsonValue }),
        finishedAt: input.finishedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return { won: updated.count === 1 };
  }

  /**
   * A read is deliberately not claimed by the worker.  It is nevertheless
   * completed with an atomic status fence so an interrupted process cannot
   * later overwrite a restart reconciliation failure.
   */
  async finalizeInlineInvocation(
    input: InlineInvocationFinalizeInput,
  ): Promise<{ won: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const invocation = await tx.agentCapabilityInvocation.findFirst({
        where: {
          id: input.invocationId,
          organizationId: input.organizationId,
        },
        select: { attemptId: true },
      });
      if (!invocation) return { won: false };
      const attempt = await lockAttempt(
        tx,
        input.organizationId,
        invocation.attemptId,
      );
      if (!attempt || !["starting", "running"].includes(attempt.status)) {
        return { won: false };
      }
      const updated = await tx.agentCapabilityInvocation.updateMany({
        where: {
          id: input.invocationId,
          organizationId: input.organizationId,
          status: "authorized",
          canonicalInput: { equals: Prisma.DbNull },
        },
        data: {
          status: input.outcome,
          ...(input.result === undefined
            ? {}
            : { result: input.result as Prisma.InputJsonValue }),
          ...(input.error === undefined
            ? {}
            : { error: input.error as Prisma.InputJsonValue }),
          finishedAt: input.finishedAt,
        },
      });
      return { won: updated.count === 1 };
    });
  }

  /** API boot recovery terminalizes only prior in-process reads and attempts. */
  async reconcile(input: ReconciliationInput): Promise<ReconciliationResult> {
    return this.prisma.$transaction(async (tx) => {
      const attempts = await tx.agentAttempt.findMany({
        where: {
          status: { in: ['starting', 'running'] },
        },
        select: { id: true },
      });
      const attemptIds = attempts.map((attempt) => attempt.id);
      if (attemptIds.length) {
        await tx.agentAttempt.updateMany({
          where: { id: { in: attemptIds }, status: { in: ['starting', 'running'] } },
          data: { status: 'process_interrupted', finishedAt: input.now },
        });
      }
      const invocations = await tx.agentCapabilityInvocation.findMany({
        where: {
          status: { in: ['authorized', 'executing'] },
          attempt: {
            status: { in: ['succeeded', 'failed', 'process_interrupted', 'cancelled'] },
          },
        },
        select: { id: true, effects: true },
      });
      await failInlineReadInvocations(tx, invocations, {
        error: { code: 'process_interrupted', message: 'Inline read was interrupted before completion.' },
        finishedAt: input.now,
      });
      return { reconciled: attemptIds.length, attemptIds };
    });
  }

  async transitionTask(
    input: TaskLifecycleTransitionInput,
  ): Promise<TaskLifecycleTransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.requestedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.requestedByUserId,
      );
      const task = await lockTask(
        tx,
        input.organizationId,
        input.sessionId,
        input.taskId,
      );
      let cancelledAttemptIds: string[] | undefined;
      if (input.to === "cancelled") {
        if (task.status !== "open") throw rejection("task_not_open");
        const cancelledAttempts = await tx.$queryRaw<{ id: string }[]>`
          UPDATE agent_attempts
          SET status = 'cancelled', finished_at = ${input.at}
          WHERE task_id = ${task.id}::uuid
            AND organization_id = ${input.organizationId}::uuid
            AND status IN ('starting', 'running')
          RETURNING id`;
        cancelledAttemptIds = cancelledAttempts.map((attempt) => attempt.id);
        await tx.agentCapabilityApproval.updateMany({
          where: {
            sessionId: input.sessionId,
            status: "pending",
            invocation: { taskId: task.id },
          },
          data: { status: "expired", decidedAt: input.at },
        });
        const executing = await tx.agentCapabilityInvocation.findMany({
          where: { taskId: task.id, status: "executing" },
          select: { id: true, effects: true },
        });
        const readOnlyExecutingIds = executing
          .filter((invocation) => isReadOnlyEffects(invocation.effects))
          .map((invocation) => invocation.id);
        await tx.agentCapabilityInvocation.updateMany({
          where: {
            taskId: task.id,
            status: { in: ["authorized", "approval_pending"] },
          },
          data: {
            status: "failed",
            error: { code: "task_cancelled", message: "Task cancelled." },
            finishedAt: input.at,
          },
        });
        if (readOnlyExecutingIds.length) {
          await tx.agentCapabilityInvocation.updateMany({
            where: { id: { in: readOnlyExecutingIds }, status: "executing" },
            data: {
              status: "failed",
              error: { code: "task_cancelled", message: "Task cancelled." },
              finishedAt: input.at,
            },
          });
        }
      } else {
        if (task.status !== "open") throw rejection("task_not_open");
        const [pendingInvocations, liveAttempts, openChildren] =
          await Promise.all([
            tx.agentCapabilityInvocation.count({
              where: {
                taskId: task.id,
                status: {
                  in: ["authorized", "approval_pending", "ready", "executing"],
                },
              },
            }),
            tx.agentAttempt.count({
              where: {
                taskId: task.id,
                status: { in: ["starting", "running"] },
              },
            }),
            tx.agentTask.count({
              where: { parentTaskId: task.id, status: "open" },
            }),
          ]);
        if (pendingInvocations || liveAttempts || openChildren)
          throw rejection("task_pending_work");
      }
      await tx.agentTask.updateMany({
        where: { id: task.id, organizationId: input.organizationId },
        data: { status: input.to, finishedAt: input.at },
      });
      return {
        status: input.to,
        ...(cancelledAttemptIds === undefined ? {} : { cancelledAttemptIds }),
      };
    });
  }

  async transitionAttempt(input: AttemptLifecycleTransitionInput): Promise<{ transitioned: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agentAttempt.updateMany({
        where: { id: input.attemptId, status: input.from },
        data: {
          status: input.to,
          ...(input.to === 'running' ? { startedAt: input.at } : { finishedAt: input.at }),
          ...(input.result ? { result: input.result as Prisma.InputJsonValue } : {}),
          ...(input.error ? { error: input.error as Prisma.InputJsonValue } : {}),
        },
      });
      if (updated.count !== 1 || input.to === 'running') {
        return { transitioned: updated.count === 1 };
      }
      const invocations = await tx.agentCapabilityInvocation.findMany({
        where: {
          attemptId: input.attemptId,
          status: { in: ['authorized', 'executing'] },
        },
        select: { id: true, effects: true },
      });
      await failInlineReadInvocations(tx, invocations, {
        error: {
          code: 'attempt_terminalized',
          message: 'Inline read was interrupted because its Attempt terminalized.',
        },
        finishedAt: input.at,
      });
      return { transitioned: true };
    });
  }

  async finalizeTaskFromAttempt(input: FinalizeTaskFromAttemptInput): Promise<{ finalized: boolean; status: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const coordinate = await tx.agentAttempt.findFirst({
        where: { id: input.attemptId },
        select: { organizationId: true, sessionId: true, taskId: true },
      });
      if (!coordinate) return { finalized: false, status: null };
      // Keep the same Session -> Task order as successor admission. The Task
      // lock spans every finalization fence, so a new Attempt cannot appear
      // after the latest/live checks but before the terminal Task update.
      await lockSession(tx, coordinate.organizationId, coordinate.sessionId);
      const task = await lockTask(tx, coordinate.organizationId, coordinate.sessionId, coordinate.taskId);
      const attempt = await tx.agentAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: coordinate.organizationId,
          sessionId: coordinate.sessionId,
          taskId: coordinate.taskId,
        },
      });
      if (!attempt || task.status !== 'open' || !['succeeded', 'failed'].includes(attempt.status)) return { finalized: false, status: null };
      const result = AgentResultEnvelopeSchema.safeParse(attempt.result);
      if (!result.success || !['completed', 'failed'].includes(result.data.outcome)) return { finalized: false, status: null };
      const latest = await tx.agentAttempt.findFirst({ where: { taskId: attempt.taskId }, orderBy: { ordinal: 'desc' }, select: { id: true } });
      if (latest?.id !== attempt.id) return { finalized: false, status: null };
      const [pendingInvocations, liveAttempts, openChildren] = await Promise.all([
        tx.agentCapabilityInvocation.count({ where: { taskId: attempt.taskId, status: { in: ['authorized', 'approval_pending', 'ready', 'executing'] } } }),
        tx.agentAttempt.count({ where: { taskId: attempt.taskId, status: { in: ['starting', 'running'] } } }),
        tx.agentTask.count({ where: { parentTaskId: attempt.taskId, status: 'open' } }),
      ]);
      if (pendingInvocations || liveAttempts || openChildren) return { finalized: false, status: null };
      const invocationResults = await tx.agentCapabilityInvocation.findMany({
        where: { taskId: attempt.taskId, status: 'succeeded' }, select: { result: true },
      });
      const operationIds = [result.data, ...invocationResults.map((invocation) => AgentResultEnvelopeSchema.safeParse(invocation.result)).filter((parsed): parsed is { success: true; data: typeof result.data } => parsed.success).map((parsed) => parsed.data)]
        .flatMap((envelope) => envelope.operationRefs.map((reference) => reference.id));
      if (operationIds.length) {
        // The Operations owner is authoritative for current state.  If it is
        // unavailable or a reference is active, preserve this Task for a
        // successor rather than inferring completion from stale envelopes.
        if (!this.operations) return { finalized: false, status: null };
        try {
          const uniqueOperationIds = [...new Set(operationIds)];
          for (let index = 0; index < uniqueOperationIds.length; index += 50) {
            const runs = await Promise.all(uniqueOperationIds
              .slice(index, index + 50)
              .map((id) => this.operations!.get(attempt.organizationId, id)));
            if (runs.some((run) => !run || !['succeeded', 'failed', 'cancelled', 'skipped'].includes(run.status))) {
              return { finalized: false, status: null };
            }
          }
        } catch { return { finalized: false, status: null }; }
      }
      const status = result.data.outcome === 'completed' ? 'completed' : 'failed';
      const updated = await tx.agentTask.updateMany({ where: { id: attempt.taskId, organizationId: attempt.organizationId, status: 'open' }, data: { status, finishedAt: input.at } });
      return { finalized: updated.count === 1, status: updated.count === 1 ? status : null };
    });
  }

  async deleteTerminalSession(
    input: TerminalSessionDeleteInput,
  ): Promise<{ deleted: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await assertActiveMembership(
        tx,
        input.organizationId,
        input.deletedByUserId,
      );
      await lockedOwnedSession(
        tx,
        input.organizationId,
        input.sessionId,
        input.deletedByUserId,
      );
      const [tasks, attempts, invocations, approvals] = await Promise.all([
        tx.agentTask.count({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            status: "open",
          },
        }),
        tx.agentAttempt.count({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            status: { in: ["starting", "running"] },
          },
        }),
        tx.agentCapabilityInvocation.count({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            status: {
              in: ["authorized", "approval_pending", "ready", "executing"],
            },
          },
        }),
        tx.agentCapabilityApproval.count({
          where: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            status: "pending",
          },
        }),
      ]);
      if (tasks || attempts || invocations || approvals)
        throw rejection("session_busy");
      await tx.agentSession.delete({
        where: {
          id_organizationId: {
            id: input.sessionId,
            organizationId: input.organizationId,
          },
        },
      });
      return { deleted: true };
    });
  }
}

async function createOrLockOwnedSession(
  tx: AgentWorkTransaction,
  organizationId: string,
  sessionId: string,
  userId: string,
) {
  try {
    return await tx.agentSession.create({ data: { id: sessionId, organizationId, createdByUserId: userId } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    return lockedOwnedSession(tx, organizationId, sessionId, userId);
  }
}

async function findIdempotentInvocation(
  tx: AgentWorkTransaction,
  input: InvocationAuthorizationInput,
) {
  if (
    input.idempotencyRequirement !== "required" ||
    !input.ownerIdempotencyKey
  )
    return null;
  return tx.agentCapabilityInvocation.findFirst({
    where: {
      organizationId: input.organizationId,
      capabilityKey: input.capabilityKey,
      ownerIdempotencyKey: input.ownerIdempotencyKey,
      idempotencyRequirement: "required",
    },
    include: { approval: true },
  });
}

function replayInvocation(
  invocation: NonNullable<Awaited<ReturnType<typeof findIdempotentInvocation>>>,
  input: InvocationAuthorizationInput,
): InvocationAuthorizationResult {
  // The input hash is calculated from canonical JSON at the application edge.
  // It is the durable equality proof for a required owner idempotency key.
  if (invocation.inputHash !== input.inputHash)
    throw rejection("owner_idempotency_input_conflict");
  return {
    invocationId: invocation.id,
    approvalId: invocation.approval?.id ?? null,
    invocationStatus:
      invocation.status as InvocationAuthorizationResult["invocationStatus"],
    approvalStatus: invocation.approval
      ?.status as InvocationAuthorizationResult["approvalStatus"],
    applicationVersion: invocation.applicationVersion,
    authorizingGitSha: invocation.authorizingGitSha,
    runtimeType: invocation.runtimeType,
  };
}

function isInvocationIdempotencyRace(
  error: unknown,
  input: InvocationAuthorizationInput,
): boolean {
  return (
    input.idempotencyRequirement === "required" &&
    Boolean(input.ownerIdempotencyKey) &&
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isReadOnlyEffects(effects: unknown): boolean {
  const readOnlyEffects = new Set(["read", "browser", "external_io", "llm"]);
  return (
    Array.isArray(effects) &&
    effects.every(
      (effect) => typeof effect === "string" && readOnlyEffects.has(effect),
    )
  );
}

async function failInlineReadInvocations(
  tx: AgentWorkTransaction,
  invocations: readonly { id: string; effects: unknown }[],
  input: {
    error: { code: string; message: string };
    finishedAt: Date;
  },
): Promise<void> {
  const invocationIds = invocations
    .filter((invocation) => isReadOnlyEffects(invocation.effects))
    .map((invocation) => invocation.id);
  if (!invocationIds.length) return;
  await tx.agentCapabilityInvocation.updateMany({
    where: {
      id: { in: invocationIds },
      status: { in: ['authorized', 'executing'] },
    },
    data: {
      status: 'failed',
      error: input.error,
      finishedAt: input.finishedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

async function mutationContextStatus(
  tx: AgentWorkTransaction,
  invocation: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    agentVersionId: string;
    initiatingUserId: string;
    capabilityKey: string;
    ownerDomain: string;
    authorizationKind: string;
    authorizationExpiresAt: Date;
    inputHash: string;
    canonicalInput: unknown;
    ownerIdempotencyKey: string | null;
  },
): Promise<{ valid: true } | { valid: false; error: { code: string; message: string } }> {
  if (invocation.canonicalInput === null || !invocation.ownerIdempotencyKey) {
    return { valid: false, error: { code: 'stale_resource', message: 'Capability authorization is no longer current.' } };
  }
  const [membership, session, task, attempt, version] = await Promise.all([
    tx.organizationMembership.findFirst({
      where: { organizationId: invocation.organizationId, userId: invocation.initiatingUserId, status: 'active' },
      select: { id: true },
    }),
    tx.agentSession.findFirst({
      where: { id: invocation.sessionId, organizationId: invocation.organizationId, createdByUserId: invocation.initiatingUserId },
      select: { id: true },
    }),
    tx.agentTask.findFirst({
      where: { id: invocation.taskId, organizationId: invocation.organizationId, sessionId: invocation.sessionId },
      select: { id: true, parentTaskId: true, delegatedFromAttemptId: true },
    }),
    tx.agentAttempt.findFirst({
      where: { id: invocation.attemptId, organizationId: invocation.organizationId, sessionId: invocation.sessionId, taskId: invocation.taskId, agentVersionId: invocation.agentVersionId },
      select: { id: true, input: true },
    }),
    tx.agentVersion.findFirst({
      where: { id: invocation.agentVersionId },
      select: { capabilityKeys: true, assignedDomains: true },
    }),
  ]);
  const explicitGrant = invocation.authorizationKind === 'explicit_execution_grant';
  const ownsDomain = Boolean(version && Array.isArray(version.assignedDomains)
    && version.assignedDomains.includes(invocation.ownerDomain));
  const ownsDefaultCapability = Boolean(version && Array.isArray(version.capabilityKeys)
    && version.capabilityKeys.includes(invocation.capabilityKey));
  if (!version || !ownsDomain || (!explicitGrant && !ownsDefaultCapability)) {
    return { valid: false, error: { code: 'stale_capability_version', message: 'Capability version is no longer current.' } };
  }
  if (!membership || !session || !task || !attempt) {
    return { valid: false, error: { code: 'stale_resource', message: 'Capability context is no longer current.' } };
  }
  if (!matchesCanonicalInputHash(invocation.canonicalInput, invocation.inputHash)) {
    return { valid: false, error: { code: 'stale_resource', message: 'Capability input is no longer current.' } };
  }
  if (explicitGrant) {
    if (!task.parentTaskId || !task.delegatedFromAttemptId) {
      return { valid: false, error: { code: 'stale_resource', message: 'Explicit capability grant is not delegated.' } };
    }
    const [parent, delegatedFrom, root] = await Promise.all([
      tx.agentTask.findFirst({
        where: { id: task.parentTaskId, organizationId: invocation.organizationId, sessionId: invocation.sessionId },
        select: { id: true },
      }),
      tx.agentAttempt.findFirst({
        where: {
          id: task.delegatedFromAttemptId,
          organizationId: invocation.organizationId,
          sessionId: invocation.sessionId,
          taskId: task.parentTaskId,
        },
        select: { id: true },
      }),
      tx.agentTask.findFirst({
        where: { organizationId: invocation.organizationId, sessionId: invocation.sessionId, parentTaskId: null },
        select: { id: true },
      }),
    ]);
    if (!parent || !delegatedFrom || !root || !matchesExplicitGrant({
      grantSource: attempt.input,
      capabilityKey: invocation.capabilityKey,
      ownerDomain: invocation.ownerDomain,
      canonicalInput: invocation.canonicalInput,
      ownerIdempotencyKey: invocation.ownerIdempotencyKey,
      childAttemptId: invocation.attemptId,
      parentTaskId: task.parentTaskId,
      rootTaskId: root.id,
      delegatingAttemptId: task.delegatedFromAttemptId,
    })) {
      return { valid: false, error: { code: 'stale_resource', message: 'Explicit capability grant lineage is no longer current.' } };
    }
  }
  return { valid: true };
}

function matchesCanonicalInputHash(input: unknown, expectedHash: string): boolean {
  try {
    const canonical = canonicalizeOwnerInput(input);
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex') === expectedHash;
  } catch {
    return false;
  }
}

function matchesExplicitGrant(input: {
  grantSource: unknown;
  capabilityKey: string;
  ownerDomain: string;
  canonicalInput: unknown;
  ownerIdempotencyKey: string;
  childAttemptId: string;
  parentTaskId: string;
  rootTaskId: string;
  delegatingAttemptId: string;
}): boolean {
  if (!input.grantSource || typeof input.grantSource !== 'object' || Array.isArray(input.grantSource)) return false;
  const grant = (input.grantSource as Record<string, unknown>).explicitExecutionGrant;
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) return false;
  const value = grant as Record<string, unknown>;
  if (value.capabilityKey !== input.capabilityKey || value.ownerDomain !== input.ownerDomain ||
    value.parentTaskId !== input.parentTaskId || value.rootTaskId !== input.rootTaskId ||
    value.delegatingAttemptId !== input.delegatingAttemptId) return false;
  try {
    const canonicalGrantInput = canonicalizeOwnerInput(value.input);
    const canonicalInvocationInput = canonicalizeOwnerInput(input.canonicalInput);
    return JSON.stringify(canonicalGrantInput) === JSON.stringify(canonicalInvocationInput)
      && deriveOwnerIdempotencyKey({
        attemptId: input.childAttemptId,
        capabilityKey: input.capabilityKey,
        input: canonicalGrantInput,
      }) === input.ownerIdempotencyKey;
  } catch {
    return false;
  }
}
