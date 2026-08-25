import { Injectable } from "@nestjs/common";
import { MUTATION_EFFECTS } from "../../../common/capability-definition";
import {
  assertCapabilityDefinitions,
  type CapabilityDefinition,
} from "../../domain/capability/capability-definition";
import type { AgentResultEnvelope } from "@kiditem/shared/agent-interaction";
import type { CapabilityCompositionUnit } from "../../../common/capability-composition";
import type { AgentCapabilityContractHandler } from "../port/out/capability/agent-capability-handler.port";

@Injectable()
export class AgentCapabilityRegistry {
  private readonly definitions = new Map<string, CapabilityDefinition>();
  private readonly implementations = new Map<
    string,
    AgentCapabilityContractHandler
  >();

  registerDefinition(definition: CapabilityDefinition): void {
    if (this.definitions.has(definition.key)) {
      throw new Error(
        `Capability definition already registered: ${definition.key}`,
      );
    }
    this.definitions.set(definition.key, definition);
  }

  resolveDefinition(key: string): CapabilityDefinition | null {
    return this.definitions.get(key) ?? null;
  }

  registerImplementation(implementation: AgentCapabilityContractHandler): void {
    if (this.implementations.has(implementation.capabilityKey)) {
      throw new Error(
        `Capability implementation already registered: ${implementation.capabilityKey}`,
      );
    }
    this.implementations.set(implementation.capabilityKey, implementation);
  }

  /**
   * Agent OS only receives completed owner-local definition/port pairs. This
   * prevents a definition from being independently wired to a string-selected
   * implementation after either owner has changed.
   */
  registerComposition(composition: CapabilityCompositionUnit): void {
    const { definition, implementation } = composition;
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
    this.registerDefinition(definition);
    this.registerImplementation({
      capabilityKey: definition.key,
      invoke: async ({ context, input }) => {
        const parsedInput = definition.inputSchema.parse(input);
        if (isMutation(definition) && !context.ownerIdempotencyKey?.trim()) {
          throw new Error(`Owner idempotency key required: ${definition.key}`);
        }
        const output = await implementation.invoke({ context, input: parsedInput });
        return envelope(
          definition.key,
          output,
          implementation.resourceRef?.(output) ?? null,
          implementation.operationRef?.(output) ?? null,
        );
      },
    });
  }

  resolveImplementation(key: string): AgentCapabilityContractHandler | null {
    return this.implementations.get(key) ?? null;
  }

  /** Public discovery is broader than an AgentVersion's default invocation scope. */
  listDefinitions(): CapabilityDefinition[] {
    return [...this.definitions.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    );
  }

  assertFinalCatalog(expectedDefinitions?: readonly CapabilityDefinition[]): void {
    if (this.definitions.size === 0 && this.implementations.size === 0) {
      throw new Error("Final capability catalog cannot be empty");
    }
    assertCapabilityDefinitions([...this.definitions.values()]);
    for (const key of this.definitions.keys()) {
      if (!this.implementations.has(key)) {
        throw new Error(`Capability implementation missing: ${key}`);
      }
    }
    for (const key of this.implementations.keys()) {
      if (!this.definitions.has(key)) {
        throw new Error(`Capability definition missing: ${key}`);
      }
    }
    if (expectedDefinitions) {
      assertCapabilityDefinitions(expectedDefinitions);
      const expectedByKey = new Map(
        expectedDefinitions.map((definition) => [definition.key, definition]),
      );
      if (expectedByKey.size !== this.definitions.size) {
        throw new Error("Final capability catalog does not match the expected definitions");
      }
      for (const [key, expectedDefinition] of expectedByKey) {
        const registeredDefinition = this.definitions.get(key);
        if (!registeredDefinition) {
          throw new Error(`Final capability catalog missing expected definition: ${key}`);
        }
        if (registeredDefinition !== expectedDefinition) {
          throw new Error(`Final capability catalog definition differs: ${key}`);
        }
      }
    }
  }
}

function isMutation(definition: CapabilityDefinition): boolean {
  return definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
}

function envelope(
  key: string,
  output: Record<string, unknown>,
  resource: { kind: string; id: string } | null,
  operation: string | null,
): AgentResultEnvelope {
  return {
    outcome: "completed",
    summary: `${key} completed.`,
    resourceRefs: resource ? [{ ...resource, version: null }] : [],
    operationRefs: operation ? [{ kind: "operation_run", id: operation }] : [],
    output,
  };
}
