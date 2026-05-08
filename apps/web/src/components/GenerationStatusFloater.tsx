'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface ProductsResponse {
  items: Array<{ id: string; pipelineStep: string | null; name?: string }>;
  total: number;
}

const IN_PROGRESS = ['processing', 'images_generating'];

export default function GenerationStatusFloater() {
  const router = useRouter();

  const { data } = useQuery({
    queryKey: queryKeys.sourcing.list({ inProgressOnly: '1' }),
    queryFn: () =>
      apiClient.get<ProductsResponse>('/api/sourcing/extension/products?page=1&limit=100&inProgressOnly=1'),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasActive = items.some((p) => p.pipelineStep && IN_PROGRESS.includes(p.pipelineStep));
      return hasActive ? 15000 : 60000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  const inProgress = (data?.items ?? []).filter(
    (p) => p.pipelineStep && IN_PROGRESS.includes(p.pipelineStep),
  );

  if (inProgress.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => router.push('/sourcing')}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-violet-700 hover:shadow-xl"
      title={`AI 생성 중: ${inProgress.map((p) => p.name).filter(Boolean).slice(0, 3).join(', ')}${
        inProgress.length > 3 ? ` 외 ${inProgress.length - 3}개` : ''
      }`}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Loader2 size={16} className="animate-spin" />
      </span>
      <span className="flex items-center gap-1">
        <Sparkles size={13} />
        AI 생성 중
        <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px]">
          {inProgress.length}
        </span>
      </span>
    </button>
  );
}
