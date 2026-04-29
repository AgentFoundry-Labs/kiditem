import type { PrismaService } from '../../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared/panel';
import { workflowPanelAdapter } from './workflow.adapter';

/**
 * Query WorkflowRun + template, map to PanelRunItem.
 * ADR-0011: WorkflowRun.status 는 이제 canonical. 정규화 불필요.
 * Returns null if run missing or lacks companyId (legacy rows).
 */
export async function buildWorkflowPanelItem(
  prisma: PrismaService,
  runId: string,
  companyId?: string,
): Promise<{ item: Omit<PanelItem, 'seq' | 'updatedAt'>; companyId: string } | null> {
  const run = await prisma.workflowRun.findFirst({
    where: companyId ? { id: runId, companyId } : { id: runId },
    include: { template: { select: { name: true } } },
  });
  if (!run || !run.companyId) return null;

  const steps = Array.isArray(run.steps)
    ? (run.steps as Array<{ status?: string }>).map((s) => ({
        status: s?.status ?? 'pending',
      }))
    : [];

  const item = workflowPanelAdapter.mapToItem(
    {
      id: run.id,
      status: run.status,
      templateName: run.template?.name ?? '',
      steps,
      parentRunId: null,
      triggeredByUserId: run.triggeredByUserId,
      createdAt: run.createdAt,
    },
    run.companyId,
  );

  return { item, companyId: run.companyId };
}
