export function deriveAgentSessionArtifactKey(input: {
  organizationId: string;
  sessionId: string;
  artifactId: string;
}): string {
  return `agent-artifacts/${input.organizationId}/${input.sessionId}/${input.artifactId}`;
}
