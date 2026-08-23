'use client';

import { AgentInteractionSurface } from '@/components/agent-interaction/AgentInteractionSurface';

export default function AgentOsPage() {
  return <main className="flex min-h-[calc(100vh-4rem)] p-4"><AgentInteractionSurface surface="workspace" /></main>;
}
