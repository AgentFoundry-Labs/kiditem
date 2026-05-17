'use client';

import { ExternalLink, PackagePlus, Store } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { ProductInboxCardShell } from '../../_shared/components/inbox/ProductInboxCardShell';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

interface RegisteredListingCardProps {
  listing: RegisteredChannelListing;
  selected?: boolean;
  onOpen: (listing: RegisteredChannelListing) => void;
  onManageProduct: (listing: RegisteredChannelListing) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
}

export function RegisteredListingCard({
  listing,
  selected = false,
  onOpen,
  onManageProduct,
  onSelectedChange,
}: RegisteredListingCardProps) {
  const title = listing.channelName || listing.masterName;
  const channelLabel = channelDisplayName(listing.channel);
  const accountLabel = listing.channelAccountName ?? '계정 미지정';
  const isMatchedToMasterProduct = Boolean(listing.masterId);

  return (
    <ProductInboxCardShell
      title={title}
      thumbnailUrl={listing.thumbnailUrl}
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
          <div className="truncate">{listing.masterCode} · {listing.externalId}</div>
          {listing.channelPrice != null ? (
            <div className="text-[var(--text-primary)]">{formatKRW(listing.channelPrice)}원</div>
          ) : (
            <div className="text-[var(--text-muted)]">가격 미지정</div>
          )}
        </div>
      }
      footer={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (isMatchedToMasterProduct) onManageProduct(listing);
          }}
          disabled={!isMatchedToMasterProduct}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-extrabold shadow-sm transition-all',
            isMatchedToMasterProduct
              ? 'border-[var(--text-primary)] bg-white text-[var(--text-primary)] hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:shadow-emerald-100'
              : 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700',
          )}
        >
          {isMatchedToMasterProduct ? (
            <>
              <ExternalLink size={13} /> 상품 관리
            </>
          ) : (
            <>
              <PackagePlus size={13} /> 재고 상품 등록 필요
            </>
          )}
        </button>
      }
    />
  );
}

export function channelDisplayName(channel: string): string {
  const key = channel.toLowerCase();
  if (key === 'coupang') return '쿠팡';
  if (key === 'naver' || key === 'smartstore') return '스마트스토어';
  if (key === '11st') return '11번가';
  if (key === 'esm' || key === 'esmplus') return 'ESM Plus';
  return channel;
}
