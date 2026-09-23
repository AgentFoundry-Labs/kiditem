import { describe, expect, it } from "vitest";
import { FINAL_CAPABILITY_DEFINITIONS } from "./catalog/final-capability.catalog";
import { AGENT_DEFINITIONS } from "./agent-definition.registry";

describe("AGENT_DEFINITIONS", () => {
  it("publishes exactly the five approved business Agents", () => {
    expect(AGENT_DEFINITIONS).toEqual([
      {
        key: "sourcing",
        label: "Sourcing",
        responsibility:
          "Supplier discovery, source evidence, candidate intake, and sourcing review.",
        assignedDomains: ["sourcing"],
        instructionProfileRef: "agent-config/prompts/agents/sourcing.md",
      },
      {
        key: "merchandising",
        label: "Merchandising",
        responsibility:
          "Canonical product and AI-backed merchandising preparation.",
        assignedDomains: ["products", "ai"],
        instructionProfileRef: "agent-config/prompts/agents/merchandising.md",
      },
      {
        key: "supply",
        label: "Supply",
        responsibility:
          "Procurement planning, purchase-order drafting, and submission.",
        assignedDomains: ["supply"],
        instructionProfileRef: "agent-config/prompts/agents/supply.md",
      },
      {
        key: "channel_operations",
        label: "Channel Operations",
        responsibility:
          "Marketplace listing, order, and channel inventory operations.",
        assignedDomains: ["channels", "orders", "inventory"],
        instructionProfileRef:
          "agent-config/prompts/agents/channel_operations.md",
      },
      {
        key: "advertising",
        label: "Advertising",
        responsibility: "Advertising analysis and campaign operations.",
        assignedDomains: ["advertising"],
        instructionProfileRef: "agent-config/prompts/agents/advertising.md",
      },
    ]);
  });

  it("projects the exact code-owned assigned-domain capability catalog", () => {
    const capabilityKeysByAgent = Object.fromEntries(
      AGENT_DEFINITIONS.map((agent) => [
        agent.key,
        FINAL_CAPABILITY_DEFINITIONS
          .filter((definition) => agent.assignedDomains.includes(definition.ownerDomain))
          .map((definition) => definition.key),
      ]),
    );

    expect(capabilityKeysByAgent).toEqual({
      sourcing: [
        "sourcing.createReviewBatch",
        "sourcing.duplicateCheck",
        "sourcing.ingestCandidate",
        "sourcing.inspectRecommendationRun",
        "sourcing.refreshValidation",
        "sourcing.retrieveWorkspaceEvidence",
        "sourcing.scrapeProductUrl",
      ],
      merchandising: ["products.create_listing_generation_package"],
      supply: [
        "supply.create_purchase_order_draft",
        "supply.submit_purchase_order",
      ],
      channel_operations: [
        "channels.submit_representative_image",
      ],
      advertising: [],
    });
  });
});
