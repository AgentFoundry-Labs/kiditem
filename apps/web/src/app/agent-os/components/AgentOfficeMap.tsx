'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getOfficeSeat } from '../lib/agent-office-layout';
import { AgentOfficeAvatar } from './AgentOfficeAvatar';
import { AgentOfficeFloor } from './AgentOfficeFloor';
import type {
  AgentOfficeActivity,
  AgentOfficeNode,
} from '../lib/agent-office-model';

function latestActivityLabels(activities: AgentOfficeActivity[]) {
  const latestByEmployee = new Map<string, AgentOfficeActivity>();

  for (const activity of activities) {
    if (!activity.agentInstanceId) continue;

    const previous = latestByEmployee.get(activity.agentInstanceId);
    if (!previous || activity.occurredAt > previous.occurredAt) {
      latestByEmployee.set(activity.agentInstanceId, activity);
    }
  }

  return new Map(
    Array.from(latestByEmployee, ([employeeId, activity]) => [
      employeeId,
      activity.label,
    ]),
  );
}

export function AgentOfficeMap({
  nodes,
  activities,
  selectedNodeId,
  onSelectNode,
  className,
}: {
  nodes: AgentOfficeNode[];
  activities: AgentOfficeActivity[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  className?: string;
}) {
  const placements = useMemo(
    () =>
      nodes.map((node, index) => ({
        node,
        seat: getOfficeSeat(node.agentType, index),
      })),
    [nodes],
  );
  const activityLabels = useMemo(
    () => latestActivityLabels(activities),
    [activities],
  );

  return (
    <section
      aria-label="운영 캔버스"
      className={cn(
        'relative flex min-h-[720px] items-center justify-center overflow-hidden bg-slate-100',
        className,
      )}
    >
      <div
        data-testid="agent-office-scene"
        className="relative aspect-[8/5] max-w-full overflow-hidden border border-slate-200 bg-white shadow-sm"
        style={{
          width: 'min(100%, calc((100vh - 104px) * 1.6))',
        }}
      >
        <AgentOfficeFloor desks={placements} onSelectNode={onSelectNode} />
        {placements.map(({ node, seat }) => (
          <AgentOfficeAvatar
            key={node.id}
            node={node}
            seat={seat}
            selected={selectedNodeId === node.id}
            activityLabel={activityLabels.get(node.id) ?? null}
            onSelect={onSelectNode}
          />
        ))}
      </div>
    </section>
  );
}
