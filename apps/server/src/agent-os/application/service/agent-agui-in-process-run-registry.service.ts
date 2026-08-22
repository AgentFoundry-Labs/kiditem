import { Injectable } from "@nestjs/common";
import type { RuntimeInspection } from "../port/out/runtime/agent-durable-runtime.port";
import type { AguiRunCoordinate } from "../port/out/runtime/agent-agui-runtime-cleanup.port";

interface ActiveAguiRun {
  controller: AbortController;
  settled: Promise<void>;
  settle(): void;
}

/**
 * Tracks only local AG-UI work. Persistent revocation remains authoritative
 * across process recreation; this registry makes the current process stop the
 * exact active coordinate before graph contraction.
 */
@Injectable()
export class AgentAguiInProcessRunRegistry {
  private readonly active = new Map<string, ActiveAguiRun>();

  begin(input: AguiRunCoordinate): { signal: AbortSignal; finish(): void } {
    const key = coordinateKey(input);
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

  async stopAndInspect(
    input: AguiRunCoordinate,
    signal: AbortSignal,
  ): Promise<RuntimeInspection> {
    signal.throwIfAborted();
    const run = this.active.get(coordinateKey(input));
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
