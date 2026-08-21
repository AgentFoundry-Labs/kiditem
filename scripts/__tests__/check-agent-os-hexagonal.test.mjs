import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAgentOsHexagonalSources } from '../check-agent-os-hexagonal.mjs';

test('rejects concrete application imports from incoming adapters', () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: 'apps/server/src/agent-os/adapter/in/http/interaction/bootstrap.controller.ts',
      source:
        "import { BootstrapService } from '../../../application/service/interaction/bootstrap.service';",
      lines: 12,
    },
  ]);

  assert.match(violations.join('\n'), /incoming adapter must depend on port\/in/);
});

test('rejects flat official input ports and oversized official modules', () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: 'apps/server/src/agent-os/application/port/in/agent-session-execution.port.ts',
      source: 'export interface AgentSessionExecutionPort {}',
      lines: 10,
    },
    {
      path: 'apps/server/src/agent-os/application/service/session-execution/huge.ts',
      source: 'export class Huge {}',
      lines: 701,
    },
  ]);

  assert.equal(violations.length, 2);
  assert.match(violations.join('\n'), /official input port requires capability folder/);
  assert.match(violations.join('\n'), /official AgentOS module exceeds 700 lines/);
});

test('normalizes Windows paths and keeps size exclusions narrow', () => {
  const violations = analyzeAgentOsHexagonalSources([
    {
      path: 'apps\\server\\src\\agent-os\\adapter\\in\\http\\legacy-run\\run.controller.ts',
      source: "import { RunService } from '../../../application/service/run.service';",
      lines: 701,
    },
    {
      path: 'apps/server/src/agent-os/adapter/in/http/__tests__/huge.spec.ts',
      source: "import { Service } from '../../../application/service/service';",
      lines: 701,
    },
    {
      path: 'apps/server/src/agent-os/application/port/in/agent-runner.port.ts',
      source: 'export interface AgentRunnerPort {}',
      lines: 10,
    },
  ]);

  assert.equal(violations.length, 2);
  assert.ok(violations.every((violation) => /incoming adapter must depend on port\/in/.test(violation)));
});
