'use client';

import {
  Bot,
  CheckCircle2,
  FileBox,
  Maximize2,
  RotateCcw,
  ShieldCheck,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ExecutionCanvasGraph,
  ExecutionCanvasLane,
  ExecutionCanvasNode,
  ExecutionCanvasNodeKind,
  ExecutionCanvasStatus,
} from '../lib/execution-canvas-graph';

const LANE_WIDTH = 260;
const LANE_GAP = 28;
const NODE_WIDTH = 208;
const NODE_HEIGHT = 74;
const NODE_GAP = 18;
const NODE_TOP = 82;
const CANVAS_PADDING_X = 24;
const CANVAS_PADDING_BOTTOM = 38;
const MIN_CANVAS_WIDTH = 760;
const MIN_CANVAS_HEIGHT = 360;

interface ExecutionCanvasProps {
  graph: ExecutionCanvasGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

export function ExecutionCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: ExecutionCanvasProps) {
  const [zoom, setZoom] = useState(1);

  const laneNodeEntries = useMemo(
    () =>
      graph.lanes.map((lane) => ({
        lane,
        nodes: nodesForLane(graph, lane),
      })),
    [graph],
  );

  const maxLaneNodes = Math.max(
    1,
    ...laneNodeEntries.map(({ nodes }) => nodes.length),
  );
  const canvasWidth = Math.max(
    MIN_CANVAS_WIDTH,
    graph.lanes.length * LANE_WIDTH +
      Math.max(0, graph.lanes.length - 1) * LANE_GAP +
      CANVAS_PADDING_X * 2,
  );
  const canvasHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    NODE_TOP +
      maxLaneNodes * NODE_HEIGHT +
      Math.max(0, maxLaneNodes - 1) * NODE_GAP +
      CANVAS_PADDING_BOTTOM,
  );

  const nodePositions = useMemo(() => {
    const positions = new Map<string, NodePosition>();

    laneNodeEntries.forEach(({ nodes }, laneIndex) => {
      const laneX = CANVAS_PADDING_X + laneIndex * (LANE_WIDTH + LANE_GAP);
      const nodeX = laneX + (LANE_WIDTH - NODE_WIDTH) / 2;

      nodes.forEach((node, nodeIndex) => {
        const nodeY = NODE_TOP + nodeIndex * (NODE_HEIGHT + NODE_GAP);
        positions.set(node.id, {
          x: nodeX,
          y: nodeY,
          centerX: nodeX + NODE_WIDTH / 2,
          centerY: nodeY + NODE_HEIGHT / 2,
        });
      });
    });

    return positions;
  }, [laneNodeEntries]);

  const hasGraphRecords = graph.nodes.length > 0 || graph.lanes.length > 0;

  return (
    <section className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-sky-200/80 bg-sky-50 text-slate-950 shadow-sm">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-sky-200/80 bg-white/75 px-4 py-3 backdrop-blur">
        <div>
          <h2 className="text-sm font-bold text-slate-950">Execution Canvas</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {graph.summary.totalNodes} nodes / {graph.summary.runningNodes}{' '}
            running / {graph.summary.approvalNodes} approvals
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-white/80 p-1 shadow-sm">
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((currentZoom) => Math.max(0.6, currentZoom - 0.1))}
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <span className="w-10 text-center text-[10px] font-semibold tabular-nums text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Zoom in"
            onClick={() => setZoom((currentZoom) => Math.min(1.4, currentZoom + 0.1))}
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <div className="mx-1 h-4 w-px bg-sky-200" />
          <IconButton label="Fit view" onClick={() => setZoom(0.86)}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset view" onClick={() => setZoom(1)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div className="relative flex-1 overflow-auto">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(14,165,233,0.28)_1px,transparent_0)] [background-size:22px_22px]"
          aria-hidden="true"
        />

        {!hasGraphRecords ? (
          <div className="relative z-10 flex h-full min-h-[320px] items-center justify-center p-6">
            <div className="rounded-lg border border-dashed border-sky-300 bg-white/70 px-4 py-3 text-sm font-medium text-slate-500 shadow-sm">
              아직 실행 그래프가 없습니다
            </div>
          </div>
        ) : (
          <div
            className="relative z-10 origin-top-left transition-transform"
            style={{
              height: canvasHeight,
              transform: `scale(${zoom})`,
              width: canvasWidth,
            }}
          >
            <svg
              className="pointer-events-none absolute left-0 top-0"
              height={canvasHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              width={canvasWidth}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="execution-canvas-arrow"
                  markerHeight="7"
                  markerWidth="7"
                  orient="auto"
                  refX="6"
                  refY="3.5"
                >
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#38bdf8" />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const from = nodePositions.get(edge.from);
                const to = nodePositions.get(edge.to);

                if (!from || !to) {
                  return null;
                }

                return (
                  <path
                    key={edge.id}
                    d={edgePath(from, to)}
                    fill="none"
                    markerEnd="url(#execution-canvas-arrow)"
                    stroke={edge.crossLane ? '#0ea5e9' : '#38bdf8'}
                    strokeDasharray={edge.crossLane ? '5 5' : undefined}
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>

            {laneNodeEntries.map(({ lane, nodes }, laneIndex) => {
              const laneX = CANVAS_PADDING_X + laneIndex * (LANE_WIDTH + LANE_GAP);

              return (
                <div
                  key={lane.id}
                  className="absolute top-4 rounded-lg border border-sky-200/80 bg-white/45"
                  style={{
                    height: canvasHeight - 32,
                    left: laneX,
                    width: LANE_WIDTH,
                  }}
                >
                  <div className="flex h-12 items-center justify-between border-b border-sky-200/70 px-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-bold text-slate-800">
                        {lane.label}
                      </h3>
                      <p className="mt-0.5 truncate text-[10px] font-medium uppercase text-sky-700">
                        {lane.agentType ?? 'agent'}
                      </p>
                    </div>
                    <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      {nodes.length}
                    </span>
                  </div>
                </div>
              );
            })}

            {laneNodeEntries.flatMap(({ lane, nodes }) =>
              nodes.map((node) => {
                const position = nodePositions.get(node.id);

                if (!position) {
                  return null;
                }

                return (
                  <button
                    key={node.id}
                    type="button"
                    aria-label={`${node.label} node`}
                    onClick={() => onSelectNode(node.id)}
                    className={cn(
                      'absolute flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition',
                      'hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2',
                      selectedNodeId === node.id
                        ? 'border-sky-500 ring-2 ring-sky-200'
                        : 'border-sky-200',
                    )}
                    style={{
                      height: NODE_HEIGHT,
                      left: position.x,
                      top: position.y,
                      width: NODE_WIDTH,
                    }}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                        kindTone(node.kind),
                      )}
                    >
                      <NodeKindIcon kind={node.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold leading-5 text-slate-900">
                        {visibleNodeLabel(node, lane)}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                        {visibleEyebrow(node)}
                      </span>
                      <span
                        className={cn(
                          'mt-1 inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                          statusTone(node.status),
                        )}
                      >
                        {node.status}
                      </span>
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function nodesForLane(
  graph: ExecutionCanvasGraph,
  lane: ExecutionCanvasLane,
): ExecutionCanvasNode[] {
  return lane.nodes.length > 0
    ? lane.nodes
    : graph.nodes.filter((node) => node.laneId === lane.id);
}

function edgePath(from: NodePosition, to: NodePosition): string {
  if (Math.abs(from.centerX - to.centerX) < 1) {
    const startY = from.y + NODE_HEIGHT;
    const endY = to.y;
    const controlOffset = Math.max(28, (endY - startY) / 2);

    return [
      `M ${from.centerX} ${startY}`,
      `C ${from.centerX} ${startY + controlOffset}`,
      `${to.centerX} ${endY - controlOffset}`,
      `${to.centerX} ${endY}`,
    ].join(' ');
  }

  const startX = from.centerX < to.centerX ? from.x + NODE_WIDTH : from.x;
  const endX = from.centerX < to.centerX ? to.x : to.x + NODE_WIDTH;
  const controlOffset = Math.max(48, Math.abs(endX - startX) / 2);
  const firstControlX =
    from.centerX < to.centerX ? startX + controlOffset : startX - controlOffset;
  const secondControlX =
    from.centerX < to.centerX ? endX - controlOffset : endX + controlOffset;

  return [
    `M ${startX} ${from.centerY}`,
    `C ${firstControlX} ${from.centerY}`,
    `${secondControlX} ${to.centerY}`,
    `${endX} ${to.centerY}`,
  ].join(' ');
}

function visibleNodeLabel(
  node: ExecutionCanvasNode,
  lane: ExecutionCanvasLane,
): string {
  if (node.label.trim().toLowerCase() === lane.label.trim().toLowerCase()) {
    return `${node.label} request`;
  }

  return node.label;
}

function visibleEyebrow(node: ExecutionCanvasNode): string {
  if (node.eyebrow.trim().toLowerCase() === node.label.trim().toLowerCase()) {
    return node.kind;
  }

  return node.eyebrow;
}

function kindTone(kind: ExecutionCanvasNodeKind): string {
  switch (kind) {
    case 'agent':
      return 'bg-cyan-100 text-cyan-700';
    case 'tool':
      return 'bg-indigo-100 text-indigo-700';
    case 'artifact':
      return 'bg-emerald-100 text-emerald-700';
    case 'approval':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function statusTone(status: ExecutionCanvasStatus): string {
  switch (status) {
    case 'running':
      return 'bg-cyan-100 text-cyan-700';
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'waiting_approval':
      return 'bg-amber-100 text-amber-700';
    case 'skipped':
      return 'bg-slate-100 text-slate-500';
    case 'waiting':
    default:
      return 'bg-sky-100 text-sky-700';
  }
}

function NodeKindIcon({ kind }: { kind: ExecutionCanvasNodeKind }) {
  switch (kind) {
    case 'agent':
      return <Bot className="h-4 w-4" aria-hidden="true" />;
    case 'tool':
      return <Wrench className="h-4 w-4" aria-hidden="true" />;
    case 'artifact':
      return <FileBox className="h-4 w-4" aria-hidden="true" />;
    case 'approval':
      return <ShieldCheck className="h-4 w-4" aria-hidden="true" />;
    default:
      return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  }
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-100 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      {children}
    </button>
  );
}
