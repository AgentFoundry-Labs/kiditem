/** What an operator marks as worth watching: a keyword, a category, or one product. */
export type SourcingInterestTargetType = 'keyword' | 'category' | 'product';

/** Where an interest target was raised from. */
export type SourcingInterestTargetSource =
  | 'keyword_analysis'
  | 'today_recommendation'
  | 'wing_catalog'
  | 'manual';
