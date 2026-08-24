import { describe, expect, it } from 'vitest';
import { RunnerCommandQueue } from './runner-command.queue';
import { RunnerLeaseRegistry } from './runner-lease.registry';
import { RunnerReadinessService } from './runner-readiness.service';

const runnerInstanceId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('RunnerReadinessService', () => {
  it('projects only a ready strict Runner hello and never probes a provider from the API', async () => {
    const leases = new RunnerLeaseRegistry({
      commands: new RunnerCommandQueue(),
      interruptAttempt: async () => undefined,
      leaseId: () => '118f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const readiness = new RunnerReadinessService(leases);

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', 'deploy')).rejects.toThrow('runner_not_ready');
    const lease = leases.hello(hello());
    leases.markReady({ runnerInstanceId, leaseId: lease.leaseId });

    await expect(readiness.assertRuntime('codex_cli', 'gpt-5', 'deploy')).resolves.toBeUndefined();
    leases.dispose();
  });
});

function hello() {
  return {
    kind: 'hello' as const,
    runnerInstanceId,
    platform: 'macos' as const,
    nodeMajor: 22 as const,
    controlRevision: 'kiditem-runner-control-v1' as const,
    mcpProtocolRevision: '2026-07-28' as const,
    cliContractIdentity: 'office-cli-contract-v2' as const,
    runtimes: {
      codex_cli: { version: '0.149.1' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
      claude_cli: { version: '2.1.241' as const, loginVerified: true as const, nonPersistentSettingsVerified: true as const },
    },
  };
}
