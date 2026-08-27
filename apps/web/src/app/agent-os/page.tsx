'use client';

import { useSearchParams } from 'next/navigation';
import { AgentConversationSurface } from '@/components/agent-interaction/AgentConversationSurface';

const INVOCATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AgentOsPage() {
  const searchParams = useSearchParams();
  const invocationId = searchParams.get('invocationId');
  const validInvocationId = invocationId && INVOCATION_ID_PATTERN.test(invocationId)
    ? invocationId
    : null;

  return <AgentConversationSurface fallbackApprovalInvocationId={validInvocationId} />;
}
