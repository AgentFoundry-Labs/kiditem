'use client';

import { ExternalLink, Store } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { ProductInboxCardShell } from '../../_shared/components/inbox/ProductInboxCardShell';
import type { RegisteredProductGroup } from '../lib/channel-listings-api';
import { channelDisplayName } from './RegisteredListingCard';

interface RegisteredProductGroupCardProps {
  group: RegisteredProductGroup;
  selected?: boolean;
  onOpen: (group: RegisteredProductGroup) => void;
  onManageProduct: (group: RegisteredProductGroup) => void;
  onSelectedChange?: (masterId: string, selected: boolean) => void;
}

export function RegisteredProductGroupCard({
  group,
  selected = false,
  onOpen,
  onManageProduct,
  onSelectedChange,
}: RegisteredProductGroupCardProps) {
  const primaryListing = group.listings[0] ?? null;
  const channelLabels = [...new Set(group.listings.map((listing) => channelDisplayName(listing.channel)))];

  return (
    <ProductInboxCardShell
      title={group.masterName}
      thumbnailUrl={group.thumbnailUrl}
      clickArea="card"
      imageFallback="No Image"
      onOpen={() => onOpen(group)}
      selectionAction={onSelectedChange
        ? {
            checked: selected,
            ariaLabel: `${group.masterName} 선택`,
            onChange: (checked) => onSelectedChange(group.masterId, checked),
          }
        : undefined}
      thumbnailTopLeft={
        <div className="flex flex-col gap-1">
          <span className="w-fit rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {channelLabels.slice(0, 2).join(' · ') || '마켓'}
          </span>
          <span className="w-fit rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {group.listingCount}개 등록
          </span>
        </div>
      }
      hoverAction={{
        icon: <Store size={13} />,
        label: '등록 작업 열기',
        onClick: () => onOpen(group),
      }}
      meta={
        <div className="space-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <div className="truncate">{group.masterCode}</div>
          {primaryListing ? (
            <div className="truncate">
              {channelDisplayName(primaryListing.channel)}
              {primaryListing.channelAccountName ? ` · ${primaryListing.channelAccountName}` : ''}
              {' · '}
              {primaryListing.externalId}
            </div>
          ) : (
            <div className="truncate">마켓 등록 정보 없음</div>
          )}
          <div className="text-[var(--text-primary)]">
            {primaryListing?.channelPrice != null
              ? `${formatKRW(primaryListing.channelPrice)}원`
              : '가격 미지정'}
          </div>
        </div>
      }
      footer={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onManageProduct(group);
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--text-primary)] bg-white text-[12px] font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:shadow-emerald-100"
        >
          <ExternalLink size={13} /> 상품 관리
        </button>
      }
    />
  );
}
