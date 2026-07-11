'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  getOfficeSeat,
  OFFICE_WORLD_SIZE,
} from '../lib/agent-office-layout';
import { AgentOfficeAvatar } from './AgentOfficeAvatar';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';
import { AgentOfficeFloor } from './AgentOfficeFloor';
import type {
  AgentOfficeActivity,
  AgentOfficeNode,
} from '../lib/agent-office-model';

function latestActivityLabels(
  activities: AgentOfficeActivity[],
  nodeIdByInstanceId: Map<string, string>,
) {
  const latestByEmployee = new Map<string, AgentOfficeActivity>();

  for (const activity of activities) {
    if (!activity.agentInstanceId) continue;

    const nodeId = nodeIdByInstanceId.get(activity.agentInstanceId);
    if (!nodeId) continue;

    const previous = latestByEmployee.get(nodeId);
    if (!previous || activity.occurredAt > previous.occurredAt) {
      latestByEmployee.set(nodeId, activity);
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
  const nodeIdByInstanceId = useMemo(
    () =>
      new Map(
        nodes.flatMap((node) =>
          node.instanceId ? [[node.instanceId, node.id] as const] : [],
        ),
      ),
    [nodes],
  );
  const activityLabels = useMemo(
    () => latestActivityLabels(activities, nodeIdByInstanceId),
    [activities, nodeIdByInstanceId],
  );

  return (
    <section
      aria-label="운영 캔버스"
      className={cn(
        'relative h-full min-h-0 overflow-hidden bg-slate-100',
        className,
      )}
    >
      <AgentOfficeCanvas worldSize={OFFICE_WORLD_SIZE}>
        <div
          data-testid="agent-office-scene"
          className="relative h-full w-full overflow-hidden border border-slate-200 bg-white shadow-sm"
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
      </AgentOfficeCanvas>
    </section>
  );
}
