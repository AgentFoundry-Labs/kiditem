import { Prisma } from "@prisma/client";
import type { AgentSessionDeletionFailureCode } from "@kiditem/shared/agent-interaction";
import { AgentSessionControlRepositoryError } from "../../../../../application/port/out/repository/session-control/agent-session-control.persistence.types";

export interface LockedAgentSession {
  id: string;
  createdByUserId: string;
  lifecycle: string;
  deletionOperationRunId: string | null;
  deletionFailureCode: AgentSessionDeletionFailureCode | null;
}

export async function lockWritableAgentSession(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string },
): Promise<LockedAgentSession> {
  const session = await lockAgentSessionForDeletion(tx, input);
  if (!session) throw scope();
  if (session.lifecycle === "deleting" || session.lifecycle === "delete_failed") {
    throw state();
  }
  return session;
}

export async function lockAgentSessionForDeletion(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string },
): Promise<LockedAgentSession | null> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(
      ${`agent-session-lifecycle:${input.organizationId}:${input.sessionId}`}, 0
    ))`,
  );
  const rows = await tx.$queryRaw<Array<{
    id: string;
    created_by_user_id: string;
    lifecycle: string;
    deletion_operation_run_id: string | null;
    deletion_failure_code: AgentSessionDeletionFailureCode | null;
  }>>(Prisma.sql`
    SELECT id, created_by_user_id, lifecycle,
           deletion_operation_run_id, deletion_failure_code
    FROM agent_sessions
    WHERE id = ${input.sessionId}::uuid
      AND organization_id = ${input.organizationId}::uuid
    FOR UPDATE
  `);
  const session = rows[0];
  if (!session) return null;
  return {
    id: session.id,
    createdByUserId: session.created_by_user_id,
    lifecycle: session.lifecycle,
    deletionOperationRunId: session.deletion_operation_run_id,
    deletionFailureCode: session.deletion_failure_code,
  };
}

function scope(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    "AGENT_SESSION_CONTROL_SCOPE_INVALID",
    "AGENT_SESSION_CONTROL_SCOPE_INVALID",
  );
}

function state(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    "AGENT_SESSION_CONTROL_STATE_CONFLICT",
    "AGENT_SESSION_CONTROL_STATE_CONFLICT",
  );
}
