import { Injectable } from "@nestjs/common";
import type { AgentCapabilityContractHandler } from "../port/out/capability/agent-capability-handler.port";
import {
  assertCapabilityDefinitions,
  type CapabilityDefinition,
} from "../../domain/capability/capability-definition";

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

  resolveImplementation(key: string): AgentCapabilityContractHandler | null {
    return this.implementations.get(key) ?? null;
  }

  /** Public discovery is broader than an AgentVersion's default invocation scope. */
  listDefinitions(): CapabilityDefinition[] {
    return [...this.definitions.values()];
  }

  assertFinalCatalog(): void {
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
  }
}
