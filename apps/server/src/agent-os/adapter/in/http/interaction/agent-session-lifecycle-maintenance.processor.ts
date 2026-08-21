import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT,
  type AgentSessionLifecycleMaintenancePort,
} from "../../../../application/port/in/interaction/agent-session-lifecycle-maintenance.port";

const MAINTENANCE_INTERVAL_MS = 60_000;

@Injectable()
export class AgentSessionLifecycleMaintenanceProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private interval: ReturnType<typeof setInterval> | undefined;
  private currentRun: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(AGENT_SESSION_LIFECYCLE_MAINTENANCE_PORT)
    private readonly maintenance: AgentSessionLifecycleMaintenancePort,
  ) {}

  onModuleInit(): void {
    this.start();
    this.interval = setInterval(() => this.start(), MAINTENANCE_INTERVAL_MS);
    this.interval.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.interval) clearInterval(this.interval);
    await this.currentRun;
  }

  private start(): void {
    if (this.stopped || this.currentRun) return;
    this.currentRun = this.maintenance.drain()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.currentRun = undefined;
      });
  }
}
