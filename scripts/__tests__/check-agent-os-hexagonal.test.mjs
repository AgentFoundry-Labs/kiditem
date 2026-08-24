import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAgentOsHexagonalSources,
  collectServerProductionSources,
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

test("rejects direct runtime adapter imports from incoming adapters", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/entry.controller.ts",
      source:
        "import { AttemptExecutor } from '../../../../adapter/out/runtime/attempt/attempt-executor.service';",
      lines: 12,
    },
  ]);

  assert.match(
    violations.join("\n"),
    /incoming adapter must not import adapter\/out at runtime/,
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

test("treats named type specifiers as type-only dependencies", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/named-import.controller.ts",
      source:
        "import { type ConcreteService } from '@/agent-os/application/service/interaction/concrete.service';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/named-export.controller.ts",
      source:
        "export { type ConcreteService } from '@/agent-os/application/service/interaction/concrete.service';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("collects the full server graph before limiting reports to AgentOS entries", () => {
  const paths = collectServerProductionSources().map((file) => file.path);
  assert.ok(paths.includes("apps/server/src/agent-os/agent-os.module.ts"));
  assert.ok(paths.includes("apps/server/src/sourcing/sourcing-agent-runtime.module.ts"));
});

test("follows incoming adapters through server-wide relative and alias barrels", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/entry.controller.ts",
      source: "import { Bridge } from '../../../../../shared/agent-os-bridge';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/agent-os-bridge.ts",
      source: "export { Bridge } from '@/shared/agent-os-bridge-inner';",
      lines: 3,
    },
    {
      path: "apps/server/src/shared/agent-os-bridge-inner.ts",
      source:
        "export { Bridge } from '@/agent-os/application/service/interaction/bridge.service';",
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/bridge.service.ts",
      source: "export class Bridge {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, ["entry.controller.ts"]);
});

test("follows external barrels that import and then re-export AgentOS services", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/entry.controller.ts",
      source: "import { Bridge } from '@/shared/agent-os-bridge';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/agent-os-bridge.ts",
      source: [
        "import { Bridge } from '@/shared/agent-os-bridge-inner';",
        "export { Bridge };",
      ].join("\n"),
      lines: 3,
    },
    {
      path: "apps/server/src/shared/agent-os-bridge-inner.ts",
      source: [
        "import { Bridge } from '@/agent-os/application/service/interaction/bridge.service';",
        "export { Bridge };",
      ].join("\n"),
      lines: 3,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/bridge.service.ts",
      source: "export class Bridge {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, ["entry.controller.ts"]);
});

test("treats a default import as a runtime dependency even with type-only named specifiers", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/default-import.controller.ts",
      source:
        "import ConcreteService, { type Marker } from '@/agent-os/application/service/interaction/concrete.service';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/application/service/interaction/concrete.service.ts",
      source: "export default class ConcreteService {}\nexport interface Marker {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, ["default-import.controller.ts"]);
});

test("rejects a fake local Module decorator barrel that forwards a concrete service", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/entry.controller.ts",
      source: "import { ConcreteService } from '@/shared/fake-module-barrel';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/fake-module-barrel.ts",
      source: [
        "const Module = (): ClassDecorator => () => undefined;",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Module()",
        "export class FakeModule {}",
        "export { ConcreteService };",
      ].join("\n"),
      lines: 5,
    },
    {
      path: "apps/server/src/agent-os/application/service/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, ["entry.controller.ts"]);
});

test("rejects a concrete service re-export from a genuine Nest module", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/entry.controller.ts",
      source: "import { ConcreteService } from '@/shared/genuine-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/genuine-module.ts",
      source: [
        "import { Module } from '@nestjs/common';",
        "export { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Module({})",
        "export class FooModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/agent-os/application/service/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, ["entry.controller.ts"]);
});

