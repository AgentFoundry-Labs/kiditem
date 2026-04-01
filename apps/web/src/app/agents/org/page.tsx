'use client';

import { useRouter } from 'next/navigation';
import { ADAPTER_LABELS, ROLE_LABELS, type OrgNode } from '@/lib/agent-types';
import { agentStatusDot, agentStatusDotDefault } from '@/lib/status-colors';
import { cn } from '@/lib/utils';
import { useAgentOrg } from '@/hooks/use-agents';

function AgentCard({ node, onClick }: { node: OrgNode; onClick: () => void }) {
  const dotClass = agentStatusDot[node.status] ?? agentStatusDotDefault;
  const initial = node.name.charAt(0).toUpperCase();
  const adapterLabel = ADAPTER_LABELS[node.adapterType] ?? node.adapterType;
  const roleLabel = ROLE_LABELS[node.role] ?? node.role;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all duration-200 w-36 text-left"
    >
      {/* Icon + status dot */}
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
          {initial}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
          <span className={cn('inline-flex h-2.5 w-2.5 rounded-full', dotClass)} />
        </span>
      </div>

      {/* Name */}
      <div className="w-full text-center">
        <p className="text-xs font-medium text-gray-900 truncate">{node.name}</p>
        {node.title && (
          <p className="text-[10px] text-gray-500 truncate mt-0.5">{node.title}</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap justify-center gap-1">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
          {roleLabel}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">
          {adapterLabel}
        </span>
      </div>
    </button>
  );
}

function OrgTree({ nodes, router }: { nodes: OrgNode[]; router: ReturnType<typeof useRouter> }) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0">
      {nodes.map((node, idx) => (
        <div key={node.id} className="flex flex-col items-center">
          {/* Vertical connector from parent (except first item at root) */}
          {idx > 0 && (
            <div className="w-px h-4 bg-gray-200" />
          )}

          <AgentCard node={node} onClick={() => router.push(`/agents/${node.id}`)} />

          {/* Children */}
          {node.reports && node.reports.length > 0 && (
            <div className="flex flex-col items-center">
              {/* Vertical line down */}
              <div className="w-px h-6 bg-gray-200" />

              {node.reports.length === 1 ? (
                /* Single child — straight line */
                <OrgTree nodes={node.reports} router={router} />
              ) : (
                /* Multiple children — horizontal rail */
                <div className="flex flex-col items-center">
                  {/* Horizontal rail */}
                  <div
                    className="relative h-px bg-gray-200"
                    style={{ width: `${node.reports.length * 9}rem` }}
                  />
                  {/* Children row */}
                  <div className="flex items-start gap-4">
                    {node.reports.map((child) => (
                      <div key={child.id} className="flex flex-col items-center">
                        {/* Vertical drop to each child */}
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

export default function OrgPage() {
  const router = useRouter();
  const { data: roots = [], isLoading: loading, error: queryError } = useAgentOrg();
  const error = queryError ? '조직도를 불러오지 못했습니다.' : null;

  return (
    <div className="p-4 sm:p-8">
      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-32 text-sm text-gray-400">
          불러오는 중...
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-32 text-sm text-red-500">
          {error}
        </div>
      )}

      {!loading && !error && roots.length === 0 && (
        <div className="flex items-center justify-center py-32 text-sm text-gray-400">
          등록된 에이전트가 없습니다.
        </div>
      )}

      {!loading && !error && roots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto p-10">
          <div className="flex justify-center">
            <OrgTree nodes={roots} router={router} />
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && roots.length > 0 && (
        <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span>실행 중</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-400" />
            <span>활성</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-gray-400" />
            <span>유휴</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-orange-400" />
            <span>일시정지</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
            <span>오류</span>
          </div>
        </div>
      )}
    </div>
  );
}
