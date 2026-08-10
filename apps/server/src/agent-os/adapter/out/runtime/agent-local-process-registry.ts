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
  killExitWaitMs?: number;
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
  private readonly killExitWaitMs: number;
  private readonly killProcessGroup: (
    pid: number,
    signal: NodeJS.Signals,
  ) => void;
  private readonly children = new Map<string, ChildProcess>();
  private readonly terminations = new Map<string, Promise<boolean>>();
  private readonly reasons = new Map<string, AgentLocalTerminationReason>();
  private readonly leases = new Set<string>();
  private readonly waiters: Array<() => void> = [];

  constructor(@Optional() options: AgentLocalProcessRegistryOptions = {}) {
    const config = resolveAgentLocalCliRuntimeConfig();
    this.capacity = options.capacity ?? config.concurrency;
    this.capacityWaitMs = options.capacityWaitMs ?? config.capacityWaitMs;
    this.killGraceMs = options.killGraceMs ?? 2_000;
    this.killExitWaitMs = options.killExitWaitMs ?? 2_000;
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
    const activeTermination = this.terminations.get(runId);
    if (activeTermination) return activeTermination;
    const child = this.children.get(runId);
    if (!child?.pid) return false;
    if (!this.reasons.has(runId)) this.reasons.set(runId, reason);

    const termination = new Promise<boolean>((resolveTermination) => {
      let settled = false;
      let graceTimer: NodeJS.Timeout | undefined;
      let exitTimer: NodeJS.Timeout | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (graceTimer) clearTimeout(graceTimer);
        if (exitTimer) clearTimeout(exitTimer);
        child.off('close', finish);
        if (this.children.get(runId) === child) this.children.delete(runId);
        resolveTermination(true);
      };
      const signal = (value: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          this.killProcessGroup(child.pid, value);
        } catch {
          // Continue to the bounded SIGKILL/exit deadline even if signalling
          // races with process exit or the host refuses the signal.
        }
      };

      child.once('close', finish);
      signal('SIGTERM');
      if (settled) return;
      graceTimer = setTimeout(() => {
        if (this.children.get(runId) === child) signal('SIGKILL');
        if (settled) return;
        exitTimer = setTimeout(finish, this.killExitWaitMs);
      }, this.killGraceMs);
    });
    const trackedTermination = termination.finally(() => {
      if (this.terminations.get(runId) === trackedTermination) {
        this.terminations.delete(runId);
      }
    });
    this.terminations.set(runId, trackedTermination);
    return trackedTermination;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.children.keys()].map((runId) =>
        this.cancel(runId, 'process_interrupted'),
      ),
    );
  }
}
