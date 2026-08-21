const AGENT_ARTIFACT_REFERENCE = /^agent-artifacts\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;

/**
 * Physical AgentOS artifacts are immutable organization-partitioned object
 * keys. This deliberately accepts no URLs, buckets, or caller-controlled
 * paths, because erasure is authorized from this reference.
 */
export function isOwnedAgentSessionArtifactReference(
  organizationId: string,
  storageReference: string,
): boolean {
  const match = AGENT_ARTIFACT_REFERENCE.exec(storageReference);
  return match?.[1] === organizationId.toLowerCase();
}
