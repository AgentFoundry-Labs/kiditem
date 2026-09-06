import { z } from 'zod';
import { zIsoDate } from './common';

const timestamp = zIsoDate
  .transform((value) => (value instanceof Date ? value.toISOString() : value))
  .pipe(z.string().datetime());
const text = z.string().refine((value) => value.trim().length > 0);

export const SellerIdentitySourceBeginSchema = z.object({}).strict();
export const SellerIdentityTargetSchema = z
  .object({
    keyword: text,
    productKey: text,
    productId: z.string().nullable(),
    vendorItemId: z.string().nullable(),
    name: z.string(),
    link: text,
    rank: z.number().int().positive(),
    matchScore: z.number().finite(),
  })
  .strict();
export type SellerIdentityTarget = z.infer<typeof SellerIdentityTargetSchema>;
export const SellerIdentitySourcePlanSchema = z
  .object({
    sourceType: z.literal('coupang_competitor_seller_identity'),
    parserVersion: z.literal('seller-identity-v1'),
    days: z.literal(30),
    limit: z.literal(200),
    targets: z.array(SellerIdentityTargetSchema).max(200),
  })
  .strict();
export type SellerIdentitySourcePlan = z.infer<
  typeof SellerIdentitySourcePlanSchema
>;

export const SellerIdentitySourceCaptureSchema = z
  .object({
    capturedAt: timestamp,
    identities: z
      .array(
        z
          .object({
            keyword: text,
            productKey: text,
            productId: z.string().nullable(),
            vendorItemId: z.string().nullable(),
            link: text,
            sellerName: text,
            sellerId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
            sellerStoreUrl: z.string().url(),
            capturedAt: timestamp,
          })
          .strict()
          .refine((identity) => {
            try {
              const url = new URL(identity.sellerStoreUrl);
              return (
                url.protocol === 'https:' &&
                url.hostname === 'shop.coupang.com' &&
                (url.pathname === `/${identity.sellerId}` ||
                  url.pathname === `/vid/${identity.sellerId}`)
              );
            } catch {
              return false;
            }
          }),
      )
      .max(200),
  })
  .strict();
export type SellerIdentitySourceCapture = z.infer<
  typeof SellerIdentitySourceCaptureSchema
>;
export const SellerIdentitySourceAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    generation: z.string().regex(/^\d+$/),
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: SellerIdentitySourcePlanSchema,
    expiresAt: timestamp,
    actualCutoffAt: timestamp.nullable(),
    itemCount: z.number().int().nonnegative(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();
export type SellerIdentitySourceAttempt = z.infer<
  typeof SellerIdentitySourceAttemptSchema
>;
export const SellerIdentitySourceControlSchema =
  SellerIdentitySourceAttemptSchema.extend({
    attemptToken: z.string().uuid(),
  }).strict();
export type SellerIdentitySourceControl = z.infer<
  typeof SellerIdentitySourceControlSchema
>;
export const SellerIdentitySourceSchema = z
  .object({
    status: z.enum(['MISSING', 'READY', 'STALE']),
    refreshing: z.boolean(),
    latestAttempt: SellerIdentitySourceAttemptSchema.nullable(),
    latestComplete: SellerIdentitySourceAttemptSchema.nullable(),
  })
  .strict();
export type SellerIdentitySource = z.infer<typeof SellerIdentitySourceSchema>;
