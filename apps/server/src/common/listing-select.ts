import type { Prisma } from '@prisma/client';

/**
 * ChannelListing hydrate — master + category + grade + thumbnail 포함.
 * B2c 의 statistics/settlements 공통 사용. supplier-stats 는 별도 prisma 쿼리 (optionId join).
 * B2b 의 LISTING_SUMMARY_SELECT (advertising/services/types.ts) 와는 별도 유지 — advertising 축소 버전.
 */
export const LISTING_WITH_MASTER_SELECT_EXTENDED = {
  id: true,
  externalId: true,
  channel: true,
  channelName: true,
  isDeleted: true,
  master: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      abcGrade: true,
      thumbnailUrl: true,
    },
  },
} as const satisfies Prisma.ChannelListingSelect;
