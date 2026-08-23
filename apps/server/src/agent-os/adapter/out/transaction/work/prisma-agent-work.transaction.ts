import { Prisma, type PrismaClient } from "@prisma/client";
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
  AgentWorkTransactionPort,
  InvocationAuthorizationInput,
  InvocationAuthorizationResult,
  TaskLifecycleTransitionInput,
  TerminalSessionDeleteInput,
} from "../../../../application/port/out/work/agent-work-transaction.port";
import {
  activeVersion,
  assertActiveMembership,
  lockSession,
  lockSessionOwner,
  lockedOwnedSession,
  lockTask,
  rejectAgentWork as rejection,
} from "./internal/agent-work-transaction.guards";

export class PrismaAgentWorkTransaction implements Pick<
  AgentWorkTransactionPort,
  | "admitRootAttempt"
  | "admitAttempt"
  | "delegateTask"
  | "authorizeInvocation"
  | "decideApproval"
  | "expireApproval"
  | "transitionTask"
  | "deleteTerminalSession"
> {
  constructor(private readonly prisma: PrismaClient) {}

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
        ? await lockedOwnedSession(
            tx,
            input.organizationId,
            input.sessionId,
            input.createdByUserId,
          )
        : await tx.agentWorkSession.create({
            data: {
              organizationId: input.organizationId,
              createdByUserId: input.createdByUserId,
            },
          });
      const existing = await tx.agentWorkTask.count({
        where: { sessionId: session.id },
      });
      if (existing) throw rejection("root_task_already_exists");
      const version = await activeVersion(tx, input.assignedAgentVersionId);
      const task = await tx.agentWorkTask.create({
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
        await tx.agentWorkTask.update({
          where: { id: task.id },
          data: { status: "open", finishedAt: null },
        });
      }
      const version = await activeVersion(tx, task.assigned_agent_version_id);
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
      const existing = await tx.agentWorkTask.findFirst({
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
      const version = await activeVersion(tx, input.targetAgentVersionId);
      const child = await tx.agentWorkTask.create({
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
    return this.prisma.$transaction(async (tx) => {
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
      if (task.status !== "open") throw rejection("task_not_open");
      const attempt = await tx.agentAttempt.findFirst({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          agentVersionId: input.agentVersionId,
        },
      });
      if (!attempt || !["starting", "running"].includes(attempt.status))
        throw rejection("attempt_not_live");
      if (
        attempt.agentVersionId !== task.assigned_agent_version_id ||
        input.agentVersionId !== task.assigned_agent_version_id
      )
        throw rejection("attempt_version_mismatch");
      const version = await activeVersion(tx, task.assigned_agent_version_id);
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
          (!mutation || !delegatedChild)) ||
        ![
          "agent_default_scope",
          "cross_domain_read_grant",
          "explicit_execution_grant",
        ].includes(input.authorizationKind)
      )
        throw rejection("capability_routing_denied");
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
      };
    });
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

  async transitionTask(
    input: TaskLifecycleTransitionInput,
  ): Promise<{ status: string }> {
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
      if (input.to === "cancelled") {
        if (task.status !== "open") throw rejection("task_not_open");
        await tx.agentAttempt.updateMany({
          where: { taskId: task.id, status: { in: ["starting", "running"] } },
          data: { status: "cancelled", finishedAt: input.at },
        });
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
            tx.agentWorkTask.count({
              where: { parentTaskId: task.id, status: "open" },
            }),
          ]);
        if (pendingInvocations || liveAttempts || openChildren)
          throw rejection("task_pending_work");
      }
      await tx.agentWorkTask.updateMany({
        where: { id: task.id, organizationId: input.organizationId },
        data: { status: input.to, finishedAt: input.at },
      });
      return { status: input.to };
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
        tx.agentWorkTask.count({
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
      await tx.agentWorkSession.delete({
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

function isReadOnlyEffects(effects: unknown): boolean {
  const readOnlyEffects = new Set(["read", "browser", "external_io", "llm"]);
  return (
    Array.isArray(effects) &&
    effects.every(
      (effect) => typeof effect === "string" && readOnlyEffects.has(effect),
    )
  );
}
