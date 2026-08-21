export const AGENT_SESSION_ARTIFACT_ERASER = Symbol(
  "AGENT_SESSION_ARTIFACT_ERASER",
);

export type AgentSessionArtifactEraseResult =
  | { outcome: "erased" }
  | { outcome: "retry"; errorCode: "storage_delete_failed" }
  | { outcome: "quarantined"; errorCode: "invalid_reference" };

export interface AgentSessionArtifactEraserPort {
  erase(input: {
    organizationId: string;
    storageReference: string;
  }): Promise<AgentSessionArtifactEraseResult>;
}
