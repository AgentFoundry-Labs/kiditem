import { z } from 'zod';

const instant = z.string().datetime({ offset: true });
const nullableText = z.string().max(2_000).nullable();
const nullableNumber = z.number().finite().nullable();
const count = z.number().int().nonnegative();
const rate = z.number().finite().min(0).max(1);
const linkfoxRegion = z.enum([
  'US', 'GB', 'ID', 'TH', 'PH', 'MY', 'VN', 'MX',
  'SG', 'SA', 'BR', 'ES', 'JP', 'DE', 'IT', 'FR',
]);

const googleSource = z.object({
  source: z.literal('google-trends-rss'),
  generatedAt: instant,
  items: z.array(z.object({
    externalId: z.string().min(1).max(1_000),
    source: z.literal('google-trends-rss'),
    title: z.string().max(1_000),
    rawTitle: z.string().max(1_000),
    approximateTraffic: nullableNumber,
    approximateTrafficLabel: nullableText,
    publishedAt: nullableText,
    sourceUrl: nullableText,
    newsItems: z.array(z.object({
      title: nullableText,
      url: nullableText,
      source: nullableText,
    }).strict()).max(100),
    relevanceLabel: nullableText,
  }).strip()).max(100),
}).strict();

const linkfoxSource = z.object({
  source: z.literal('linkfox-echotik-new-product-rank'),
  generatedAt: instant,
  date: z.string().max(100),
  region: linkfoxRegion,
  pageSize: count,
  total: count.nullable(),
  costToken: nullableNumber,
  products: z.array(z.object({
    asin: z.string().max(200).nullable(),
    title: z.string().max(1_000).nullable(),
    region: linkfoxRegion,
    price: nullableNumber,
    minPrice: nullableNumber,
    maxPrice: nullableNumber,
    currency: z.string().max(40).nullable(),
    totalSaleCnt: count.nullable(),
    totalSale30dCnt: count.nullable(),
    gmv: nullableNumber,
    salesTrendFlagText: z.string().max(500).nullable(),
    videoCount: count.nullable(),
    liveCount: count.nullable(),
    influencerCount: count.nullable(),
    commission: nullableNumber,
    rating: nullableNumber,
    reviewCount: count.nullable(),
    availableDate: z.string().max(100).nullable(),
    categoryId: z.string().max(200).nullable(),
    imageUrls: z.array(z.string().max(2_000)).max(100),
  }).strip()).max(100),
}).strict();

const stringList = z.array(z.string().max(500)).max(500);
const baseline = z.object({
  naverKeywordCount: count,
  naverPopularKeywordCount: count,
  hot1688Count: count,
  shortsCount: count,
  evidenceGroupCount: count,
  relevanceLabels: stringList,
}).strict();
const googleEvaluation = z.object({
  signalCount: count,
  relevantSignalCount: count,
  relevanceRate: rate,
  relevanceLabels: stringList,
  overlapLabels: stringList,
  novelLabels: stringList,
}).strict();
const linkfoxEvaluation = z.object({
  status: z.enum(['disabled', 'not_in_pilot', 'configuration_error', 'complete', 'failed']),
  region: linkfoxRegion.nullable(),
  productCount: count,
  relevantProductCount: count,
  freshProductCount: count,
  evidenceCompleteness: rate,
  costPoints: nullableNumber,
  relevanceLabels: stringList,
}).strict();
const pairedComparison = z.object({
  controlEvidenceGroupCount: count,
  treatmentProductCount: count,
  overlapCount: count,
  novelRelevantCount: count,
  freshCount: count,
  evidenceCompleteness: rate,
  costPoints: nullableNumber,
}).strict();

export const MarketShadowSnapshotDocumentSchema = z.object({
  version: z.literal(1),
  input: z.object({
    experiment: z.literal('paired-shadow-v1'),
    sources: z.array(z.string().max(100)).max(10),
    seedKeywords: z.array(z.string().max(200)).max(500),
    windowDays: z.literal(30),
  }).strict(),
  result: z.object({
    status: z.enum(['collecting', 'complete', 'partial', 'failed']),
    decisionImpact: z.literal('disabled'),
    sources: z.array(z.union([googleSource, linkfoxSource])).max(2),
    evaluation: z.object({
      baseline,
      googleTrends: googleEvaluation,
      linkfoxEchoTik: linkfoxEvaluation,
      pairedComparison,
      promotionGate: z.object({
        minimumObservationDays: z.literal(30),
        observedDays: count,
        reviewReady: z.boolean(),
        eligible: z.literal(false),
      }).strict(),
    }).strict(),
    errors: z.array(z.object({
      source: z.string().max(100),
      message: z.string().max(1_000),
    }).strict()).max(20),
  }).strict(),
  meta: z.object({
    generatedAt: instant,
    generationSource: z.literal('scheduled'),
    generatorVersion: z.literal('market-shadow-signals.v1'),
  }).strict(),
}).strict();

export type MarketShadowSnapshotDocument = z.infer<typeof MarketShadowSnapshotDocumentSchema>;
