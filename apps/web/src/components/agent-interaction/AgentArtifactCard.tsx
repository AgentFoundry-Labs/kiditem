'use client';

import type { AgentArtifactCard as AgentArtifact } from '@kiditem/shared/agent-interaction';
import { AuthorizedInteractionNavigationButton } from './renderers';

export function AgentArtifactCard({ event }: { event: AgentArtifact }) {
  return (
    <section
      data-testid={`agent-artifact-${event.artifactId}`}
      aria-label="Agent 산출물"
      className="space-y-2 rounded-lg border border-border bg-card p-3 text-card-foreground"
    >
      <div>
        <p className="text-sm font-semibold">{event.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{event.artifactType}</p>
      </div>
      <p className="break-all text-xs text-muted-foreground">SHA-256: {event.sha256}</p>
      <AuthorizedInteractionNavigationButton
        actionId={event.navigationActionId}
        label={`${event.label} 열기`}
      />
    </section>
  );
}
