import type { PrismaService } from '../../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';

/**
 * Normalize workflow-runner vocabulary to Panel enum.
 * workflow-runner writes 'completed'; Panel enum uses 'succeeded'.
 * Single source of truth — avoids drift across panel.service, workflows.service, workflow-runner.service.
 */
export const normalizeWorkflowStatus = (s: string | null | undefined): string =>
  s === 'completed' ? 'succeeded' : (s ?? 'pending');

/**
 * Query WorkflowRun + template, normalize vocabulary, map to PanelRunItem.
 * Returns null if run missing or lacks companyId (legacy rows pre-Task 6).
 */
export async function buildWorkflowPanelItem(
  prisma: PrismaService,
  runId: string,
): Promise<{ item: Omit<PanelItem, 'seq' | 'updatedAt'>; companyId: string } | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { template: { select: { name: true } } },
  });
  if (!run || !run.companyId) return null;

  const steps = Array.isArray(run.steps)
    ? (run.steps as Array<{ status?: string }>).map((s) => ({
        status: normalizeWorkflowStatus(s?.status),
      }))
    : [];

  const item = workflowPanelAdapter.mapToItem(
    {
      id: run.id,
      status: normalizeWorkflowStatus(run.status),
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
