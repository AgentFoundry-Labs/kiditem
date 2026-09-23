'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useWingRegister } from '../../../_shared/hooks/useThumbnailGenerations';
import { fetchRepresentativeImageListingChoices, representativeImageUploadedMessage, representativeImageUploadReached } from '../../../_shared/lib/representative-image-execution';

/**
 * 판매상품에 대표이미지를 받는 채널의 리스팅이 여럿이라 준비가 거절된(`ambiguous_listing`) 생성에서, 운영자가
 * 올릴 리스팅을 고르고 그 리스팅으로 다시 올린다. 몰 이름은 리스팅 줄이 말하고 이 화면은 몰을 모른다(KID-321).
 */
export function ListingPicker({ generationId, onDone }: { generationId: string; onDone: () => void }) {
  const choices = useQuery({
    queryKey: queryKeys.thumbnailExecutions.listingChoices(generationId),
    queryFn: () => fetchRepresentativeImageListingChoices(generationId),
  });
  const register = useWingRegister();
  const [picked, setPicked] = useState<string>('');
  const selected = picked || choices.data?.[0]?.channelListingId || '';

  if (choices.isLoading) return <p className="text-[11px] text-slate-500">올릴 수 있는 리스팅을 읽는 중…</p>;
  if (!choices.data?.length) return <p className="text-[11px] text-slate-500">고를 수 있는 리스팅이 없습니다</p>;

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <select
        aria-label="올릴 리스팅"
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
              if (!representativeImageUploadReached(result)) {
                toast.error(result.error ?? '대표이미지를 올리지 못했습니다');
                return;
              }
              toast.success(representativeImageUploadedMessage());
              onDone();
            },
            onError: (error) => toast.error(error instanceof Error ? error.message : '대표이미지를 올리지 못했습니다'),
          });
        }}
        className="shrink-0 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
      >
        이 리스팅으로 올리기
      </button>
    </div>
  );
}
