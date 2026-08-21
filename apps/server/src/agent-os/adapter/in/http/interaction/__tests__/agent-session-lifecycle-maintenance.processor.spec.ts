import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSessionLifecycleMaintenanceProcessor } from "../agent-session-lifecycle-maintenance.processor";

afterEach(() => {
  vi.useRealTimers();
});

describe("AgentSessionLifecycleMaintenanceProcessor", () => {
  it("starts an API lifecycle drain, prevents overlap, and waits for shutdown", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const processor = new AgentSessionLifecycleMaintenanceProcessor({ drain } as never);

    processor.onModuleInit();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(drain).toHaveBeenCalledOnce();

    const stopping = processor.onModuleDestroy();
    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(drain).toHaveBeenCalledOnce();
  });
});
