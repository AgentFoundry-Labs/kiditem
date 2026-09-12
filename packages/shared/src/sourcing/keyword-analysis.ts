import { z } from 'zod';

const InstantSchema = z.string().datetime({ offset: true });
const KeywordTextSchema = z.string().trim().min(1).max(100);
const BoundedTextSchema = z.string().trim().max(500);
const BoundedIdentifierSchema = z.string().trim().min(1).max(500);
const BoundedUnsignedIntegerSchema = z.number().int().nonnegative().max(2_147_483_647);
const BoundedUnsignedMetricSchema = z.number().finite().nonnegative().max(2_147_483_647);
const BoundedSignedMetricSchema = z.number().finite().min(-2_147_483_647).max(2_147_483_647);
const NullableUnsignedMetricSchema = BoundedUnsignedMetricSchema.nullable();
const CalendarDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const SourcingKeywordAnalysisActionSchema = z.enum([
  'trend_agent',
  'popular',
  'compare',
  'related',
]);

export const SourcingKeywordAnalysisInputSchema = z
  .object({
    action: SourcingKeywordAnalysisActionSchema,
    keyword: KeywordTextSchema.optional(),
    keywords: z.array(KeywordTextSchema).min(1).max(50).optional(),
    timeUnit: z.enum(['date', 'week', 'month']).default('date'),
    gender: z.enum(['all', 'm', 'f']).default('all'),
    age: z.string().trim().min(1).max(20).default('all'),
    device: z.enum(['all', 'pc', 'mo']).default('all'),
    selectedBoardKey: z.string().trim().min(1).max(60).default('all'),
    rankLimit: z.number().int().min(1).max(100).default(20),
    focusMode: z.enum(['all', 'toy_stationery', 'kids']).default('all'),
    finalLimit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === 'related' && !input.keyword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'keyword_required',
        path: ['keyword'],
      });
    }
    if (input.action === 'compare' && !input.keywords?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'keywords_required',
        path: ['keywords'],
      });
    }
  });

export const SourcingNaverDatalabPopularKeywordBoardKeySchema = z.enum([
  'all_categories',
  'birth_kids',
  'toys_dolls',
  'stationery_office',
  'kids_fashion',
  'toys_block',
  'toys_action',
  'fancy_sticker',
  'fancy_goods',
  'stationery_writing',
  'toys_roleplay',
  'toys_puzzle',
  'fancy_diary',
  'stationery_note',
]);

export const SourcingNaverRelatedKeywordSchema = z
  .object({
    keyword: KeywordTextSchema,
    monthlyPcSearchCount: NullableUnsignedMetricSchema,
    monthlyMobileSearchCount: NullableUnsignedMetricSchema,
    monthlyTotalSearchCount: NullableUnsignedMetricSchema,
    monthlyPcClickCount: NullableUnsignedMetricSchema,
    monthlyMobileClickCount: NullableUnsignedMetricSchema,
    monthlyTotalClickCount: NullableUnsignedMetricSchema,
    monthlyPcClickRate: NullableUnsignedMetricSchema,
    monthlyMobileClickRate: NullableUnsignedMetricSchema,
    averageAdRank: NullableUnsignedMetricSchema,
    competitionIndex: BoundedTextSchema.nullable(),
  })
  .strict();

export const SourcingNaverAutocompleteKeywordSchema = z
  .object({
    keyword: KeywordTextSchema,
    rank: z.number().int().min(1).max(100),
    source: z.literal('naver-search-autocomplete'),
  })
  .strict();

export const SourcingNaverAutocompleteKeywordResultSchema = z
  .object({
    source: z.literal('naver-search-autocomplete'),
    keyword: KeywordTextSchema,
    generatedAt: InstantSchema,
    items: z.array(SourcingNaverAutocompleteKeywordSchema).max(30),
  })
  .strict();

export const SourcingNaverRelatedKeywordResultSchema = z
  .object({
    source: z.literal('naver-searchad-keywordstool'),
    seedKeywords: z.array(KeywordTextSchema).min(1).max(12),
    generatedAt: InstantSchema,
    items: z.array(SourcingNaverRelatedKeywordSchema).max(100),
  })
  .strict();

export const SourcingNaverDatalabTrendPointSchema = z
  .object({
    period: BoundedIdentifierSchema,
    ratio: BoundedUnsignedMetricSchema,
  })
  .strict();

export const SourcingNaverDatalabKeywordTrendSchema = z
  .object({
    keyword: KeywordTextSchema,
    latestRatio: BoundedUnsignedMetricSchema,
    previousAverageRatio: BoundedUnsignedMetricSchema,
    peakRatio: BoundedUnsignedMetricSchema,
    trendDelta: BoundedSignedMetricSchema,
    trendRate: BoundedSignedMetricSchema.nullable(),
    data: z.array(SourcingNaverDatalabTrendPointSchema).max(400),
  })
  .strict();

