import type { z } from "zod";
import type { CapabilityDefinition } from "./capability-definition";

/** Server-derived execution coordinates; business input never carries these. */
export interface CapabilityExecutionContext {
  organizationId: string;
  initiatingUserId: string;
  /** Server-derived active-turn execution coordinate; never a bearer or business input. */
  executionId: string;
  /** Present only for mutations and derived by Agent OS from the exact input. */
  ownerIdempotencyKey?: string;
  /** SHA-256 of the exact canonical parsed business input for mutations. */
  ownerInputHash?: string;
}

export interface CapabilityCompositionResourceRef {
  kind: string;
  id: string;
}

/**
 * The erased handoff Agent OS aggregates. Its typed construction stays with
 * the owner definition and incoming port adapter.
 */
export interface CapabilityCompositionImplementation {
  readonly capabilityKey: string;
  readonly ownerInputPort: string;
  invoke(request: {
    context: CapabilityExecutionContext;
    input: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  resourceRef?(output: Record<string, unknown>): CapabilityCompositionResourceRef | null;
  operationRef?(output: Record<string, unknown>): string | null;
}

/** A definition and its owner-port adapter are inseparable at the aggregation seam. */
export interface CapabilityCompositionUnit {
  readonly definition: CapabilityDefinition;
  readonly implementation: CapabilityCompositionImplementation;
}

/** Owner-local capability composition exported to the Agent OS aggregation Module. */
export interface CapabilityCompositionProvider {
  readonly compositions: readonly CapabilityCompositionUnit[];
}

type OwnerPortMethodName<
  D extends CapabilityDefinition,
  OwnerPort extends object,
> = `${D["ownerDomain"]}.${Extract<keyof OwnerPort, string>}`;

interface TypedCapabilityCompositionImplementation<
  D extends CapabilityDefinition,
  OwnerPort extends object,
> {
  readonly capabilityKey: D["key"];
  readonly ownerInputPort: D["ownerInputPort"] & OwnerPortMethodName<D, OwnerPort>;
  invoke(request: {
    context: CapabilityExecutionContext;
    input: z.output<D["inputSchema"]>;
  }): Promise<unknown>;
  resourceRef?(
    output: z.output<D["outputSchema"]>,
  ): CapabilityCompositionResourceRef | null;
  operationRef?(output: z.output<D["outputSchema"]>): string | null;
}

/**
 * Creates the only owner-to-Agent-OS composition seam. The strict schemas and
 * exact injected owner port are checked at construction, before registration.
 */
export function defineCapabilityComposition<
  D extends CapabilityDefinition,
  OwnerPort extends object,
>(
  definition: D,
  ownerPort: OwnerPort,
  implementation: TypedCapabilityCompositionImplementation<D, OwnerPort>,
): CapabilityCompositionUnit {
  void ownerPort;
  if (definition.key !== implementation.capabilityKey) {
    throw new Error(
      `Capability composition key mismatch: ${definition.key} != ${implementation.capabilityKey}`,
    );
  }
  if (definition.ownerInputPort !== implementation.ownerInputPort) {
    throw new Error(
      `Capability composition owner input port mismatch: ${definition.ownerInputPort} != ${implementation.ownerInputPort}`,
    );
  }

  return {
    definition,
    implementation: {
      capabilityKey: implementation.capabilityKey,
      ownerInputPort: implementation.ownerInputPort,
      async invoke({ context, input }) {
        const parsedInput = definition.inputSchema.parse(input);
        const output = await implementation.invoke({ context, input: parsedInput });
        return definition.outputSchema.parse(output);
      },
      resourceRef: implementation.resourceRef
        ? (output) =>
            implementation.resourceRef?.(definition.outputSchema.parse(output)) ??
            null
        : undefined,
      operationRef: implementation.operationRef
        ? (output) => implementation.operationRef?.(definition.outputSchema.parse(output)) ?? null
        : undefined,
    },
  };
}
