import type { PrismaService } from '../../../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared/panel';
import { workflowPanelMapper } from './workflow.mapper';

/**
 * Query WorkflowRun + template, map to PanelRunItem.
 * ADR-0011: WorkflowRun.status 는 이제 canonical. 정규화 불필요.
 * Returns null if the run is missing for the current organization.
 */
export async function buildWorkflowPanelItem(
  prisma: PrismaService,
  runId: string,
  organizationId: string,
): Promise<{ item: Omit<PanelItem, 'seq' | 'updatedAt'>; organizationId: string } | null> {
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, organizationId },
    include: { template: { select: { name: true } } },
  });
  if (!run) return null;

  const steps = Array.isArray(run.steps)
    ? (run.steps as Array<{ status?: string }>).map((s) => ({
        status: s?.status ?? 'pending',
      }))
    : [];

  const item = workflowPanelMapper.mapToItem(
    {
      id: run.id,
      status: run.status,
      templateName: run.template?.name ?? '',
      steps,
      parentRunId: null,
      triggeredByUserId: run.triggeredByUserId,
      createdAt: run.createdAt,
    },
    organizationId,
  );

  return { item, organizationId };
}
