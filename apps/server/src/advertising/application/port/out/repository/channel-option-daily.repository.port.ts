// Option-day winner state a scraped option row carries
// (`ChannelListingOptionDailySnapshot` columns). The repository port and
// adapter are gone (KID-372); the scrape row normalizer still reads this shape.

export interface ListingOptionDailyState {
  optionName?: string | null;
  salePrice?: number | null;
  stockQty?: number | null;
  saleStatus?: string | null;
  isActive?: boolean | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
}
