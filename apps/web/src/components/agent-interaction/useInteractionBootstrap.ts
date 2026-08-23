'use client';

import { useQuery } from '@tanstack/react-query';
import { InteractionBootstrapSchema } from '@kiditem/shared/agent-interaction';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

const BOOTSTRAP_PATH = '/api/copilotkit/bootstrap';

export function useInteractionBootstrap() {
  return useQuery({
    queryKey: queryKeys.agentInteraction.bootstrap(),
    queryFn: () => apiClient.getParsed(BOOTSTRAP_PATH, InteractionBootstrapSchema),
  });
}
