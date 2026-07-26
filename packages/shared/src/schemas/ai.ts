import { z } from 'zod';

export const DETAIL_PAGE_TEMPLATE_IDS = ['kids-playful', 'bold-vertical'] as const;
export const DETAIL_PAGE_AGE_GROUPS = ['age-8-plus', 'age-14-plus'] as const;
export const DETAIL_IMAGE_COUNTS = ['auto', '1', '2', '3', '4', '5', '6'] as const;

export const DetailPageTemplateIdSchema = z.enum(DETAIL_PAGE_TEMPLATE_IDS);
export const DetailPageAgeGroupSchema = z.enum(DETAIL_PAGE_AGE_GROUPS);
export const DetailImageCountSchema = z.enum(DETAIL_IMAGE_COUNTS);

export type DetailPageTemplateId = z.infer<typeof DetailPageTemplateIdSchema>;
export type DetailPageAgeGroup = z.infer<typeof DetailPageAgeGroupSchema>;
export type DetailImageCount = z.infer<typeof DetailImageCountSchema>;

export const DETAIL_PAGE_CLIENT_RENDER_VARIANT = 'wing-client-jpeg-v1' as const;
export const DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE = 'image/jpeg' as const;
export const DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH = 720 as const;
export const DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH = 780 as const;
export const DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES = 10 * 1024 * 1024;
export const DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT = 50_000;

const ClientRenderUuidSchema = z.string().uuid();
const ClientRenderDateSchema = z.string().datetime({ offset: true });
const ClientRenderVariantSchema = z.literal(DETAIL_PAGE_CLIENT_RENDER_VARIANT);
const ClientRenderContentTypeSchema = z.literal(
  DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
);
const ClientRenderOutputWidthSchema = z.literal(
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
);
const ClientRenderArtifactSchema = z
  .object({
    artifactId: ClientRenderUuidSchema,
    revisionId: ClientRenderUuidSchema,
    imageUrl: z.string().url(),
    outputWidth: ClientRenderOutputWidthSchema,
    contentType: ClientRenderContentTypeSchema,
    byteLength: z.number().int().positive().max(DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES),
    pixelWidth: ClientRenderOutputWidthSchema,
    pixelHeight: z.number().int().positive().max(DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const DetailPageClientRenderPrepareResponseSchema = z.discriminatedUnion(
  'status',
  [
    ClientRenderArtifactSchema.omit({ pixelWidth: true, pixelHeight: true, sha256: true })
      .extend({ status: z.literal('ready') })
      .strict(),
    z
      .object({
        status: z.literal('render_required'),
        intentId: ClientRenderUuidSchema,
        revisionId: ClientRenderUuidSchema,
        outputWidth: ClientRenderOutputWidthSchema,
        expiresAt: ClientRenderDateSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('missing'),
        reason: z.enum(['no_saved_detail_page', 'empty_html']),
        message: z.string().min(1).max(300),
      })
      .strict(),
  ],
);

export const DetailPageClientRenderClaimResponseSchema = z
  .object({
    intentId: ClientRenderUuidSchema,
    revisionId: ClientRenderUuidSchema,
    variant: ClientRenderVariantSchema,
    outputWidth: ClientRenderOutputWidthSchema,
    renderDocumentUrl: z.string().url(),
    upload: z
      .object({
        url: z.string().url(),
        headers: z.record(z.string()),
        expiresAt: ClientRenderDateSchema,
      })
      .strict(),
  })
  .strict();

export const DetailPageClientRenderDocumentResponseSchema = z
  .object({
    intentId: ClientRenderUuidSchema,
    revisionId: ClientRenderUuidSchema,
    html: z.string().min(1),
    layoutWidth: z.literal(DETAIL_PAGE_CLIENT_RENDER_LAYOUT_WIDTH),
    outputWidth: ClientRenderOutputWidthSchema,
    requiredAssetPolicy: z.literal('all'),
  })
  .strict();

export const DetailPageClientRenderFinalizeBodySchema = z
  .object({
    byteLength: z.number().int().positive().max(DETAIL_PAGE_CLIENT_RENDER_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    pixelWidth: ClientRenderOutputWidthSchema,
    pixelHeight: z.number().int().positive().max(DETAIL_PAGE_CLIENT_RENDER_MAX_HEIGHT),
  })
  .strict();

export const DetailPageClientRenderFailBodySchema = z
  .object({
    code: z.string().regex(/^[a-z0-9_]{1,64}$/),
    message: z.string().min(1).max(300),
  })
  .strict();

export const DetailPageClientRenderStatusResponseSchema = z
  .object({
    intentId: ClientRenderUuidSchema,
    revisionId: ClientRenderUuidSchema,
    state: z.enum(['issued', 'claimed', 'uploaded', 'completed', 'failed', 'expired']),
    expiresAt: ClientRenderDateSchema,
    error: z
      .object({
        code: z.string().min(1).max(64),
        message: z.string().min(1).max(300),
      })
      .strict()
      .nullable(),
    artifact: ClientRenderArtifactSchema.nullable(),
  })
  .strict();

export type DetailPageClientRenderPrepareResponse = z.infer<
  typeof DetailPageClientRenderPrepareResponseSchema
>;
export type DetailPageClientRenderClaimResponse = z.infer<
  typeof DetailPageClientRenderClaimResponseSchema
>;
export type DetailPageClientRenderDocumentResponse = z.infer<
  typeof DetailPageClientRenderDocumentResponseSchema
>;
export type DetailPageClientRenderFinalizeBody = z.infer<
  typeof DetailPageClientRenderFinalizeBodySchema
>;
export type DetailPageClientRenderFailBody = z.infer<
  typeof DetailPageClientRenderFailBodySchema
>;
export type DetailPageClientRenderStatusResponse = z.infer<
  typeof DetailPageClientRenderStatusResponseSchema
>;
