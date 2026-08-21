export const AGENT_SESSION_ARTIFACT_ERASER = Symbol(
  "AGENT_SESSION_ARTIFACT_ERASER",
);

export type AgentSessionArtifactEraseResult =
  | { outcome: "erased" }
  | { outcome: "retry"; errorCode: "unsupported_reference" | "storage_delete_failed" };

export interface AgentSessionArtifactEraserPort {
  erase(input: { storageReference: string }): Promise<AgentSessionArtifactEraseResult>;
}
