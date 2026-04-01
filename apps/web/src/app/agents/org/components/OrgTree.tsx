'use client';
import { useRouter } from 'next/navigation';
import { type OrgNode } from '../../lib/agent-types';
import AgentCard from './AgentCard';

interface Props {
  nodes: OrgNode[];
  router: ReturnType<typeof useRouter>;
}

export default function OrgTree({ nodes, router }: Props) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0">
      {nodes.map((node, idx) => (
        <div key={node.id} className="flex flex-col items-center">
          {idx > 0 && (
            <div className="w-px h-4 bg-gray-200" />
          )}

          <AgentCard node={node} onClick={() => router.push(`/agents/${node.id}`)} />

          {node.reports && node.reports.length > 0 && (
            <div className="flex flex-col items-center">
              <div className="w-px h-6 bg-gray-200" />

              {node.reports.length === 1 ? (
                <OrgTree nodes={node.reports} router={router} />
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
                        <OrgTree nodes={[child]} router={router} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
