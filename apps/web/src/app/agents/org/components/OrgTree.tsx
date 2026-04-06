'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { type OrgNode } from '../../lib/agent-types';
import AgentCard from './AgentCard';

interface Props {
  nodes: OrgNode[];
  router: ReturnType<typeof useRouter>;
  onAddAgent?: () => void;
  onNodeClick?: (node: OrgNode) => void;
}

function EmptySlot({ onAddAgent }: { onAddAgent?: () => void }) {
  if (onAddAgent) {
    return (
      <button
        onClick={onAddAgent}
        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 w-36 text-center cursor-pointer"
      >
        <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center">
          <Plus className="w-4 h-4 text-gray-400" />
        </div>
        <p className="text-[11px] text-gray-400">+ 전문 에이전트 추가</p>
      </button>
    );
  }
  return (
    <Link
      href="/agents?tab=marketplace"
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 w-36 text-center"
    >
      <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center">
        <Plus className="w-4 h-4 text-gray-400" />
      </div>
      <p className="text-[11px] text-gray-400">+ 전문 에이전트 추가</p>
    </Link>
  );
}

export default function OrgTree({ nodes, router, onAddAgent, onNodeClick }: Props) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0">
      {nodes.map((node, idx) => {
        const isManager = node.role === 'manager' || node.role === 'ceo';
        const hasReports = node.reports && node.reports.length > 0;

        return (
          <div key={node.id} className="flex flex-col items-center">
            {idx > 0 && (
              <div className="w-px h-4 bg-gray-200" />
            )}

            <AgentCard node={node} onClick={() => {
              if (onNodeClick) {
                onNodeClick(node);
              } else if (node.hired) {
                router.push(`/agents/${node.id}`);
              } else {
                router.push(`/agents?tab=marketplace`);
              }
            }} />

            {hasReports ? (
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-gray-200" />

                {node.reports.length === 1 ? (
                  <OrgTree nodes={node.reports} router={router} onAddAgent={onAddAgent} onNodeClick={onNodeClick} />
                ) : (
                  <div className="flex flex-col items-center">
                    <div
                      className="relative h-px bg-gray-200"
                      style={{ width: `${node.reports.length * 9}rem` }}
                    />
                    <div className="flex items-start gap-4">
                      {node.reports.map((child) => (
                        <div key={child.id} className="flex flex-col items-center">
                          <div className="w-px h-6 bg-gray-200" />
                          <OrgTree nodes={[child]} router={router} onAddAgent={onAddAgent} onNodeClick={onNodeClick} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : isManager ? (
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-gray-200" />
                <EmptySlot onAddAgent={onAddAgent} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
