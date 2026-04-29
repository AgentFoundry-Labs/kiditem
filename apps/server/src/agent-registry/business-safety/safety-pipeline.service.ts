import { Injectable, Logger } from '@nestjs/common';
import { ActionCapService, BlockedAction } from './action-cap.service';
import { DryRunGateService } from './dry-run-gate.service';
import { SnapshotService } from './snapshot.service';
import { PostVerificationService } from './post-verification.service';

interface SafetyResult {
  allowed: boolean;
  dryRunForced: boolean;
  blockedActions: BlockedAction[];
  snapshotCount: number;
}

@Injectable()
export class SafetyPipelineService {
  private readonly logger = new Logger(SafetyPipelineService.name);

  constructor(
    private readonly dryRunGate: DryRunGateService,
    private readonly actionCap: ActionCapService,
    private readonly snapshot: SnapshotService,
    private readonly postVerification: PostVerificationService,
  ) {}

  async validate(context: {
    agentId: string;
    trustLevel: number;
    actionCap: Record<string, unknown>;
    runId: string;
    companyId: string;
    body: { actions?: any[]; dry_run?: boolean; [key: string]: unknown };
  }): Promise<SafetyResult> {
    const result: SafetyResult = {
      allowed: true,
      dryRunForced: false,
      blockedActions: [],
      snapshotCount: 0,
    };

    // 1. DryRunGate
    const gate = this.dryRunGate.check(context.trustLevel, context.body.dry_run as boolean | undefined);
    if (gate.forced) {
      result.dryRunForced = true;
      context.body.dry_run = true;
      this.logger.warn(`DryRunGate forced for agent ${context.agentId}: ${gate.reason}`);
    }

    if (context.body.dry_run) {
      return result;
    }

    // 2. ActionCap
    if (context.body.actions?.length) {
      const capResult = this.actionCap.validate(context.actionCap, context.body.actions);
      result.blockedActions = capResult.blocked;

      if (capResult.allBlocked) {
        result.allowed = false;
        return result;
      }

      if (capResult.blocked.length > 0) {
        context.body.actions = capResult.allowed;
      }
    }

    // 3. Snapshot
    if (context.body.actions?.length) {
      result.snapshotCount = await this.snapshot.capture({
        agentId: context.agentId,
        runId: context.runId,
        companyId: context.companyId,
        actions: context.body.actions,
      });
    }

    return result;
  }

  async scheduleVerification(context: {
    agentId: string;
    runId: string;
    companyId: string;
    trustLevel: number;
  }): Promise<void> {
    if (context.trustLevel >= 1) {
      await this.postVerification.schedule(context);
    }
  }
}
