'use client';

import { findChannel } from '@kiditem/shared/channel-registry';
import { ExternalLink, Store, Trash2 } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { RegistrationStateBadge } from '@/app/(channels)/_shared/components/RegistrationStateBadge';
import { ProductInboxCardShell } from '../../_shared/components/inbox/ProductInboxCardShell';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

interface RegisteredListingCardProps {
  listing: RegisteredChannelListing;
  selected?: boolean;
  onOpen: (listing: RegisteredChannelListing) => void;
  onSelectedChange?: (id: string, selected: boolean) => void;
  /**
   * ⚠️ 파괴적. 우리가 등록한 상품(`sourceRecordId` 있음)에만 전달된다.
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
          {/* 판매상품이 있는 리스팅은 등록 상태 reader 값을, 없으면 몰 원문 상태를 보인다(KID-320). */}
          {listing.registration ? (
            <RegistrationStateBadge account={listing.registration} className="max-w-full" />
          ) : (
            <span className="w-fit max-w-full rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {listing.status || '등록'}
            </span>
          )}
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

/**
 * 저장된 채널 문자열 → 채널 키.
 *
 * 이 표가 있는 이유는 **오래된 행이 남긴 철자** 때문이다. 스마트스토어를 `naver` 로,
 * 지마켓 ESM 을 `esm`·`esmplus` 로 적어 둔 리스팅이 아직 있다. 새 이름을 여기 더하지
 * 않는다 — 몰이 늘어도 채널 레지스트리에 한 줄이면 화면이 따라온다.
 *
 * 쿠팡 로켓은 WING(`coupang`)과 별개 채널이라 접지 않는다. 합치면 사입/로켓 매출이 섞인다.
 */
const LEGACY_CHANNEL_SPELLING: Readonly<Record<string, string>> = {
  naver: 'smartstore',
  esm: 'gmarket',
  esmplus: 'gmarket',
};

/** 화면에 적을 채널 이름. 이름의 권위는 채널 레지스트리 하나다. */
export function channelDisplayName(channel: string): string {
  const key = channel.toLowerCase();
  const canonical = LEGACY_CHANNEL_SPELLING[key] ?? key;
  return findChannel(canonical)?.name ?? channel;
}
