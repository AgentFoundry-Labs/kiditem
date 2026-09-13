import { z } from 'zod';
import {
  SourcingWingCatalogKeywordSchema,
  sourcingWingCatalogKeywordIdentity,
} from './browser-operations.js';

const InstantSchema = z.string().datetime({ offset: true });
const NullableBoundedTextSchema = z.string().trim().max(500).nullable();
const NullableBoundedMetricSchema = z.number().finite().nonnegative().max(2_147_483_647).nullable();

const sourcing1688QueryRules: ReadonlyArray<{
  terms: readonly string[];
  query: string;
}> = [
  { terms: ['말랑이', '스퀴시', '스트레스볼', '악뿌볼'], query: '解压玩具捏捏乐' },
  { terms: ['슬라임'], query: '儿童史莱姆玩具' },
  { terms: ['잔디인형', '인형'], query: '儿童毛绒玩具' },
  { terms: ['도장'], query: '儿童印章玩具' },
  { terms: ['레고', '블록'], query: '积木玩具' },
  { terms: ['우산'], query: '儿童雨伞' },
  { terms: ['물총'], query: '儿童水枪玩具' },
  { terms: ['목욕놀이', '목욕'], query: '儿童洗澡玩具' },
  { terms: ['필통'], query: '儿童笔袋文具盒' },
  { terms: ['선글라스'], query: '儿童太阳镜' },
  { terms: ['쿨매트', '냉감매트'], query: '婴儿凉席垫' },
  { terms: ['보드게임'], query: '儿童桌游玩具' },
  { terms: ['물놀이', '스프링 매트', '매트'], query: '儿童喷水戏水垫' },
  { terms: ['헤어핀', '머리핀'], query: '儿童发夹' },
  { terms: ['양말'], query: '儿童袜子' },
  { terms: ['모래놀이'], query: '儿童沙滩玩具' },
  { terms: ['스티커북', '스티커'], query: '儿童贴纸书' },
  { terms: ['앞치마'], query: '儿童围裙' },
  { terms: ['물컵', '빨대컵'], query: '儿童水杯' },
  { terms: ['방수팩'], query: '儿童防水袋' },
  { terms: ['캐리어'], query: '儿童行李箱' },
  { terms: ['퍼즐'], query: '儿童拼图玩具' },
  { terms: ['캠핑의자', '의자'], query: '儿童露营椅' },
  { terms: ['젤리슈즈', '샌들', '신발'], query: '儿童洞洞鞋凉鞋' },
  { terms: ['베개', '枕'], query: '儿童凉感枕套' },
  { terms: ['선풍기', '팬'], query: '婴儿车夹扇USB风扇' },
  { terms: ['주차번호판'], query: '汽车临时停车号码牌' },
  { terms: ['강아지계단'], query: '宠物楼梯' },
  { terms: ['안전벨트클립'], query: '汽车安全带夹' },
  { terms: ['식탁매트'], query: '儿童餐垫' },
];

export function buildSourcing1688TargetId(input: {
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
}): string {
  return `${input.productId}:${input.itemId ?? ''}:${input.vendorItemId ?? ''}`;
}

export function deriveSourcing1688SearchQuery(input: {
  productName: string;
  primaryKeyword: string;
  keywords: readonly string[];
}): string {
  const haystack = normalizeSourcing1688QueryText([
    input.productName,
    input.primaryKeyword,
    ...input.keywords,
  ].join(' '));
  const rule = sourcing1688QueryRules.find((candidate) =>
    candidate.terms.some((term) =>
      haystack.includes(normalizeSourcing1688QueryText(term))));
  if (rule) return rule.query;
  return stripSourcing1688QueryNoise(
    input.primaryKeyword || input.keywords[0] || input.productName,
  ).slice(0, 40);
}

function stripSourcing1688QueryNoise(value: string): string {
  return value
    .replace(/\b(쿠팡|로켓배송|무료배송|당일배송|신상|인기|정품)\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeSourcing1688QueryText(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/\s+/gu, '');
}

export const Sourcing1688TargetIdSchema = z.string()
  .trim()
  .min(3)
  .max(600)
  .regex(/^[A-Za-z0-9._-]+:[A-Za-z0-9._-]*:[A-Za-z0-9._-]*$/u);

export const Sourcing1688KeywordBatchInputSchema = z
  .object({
    keywords: z.array(SourcingWingCatalogKeywordSchema).min(1).max(6),
  })
  .strict()
  .superRefine((value, context) => {
    const identities = new Set<string>();
    value.keywords.forEach((keyword, index) => {
      const identity = sourcingWingCatalogKeywordIdentity(keyword);
      if (identities.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['keywords', index],
          message: '1688 keywords must be unique after normalization.',
        });
      }
      identities.add(identity);
    });
  });

