import { describe, expect, it, vi } from "vitest";
import { AgentAguiStartupRecoveryService } from "../agent-agui-startup-recovery.service";

describe("AgentAguiStartupRecoveryService", () => {
  it("drains bounded inline AG-UI recovery batches before the API accepts traffic", async () => {
    const recovery = {
      failInterruptedInlineAguiRuns: vi
        .fn()
        .mockResolvedValueOnce(2),
    };
    const service = new AgentAguiStartupRecoveryService(recovery as never);

    await service.onApplicationBootstrap();

    expect(recovery.failInterruptedInlineAguiRuns).toHaveBeenNthCalledWith(1, {
      limit: 100,
    });
    expect(recovery.failInterruptedInlineAguiRuns).toHaveBeenCalledTimes(1);
  });

  it.each([200, 201, 256])("continues %i interrupted rows across full batches", async (count) => {
    let remaining = count;
    const recovery = {
      failInterruptedInlineAguiRuns: vi.fn(async ({ limit }: { limit: number }) => {
        const recovered = Math.min(limit, remaining);
        remaining -= recovered;
        return recovered;
      }),
    };
    await new AgentAguiStartupRecoveryService(recovery as never).onApplicationBootstrap();
    expect(remaining).toBe(0);
    expect(recovery.failInterruptedInlineAguiRuns).toHaveBeenCalledTimes(
      Math.floor(count / 100) + 1,
    );
  });

  it("fails closed when a recovery batch cannot make progress", async () => {
    const recovery = {
      failInterruptedInlineAguiRuns: vi.fn().mockResolvedValue(100),
    };
    const service = new AgentAguiStartupRecoveryService(recovery as never);

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      "agent_agui_startup_recovery_backlog_exhausted",
    );
  });
});
