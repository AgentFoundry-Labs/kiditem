import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AgentRunExecutor } from './agent-run-executor.service';
import {
  resolveAgentRuntimeWorkerEnabled,
  resolveAgentRuntimeWorkerIntervalMs,
} from './agent-runtime.config';

/**
 * Internal worker that drains `AgentRunRequest` rows by calling
 * `AgentRunExecutor.executeNextUnscoped` on a fixed interval.
 *
 * Why this exists — without a worker, requests enqueued via `AgentRunnerPort`
 * stay `pending` until something else triggers `claim-and-run`. The HTTP
 * `/api/agent-os/executor/claim-and-run` route is per-organization and was
 * historically expected to be invoked by an external orchestrator that never
 * shipped. Phase 1 ships the worker class so the queue can be drained under
 * normal `npm run start:dev` / `npm run start:prod` boots once a real runtime
 * adapter is bound.
 *
 * **Default: disabled. Explicit opt-in only.** Even with the routing runtime
 * adapter (per-type handlers via `AgentRuntimeHandlerRegistry`), agent types
 * without a registered handler still fail-fast with `runtime_not_configured`.
 * Auto-on would silently flip those (`/api/image-ai/edit`, rules evaluation,
 * advertising strategy, sourcing scrape) from "request stays pending" to
 * "request fails fast" the moment a domain hadn't shipped its handler yet.
 * The operator turns the worker on explicitly via
 * `AGENT_RUNTIME_WORKER_ENABLED=1` once enough handlers are bound for the
 * fast-fail mass to be acceptable. The HTTP `claim-and-run` route stays
 * available for ad-hoc per-organization drains in the meantime.
 *
 * Behavior when enabled:
 *   - One in-flight tick at a time. Re-entrant ticks are skipped (`busy`
 *     guard) so a slow runtime call does not stack ticks.
 *   - Empty-queue ticks (`no_pending_request`) are silent — the queue is
 *     normally idle.
 *   - Runtime exceptions are caught here so a bug in one request does not
 *     stop the loop.
 *
 * Configuration:
 *   - `AGENT_RUNTIME_WORKER_ENABLED=1|true` enables the timer (default:
 *     disabled regardless of `NODE_ENV`).
 *   - `AGENT_RUNTIME_WORKER_INTERVAL_MS` overrides the tick interval (default
 *     `2000`). Setting `0` disables the timer.
 *
 * Multi-instance note: claim is `FOR UPDATE SKIP LOCKED`, so multiple workers
 * across replicas are safe. KidItem currently runs a single backend instance,
 * matching the same operational assumption as `coupang-image-sync` and the
 * panel SSE bus. When prod scales out, this worker scales naturally.
 */
@Injectable()
export class AgentRunWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly workerId: string;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(private readonly executor: AgentRunExecutor) {
    this.enabled = AgentRunWorker.resolveEnabled();
    this.intervalMs = AgentRunWorker.resolveIntervalMs();
    this.workerId = `internal-${process.pid}`;
  }

  onModuleInit(): void {
    if (!this.enabled || this.intervalMs <= 0) {
      this.logger.log(
        `AgentRunWorker disabled (enabled=${this.enabled} intervalMs=${this.intervalMs}). ` +
          `Set AGENT_RUNTIME_WORKER_ENABLED=1 to opt in once a real runtime adapter is bound. ` +
          `Use POST /api/agent-os/executor/claim-and-run for ad-hoc per-organization drains.`,
      );
      return;
    }
    this.logger.log(
      `AgentRunWorker starting (workerId=${this.workerId} intervalMs=${this.intervalMs}).`,
    );
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // Do not block process exit on the timer.
    if (typeof this.intervalHandle.unref === 'function') {
      this.intervalHandle.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Public for tests — invoked directly so spec files do not depend on the
   * timer firing. Production code never calls this; the interval owns it.
   */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.executor.executeNextUnscoped(this.workerId);
    } catch (err) {
      this.logger.warn(
        `AgentRunWorker tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  /**
   * Default: **disabled**. The operator must explicitly opt in via
   * `AGENT_RUNTIME_WORKER_ENABLED=1` once enough per-type runtime handlers
   * are registered (`AgentRuntimeHandlerRegistry`). The routing runtime
   * adapter still fail-fasts unknown agent types with
   * `runtime_not_configured`, so default-on would mass-fail consumers whose
   * handlers haven't shipped yet — see the class doc above for the
   * reasoning.
   */
  static resolveEnabled(): boolean {
    return resolveAgentRuntimeWorkerEnabled();
  }

  static resolveIntervalMs(): number {
    return resolveAgentRuntimeWorkerIntervalMs();
  }
}
