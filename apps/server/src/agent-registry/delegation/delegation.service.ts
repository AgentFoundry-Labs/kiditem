/**
 * Delegation Service — Operator→Specialist 위임.
 * Design Ref: §4.2.2 — 계층 검증 후 WakeupService로 위임
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaService } from '../../prisma/prisma.service';
import { WakeupService } from '../wakeup/wakeup.service';
import { DenialTrackerService } from '../safety/denial-tracker.service';
import { validateDelegation } from './hierarchy.validator';

@Injectable()
export class DelegationService {
  private readonly logger = new Logger(DelegationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wakeupService: WakeupService,
    private readonly denialTracker: DenialTrackerService,
  ) {}

  async delegate(input: {
    parentAgentId: string;
    childAgentType: string;
    parentRunId: string;
    companyId: string;
    payload?: Record<string, unknown>;
    reason?: string;
  }) {
    const parent = await this.prisma.agentDefinition.findUnique({
      where: { id: input.parentAgentId },
    });
    const child = await this.prisma.agentDefinition.findUnique({
      where: { type: input.childAgentType },
    });
    if (!parent || !child) {
      return { ok: false, error: 'agent_not_found' };
    }

    const validation = validateDelegation(parent, child);
    if (!validation.valid) {
      const companyId = input.companyId || parent.companyId;
      if (companyId) {
        await this.denialTracker.recordDenial({
          companyId,
          agentId: input.parentAgentId,
          runId: input.parentRunId,
          category: 'delegation_denied',
          detail: `${parent.name} → ${child.name}: ${validation.reason}`,
        });
      }
      return { ok: false, error: validation.reason };
    }

    const companyId = input.companyId || parent.companyId;
    if (!companyId) {
      return { ok: false, error: 'no_company_id' };
    }

    const wakeup = await this.wakeupService.requestWakeup({
      agentId: child.id,
      companyId,
      source: 'assignment',
      reason: input.reason ?? `Delegated by ${parent.name}`,
      payload: {
        ...input.payload,
        _delegatedBy: input.parentAgentId,
        _parentRunId: input.parentRunId,
      },
      requestedByType: 'agent',
      requestedById: input.parentAgentId,
    });

    this.logger.log(`Delegation: ${parent.name} → ${child.name} (wakeup=${wakeup.id})`);
    return { ok: true, wakeupId: wakeup.id, childAgentId: child.id };
  }

  // Design Ref: §4.7 — Scratch Workspace
  async createScratchWorkspace(workflowId: string): Promise<string> {
    const dir = path.join(os.tmpdir(), 'kiditem-scratch', workflowId);
    await fs.promises.mkdir(dir, { recursive: true });
    return dir;
  }

  async cleanupScratchWorkspace(workflowId: string): Promise<void> {
    const dir = path.join(os.tmpdir(), 'kiditem-scratch', workflowId);
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
