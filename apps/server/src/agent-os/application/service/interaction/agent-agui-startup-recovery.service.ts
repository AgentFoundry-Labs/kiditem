import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import {
  AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION,
  type AgentAguiStartupRecoveryTransactionPort,
} from "../../port/out/transaction/interaction/agent-agui-startup-recovery.transaction.port";

const RECOVERY_BATCH_SIZE = 100;
const MAX_RECOVERY_BATCHES = 100;

/** Finalizes interrupted same-process AG-UI work before this API accepts SSE. */
@Injectable()
export class AgentAguiStartupRecoveryService implements OnApplicationBootstrap {
  constructor(
    @Inject(AGENT_AGUI_STARTUP_RECOVERY_TRANSACTION)
    private readonly recovery: AgentAguiStartupRecoveryTransactionPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (let batch = 0; batch < MAX_RECOVERY_BATCHES; batch += 1) {
      const recovered = await this.recovery.failInterruptedInlineAguiRuns({
        limit: RECOVERY_BATCH_SIZE,
      });
      if (recovered === 0 || recovered < RECOVERY_BATCH_SIZE) return;
    }
    // Do not accept requests while an unusually large interrupted backlog is
    // still full after the bounded startup budget.
    throw new Error("agent_agui_startup_recovery_backlog_exhausted");
  }
}
