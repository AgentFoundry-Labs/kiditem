'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { useAgentOrg } from '../hooks/useAgents';
import OrgTree from './components/OrgTree';
import OrgLegend from './components/OrgLegend';

export default function OrgPage() {
  const router = useRouter();
  const { data: roots = [], isLoading: loading, error: queryError } = useAgentOrg();
  const error = queryError ? '조직도를 불러오지 못했습니다.' : null;

  return (
    <div className="p-4 sm:p-8">
      {loading && (
        <div className="flex items-center justify-center py-32 text-sm text-slate-400">
          불러오는 중...
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-32 text-sm text-red-500">
          {error}
        </div>
      )}

      {!loading && !error && roots.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
          <Users className="w-10 h-10 mb-3" />
          <p className="text-sm">에이전트가 아직 없습니다.</p>
          <Link
            href="/agents?tab=marketplace"
            className="mt-2 text-sm text-blue-500 hover:text-blue-600 hover:underline"
          >
            마켓플레이스에서 에이전트를 고용하세요
          </Link>
        </div>
      )}

      {!loading && !error && roots.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-auto p-10">
          <div className="flex justify-center">
            <OrgTree nodes={roots} router={router} />
          </div>
        </div>
      )}

      {!loading && roots.length > 0 && <OrgLegend />}
    </div>
  );
}
