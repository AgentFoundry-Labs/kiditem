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
  private readonly pendingRuns = new Set<string>();
  private readonly pendingResumes = new Map<string, () => void>();
  private readonly waiters: Array<() => void> = [];
  private stopping = false;

  constructor(@Optional() options: AgentLocalProcessRegistryOptions = {}) {
    const config = resolveAgentLocalCliRuntimeConfig();
    this.capacity = options.capacity ?? config.concurrency;
    this.capacityWaitMs = options.capacityWaitMs ?? config.capacityWaitMs;
    this.killGraceMs = options.killGraceMs ?? 2_000;
    this.killExitWaitMs = options.killExitWaitMs ?? 2_000;
    this.killProcessGroup = options.killProcessGroup ?? defaultKillProcessGroup;
  }

  async acquire(runId: string): Promise<() => void> {
    this.assertCanSpawn(runId);
    this.pendingRuns.add(runId);
    try {
      if (this.leases.size >= this.capacity) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const resume = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.pendingResumes.delete(runId);
            const index = this.waiters.indexOf(resume);
            if (index >= 0) this.waiters.splice(index, 1);
            try {
              this.assertCanSpawn(runId);
            } catch (error: unknown) {
              reject(error);
              return;
            }
            this.leases.add(runId);
            resolve();
          };
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            this.pendingResumes.delete(runId);
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
          this.pendingResumes.set(runId, resume);
          this.waiters.push(resume);
        });
      }
      this.leases.add(runId);
    } catch (error: unknown) {
      this.reasons.delete(runId);
      throw error;
    } finally {
      this.pendingRuns.delete(runId);
      this.pendingResumes.delete(runId);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases.delete(runId);
      this.reasons.delete(runId);
      this.waiters.shift()?.();
    };
  }

  attach(runId: string, child: ChildProcess): boolean {
    this.children.set(runId, child);
    child.once('close', () => this.children.delete(runId));
    const reason =
      this.reasons.get(runId) ??
      (this.stopping ? 'process_interrupted' : null);
    if (!reason) return true;
    this.reasons.set(runId, reason);
    queueMicrotask(() => {
      void this.cancel(runId, reason).catch(() => undefined);
    });
    return false;
  }

  detach(runId: string): void {
    this.children.delete(runId);
  }

  reasonFor(runId: string): AgentLocalTerminationReason | null {
    return this.reasons.get(runId) ?? null;
  }

  consumeReason(runId: string): AgentLocalTerminationReason | null {
    const reason = this.reasonFor(runId);
    this.reasons.delete(runId);
    return reason;
  }

  assertCanSpawn(runId: string): void {
    const reason =
      this.reasons.get(runId) ??
      (this.stopping ? 'process_interrupted' : null);
    if (!reason) return;
    throw new AgentOsRuntimeError(
      reason,
      reason === 'user_cancelled'
        ? 'The Agent OS run was cancelled.'
        : 'The local Agent OS process was interrupted.',
    );
  }

  async cancel(
    runId: string,
    reason: AgentLocalTerminationReason,
  ): Promise<boolean> {
    const activeTermination = this.terminations.get(runId);
    if (activeTermination) return activeTermination;
    const child = this.children.get(runId);
    if (
      !child &&
      !this.leases.has(runId) &&
      !this.pendingRuns.has(runId)
    ) {
      return false;
    }
    if (!this.reasons.has(runId)) this.reasons.set(runId, reason);
    this.pendingResumes.get(runId)?.();
    if (!child?.pid) return true;

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
    this.stopping = true;
    for (const runId of [...this.leases, ...this.pendingRuns]) {
      if (!this.reasons.has(runId)) {
        this.reasons.set(runId, 'process_interrupted');
      }
    }
    for (const resume of this.waiters.splice(0)) resume();
    await Promise.all(
      [...this.children.keys()].map((runId) =>
        this.cancel(runId, 'process_interrupted'),
      ),
    );
  }
}