test("allows only provenance-verified decorated Nest module bindings", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/cli/operator.cli.ts",
      source: "import { FooModule } from '@/shared/direct-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/operator.mcp.ts",
      source: "import { AliasedModule } from '@/shared/aliased-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/operator.controller.ts",
      source: "import { NamespacedModule } from '@/shared/namespaced-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/direct-module.ts",
      source: [
        "import { Module } from '@nestjs/common';",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Module({ providers: [ConcreteService] })",
        "export class FooModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/shared/aliased-module.ts",
      source: [
        "import { Module as NestModule } from '@nestjs/common';",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@NestModule({ providers: [ConcreteService] })",
        "export class AliasedModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/shared/namespaced-module.ts",
      source: [
        "import * as Nest from '@nestjs/common';",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Nest.Module({ providers: [ConcreteService] })",
        "export class NamespacedModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/agent-os/application/service/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("traverses default, namespace, side-effect, and non-module bindings from a Nest module", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/cli/default.cli.ts",
      source: "import RootModule from '@/shared/root-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/mcp/namespace.mcp.ts",
      source: "import * as Root from '@/shared/root-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/side-effect.controller.ts",
      source: "import '@/shared/root-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-os/adapter/in/http/interaction/other.controller.ts",
      source: "import { Other } from '@/shared/root-module';",
      lines: 10,
    },
    {
      path: "apps/server/src/shared/root-module.ts",
      source: [
        "import { Module } from '@nestjs/common';",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Module({ providers: [ConcreteService] })",
        "export class RootModule {}",
        "export default RootModule;",
        "export const Other = true;",
      ].join("\n"),
      lines: 6,
    },
    {
      path: "apps/server/src/agent-os/application/service/concrete.service.ts",
      source: "export class ConcreteService {}",
      lines: 3,
    },
  ]);

  expectViolationsFor(violations, [
    "default.cli.ts",
    "namespace.mcp.ts",
    "side-effect.controller.ts",
    "other.controller.ts",
  ]);
});

test("does not mistake a Nest composition root for an adapter-to-service bypass", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/in/cli/operator.cli.ts",
      source: "import { AgentApplicationModule } from '@/agent-application.module';",
      lines: 10,
    },
    {
      path: "apps/server/src/agent-application.module.ts",
      source: [
        "import { Module } from '@nestjs/common';",
        "import { AgentLegacyModule } from '@/agent-legacy.module';",
        "@Module({ imports: [AgentLegacyModule] })",
        "export class AgentApplicationModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/agent-legacy.module.ts",
      source: [
        "import { Module } from '@nestjs/common';",
        "import { ConcreteService } from '@/agent-os/application/service/concrete.service';",
        "@Module({ providers: [ConcreteService] })",
        "export class AgentLegacyModule {}",
      ].join("\n"),
      lines: 4,
    },
    {
      path: "apps/server/src/agent-os/application/service/concrete.service.ts",
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

test("rejects child process ownership in Agent OS while leaving the future Runner and unrelated domains alone", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/agent-os/adapter/out/runtime/attempt/local-process.ts",
      source: "import { spawn } from 'node:child_process'; spawn('codex');",
      lines: 2,
    },
    {
      path: "apps/server/src/agent-os/adapter/out/runtime/attempt/legacy-process.ts",
      source: "import { execFile } from 'child_process'; execFile('claude');",
      lines: 2,
    },
    {
      path: "apps/agent-runner/src/runner.ts",
      source: "import { spawn } from 'node:child_process'; spawn('codex');",
      lines: 2,
    },
    {
      path: "apps/server/src/orders/coupang-directship/coupang-directship.service.ts",
      source: "import { spawn } from 'node:child_process'; spawn('lp');",
      lines: 2,
    },
  ]);

  assert.deepEqual(violations, [
    "apps/server/src/agent-os/adapter/out/runtime/attempt/local-process.ts: Agent OS/API runtime must not import child_process",
    "apps/server/src/agent-os/adapter/out/runtime/attempt/legacy-process.ts: Agent OS/API runtime must not import child_process",
  ]);
});

test("rejects unallowlisted server provider process bindings while preserving explicit exemptions", () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: "apps/server/src/ai/adapter/out/provider/new-provider-runner.ts",
      source: "import { spawn } from 'node:child_process'; spawn('codex');",
      lines: 2,
    },
    {
      path: "apps/server/src/orders/coupang-directship/coupang-directship.service.ts",
      source: "import { execFile } from 'node:child_process'; execFile('python3');",
      lines: 2,
    },
    {
      path: "apps/agent-runner/src/runner.ts",
      source: "import { spawn } from 'node:child_process'; spawn('codex');",
      lines: 2,
    },
    {
      path: "apps/server/src/agent-os/application/service/matcher.ts",
      source: "const match = /kiditem/.exec(input);",
      lines: 2,
    },
  ]);

  assert.deepEqual(violations, [
    "apps/server/src/ai/adapter/out/provider/new-provider-runner.ts: Agent OS/API runtime must not import child_process",
  ]);
});

function expectViolationsFor(violations, paths) {
  assert.ok(violations.length >= paths.length);
  for (const path of paths) {
    assert.ok(violations.some((violation) => violation.includes(path)));
  }
}
