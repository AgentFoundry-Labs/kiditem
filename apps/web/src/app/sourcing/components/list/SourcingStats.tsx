'use client';

interface Props {
  draftCount: number;
  totalCount: number;
  firstThumbnailUrl?: string | null;
}

export default function SourcingStats({ draftCount, totalCount, firstThumbnailUrl }: Props) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <span className="text-gray-600 font-medium text-sm">
          등록을 기다리는 상품{' '}
          <span className="font-extrabold text-gray-900 ml-1 text-base">
            {draftCount}개
          </span>
        </span>
      </div>
      <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-gray-600 font-medium text-sm">
            전체 상품{' '}
            <span className="font-extrabold text-gray-900 ml-1 text-base">
              {totalCount}개
            </span>
          </span>
          {totalCount > 0 && firstThumbnailUrl && (
            <img
              src={firstThumbnailUrl}
              alt="Thumb"
              className="w-8 h-8 rounded border object-cover"
            />
          )}
        </div>
      </div>
    </div>
  );
}
