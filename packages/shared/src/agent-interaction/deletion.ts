import { z } from "zod";

export const AgentSessionDeletionStateSchema = z.enum([
  "deleting",
  "delete_failed",
  "finalizing",
]);

export const AgentSessionDeletionFailureCodeSchema = z.enum([
  "RUNTIME_CLEANUP_UNKNOWN",
  "ARTIFACT_WRITER_NOT_FENCED",
  "STORAGE_DELETE_PRESENT",
  "STORAGE_DELETE_UNKNOWN",
  "SESSION_OPERATION_OWNERSHIP_INVALID",
  "SESSION_GRAPH_CHANGED",
  "SESSION_DELETION_INVARIANT",
]);

export const AgentSessionDeletionStatusSchema = z
  .object({
    state: AgentSessionDeletionStateSchema,
    failureCode: AgentSessionDeletionFailureCodeSchema.nullable(),
  })
  .strict();

export type AgentSessionDeletionState = z.infer<
  typeof AgentSessionDeletionStateSchema
>;
export type AgentSessionDeletionFailureCode = z.infer<
  typeof AgentSessionDeletionFailureCodeSchema
>;
export type AgentSessionDeletionStatus = z.infer<
  typeof AgentSessionDeletionStatusSchema
>;
