'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useWingRegister } from '../../../_shared/hooks/useThumbnailGenerations';
import { fetchWingListingChoices, wingUploadReached } from '../../../_shared/lib/wing-registration';

/**
 * 판매상품에 쿠팡 listing 이 여럿이라 준비가 거절된 생성에서, 운영자가 올릴 listing 을 고르고
 * 그 listing 으로 다시 올린다.
 */
export function WingListingPicker({ generationId, onDone }: { generationId: string; onDone: () => void }) {
  const choices = useQuery({
    queryKey: queryKeys.thumbnailExecutions.listingChoices(generationId),
    queryFn: () => fetchWingListingChoices(generationId),
  });
  const register = useWingRegister();
  const [picked, setPicked] = useState<string>('');
  const selected = picked || choices.data?.[0]?.channelListingId || '';

  if (choices.isLoading) return <p className="text-[11px] text-slate-500">쿠팡 listing 을 읽는 중…</p>;
  if (!choices.data?.length) return <p className="text-[11px] text-slate-500">고를 수 있는 쿠팡 listing 이 없습니다</p>;

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <select
        aria-label="쿠팡 listing"
        value={selected}
        onChange={(event) => setPicked(event.target.value)}
        className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 focus:border-primary focus:outline-none"
      >
        {choices.data.map((choice) => (
          <option key={choice.channelListingId} value={choice.channelListingId}>
            {`${choice.channelName ?? '이름 없음'} · ${choice.channelAccountName} · ${choice.externalId}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || register.isPending}
        onClick={() => {
          register.mutate({ generationId, channelListingId: selected }, {
            onSuccess: (result) => {
              if (wingUploadReached(result)) toast.success('Wing 수정 화면에 올렸습니다 — Wing에서 저장한 뒤 반영됨으로 표시하세요');
              else toast.error(result.error ?? 'Wing 업로드 실패');
              onDone();
            },
            onError: (error) => toast.error(error instanceof Error ? error.message : 'Wing 업로드 실패'),
          });
        }}
        className="shrink-0 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
      >
        이 listing 으로 올리기
      </button>
    </div>
  );
}
