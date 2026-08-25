import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";

export interface AgentAttemptCapacityLease {
  release(): void;
}

/** Process-local CLI capacity. Persistence remains the source of durable work. */
export class AgentAttemptCapacityService {
  private readonly maximum: number;
  private readonly accepted = new Map<string, AgentAttemptCapacityLease>();
  private reserved = 0;

  constructor(maximum = Number(process.env.AGENT_CLI_MAX_CONCURRENCY ?? 4)) {
    this.maximum = Number.isInteger(maximum) && maximum > 0 ? maximum : 4;
  }

  tryReserve(): AgentAttemptCapacityLease {
    if (this.reserved >= this.maximum) {
      throw new AgentOsRuntimeError(
        "agent_capacity_exhausted",
        "agent_capacity_exhausted",
      );
    }
    this.reserved += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.reserved -= 1;
      },
    };
  }

  acceptAttempt(attemptId: string, lease: AgentAttemptCapacityLease): void {
    if (this.accepted.has(attemptId)) {
      lease.release();
      throw new AgentOsRuntimeError(
        "attempt_capacity_binding_conflict",
        "attempt_capacity_binding_conflict",
      );
    }
    this.accepted.set(attemptId, lease);
  }

  releaseAttempt(attemptId: string): void {
    const lease = this.accepted.get(attemptId);
    if (!lease) return;
    this.accepted.delete(attemptId);
    lease.release();
  }
}
