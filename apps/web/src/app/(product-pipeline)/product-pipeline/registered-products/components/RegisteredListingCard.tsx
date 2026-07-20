'use client';

import { ExternalLink, Store, Trash2 } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { ProductInboxCardShell } from '../../_shared/components/inbox/ProductInboxCardShell';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

interface RegisteredListingCardProps {
  listing: RegisteredChannelListing;
  selected?: boolean;
  onOpen: (listing: RegisteredChannelListing) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
  /**
   * ⚠️ 파괴적. 우리가 등록한 상품(`sourceCandidateId` 있음)에만 전달된다.
   * 넘어오지 않으면 삭제 진입점 자체를 렌더하지 않는다.
   */
  onRequestDelete?: (listing: RegisteredChannelListing) => void;
}

export function RegisteredListingCard({
  listing,
  selected = false,
  onOpen,
  onSelectedChange,
  onRequestDelete,
}: RegisteredListingCardProps) {
  const title = listing.listingName;
  const channelLabel = channelDisplayName(listing.channel);
  const accountLabel = listing.channelAccountName ?? '계정 미지정';
  const mappingLabel = mappingStatusLabel(listing.mappingStatus);

  return (
    <ProductInboxCardShell
      title={title}
      thumbnailUrl={listing.contentWorkspaceId ? listing.thumbnailUrl : null}
      clickArea="card"
      imageFallback="No Image"
      onOpen={() => onOpen(listing)}
      selectionAction={onSelectedChange
        ? {
            checked: selected,
            ariaLabel: `${title} 선택`,
            onChange: (checked) => onSelectedChange(listing.id, checked),
          }
        : undefined}
      thumbnailTopLeft={
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {channelLabel}
          </span>
          <span className="w-fit max-w-full rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {listing.status || '등록'}
          </span>
          <span className="w-fit max-w-full rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 backdrop-blur-sm">
            {mappingLabel}
          </span>
        </div>
      }
      hoverAction={{
        icon: <Store size={13} />,
        label: '작업 화면 열기',
        onClick: () => onOpen(listing),
      }}
      meta={
        <div className="space-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <div className="truncate">{accountLabel}</div>
          <div className="truncate">{listing.externalId} · 옵션 {listing.optionCount}개</div>
          <div className={listing.contentWorkspaceId ? 'text-emerald-700' : 'text-amber-700'}>
            {listing.contentWorkspaceId ? '콘텐츠 연결됨' : '콘텐츠 미연결'}
          </div>
          {listing.channelPrice != null ? (
            <div className="text-[var(--text-primary)]">{formatKRW(listing.channelPrice)}원</div>
          ) : (
            <div className="text-[var(--text-muted)]">가격 미지정</div>
          )}
        </div>
      }
      footer={
        <div className="flex w-full items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(listing);
            }}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--text-primary)] bg-white text-[12px] font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:shadow-emerald-100"
          >
            <ExternalLink size={13} /> 콘텐츠 관리
          </button>
          {onRequestDelete && (
            <button
              type="button"
              aria-label={`${title} 삭제`}
              title="쿠팡에서 삭제"
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(listing);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition-all hover:border-rose-600 hover:bg-rose-600 hover:text-white"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      }
    />
  );
}

function mappingStatusLabel(status: RegisteredChannelListing['mappingStatus']): string {
  if (status === 'matched') return '재고 매칭 완료';
  if (status === 'needs_review') return '재고 매칭 검토';
  return '재고 매칭 필요';
}

export function channelDisplayName(channel: string): string {
  const key = channel.toLowerCase();
  if (key === 'coupang') return '쿠팡';
  if (key === 'naver' || key === 'smartstore') return '스마트스토어';
  if (key === '11st') return '11번가';
  if (key === 'esm' || key === 'esmplus') return 'ESM Plus';
  return channel;
}
