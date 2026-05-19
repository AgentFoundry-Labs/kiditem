export const AGENT_LOG_STORE_PORT = Symbol('AGENT_LOG_STORE_PORT');

export interface PutLogInput {
  organizationId: string;
  runId: string;
  payload: string;
}

export interface PutLogResult {
  store: string;
  ref: string;
  bytes: bigint;
  sha256: string;
}

export interface AgentLogStorePort {
  put(input: PutLogInput): Promise<PutLogResult>;
}
