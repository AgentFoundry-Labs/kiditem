import type { DomainKey } from "../catalog/domain-definition.registry";
import {
  MUTATION_EFFECTS,
  type CapabilityDefinition,
} from "./capability-definition";

export { MUTATION_EFFECTS } from "./capability-definition";

export function isMutation(definition: CapabilityDefinition) {
  return definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
}

export function requiresDomainDelegation(
  assignedDomains: readonly DomainKey[],
  definition: CapabilityDefinition,
) {
  return (
    !assignedDomains.includes(definition.ownerDomain) && isMutation(definition)
  );
}

export function requiresHumanApproval(definition: CapabilityDefinition) {
  return (
    isMutation(definition) &&
    (definition.approvalRisk === "medium" || definition.approvalRisk === "high")
  );
}
