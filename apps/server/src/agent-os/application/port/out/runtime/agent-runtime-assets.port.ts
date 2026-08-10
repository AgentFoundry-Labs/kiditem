export const AGENT_RUNTIME_ASSETS_PORT = Symbol('AGENT_RUNTIME_ASSETS_PORT');

export interface ResolveAgentRuntimeAssetsInput {
  agentType: string;
  promptPath: string;
  skillKeys: string[];
  outputSchemaPath: string;
}

export interface ResolvedAgentRuntimeSkill {
  key: string;
  version: string;
  path: string;
  content: string;
  sha256: string;
}

export interface ResolvedAgentRuntimeAssets {
  promptPath: string;
  prompt: string;
  promptSha256: string;
  skills: ResolvedAgentRuntimeSkill[];
  outputSchemaPath: string;
  outputSchemaVersion: 'sourcing-agent-answer.v1';
  outputSchema: Record<string, unknown>;
  outputSchemaSha256: string;
}

export interface AgentRuntimeAssetsPort {
  resolve(
    input: ResolveAgentRuntimeAssetsInput,
  ): Promise<ResolvedAgentRuntimeAssets>;
}
