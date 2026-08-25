import { z } from "zod";
import { describe, expect, it } from "vitest";
import { AgentCapabilityRegistry } from "./agent-capability-registry.service";
import type { CapabilityDefinition } from "../../domain/capability/capability-definition";

const definition = (
  overrides: Partial<CapabilityDefinition> = {},
): CapabilityDefinition => ({
  key: "products.inspect",
  ownerDomain: "products",
  description: "Inspect product.",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  effects: ["read"],
  approvalRisk: "none",
  idempotency: "none",
  ownerInputPort: "products.inspect",
  ...overrides,
});
const implementation = (capabilityKey = "products.inspect") => ({
  capabilityKey,
  invoke: async () => ({
    outcome: "completed" as const,
    summary: "Done.",
    resourceRefs: [],
    operationRefs: [],
  }),
});

describe("AgentCapabilityRegistry final contracts", () => {
  it("registers a definition and its owner implementation as one composition unit", () => {
    const registry = new AgentCapabilityRegistry();

    registry.registerComposition({
      definition: definition(),
      implementation: {
        capabilityKey: "products.inspect",
        ownerInputPort: "products.inspect",
        invoke: async () => ({}),
      },
    });

    expect(registry.resolveDefinition("products.inspect")).toMatchObject({
      ownerInputPort: "products.inspect",
    });
    expect(registry.resolveImplementation("products.inspect")).toMatchObject({
      capabilityKey: "products.inspect",
    });
    expect(() => registry.assertFinalCatalog()).not.toThrow();
  });

  it("rejects a composition whose injected owner port does not match its definition", () => {
    const registry = new AgentCapabilityRegistry();

    expect(() =>
      registry.registerComposition({
        definition: definition(),
        implementation: {
          capabilityKey: "products.inspect",
          ownerInputPort: "products.write",
          invoke: async () => ({}),
        },
      }),
    ).toThrow("owner input port");
  });

  it("validates exactly one final definition and implementation per capability", () => {
    const registry = new AgentCapabilityRegistry();
    registry.registerDefinition(definition());
    registry.registerImplementation(implementation());
    expect(registry.resolveDefinition("products.inspect")).toMatchObject({
      ownerDomain: "products",
    });
    expect(registry.resolveImplementation("products.inspect")).toMatchObject({
      capabilityKey: "products.inspect",
    });
    expect(() => registry.assertFinalCatalog()).not.toThrow();
  });

  it("rejects duplicate and missing final entries", () => {
    const registry = new AgentCapabilityRegistry();
    registry.registerDefinition(definition());
    expect(() => registry.registerDefinition(definition())).toThrow(
      "already registered",
    );
    expect(() => registry.assertFinalCatalog()).toThrow("implementation");
    const onlyImplementation = new AgentCapabilityRegistry();
    onlyImplementation.registerImplementation(implementation());
    expect(() => onlyImplementation.assertFinalCatalog()).toThrow("definition");
    onlyImplementation.registerDefinition(
      definition({ key: "products.other" }),
    );
    expect(() =>
      onlyImplementation.registerImplementation(implementation()),
    ).toThrow("already registered");
    expect(() => new AgentCapabilityRegistry().assertFinalCatalog()).toThrow(
      "empty",
    );
  });

  it("uses capability validation without a unique domain owner assumption", () => {
    const registry = new AgentCapabilityRegistry();
    registry.registerDefinition(definition());
    registry.registerDefinition(
      definition({
        key: "products.write",
        effects: ["db_write"],
        idempotency: "required",
      }),
    );
    registry.registerImplementation(implementation());
    registry.registerImplementation(implementation("products.write"));
    expect(() => registry.assertFinalCatalog()).not.toThrow();
  });

  it("rejects invalid owner prefixes, high-risk reads, and non-idempotent mutations", () => {
    for (const invalid of [
      definition({ key: "sourcing.inspect" }),
      definition({ approvalRisk: "high" }),
      definition({
        key: "products.write",
        effects: ["db_write"],
        idempotency: "recommended",
      }),
      definition({ ownerInputPort: "   " }),
    ]) {
      const registry = new AgentCapabilityRegistry();
      registry.registerDefinition(invalid);
      registry.registerImplementation(implementation(invalid.key));
      expect(() => registry.assertFinalCatalog()).toThrow();
    }
  });
});
