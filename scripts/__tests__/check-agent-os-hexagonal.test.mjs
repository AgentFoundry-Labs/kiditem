import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAgentOsHexagonalSources,
  collectAgentOsArchitectureSmells,
  collectServerProductionSources,
} from "../check-agent-os-hexagonal.mjs";

function expectViolation(violations, text) {
  assert.ok(violations.some((violation) => violation.includes(text)), text);
}

test("allows Agent OS to aggregate owner definitions and owner incoming ports", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/application/service/final-capability-catalog-registrar.service.ts",
      source: [
        "import { CHANNELS_CAPABILITIES } from '../../../channels/domain/capability/channels.capabilities';",
        "import { CHANNELS_CAPABILITY_COMPOSITION_PORT } from '../../../channels/application/port/in/capability/channels-capability-composition.port';",
        "export function registerCatalog() { return [CHANNELS_CAPABILITIES, CHANNELS_CAPABILITY_COMPOSITION_PORT]; }",
      ].join("\n"),
      lines: 3,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("rejects Agent OS imports of owner concrete services and adapters", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/application/service/owner-bypass.service.ts",
      source: [
        "import { ChannelsService } from '../../../channels/application/service/channels.service';",
        "import { ChannelRepository } from '../../../channels/adapter/out/repository/channel.repository';",
      ].join("\n"),
      lines: 2,
    },
  ]);

  expectViolation(violations, "must not import owner concrete services");
});

test("rejects Agent OS writes to owner-domain rows", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/application/service/owner-write.service.ts",
      source: "await this.prisma.channelListing.create({ data: {} });",
      lines: 1,
    },
  ]);

  expectViolation(violations, "must not write owner-domain rows");
});

test("keeps Sourcing independent from Agent OS application contracts", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/sourcing/application/service/forbidden-agent-os-import.ts",
      source:
        "import type { CapabilityInvocationPort } from '../../agent-os/application/port/in/capability/capability-invocation.port';",
      lines: 1,
    },
  ]);

  expectViolation(violations, "Sourcing must not import Agent OS application contracts");
});

test("requires Channels mutation composition to end at a Channels incoming port", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/channels/adapter/in/agent/channels-capability-composition.adapter.ts",
      source: [
        "import { defineCapabilityComposition } from '../../../../common/capability-composition';",
        "import { ChannelRegistrationService } from '../../../application/service/channel-registration.service';",
        "export const composition = () => defineCapabilityComposition(new ChannelRegistrationService());",
      ].join("\n"),
      lines: 2,
    },
  ]);

  expectViolation(violations, "Channels mutation must terminate at a Channels incoming port");
});

test("accepts Channels mutation composition that depends only on its incoming port", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/channels/adapter/in/agent/channels-capability-composition.adapter.ts",
      source: [
        "import { CHANNELS_FINAL_CAPABILITY_PORT } from '../../../application/port/in/capability/channels-final-capability.port';",
        "export const composition = CHANNELS_FINAL_CAPABILITY_PORT;",
      ].join("\n"),
      lines: 2,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("does not treat unrelated Channels adapters as the final Agent OS mutation seam", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/channels/adapter/in/agent/channel-registration-capability.adapter.ts",
      source:
        "import { ChannelRegistrationService } from '../../../application/service/channel-registration.service';",
      lines: 1,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("rejects a central mega owner-port interface", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/application/service/agent-capability-registry.service.ts",
      source: [
        "export interface CapabilityOwnerPort {",
        "  sourcing: SourcingCapabilityPort;",
        "  channels: ChannelsCapabilityPort;",
        "}",
      ].join("\n"),
      lines: 4,
    },
  ]);

  expectViolation(violations, "central registry must not define a mega owner-port interface");
});

test("keeps incoming Agent OS adapters on Agent OS input ports", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/invocation.controller.ts",
      source:
        "import { CapabilityInvocationService } from '../../../../application/service/capability-invocation.service';",
      lines: 1,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/valid.controller.ts",
      source:
        "import type { CapabilityInvocationPort } from '../../../../application/port/in/capability/capability-invocation.port';",
      lines: 1,
    },
  ]);

  expectViolation(violations, "incoming adapter must depend on Agent OS port/in");
  assert.equal(violations.filter((violation) => violation.includes("valid.controller")).length, 0);
});

test("allows the private MCP runtime adapter to aggregate the catalog service", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts",
      source:
        "import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';",
      lines: 1,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("keeps architecture-size reporting non-blocking and scoped to Agent OS", () => {
  const files = [
    {
      path: "apps/server/src/agent-os/application/service/large.ts",
      source: "export const large = true;",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/application/service/__tests__/large.spec.ts",
      source: "export const testOnly = true;",
      lines: 701,
    },
  ];

  assert.deepEqual(analyzeAgentOsHexagonalSources(files), []);
  assert.equal(collectAgentOsArchitectureSmells(files).length, 1);
});

test("collects the server graph needed to inspect owner-port boundaries", () => {
  const paths = collectServerProductionSources().map((file) => file.path);
  assert.ok(paths.includes("apps/server/src/agent-os/agent-os.module.ts"));
  assert.ok(paths.includes("apps/server/src/sourcing/sourcing.module.ts"));
});
