import type { PrismaClient } from "@prisma/client";
import { AgentOsRuntimeError } from "../../../../../domain/agent-os.errors";

export type AgentWorkTransaction = Parameters<
  PrismaClient["$transaction"]
>[0] extends (tx: infer Transaction) => unknown
  ? Transaction
  : never;

export function rejectAgentWork(code: string): AgentOsRuntimeError {
  return new AgentOsRuntimeError(code, code);
}

export async function lockSession(
  tx: AgentWorkTransaction,
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM agent_work_sessions
    WHERE id = ${sessionId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  if (!rows[0]) throw rejectAgentWork("session_not_found");
}

export async function lockSessionOwner(
  tx: AgentWorkTransaction,
  organizationId: string,
  sessionId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ created_by_user_id: string }[]>`
    SELECT created_by_user_id FROM agent_work_sessions
    WHERE id = ${sessionId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  if (!rows[0]) throw rejectAgentWork("session_not_found");
  return rows[0].created_by_user_id;
}

export async function lockedOwnedSession(
  tx: AgentWorkTransaction,
  organizationId: string,
  sessionId: string,
  userId: string,
) {
  const rows = await tx.$queryRaw<
    { id: string; organization_id: string; created_by_user_id: string }[]
  >`
    SELECT id, organization_id, created_by_user_id FROM agent_work_sessions
    WHERE id = ${sessionId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  if (!rows[0] || rows[0].created_by_user_id !== userId)
    throw rejectAgentWork("session_not_found");
  return { id: rows[0].id, organizationId: rows[0].organization_id };
}

export async function assertActiveMembership(
  tx: AgentWorkTransaction,
  organizationId: string,
  userId: string,
): Promise<void> {
  const membership = await tx.organizationMembership.findFirst({
    where: { organizationId, userId, status: "active" },
    select: { id: true },
  });
  if (!membership) throw rejectAgentWork("organization_membership_inactive");
}

export async function activeVersion(tx: AgentWorkTransaction, id: string) {
  const version = await tx.agentVersion.findFirst({
    where: { id, activatedAt: { not: null }, retiredAt: null },
  });
  if (!version) throw rejectAgentWork("agent_version_not_active");
  return version;
}

export async function lockTask(
  tx: AgentWorkTransaction,
  organizationId: string,
  sessionId: string,
  taskId: string,
): Promise<{
  id: string;
  status: string;
  assigned_agent_version_id: string;
  parent_task_id: string | null;
  delegated_from_attempt_id: string | null;
}> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      status: string;
      assigned_agent_version_id: string;
      parent_task_id: string | null;
      delegated_from_attempt_id: string | null;
    }[]
  >`
    SELECT id, status, assigned_agent_version_id, parent_task_id, delegated_from_attempt_id FROM agent_work_tasks WHERE id = ${taskId}::uuid
      AND session_id = ${sessionId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  if (!rows[0]) throw rejectAgentWork("task_not_found");
  return rows[0];
}
