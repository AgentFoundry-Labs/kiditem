import { Injectable } from "@nestjs/common";
import type { RuntimeInspection } from "../port/out/runtime/agent-durable-runtime.port";
import type { AguiRunCoordinate } from "../port/out/runtime/agent-agui-runtime-cleanup.port";

interface ActiveAguiRun {
  controller: AbortController;
  settled: Promise<void>;
  settle(): void;
}

/** A claimed user stop is an expected terminal outcome, never a runtime fault. */
export class AgentAguiUserCancelled extends Error {
  constructor() {
    super("AGUI_USER_CANCELLED");
    this.name = "AgentAguiUserCancelled";
  }
}

export function isAgentAguiUserCancelled(error: unknown): error is AgentAguiUserCancelled {
  return error instanceof AgentAguiUserCancelled;
}

/**
 * Tracks only local AG-UI work. Persistent revocation remains authoritative
 * across process recreation; this registry makes the current process stop the
 * exact active coordinate before graph contraction.
 */
@Injectable()
export class AgentAguiInProcessRunRegistry {
  private readonly active = new Map<string, ActiveAguiRun>();
  private readonly stopClaims = new Set<string>();
  /**
   * A deletion seal lasts for this registry's process lifetime. A paused
   * request cannot outlive a process restart, so process teardown is the only
   * safe cleanup boundary; time-based eviction could reopen a revoked grant.
   */
  private readonly sealed = new Set<string>();

  begin(input: AguiRunCoordinate): { signal: AbortSignal; finish(): void } {
    const key = coordinateKey(input);
    if (this.sealed.has(key))
      throw new AgentAguiUserCancelled();
    if (this.active.has(key))
      throw new Error("AGUI_RUNTIME_COORDINATE_ALREADY_ACTIVE");
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const run: ActiveAguiRun = {
      controller: new AbortController(),
      settled,
      settle,
    };
    this.active.set(key, run);
    return {
      signal: run.controller.signal,
      finish: () => {
        if (this.active.get(key) !== run) return;
        this.active.delete(key);
        run.settle();
      },
    };
  }

  seal(input: AguiRunCoordinate): void {
    this.sealed.add(coordinateKey(input));
  }

  claimStop(input: AguiRunCoordinate): void {
    this.stopClaims.add(coordinateKey(input));
  }

  /**
   * Atomically claims a current-process stop exactly once.  A just-created
   * stream may not have reached `begin()` yet; sealing still prevents that
   * stream from entering after its durable terminal record is committed.
   */
  async cancel(input: AguiRunCoordinate): Promise<boolean> {
    const key = coordinateKey(input);
    if (this.sealed.has(key)) return false;
    const run = this.active.get(key);
    if (!run && !this.stopClaims.has(key)) return false;
    this.sealed.add(key);
    this.stopClaims.delete(key);
    // The service has already DB-authorized this exact coordinate. Claiming
    // before begin closes the start/stop race; a future begin throws the typed
    // cancellation and cannot start provider work.
    if (!run) return true;
    run.controller.abort(new AgentAguiUserCancelled());
    await run.settled;
    return true;
  }

  async stopAndInspect(
    input: AguiRunCoordinate,
    signal: AbortSignal,
  ): Promise<RuntimeInspection> {
    const key = coordinateKey(input);
    // This is called only after persisted exact-coordinate invalidation. Seal
    // before inspecting local state so a request paused before `begin()` cannot
    // enter after deletion observes no active local entry.
    this.seal(input);
    signal.throwIfAborted();
    const run = this.active.get(key);
    if (!run) return { status: "cancelled" };
    run.controller.abort(new Error("agent_session_deleting"));
    await settleOrAbort(run.settled, signal);
    return { status: "cancelled" };
  }
}

function settleOrAbort(
  settled: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    void settled.then(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function coordinateKey(input: AguiRunCoordinate): string {
  return [
    input.organizationId,
    input.sessionId,
    input.executionId,
    input.attemptId,
    input.startIntentId,
  ].join("/");
}