export const Sourcing1688ImageMatchInputSchema = z
  .object({
    targetIds: z.array(Sourcing1688TargetIdSchema).min(1).max(24),
  })
  .strict()
  .superRefine((value, context) => {
    const identities = new Set<string>();
    value.targetIds.forEach((targetId, index) => {
      if (identities.has(targetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetIds', index],
          message: '1688 image-match target IDs must be unique.',
        });
      }
      identities.add(targetId);
    });
  });

export const Sourcing1688SearchItemSchema = z
  .object({
    offerId: z.string().trim().min(1).max(200).nullable(),
    title: z.string().trim().min(1).max(500),
    priceCny: NullableBoundedMetricSchema,
    sourceUrl: z.string().trim().url().max(2_000),
    imageUrl: z.string().trim().url().max(2_000).nullable(),
    score: z.number().finite().min(0).max(100).nullable(),
    monthlySales: NullableBoundedMetricSchema,
    tradeScore: NullableBoundedMetricSchema,
    repurchaseRate: NullableBoundedTextSchema,
    supplierName: NullableBoundedTextSchema,
    salesText: NullableBoundedTextSchema,
    supplierFactoryUrl: z.string().trim().url().max(2_000).nullable(),
    supplierTags: z.array(z.string().trim().min(1).max(120)).max(40),
    purchaseTags: z.array(z.string().trim().min(1).max(120)).max(40),
    minOrderQuantity: NullableBoundedMetricSchema,
    shippingFulfillmentRate: NullableBoundedTextSchema,
    shippingPickupRate: NullableBoundedTextSchema,
    shipFrom: NullableBoundedTextSchema,
    serviceScore: NullableBoundedMetricSchema,
  })
  .strict();

export const Sourcing1688SearchObservationSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    targetId: Sourcing1688TargetIdSchema.nullable(),
    capturedAt: InstantSchema,
    items: z.array(Sourcing1688SearchItemSchema).max(40),
  })
  .strict();

export const Sourcing1688SearchSnapshotSchema = z
  .object({
    generatedAt: InstantSchema.nullable(),
    observations: z.array(Sourcing1688SearchObservationSchema).max(30),
    sourceStatuses: z.array(z.object({
      keyword: SourcingWingCatalogKeywordSchema,
      targetId: Sourcing1688TargetIdSchema.nullable(),
      ready: z.boolean(),
      latestAttemptId: z.string().uuid().nullable(),
      latestAttemptState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']).nullable(),
      actualCutoffAt: InstantSchema.nullable(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
    }).strict()).max(30),
  })
  .strict();

export const Sourcing1688BatchUnitResultSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    targetId: Sourcing1688TargetIdSchema.nullable(),
    outcome: z.enum(['complete', 'no_change', 'failed']),
    discovered: z.number().int().nonnegative().max(2_147_483_647),
    accepted: z.number().int().nonnegative().max(2_147_483_647),
    duplicate: z.number().int().nonnegative().max(2_147_483_647),
    failed: z.number().int().nonnegative().max(2_147_483_647),
    errorCode: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const BoundedCountSchema = z.number().int().nonnegative().max(2_147_483_647);

export const Sourcing1688BatchResultSchema = z.object({
    outcome: z.enum(['complete', 'partial', 'no_change']),
    summary: z.object({
      discovered: BoundedCountSchema,
      accepted: BoundedCountSchema,
      duplicate: BoundedCountSchema,
      unchanged: BoundedCountSchema,
      failed: BoundedCountSchema,
    }).strict(),
    sources: z.array(z.object({
      source: z.string().trim().min(1).max(120),
      outcome: z.enum(['complete', 'partial', 'no_change', 'failed', 'skipped']),
      accepted: BoundedCountSchema,
      failed: BoundedCountSchema,
      errorCode: z.string().trim().min(1).max(120).optional(),
    }).strict()).max(32),
    snapshotGeneratedAt: InstantSchema.optional(),
    units: z.array(Sourcing1688BatchUnitResultSchema).min(1).max(24),
  })
  .strict();

export type Sourcing1688KeywordBatchInput = z.infer<
  typeof Sourcing1688KeywordBatchInputSchema
>;
export type Sourcing1688ImageMatchInput = z.infer<
  typeof Sourcing1688ImageMatchInputSchema
>;
export type Sourcing1688SearchItem = z.infer<
  typeof Sourcing1688SearchItemSchema
>;
export type Sourcing1688SearchObservation = z.infer<
  typeof Sourcing1688SearchObservationSchema
>;
export type Sourcing1688SearchSnapshot = z.infer<
  typeof Sourcing1688SearchSnapshotSchema
>;
export type Sourcing1688BatchUnitResult = z.infer<
  typeof Sourcing1688BatchUnitResultSchema
>;
export type Sourcing1688BatchResult = z.infer<
  typeof Sourcing1688BatchResultSchema
>;
