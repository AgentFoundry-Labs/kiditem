import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';
import { Workflow } from 'lucide-react';
import { useOperationRun } from '@/hooks/useOperationRun';
import { ConversationCardFrame } from './ConversationCardFrame';

type OperationReference = CapabilityResultEnvelope['operationRefs'][number];

/**
 * Compact result projection for an allowlisted operation reference. Gateway
 * tool-status events do not create this card; callers must explicitly supply
 * a result envelope reference.
 */
export function OperationReferenceCard({ reference }: { reference: OperationReference }) {
  const operationId = reference.kind === 'operation_run' ? reference.id : null;
  const operation = useOperationRun(operationId);
  if (operation.isError) {
    return (
      <ConversationCardFrame
        ariaLabel="작업 상태"
        icon={<Workflow size={15} />}
        title="작업 상태"
        subtitle="작업 상태를 다시 확인해 주세요."
        tone="warning"
        actions={(
          <button
            type="button"
            onClick={() => { void operation.refetch(); }}
            className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
          >
            다시 시도
          </button>
        )}
      >
        <p role="alert" className="text-sm text-foreground">작업 상태를 불러올 수 없습니다.</p>
      </ConversationCardFrame>
    );
  }
  const presentation = operation.data
    ? operationPresentation(operation.data.status, operation.data.title)
    : operation.isLoading
      ? { title: '작업 상태', subtitle: '작업 상태를 확인하고 있습니다.', tone: 'neutral' as const }
      : { title: '작업 상태', subtitle: '작업 상태를 확인할 수 없습니다.', tone: 'warning' as const };

  return (
    <ConversationCardFrame
      ariaLabel={presentation.title}
      icon={<Workflow size={15} />}
      title={presentation.title}
      subtitle={presentation.subtitle}
      tone={presentation.tone}
    />
  );
}

function operationPresentation(
  status: string,
  title: string,
): { title: string; subtitle: string; tone: 'neutral' | 'success' | 'warning' } {
  const statusPresentation = OPERATION_STATUS_PRESENTATIONS[status]
    ?? { label: '상태를 확인할 수 없음', tone: 'warning' as const };

  return {
    title,
    subtitle: statusPresentation.label,
    tone: statusPresentation.tone,
  };
}

const OPERATION_STATUS_PRESENTATIONS: Record<string, {
  label: string;
  tone: 'neutral' | 'success' | 'warning';
}> = {
  queued: { label: '대기 중', tone: 'neutral' },
  waiting_runtime: { label: '준비 중', tone: 'neutral' },
  waiting_dependency: { label: '준비 중', tone: 'neutral' },
  running: { label: '진행 중', tone: 'success' },
  attention_required: { label: '확인 필요', tone: 'warning' },
  succeeded: { label: '완료', tone: 'success' },
  failed: { label: '실패', tone: 'warning' },
  cancelled: { label: '취소됨', tone: 'warning' },
  skipped: { label: '건너뜀', tone: 'neutral' },
};
