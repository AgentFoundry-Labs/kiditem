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
import type { WorkflowTemplate, StepStatusInfo } from '../lib/workflow-types';
import WorkflowNode from './WorkflowNode';

interface WorkflowCanvasProps {
  template: WorkflowTemplate;
  stepStatusMap?: Map<string, StepStatusInfo>;
  onNodeClick?: (nodeId: string) => void;
}

export default function WorkflowCanvas({
  template,
  stepStatusMap,
  onNodeClick,
}: WorkflowCanvasProps) {
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      custom: WorkflowNode,
    }),
    [],
  );

  const rawNodes: any[] = useMemo(() => {
    if (!template.nodesJson) return [];
    return Array.isArray(template.nodesJson)
      ? template.nodesJson
      : [];
  }, [template.nodesJson]);

  const rawEdges: any[] = useMemo(() => {
    if (!template.edgesJson) return [];
    return Array.isArray(template.edgesJson)
      ? template.edgesJson
      : [];
  }, [template.edgesJson]);

  const nodes: Node[] = useMemo(
    () =>
      rawNodes.map((n: any) => {
        const stepInfo = stepStatusMap?.get(n.id);
        return {
          id: n.id,
          type: 'custom',
          position: n.position ?? { x: 0, y: 0 },
          data: {
            label: n.label,
            nodeType: n.type,
            module: n.module,
            status: stepInfo?.status ?? n.status ?? 'idle',
            config: n.config,
            onNodeClick,
          },
        };
      }),
    [rawNodes, stepStatusMap, onNodeClick],
  );

  const edges: Edge[] = useMemo(
    () =>
      rawEdges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: '#9ca3af', strokeWidth: 2 },
        labelStyle: { fill: '#64748b', fontSize: 10 },
        labelBgStyle: { fill: '#f9fafb', fillOpacity: 0.9 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
      })),
    [rawEdges],
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
          color="#e5e7eb"
        />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const status = node.data?.status;
            if (status === 'success') return '#10b981';
            if (status === 'error') return '#ef4444';
            if (status === 'running') return '#3b82f6';
            return '#9ca3af';
          }}
          maskColor="rgba(255, 255, 255, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}
