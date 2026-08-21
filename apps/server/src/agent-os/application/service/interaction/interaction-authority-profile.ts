import type { ActiveAgentVersionRecord } from '../../port/out/repository/agent-interaction-repository.port';
import { InteractionTokenCodec } from './interaction-token-codec';

export const AUTHORITY_PROFILE_VERSION_ID = 'foundation_read_only_probe:v1';
export const FOUNDATION_CAPABILITY_KEYS = [
  'agent_os.platform_probe',
  'analytics.readOverview',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.inspectRecommendationRun',
] as const;

export function foundationPolicyHash(version: ActiveAgentVersionRecord): string {
  return InteractionTokenCodec.hash({
    authorityProfileVersionId: AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_CAPABILITY_KEYS,
    agentDefinitionKey: version.agentDefinitionKey,
    agentVersion: version.version,
    runtimeType: version.runtimeType,
    modelIdentity: version.modelIdentity,
    policyDocument: version.policyDocument,
    versionCapabilityKeys: version.capabilityKeys,
  });
}

export function foundationAuthorityProfilePolicyDocument(): Record<string, unknown> {
  return { authorityClass: AUTHORITY_PROFILE_VERSION_ID, capabilityKeys: FOUNDATION_CAPABILITY_KEYS };
}

export function foundationAuthorityProfilePolicyHash(): string {
  return InteractionTokenCodec.hash(foundationAuthorityProfilePolicyDocument());
}
