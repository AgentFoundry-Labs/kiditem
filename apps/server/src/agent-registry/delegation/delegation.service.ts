/**
 * Delegation Service — Operator→Specialist 위임.
 * Design Ref: §4.2.2 — 계층 검증 후 WakeupService로 위임
 */
import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
    // Tenant scope: parent agent must be owned by the caller's company OR be a
    // global definition (companyId = null). Child is a system-wide catalog
    // entry resolved by `type`, which is unique across the table.
    const parent = await this.prisma.agentDefinition.findFirst({
      where: {
        id: input.parentAgentId,
        OR: [{ companyId: input.companyId }, { companyId: null }],
      },
    });
    const child = await this.prisma.agentDefinition.findFirst({
      where: {
        type: input.childAgentType,
        OR: [{ companyId: input.companyId }, { companyId: null }],
      },
    });
    if (!parent || !child) {
      throw new NotFoundException('agent_not_found');
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
      throw new ForbiddenException(validation.reason);
    }

    const companyId = input.companyId || parent.companyId;
    if (!companyId) {
      throw new BadRequestException('no_company_id');
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
