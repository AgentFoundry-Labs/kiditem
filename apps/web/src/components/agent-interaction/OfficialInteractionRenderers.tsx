'use client';

import { z } from 'zod';
import type { ReactElement } from 'react';
import {
  useInterrupt,
  type ReactActivityMessageRenderer,
} from '@copilotkit/react-core/v2';
import {
  AgentApprovalCardSchema,
  AgentArtifactCardSchema,
  AgentDelegationEventSchema,
  AgentProgressEventSchema,
} from '@kiditem/shared/agent-interaction';
import { AgentApprovalCard } from './AgentApprovalCard';
import { AgentArtifactCard } from './AgentArtifactCard';
import { AgentDelegationCard } from './AgentDelegationCard';
import { AgentProgressCard } from './AgentProgressCard';

const approvalInterruptPayloadSchema = z
  .object({
    kind: z.literal('kiditem.agent_approval_decision.v1'),
    approvalId: z.string().uuid(),
    session: z.string().min(1).max(512),
    decision: z.enum(['approved', 'rejected']),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

const approvalInterruptMetadataSchema = z
  .object({ approval: AgentApprovalCardSchema })
  .strict();

export const officialInteractionActivityRenderers: ReactActivityMessageRenderer<unknown>[] = [
  activityRenderer('kiditem.ui.agent_progress.v1', AgentProgressEventSchema, (event) => (
    <AgentProgressCard event={event} />
  )),
  activityRenderer('kiditem.ui.agent_artifact.v1', AgentArtifactCardSchema, (event) => (
    <AgentArtifactCard event={event} />
  )),
  activityRenderer('kiditem.ui.agent_delegation.v1', AgentDelegationEventSchema, (event) => (
    <AgentDelegationCard event={event} />
  )),
];

export function OfficialInteractionInterrupts({ agentId }: { agentId: string }) {
  useInterrupt({
    agentId,
    enabled: (event) => approvalFromInterrupt(event.value) !== null,
    render: ({ interrupt, event, resolve }) => {
      const approval = approvalFromInterrupt(interrupt ?? event.value);
      if (!approval) return <SafeDurableFallback value={event.value} />;
      return (
        <AgentApprovalCard
          approval={approval}
          onDecision={(decision) => {
            void resolve(approvalInterruptPayloadSchema.parse({
              kind: 'kiditem.agent_approval_decision.v1',
              approvalId: approval.approvalId,
              session: approval.session,
              decision,
              idempotencyKey: crypto.randomUUID(),
            }));
          }}
        />
      );
    },
  });
  return null;
}

function activityRenderer<Schema extends z.ZodTypeAny>(
  activityType: string,
  schema: Schema,
  render: (value: z.infer<Schema>) => ReactElement,
): ReactActivityMessageRenderer<unknown> {
  return {
    activityType,
    content: z.unknown(),
    render: ({ content }) => {
      const parsed = schema.safeParse(content);
      return parsed.success
        ? render(parsed.data)
        : <SafeDurableFallback value={content} />;
    },
  };
}

function approvalFromInterrupt(value: unknown): z.infer<typeof AgentApprovalCardSchema> | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = 'metadata' in value
    ? (value as { metadata?: unknown }).metadata
    : value;
  const parsed = approvalInterruptMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data.approval : null;
}

function SafeDurableFallback({ value }: { value: unknown }) {
  return <p>{fallbackText(value)}</p>;
}

function fallbackText(value: unknown): string {
  if (value && typeof value === 'object' && 'textFallback' in value) {
    const text = (value as { textFallback?: unknown }).textFallback;
    if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 2_000);
  }
  return '안전하게 표시할 수 없는 Agent 상태입니다.';
}
