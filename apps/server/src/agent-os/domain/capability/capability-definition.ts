import type { z } from "zod";
import type { DomainKey } from "../catalog/domain-definition.registry";

export type CapabilityEffect =
  | "read"
  | "browser"
  | "external_io"
  | "llm"
  | "db_write"
  | "external_write"
  | "job_enqueue";
export type CapabilityApprovalRisk = "none" | "low" | "medium" | "high";
export type CapabilityIdempotency = "none" | "recommended" | "required";

export const MUTATION_EFFECTS = new Set<CapabilityEffect>([
  "db_write",
  "external_write",
  "job_enqueue",
]);

export interface CapabilityDefinition {
  key: string;
  ownerDomain: DomainKey;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<Record<string, unknown>>;
  effects: readonly CapabilityEffect[];
  approvalRisk: CapabilityApprovalRisk;
  idempotency: CapabilityIdempotency;
  ownerInputPort: string;
}

export function assertCapabilityDefinitions(
  definitions: readonly CapabilityDefinition[],
): void {
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (!definition.key.startsWith(`${definition.ownerDomain}.`)) {
      throw new Error(
        `Capability key must be owner-prefixed: ${definition.key}`,
      );
    }
    if (
      !definition.ownerInputPort.trim().startsWith(`${definition.ownerDomain}.`)
    ) {
      throw new Error(
        `Capability owner input port must be owner-qualified: ${definition.key}`,
      );
    }
    if (keys.has(definition.key)) {
      throw new Error(`Duplicate capability definition: ${definition.key}`);
    }
    keys.add(definition.key);
    const mutation = definition.effects.some((effect) =>
      MUTATION_EFFECTS.has(effect),
    );
    if (
      !mutation &&
      (definition.approvalRisk === "medium" ||
        definition.approvalRisk === "high")
    ) {
      throw new Error(
        `Queries cannot require medium/high approval: ${definition.key}`,
      );
    }
    if (mutation && definition.idempotency !== "required") {
      throw new Error(`Mutations require idempotency: ${definition.key}`);
    }
  }
}
