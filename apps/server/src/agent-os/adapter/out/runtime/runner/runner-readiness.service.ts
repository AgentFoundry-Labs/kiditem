import type { AttemptRuntimeType } from '@kiditem/shared/agent-runtime';
import { RunnerLeaseRegistry } from './runner-lease.registry';

/**
 * API-side projection of the Host Runner's strict installation hello.
 * Provider version, login, and non-persistent-setting checks belong to the
 * native Runner; Nest only admits work while that process-memory lease is ready.
 */
export class RunnerReadinessService {
  constructor(private readonly leases: Pick<RunnerLeaseRegistry, 'requireReady'>) {}

  async assertRuntime(runtime: AttemptRuntimeType, model: string, _deployIdentity: string): Promise<void> {
    if ((runtime !== 'codex_cli' && runtime !== 'claude_cli') || !model.trim() || model.length > 256) {
      throw new Error('attempt_runtime_not_supported');
    }
    this.leases.requireReady();
  }
}
