import { PanelRunItemSchema } from '@kiditem/shared/panel';
import type { PanelRunItem as PanelRunItemType } from '@kiditem/shared/panel';
import type { PanelRunMapper } from './types';

/**
 * Service layer가 WorkflowRun + WorkflowTemplate join 결과를 이 shape으로 넘김.
 * Prisma model 직접 사용 안 함 — steps JSON을 이미 해석한 뒤 전달.
 *
 * service 호출 예 (workflows.service.ts):
 *   const run = await prisma.workflowRun.findFirst({
 *     where: { id, organizationId }, include: { template: { select: { name: true } } }
 *   });
 *   const steps = Array.isArray(run.steps) ? run.steps : [];
 *   const input: WorkflowRunInput = {
 *     id: run.id, status: run.status,
 *     templateName: run.template.name,
 *     steps,
 *     parentRunId: null,  // WorkflowRun schema엔 parentRunId 없음 — PR2+에서 추가 가능
 *     triggeredByUserId: run.triggeredByUserId,
 *     createdAt: run.createdAt,
 *   };
 *   const item = workflowPanelMapper.mapToItem(input, organizationId);
 */
export interface WorkflowRunInput {
  id: string;
  status: string;
  templateName: string;
  // steps는 workflow_runs.steps JSON. 어댑터는 status만 읽지만 실제 객체는 더 많은 필드 가짐
  steps: Array<{ status: string } & Record<string, unknown>>;
  parentRunId?: string | null;
  triggeredByUserId: string | null;
  createdAt: Date;
}

// shared Zod enum에서 유효 상태 집합을 파생 — 드리프트 시 tsc가 감지
const VALID_STATUS = new Set<PanelRunItemType['status']>(PanelRunItemSchema.shape.status.options);

export const workflowPanelMapper: PanelRunMapper<WorkflowRunInput> = {
  source: 'workflow',
  mapToItem(input, _organizationId) {
    const total = input.steps.length;
    const completed = input.steps.filter((s) => s.status === 'succeeded').length;
    const status = VALID_STATUS.has(input.status as PanelRunItemType['status'])
      ? (input.status as PanelRunItemType['status'])
      : 'pending';

    return {
      id: `workflow:${input.id}`,
      kind: 'run',
      source: 'workflow',
      sourceId: input.id,
      status: status as PanelRunItemType['status'],
      title: input.templateName || '워크플로우',
      subtitle: `${completed}/${total} 단계`,
      progress: total > 0 ? completed / total : undefined,
      deepLink: '/workflows',
      parentId: input.parentRunId ? `workflow:${input.parentRunId}` : undefined,
      actorUserId: input.triggeredByUserId,
      visibility: workflowPanelMapper.defaultVisibility(input),
      createdAt: input.createdAt.toISOString(),
    };
  },
  defaultVisibility(input) {
    return input.triggeredByUserId == null ? 'organization' : 'user';
  },
};
