import { Injectable, Logger } from '@nestjs/common';
import { AgentRunExecutor } from './agent-run-executor.service';

/** Legacy helper deliberately excluded from every production root. */
@Injectable()
export class AgentRunWorker {
  private readonly logger = new Logger(AgentRunWorker.name);
  private busy = false;
  constructor(private readonly executor: AgentRunExecutor) {}
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await this.executor.executeNextUnscoped(`legacy-${process.pid}`); }
    catch (error) { this.logger.warn(`Legacy AgentRun tick failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { this.busy = false; }
  }
}