export const SourcingNaverDatalabSearchTrendResultSchema = z
  .object({
    source: z.literal('naver-datalab-search-trend'),
    keywords: z.array(KeywordTextSchema).min(1).max(50),
    startDate: CalendarDateSchema,
    endDate: CalendarDateSchema,
    timeUnit: z.enum(['date', 'week', 'month']),
    generatedAt: InstantSchema,
    items: z.array(SourcingNaverDatalabKeywordTrendSchema).max(50),
  })
  .strict();

export const SourcingNaverDatalabPopularKeywordRankSchema = z
  .object({
    rank: z.number().int().min(1).max(100),
    keyword: KeywordTextSchema,
    linkId: BoundedTextSchema.nullable(),
    categories: z.array(BoundedTextSchema).max(20),
    isNew: z.boolean().optional(),
    previousRank: z.number().int().min(1).max(100).nullable().optional(),
    rankDelta: z.number().int().min(-99).max(99).nullable().optional(),
  })
  .strict();

export const SourcingNaverDatalabPopularKeywordBoardSchema = z
  .object({
    key: SourcingNaverDatalabPopularKeywordBoardKeySchema,
    label: BoundedIdentifierSchema,
    cid: BoundedUnsignedIntegerSchema.nullable(),
    categoryPath: BoundedTextSchema,
    date: z.string().trim().max(100),
    datetime: z.string().trim().max(100),
    range: z.string().trim().max(200),
    ranks: z.array(SourcingNaverDatalabPopularKeywordRankSchema).max(100),
    error: BoundedTextSchema.nullable().optional(),
  })
  .strict();

export const SourcingNaverDatalabPopularKeywordResultSchema = z
  .object({
    source: z.literal('naver-datalab-shopping-keyword-rank'),
    timeUnit: z.enum(['date', 'week', 'month']),
    startDate: CalendarDateSchema,
    endDate: CalendarDateSchema,
    device: z.enum(['pc', 'mo']).nullable(),
    gender: z.enum(['m', 'f']).nullable(),
    ages: z.array(z.string().trim().min(1).max(20)).max(12),
    generatedAt: InstantSchema,
    boards: z.array(SourcingNaverDatalabPopularKeywordBoardSchema).max(20),
  })
  .strict();

export const SourcingKeywordAnalysisSnapshotSchema = z
  .object({
    version: z.literal('naver-keyword-analysis/v1'),
    generatedAt: InstantSchema,
    input: SourcingKeywordAnalysisInputSchema,
    result: z.object({
      popular: SourcingNaverDatalabPopularKeywordResultSchema.nullable(),
      related: SourcingNaverRelatedKeywordResultSchema.nullable(),
      autocomplete: z.array(SourcingNaverAutocompleteKeywordResultSchema).max(5),
      trends: SourcingNaverDatalabSearchTrendResultSchema.nullable(),
    }).strict(),
  })
  .strict();

export const SourcingKeywordAnalysisSnapshotResponseSchema =
  SourcingKeywordAnalysisSnapshotSchema.nullable();

export type SourcingKeywordAnalysisInput = z.infer<typeof SourcingKeywordAnalysisInputSchema>;
export type SourcingNaverDatalabPopularKeywordBoardKey =
  z.infer<typeof SourcingNaverDatalabPopularKeywordBoardKeySchema>;
export type SourcingNaverRelatedKeyword = z.infer<typeof SourcingNaverRelatedKeywordSchema>;
export type SourcingNaverAutocompleteKeyword = z.infer<typeof SourcingNaverAutocompleteKeywordSchema>;
export type SourcingNaverAutocompleteKeywordResult =
  z.infer<typeof SourcingNaverAutocompleteKeywordResultSchema>;
export type SourcingNaverRelatedKeywordResult = z.infer<typeof SourcingNaverRelatedKeywordResultSchema>;
export type SourcingNaverDatalabTrendPoint = z.infer<typeof SourcingNaverDatalabTrendPointSchema>;
export type SourcingNaverDatalabKeywordTrend = z.infer<typeof SourcingNaverDatalabKeywordTrendSchema>;
export type SourcingNaverDatalabSearchTrendResult =
  z.infer<typeof SourcingNaverDatalabSearchTrendResultSchema>;
export type SourcingNaverDatalabPopularKeywordRank =
  z.infer<typeof SourcingNaverDatalabPopularKeywordRankSchema>;
export type SourcingNaverDatalabPopularKeywordBoard =
  z.infer<typeof SourcingNaverDatalabPopularKeywordBoardSchema>;
export type SourcingNaverDatalabPopularKeywordResult =
  z.infer<typeof SourcingNaverDatalabPopularKeywordResultSchema>;
export type SourcingKeywordAnalysisSnapshot = z.infer<typeof SourcingKeywordAnalysisSnapshotSchema>;
export type SourcingKeywordAnalysisSnapshotResponse =
  z.infer<typeof SourcingKeywordAnalysisSnapshotResponseSchema>;
