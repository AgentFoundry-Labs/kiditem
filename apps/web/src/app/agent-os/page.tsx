'use client';

import { useSearchParams } from 'next/navigation';
import { CapabilityInvocationCard } from '@/components/agent-interaction/CapabilityInvocationCard';
import { AgentConversationSurface } from '@/components/agent-interaction/AgentConversationSurface';
import { useAuth } from '@/hooks/useAuth';

const INVOCATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AgentOsPage() {
  const searchParams = useSearchParams();
  const { status, user } = useAuth();
  const invocationId = searchParams.get('invocationId');
  const validInvocationId = invocationId && INVOCATION_ID_PATTERN.test(invocationId)
    ? invocationId
    : null;
  const identity = status === 'ready' && user?.organizationId
    ? { userId: user.id, organizationId: user.organizationId }
    : null;

  return (
    <AgentConversationSurface
      approvalContent={validInvocationId && identity
        ? <CapabilityInvocationCard invocationId={validInvocationId} identity={identity} />
        : null}
    />
  );
}
