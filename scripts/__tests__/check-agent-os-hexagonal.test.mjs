import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAgentOsHexagonalSources,
  collectAgentOsArchitectureSmells,
} from "../check-agent-os-hexagonal.mjs";

test("rejects concrete application imports from incoming adapters", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/bootstrap.controller.ts",
      source:
        "import { BootstrapService } from '../../../../application/service/interaction/bootstrap.service';",
      lines: 12,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/bootstrap.service.ts",
      source: "export class BootstrapService {}",
      lines: 3,
    },
  ]);

  assert.match(
    violations.join("\n"),
    /incoming adapter must depend on port\/in/,
  );
});

test("follows local named, star, side-effect, and alias re-exports to concrete application services", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/named.controller.ts",
      source: "import { Named } from './named-barrel';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/named-barrel.ts",
      source:
        "export { Named } from '@/agent-os/application/service/interaction/named.service';",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/star.controller.ts",
      source: "import { Star } from './star-barrel';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/star-barrel.ts",
      source:
        "export * from '@/agent-os/application/service/interaction/star.service';",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/side-effect.controller.ts",
      source: "import './side-effect-barrel';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/side-effect-barrel.ts",
      source:
        "import '@/agent-os/application/service/interaction/side-effect.service';",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/named.service.ts",
      source: "export class Named {}",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/star.service.ts",
      source: "export class Star {}",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/side-effect.service.ts",
      source: "export class SideEffect {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, [
    "named.controller.ts",
    "star.controller.ts",
    "side-effect.controller.ts",
  ]);
});

test("permits external modules, type-only imports, and local port barrels", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/safe.controller.ts",
      source: [
        "import { Injectable } from '@nestjs/common';",
        "import type { ConcreteService } from '@/agent-os/application/service/interaction/concrete.service';",
        "import { InteractionPort } from './ports';",
      ].join("\n"),
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/ports/index.ts",
      source:
        "export type { InteractionPort } from '@/agent-os/application/port/in/interaction/interaction.port';",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("rejects flat official input ports", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/application/port/in/agent-session-execution.port.ts",
      source: "export interface AgentSessionExecutionPort {}",
      lines: 10,
    },
  ]);

  assert.equal(violations.length, 1);
  assert.match(
    violations.join("\n"),
    /official input port requires capability folder/,
  );
});

test("reports large official modules as non-blocking responsibility review smells", () => {
  const files = [
    {
      path: "apps/server/src/agent-os/application/service/session-execution/huge.ts",
      source: "export class Huge {}",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/application/service/legacy-run/huge.ts",
      source: "export class LegacyHuge {}",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/application/service/__tests__/huge.spec.ts",
      source: "export class TestHuge {}",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/generated/huge.ts",
      source: "export class GeneratedHuge {}",
      lines: 701,
    },
  ];

  assert.deepEqual(analyzeAgentOsHexagonalSources(files), []);
  assert.deepEqual(collectAgentOsArchitectureSmells(files), [
    "apps/server/src/agent-os/application/service/session-execution/huge.ts: architecture smell (non-blocking): review responsibility and cohesion (701 lines)",
  ]);
});

test("normalizes Windows paths while keeping dependency direction strict", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps\\server\\src\\agent-os\\adapter\\in\\http\\legacy-run\\run.controller.ts",
      source:
        "import { RunService } from '../../../../application/service/run.service';",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/__tests__/huge.spec.ts",
      source:
        "import { Service } from '../../../../application/service/service';",
      lines: 701,
    },
    {
      path: "apps/server/src/agent-os/application/port/in/agent-runner.port.ts",
      source: "export interface AgentRunnerPort {}",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/application/service/run.service.ts",
      source: "export class RunService {}",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/application/service/service.ts",
      source: "export class Service {}",
      lines: 10,
    },
  ]);

  assert.equal(violations.length, 2);
  assert.ok(
    violations.every((violation) =>
      /incoming adapter must depend on port\/in/.test(violation),
    ),
  );
});

function expectViolationsFor(violations, paths) {
  assert.ok(violations.length >= paths.length);
  for (const path of paths) {
    assert.ok(violations.some((violation) => violation.includes(path)));
  }
}
