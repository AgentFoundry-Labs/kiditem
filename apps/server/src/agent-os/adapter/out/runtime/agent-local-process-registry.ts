import type { ChildProcess } from 'node:child_process';
import { Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { resolveAgentLocalCliRuntimeConfig } from '../../../application/service/agent-runtime.config';

export type AgentLocalTerminationReason =
  | 'user_cancelled'
  | 'process_interrupted'
  | 'timeout'
  | 'output_limit';

export interface AgentLocalProcessRegistryOptions {
  capacity?: number;
  capacityWaitMs?: number;
  killGraceMs?: number;
  killProcessGroup?: (pid: number, signal: NodeJS.Signals) => void;
}

function defaultKillProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code !== 'ESRCH') throw error;
  }
}

@Injectable()
export class AgentLocalProcessRegistry implements OnModuleDestroy {
  private readonly capacity: number;
  private readonly capacityWaitMs: number;
  private readonly killGraceMs: number;
  private readonly killProcessGroup: (
    pid: number,
    signal: NodeJS.Signals,
  ) => void;
  private readonly children = new Map<string, ChildProcess>();
  private readonly reasons = new Map<string, AgentLocalTerminationReason>();
  private readonly leases = new Set<string>();
  private readonly waiters: Array<() => void> = [];

  constructor(@Optional() options: AgentLocalProcessRegistryOptions = {}) {
    const config = resolveAgentLocalCliRuntimeConfig();
    this.capacity = options.capacity ?? config.concurrency;
    this.capacityWaitMs = options.capacityWaitMs ?? config.capacityWaitMs;
    this.killGraceMs = options.killGraceMs ?? 2_000;
    this.killProcessGroup = options.killProcessGroup ?? defaultKillProcessGroup;
  }

  async acquire(runId: string): Promise<() => void> {
    if (this.leases.size >= this.capacity) {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const resume = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.leases.add(runId);
          resolve();
        };
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          const index = this.waiters.indexOf(resume);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(
            new AgentOsRuntimeError(
              'busy',
              'Local Agent OS runtime capacity is exhausted.',
            ),
          );
        }, this.capacityWaitMs);
        timer.unref?.();
        this.waiters.push(resume);
      });
    }
    this.leases.add(runId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases.delete(runId);
      this.waiters.shift()?.();
    };
  }

  attach(runId: string, child: ChildProcess): void {
    this.children.set(runId, child);
    child.once('close', () => this.children.delete(runId));
  }

  detach(runId: string): void {
    this.children.delete(runId);
  }

  reasonFor(runId: string): AgentLocalTerminationReason | null {
    return this.reasons.get(runId) ?? null;
  }

  async cancel(
    runId: string,
    reason: AgentLocalTerminationReason,
  ): Promise<boolean> {
    const child = this.children.get(runId);
    if (!child?.pid) return false;
    if (this.reasons.has(runId)) return true;
    this.reasons.set(runId, reason);
    this.killProcessGroup(child.pid, 'SIGTERM');
    const timer = setTimeout(() => {
      if (this.children.get(runId) === child && child.pid) {
        this.killProcessGroup(child.pid, 'SIGKILL');
      }
    }, this.killGraceMs);
    timer.unref?.();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.children.keys()].map((runId) =>
        this.cancel(runId, 'process_interrupted'),
      ),
    );
  }
}
