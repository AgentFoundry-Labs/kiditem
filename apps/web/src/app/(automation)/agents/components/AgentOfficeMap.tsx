'use client';

import { AgentOfficeNode } from './AgentOfficeNode';
import type { AgentOfficeNode as AgentOfficeNodeModel } from '../lib/agent-office-model';

export function AgentOfficeMap({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: AgentOfficeNodeModel[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <section className="relative min-h-[520px] overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,.18)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute left-[8%] top-[12%] h-24 w-32 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" />
      <div className="absolute bottom-[12%] right-[10%] h-28 w-44 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" />
      <div className="absolute bottom-[18%] left-[10%] h-20 w-24 rounded-full border border-emerald-200 bg-emerald-50" />
      {nodes.map((node) => (
        <AgentOfficeNode
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          onSelect={onSelectNode}
        />
      ))}
    </section>
  );
}
