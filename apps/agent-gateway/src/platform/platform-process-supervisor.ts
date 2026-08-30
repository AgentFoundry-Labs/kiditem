import { join } from 'node:path';
import type { ProcessSupervisor } from './process-supervisor';
import { MacosProcessSupervisor } from './macos/macos-process-supervisor';
import { WindowsJobSupervisor } from './windows/windows-job-supervisor';

/** Selects the sole process-tree owner for the protected Gateway platform. */
export function createPlatformProcessSupervisor(input: Readonly<{
  platform: 'macos' | 'windows';
  runtimeRoot: string;
}>): ProcessSupervisor {
  if (input.platform === 'macos') return new MacosProcessSupervisor();
  return new WindowsJobSupervisor({
    helperPath: join(input.runtimeRoot, 'windows', 'KidItem.AgentGateway.exe'),
  });
}
