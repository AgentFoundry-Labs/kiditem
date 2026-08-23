import { Injectable } from "@nestjs/common";
import type {
  AgentCapabilityContractHandler,
  AgentCapabilityHandler,
} from "../port/out/capability/agent-capability-handler.port";
import {
  assertCapabilityDefinitions,
  type CapabilityDefinition,
} from "../../domain/capability/capability-definition";

@Injectable()
export class AgentCapabilityRegistry {
  private readonly handlers = new Map<string, AgentCapabilityHandler>();
  private readonly definitions = new Map<string, CapabilityDefinition>();
  private readonly implementations = new Map<
    string,
    AgentCapabilityContractHandler
  >();

  register(handler: AgentCapabilityHandler): void {
    const existing = this.handlers.get(handler.key);
    if (existing && existing !== handler) {
      throw new Error(`Agent capability already registered: ${handler.key}`);
    }
    this.handlers.set(handler.key, handler);
  }

  resolve(key: string): AgentCapabilityHandler | null {
    return this.handlers.get(key) ?? null;
  }

  list(): AgentCapabilityHandler[] {
    return [...this.handlers.values()];
  }

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
