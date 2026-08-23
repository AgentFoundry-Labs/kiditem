import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { AgentWorkRepositoryPort } from '../../port/out/work/agent-work-repository.port';
import { AgentApprovalExpiryService } from './agent-approval-expiry.service';
import { AgentMutationDispatcherService } from './agent-mutation-dispatcher.service';

const POLL_INTERVAL_MS = 2_000;
const POLL_BATCH_SIZE = 100;

/** Worker-only deterministic polling; it has no durable worker identity. */
export class AgentWorkPollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AgentWorkPollerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private readonly workerId = `agent-work-${process.pid}`;

  constructor(
    private readonly dispatcher: AgentMutationDispatcherService,
    private readonly approvals: AgentApprovalExpiryService,
    private readonly work: Pick<AgentWorkRepositoryPort, 'findDueApprovals'>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return this.running;
    const running = this.runTick().catch((error: unknown) => {
      this.logger.warn(`Agent work poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async runTick(): Promise<void> {
    const now = new Date();
    const due = await this.work.findDueApprovals({ now, limit: POLL_BATCH_SIZE });
    await Promise.all(due.map((approval) => this.approvals.expire({ ...approval, expiredAt: now })));
    for (let count = 0; count < POLL_BATCH_SIZE; count += 1) {
      if (!(await this.dispatcher.dispatchOne(this.workerId))) return;
    }
  }
}
