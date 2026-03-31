'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  ConnectionMode,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import CategoryNode from './CategoryNode';
import BrandNode from './BrandNode';
import ProductNode from './ProductNode';

interface GraphData {
  nodes: {
    id: string;
    type: string;
    label: string;
    productCount: number;
    brandCount?: number;
    category?: string;
  }[];
  edges: { id: string; source: string; target: string }[];
  stats: { totalProducts: number; totalCategories: number; totalBrands: number };
}

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 180 });

  nodes.forEach((n) => {
    const w = n.type === 'category' ? 200 : n.type === 'brand' ? 180 : 160;
    const h = n.type === 'product' ? 40 : 60;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: { x: pos.x - (pos.width ?? 0) / 2, y: pos.y - (pos.height ?? 0) / 2 },
    };
  });
}

const edgeStyle = { stroke: '#9ca3af', strokeWidth: 1.5 };

export default function OntologyGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const expandedBrands = useRef(new Set<string>());
  const needsLayout = useRef(false);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      category: CategoryNode,
      brand: BrandNode,
      product: ProductNode,
    }),
    [],
  );

  const handleBrandClick = useCallback(
    async (brandData: any) => {
      const brandId = `brand-${brandData.category}-${brandData.label}`;
      if (expandedBrands.current.has(brandId)) return;
      expandedBrands.current.add(brandId);

      try {
        const res = await fetch(
          `${API_BASE}/api/ontology/products?category=${encodeURIComponent(brandData.category)}&brand=${encodeURIComponent(brandData.label)}`,
        );
        if (!res.ok) return;
        const products = await res.json();

        const newNodes: Node[] = products.map((p: any) => ({
          id: `prod-${p.id}`,
          type: 'product',
          position: { x: 0, y: 0 },
          data: {
            label: p.name,
            grade: p.abcGrade,
            thumbnailUrl: p.thumbnailUrl,
          },
        }));

        const newEdges: Edge[] = products.map((p: any) => ({
          id: `e-${brandId}-prod-${p.id}`,
          source: brandId,
          target: `prod-${p.id}`,
          style: edgeStyle,
        }));

        needsLayout.current = true;
        setNodes((prev) => [...prev, ...newNodes]);
        setEdges((prev) => [...prev, ...newEdges]);
      } catch {
        expandedBrands.current.delete(brandId);
      }
    },
    [setNodes, setEdges],
  );

  // Fetch graph data on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchGraph() {
      try {
        const res = await fetch(`${API_BASE}/api/ontology/graph`);
        if (!res.ok) throw new Error('그래프 데이터 로딩 실패');
        const data: GraphData = await res.json();

        if (cancelled) return;

        const rfNodes: Node[] = data.nodes.map((n) => ({
          id: n.id,
          type: n.type as string,
          position: { x: 0, y: 0 },
          data: {
            label: n.label,
            productCount: n.productCount,
            ...(n.type === 'category' ? { brandCount: n.brandCount } : {}),
            ...(n.type === 'brand' ? { category: n.category, onNodeClick: handleBrandClick } : {}),
          },
        }));

        const rfEdges: Edge[] = data.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          style: edgeStyle,
        }));

        const laidOut = layoutGraph(rfNodes, rfEdges);
        setNodes(laidOut);
        setEdges(rfEdges);
      } catch (err: any) {
        if (!cancelled) setError(err.message || '그래프 데이터 로딩 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGraph();
    return () => {
      cancelled = true;
    };
  }, [handleBrandClick, setNodes, setEdges]);

  // Re-layout after brand expand adds new nodes/edges
  useEffect(() => {
    if (!needsLayout.current) return;
    needsLayout.current = false;

    // Defer to next tick so both nodes and edges state are committed
    const t = setTimeout(() => {
      setNodes((currentNodes) => {
        // Read current edges inside a functional update to get latest state
        let currentEdges: Edge[] = [];
        setEdges((e) => {
          currentEdges = e;
          return e;
        });
        return layoutGraph(currentNodes, currentEdges);
      });
    }, 50);

    return () => clearTimeout(t);
  }, [nodes.length, edges.length, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-white rounded-xl border border-gray-200">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">그래프 로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-white rounded-xl border border-gray-200">
        <span className="text-sm text-red-500">{error}</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'category') return '#8b5cf6';
            if (node.type === 'brand') return '#3b82f6';
            return '#9ca3af';
          }}
          maskColor="rgba(255, 255, 255, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}
