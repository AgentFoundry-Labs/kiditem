import type { CanonicalResourceRef } from '@kiditem/shared/agent-interaction';
export interface ResolvedAgentDurableRuntimeAssets {
  prompt: string;
  promptSha256: string;
  summaryPrompt: string;
  summaryPromptSha256: string;
  skills: Array<{
    key: string;
    version: string;
    content: string;
    sha256: string;
  }>;
  outputSchema: {
    path: string;
    version: string;
    document: Record<string, unknown>;
    sha256: string;
  } | null;
}

export interface AgentDurableRuntimeCapabilities {
  detached: boolean;
  reconnect: boolean;
  interrupt: boolean;
  cancel: boolean;
  inspect: boolean;
}

export interface RuntimeConversationTurn {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  throughSequence: string;
  toolName?: string;
  toolStatus?: 'started' | 'completed' | 'failed' | 'cancelled';
}

export interface VersionedConversationSummary {
  sourceFromSequence: string;
  sourceThroughSequence: string;
  sourceHash: string;
  summarizerModelIdentity: string;
  summaryPromptHash: string;
  content: string;
}

export interface AgentDurableRuntimeExecutionContext {
  organizationId: string;
  sessionId: string;
  sessionTaskId: string;
  executionId: string;
  attemptId: string;
  agentDefinitionKey: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: string[];
  policySnapshotId: string;
  promptPackage: ResolvedAgentDurableRuntimeAssets;
  conversationView: {
    throughSequence: string;
    summary: VersionedConversationSummary | null;
    turns: RuntimeConversationTurn[];
  };
  currentInput: Record<string, unknown>;
  currentResourceRefs: CanonicalResourceRef[];
}

export interface RuntimeHandle {
  runtimeType: string;
  executionId: string;
  attemptId: string;
  externalRunId: string;
  encryptedHandleRef: string;
  generation: number;
}

export type NormalizedRuntimeEvent =
  | { kind: 'text_start' }
  | { kind: 'text_delta'; content: string }
  | { kind: 'text_end' }
  | { kind: 'progress'; progress: number; label: string }
  | { kind: 'interrupt'; interruptId: string; payload: Record<string, unknown> }
  | { kind: 'artifact'; artifactId: string; payload: Record<string, unknown> }
  | { kind: 'delegation'; payload: Record<string, unknown> }
  | { kind: 'terminal'; status: 'completed' | 'failed' | 'cancelled'; output?: Record<string, unknown>; errorCode?: string };

export type RuntimeInspection =
  | { status: 'running' }
  | { status: 'completed'; output: Record<string, unknown> }
  | { status: 'cancelled' }
  | { status: 'unknown' };

export interface RuntimeInterruptInput {
  interruptId: string;
  payload: Record<string, unknown>;
}

export interface AgentDurableRuntimeAdapter {
  readonly runtimeType: string;
  readonly capabilities: AgentDurableRuntimeCapabilities;
  start(context: AgentDurableRuntimeExecutionContext): Promise<RuntimeHandle>;
  connect(handle: RuntimeHandle): AsyncIterable<NormalizedRuntimeEvent>;
  inspect(handle: RuntimeHandle): Promise<RuntimeInspection>;
  interrupt(handle: RuntimeHandle, input: RuntimeInterruptInput): Promise<void>;
  cancel(handle: RuntimeHandle): Promise<void>;
}

export const AGENT_DURABLE_RUNTIME_ASSETS_PORT = Symbol(
  'AGENT_DURABLE_RUNTIME_ASSETS_PORT',
);

export interface AgentDurableRuntimeAssetsPort {
  resolve(input: {
    agentDefinitionKey: string;
    manifest: unknown;
  }): Promise<ResolvedAgentDurableRuntimeAssets>;
}
