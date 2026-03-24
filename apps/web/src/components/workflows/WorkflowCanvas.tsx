'use client';

import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Workflow } from '@/types';
import WorkflowNode from './WorkflowNode';

interface WorkflowCanvasProps {
  workflow: Workflow;
}

export default function WorkflowCanvas({ workflow }: WorkflowCanvasProps) {
  const nodeTypes: NodeTypes = useMemo(() => ({
    custom: WorkflowNode,
  }), []);

  const nodes: Node[] = useMemo(() =>
    workflow.nodes.map((n) => ({
      id: n.id,
      type: 'custom',
      position: n.position,
      data: {
        label: n.label,
        nodeType: n.type,
        module: n.module,
        status: n.status,
        config: n.config,
      },
    })),
    [workflow.nodes]
  );

  const edges: Edge[] = useMemo(() =>
    workflow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: true,
      style: { stroke: '#2a2d48', strokeWidth: 2 },
      labelStyle: { fill: '#64748b', fontSize: 10 },
      labelBgStyle: { fill: '#111318', fillOpacity: 0.9 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    })),
    [workflow.edges]
  );

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1d26"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const status = node.data?.status;
            if (status === 'success') return '#10b981';
            if (status === 'error') return '#ef4444';
            if (status === 'running') return '#3b82f6';
            return '#374151';
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}
