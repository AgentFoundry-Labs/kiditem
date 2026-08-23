import type { ActiveAgentVersionRecord } from "../../port/out/repository/interaction/agent-interaction.persistence.types";
import { interactionHash } from "./interaction-canonical";

export const AUTHORITY_PROFILE_VERSION_ID = "foundation_read_only_probe:v1";
export const FOUNDATION_CAPABILITY_KEYS = [
  "agent_os.platform_probe",
  "analytics.readOverview",
  "sourcing.retrieveWorkspaceEvidence",
  "sourcing.inspectRecommendationRun",
] as const;

export function foundationPolicyHash(
  version: ActiveAgentVersionRecord,
): string {
  return interactionHash({
    authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: interactionCapabilityKeys(version),
    agentDefinitionKey: version.agentDefinitionKey,
    agentVersion: version.version,
    runtimeType: version.runtimeType,
    modelIdentity: version.modelIdentity,
    policyDocument: version.policyDocument,
    versionCapabilityKeys: version.capabilityKeys,
  });
}

export function interactionCapabilityKeys(
  version: ActiveAgentVersionRecord,
): string[] {
  if (!Array.isArray(version.capabilityKeys)) return [];
  const manifestKeys = new Set(
    version.capabilityKeys.filter(
      (key): key is string => typeof key === "string" && key.length > 0,
    ),
  );
  const policyDocument = isRecord(version.policyDocument)
    ? version.policyDocument
    : {};
  const policies = Array.isArray(policyDocument.toolPolicies)
    ? policyDocument.toolPolicies
    : [];
  const directlyAllowed = new Set(
    policies
      .filter(isRecord)
      .filter(
        (policy) =>
          policy.effect === "allow" &&
          policy.approvalMode === "none" &&
          typeof policy.toolKey === "string",
      )
      .map((policy) => policy.toolKey as string),
  );
  return [...manifestKeys]
    .filter((key) => directlyAllowed.has(key))
    .sort((left, right) => left.localeCompare(right));
}

export function foundationAuthorityProfilePolicyDocument(): Record<
  string,
  unknown
> {
  return {
    authorityClass: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_CAPABILITY_KEYS,
  };
}

export function foundationAuthorityProfilePolicyHash(): string {
  return interactionHash(foundationAuthorityProfilePolicyDocument());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
