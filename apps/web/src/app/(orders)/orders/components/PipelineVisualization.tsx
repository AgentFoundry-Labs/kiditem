'use client';
import type { OrderPipelineNode, OrderPipelineEdge } from '../lib/order-pipeline';

interface PipelineVisualizationProps {
  displayNodes: OrderPipelineNode[];
  displayEdges: OrderPipelineEdge[];
  counts: Record<string, number>;
  activeNode: string;
  onNodeClick: (key: string) => void;
}

export default function PipelineVisualization({
  displayNodes, displayEdges, counts, activeNode, onNodeClick,
}: PipelineVisualizationProps) {
  const nodeW = 130;
  const nodeH = 90;
  const gap = 50;
  const padX = 30;
  const svgW = displayNodes.length * nodeW + (displayNodes.length - 1) * gap + padX * 2;
  const svgH = nodeH + 40;
  const nodeY = 20;
  const getNodeX = (i: number) => padX + i * (nodeW + gap);

  return (
    <div className="table-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle,#f1f5f9)]">
        <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Autonomous Lineage</h3>
        <span className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="relative overflow-x-auto bg-slate-50/50 p-4">
        <svg
          width="100%"
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ minWidth: 700, display: "block" }}
        >
          <defs>
            <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="0.6" fill="#dde0e5" />
            </pattern>
          </defs>
          <rect width={svgW} height={svgH} fill="url(#dots)" rx="6" />

          {displayEdges.map((edge, i) => {
            const x1 = getNodeX(edge.from) + nodeW;
            const x2 = getNodeX(edge.to);
            const y = nodeY + nodeH / 2;
            const fromCount = counts[displayNodes[edge.from]?.key ?? ''] || 0;
            return (
              <g key={`edge-${i}`}>
                <line x1={x1 + 2} y1={y} x2={x2 - 2} y2={y} stroke="#d1d5db" strokeWidth="2" strokeDasharray="5 3" />
                <polygon points={`${x2 - 5},${y - 3.5} ${x2},${y} ${x2 - 5},${y + 3.5}`} fill="#c0c5cd" />
                {fromCount > 0 && (
                  <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="monospace">
                    {fromCount}
                  </text>
                )}
              </g>
            );
          })}

          {displayNodes.map((node, i) => {
            const count = counts[node.key] || 0;
            const isActive = activeNode === node.key;
            const nx = getNodeX(i);
            return (
              <g key={node.key} onClick={() => onNodeClick(node.key)} className="cursor-pointer">
                <rect x={nx + 2} y={nodeY + 2} width={nodeW} height={nodeH} rx="10" fill="black" opacity="0.04" />
                <rect
                  x={nx} y={nodeY} width={nodeW} height={nodeH} rx="10"
                  fill={isActive ? node.color : "white"}
                  stroke={isActive ? node.color : "#dde0e5"}
                  strokeWidth={isActive ? 2 : 1}
                />
                <text
                  x={nx + nodeW / 2} y={nodeY + 38} textAnchor="middle"
                  fontSize="32" fontWeight="800" fontFamily="monospace"
                  fill={isActive ? "white" : node.color}
                >
                  {count}
                </text>
                <text
                  x={nx + nodeW / 2} y={nodeY + 58} textAnchor="middle"
                  fontSize="13" fontWeight="600"
                  fill={isActive ? "rgba(255,255,255,0.95)" : "#374151"}
                >
                  {node.label}
                </text>
                <text
                  x={nx + nodeW / 2} y={nodeY + 74} textAnchor="middle"
                  fontSize="10" fontFamily="monospace"
                  fill={isActive ? "rgba(255,255,255,0.55)" : "#9ca3af"}
                >
                  {node.sub}
                </text>
                {count > 0 && !isActive && (
                  <circle cx={nx + nodeW - 10} cy={nodeY + 10} r="4" fill={node.color} opacity="0.8" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
