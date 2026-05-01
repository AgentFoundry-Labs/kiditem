import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  async capture(context: {
    agentId: string;
    runId: string;
    organizationId: string;
    actions: any[];
  }): Promise<number> {
    const snapshots: any[] = [];

    for (const action of context.actions) {
      if (!action.product_id) continue;

      // Scope master_products lookup to the run's organization so a forged
      // product_id from a different tenant cannot leak fields into a snapshot.
      const product = await this.prisma.masterProduct.findFirst({
        where: { id: action.product_id, organizationId: context.organizationId },
        select: { id: true, adBudgetLimit: true, adTier: true, healthScore: true },
      });
      if (!product) continue;

      const fields = this.getFields(action);
      for (const field of fields) {
        snapshots.push({
          organizationId: context.organizationId,
          runId: context.runId,
          agentId: context.agentId,
          tableName: 'master_products',
          recordId: product.id,
          fieldName: field,
          valueBefore: (product as any)[field],
          valueAfter: action[`new_${field}`] ?? null,
        });
      }
    }

    if (snapshots.length > 0) {
      await this.prisma.agentEvent.createMany({
        data: snapshots.map(s => ({ ...s, eventType: 'action_snapshot' })),
      });
    }

    this.logger.debug(`Snapshot captured: ${snapshots.length} fields for run ${context.runId}`);
    return snapshots.length;
  }

  /**
   * Roll back action snapshots created by a run. Caller must supply the
   * verified organizationId from @CurrentOrganization() so cross-tenant rollbacks are
   * impossible even when an attacker forges a runId.
   */
  async rollback(runId: string, organizationId: string): Promise<{ restored: number }> {
    const snapshots = await this.prisma.agentEvent.findMany({
      where: {
        runId,
        organizationId,
        eventType: 'action_snapshot',
        restoredAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    let restored = 0;
    for (const snap of snapshots) {
      try {
        // Tenant-scoped writes: the snapshot row's organizationId is trusted because
        // we just filtered by `organizationId` above, but we still bind it on each
        // mutation as defense-in-depth so a malformed snap row cannot touch
        // another tenant's master_products / agent_events.
        const updated = await this.prisma.masterProduct.updateMany({
          where: { id: snap.recordId as string, organizationId: snap.organizationId },
          data: { [snap.fieldName as string]: snap.valueBefore },
        });
        if (updated.count === 0) {
          this.logger.warn(`Rollback: master_products row ${snap.recordId} not found for organization ${snap.organizationId}`);
          continue;
        }
        await this.prisma.agentEvent.updateMany({
          where: { id: snap.id, organizationId: snap.organizationId },
          data: { restoredAt: new Date() },
        });
        restored++;
      } catch (err) {
        this.logger.error(`Rollback failed for snapshot ${snap.id}: ${err}`);
      }
    }

    return { restored };
  }

  async getSnapshots(runId: string, organizationId: string) {
    return this.prisma.agentEvent.findMany({
      where: { runId, organizationId, eventType: 'action_snapshot' },
      orderBy: { createdAt: 'asc' },
    });
  }

  private getFields(action: any): string[] {
    switch (action.action) {
      case 'increase_budget':
      case 'decrease_budget':
      case 'minimize_budget':
        return ['adBudgetLimit'];
      case 'stop_ad':
        return ['adTier', 'adBudgetLimit'];
      // change_price snapshot 제거 — B2a 이후 sellPrice 는 ProductOption 에 있음.
      // ProductOption-level snapshot 재구축은 Plan B3
      default:
        return [];
    }
  }
}
