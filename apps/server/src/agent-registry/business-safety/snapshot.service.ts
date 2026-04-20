import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  async capture(context: {
    agentId: string;
    runId: string;
    companyId: string;
    actions: any[];
  }): Promise<number> {
    const snapshots: any[] = [];

    for (const action of context.actions) {
      if (!action.product_id) continue;

      const product = await this.prisma.masterProduct.findUnique({
        where: { id: action.product_id },
        select: { id: true, adBudgetLimit: true, adTier: true, healthScore: true },
      });
      if (!product) continue;

      const fields = this.getFields(action);
      for (const field of fields) {
        snapshots.push({
          companyId: context.companyId,
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

  async rollback(runId: string): Promise<{ restored: number }> {
    const snapshots = await this.prisma.agentEvent.findMany({
      where: { runId, eventType: 'action_snapshot', restoredAt: null },
      orderBy: { createdAt: 'desc' },
    });

    let restored = 0;
    for (const snap of snapshots) {
      try {
        await this.prisma.masterProduct.update({
          where: { id: snap.recordId as string },
          data: { [snap.fieldName as string]: snap.valueBefore },
        });
        await this.prisma.agentEvent.update({
          where: { id: snap.id },
          data: { restoredAt: new Date() },
        });
        restored++;
      } catch (err) {
        this.logger.error(`Rollback failed for snapshot ${snap.id}: ${err}`);
      }
    }

    return { restored };
  }

  async getSnapshots(runId: string) {
    return this.prisma.agentEvent.findMany({
      where: { runId, eventType: 'action_snapshot' },
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
