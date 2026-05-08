import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AgentRunExecutor } from './agent-run-executor.service';

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
 * **Default: disabled. Explicit opt-in only.** The default `LocalRuntimeAdapter`
 * fail-fasts every claim with `runtime_not_configured`. If the worker were
 * default-on under that adapter, every existing Agent OS consumer
 * (`/api/image-ai/edit`, rules evaluation, advertising strategy, sourcing
 * scrape) would flip from "request stays pending" to "request fails fast".
 * That changes production semantics, even though Phase 1's stated scope is
 * "production endpoints unchanged". So the worker stays off until the operator
 * explicitly opts in by setting `AGENT_RUNTIME_WORKER_ENABLED=1`. The HTTP
 * `claim-and-run` route remains available for ad-hoc per-organization drains.
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
   * `AGENT_RUNTIME_WORKER_ENABLED=1` once a real runtime adapter is bound,
   * because the default `LocalRuntimeAdapter` fail-fasts every claim. Auto-on
   * would silently turn existing Agent OS consumers' "pending" requests into
   * fast failures — see the class doc above for the reasoning.
   */
  static resolveEnabled(): boolean {
    const raw = process.env.AGENT_RUNTIME_WORKER_ENABLED;
    if (raw === undefined || raw === '') return false;
    return raw === '1' || raw.toLowerCase() === 'true';
  }

  static resolveIntervalMs(): number {
    const raw = process.env.AGENT_RUNTIME_WORKER_INTERVAL_MS;
    if (raw === undefined || raw === '') return 2000;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return 2000;
    return parsed;
  }
}
