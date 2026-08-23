export const AGENT_SESSION_CANCELLATION_TRANSACTION = Symbol(
  'AGENT_SESSION_CANCELLATION_TRANSACTION',
);

export interface AgentSessionCancellationCommand {
  organizationId: string;
  sessionId: string;
  taskId: string;
  actorId: string;
  idempotencyKey: string;
  fingerprint: string;
  expectedStatus: string;
  reason: string | null;
}

export interface AgentSessionCancellationTransactionPort {
  begin(
    input: AgentSessionCancellationCommand,
  ): Promise<
    | { kind: 'pending'; operationRunId: string }
    | { kind: 'completed'; status: string }
  >;

  complete(
    input: Pick<
      AgentSessionCancellationCommand,
      | 'organizationId'
      | 'sessionId'
      | 'taskId'
      | 'actorId'
      | 'idempotencyKey'
      | 'fingerprint'
    > & {
      operationRunId: string;
      status: string;
    },
  ): Promise<{ status: string }>;
}
