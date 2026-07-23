#!/usr/bin/env tsx
import 'dotenv/config';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { ChannelProductMatchingQueueResponseSchema } from '@kiditem/shared/channel-product-matching';
import { InventorySkuSnapshotListResponseSchema } from '@kiditem/shared/inventory';
import {
  CreateProductVariantRecipesIfEmptyResponseSchema,
  MAX_CREATE_IF_EMPTY_PRODUCT_VARIANT_RECIPES,
  PlanProductVariantRecipesIfEmptyResponseSchema,
} from '@kiditem/shared/product-operations';

export const CHANNEL_RECIPE_TRANSFER_SCHEMA = 'kiditem.channel-recipe-transfer.v1';
export const APPLY_CHANNEL_RECIPE_TRANSFER_CONFIRMATION = 'APPLY_CHANNEL_RECIPE_TRANSFER';

const ComponentSchema = z.object({
  sellpiaSkuCode: z.string().trim().min(1).max(100),
  quantity: z.number().int().positive(),
}).strict();

const RecipeSchema = z.object({
  listingExternalId: z.string().min(1),
  optionExternalId: z.string().min(1),
  components: z.array(ComponentSchema).min(1).max(50),
}).strict().superRefine((recipe, context) => {
  const codes = recipe.components.map(({ sellpiaSkuCode }) => sellpiaSkuCode);
  if (new Set(codes).size !== codes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['components'],
      message: 'Recipe components must use distinct Sellpia SKU codes',
    });
  }
});

export const ChannelRecipeTransferArtifactSchema = z.object({
  schemaVersion: z.literal(CHANNEL_RECIPE_TRANSFER_SCHEMA),
  channel: z.string().trim().min(1).max(50),
  exportedAt: z.string().datetime({ offset: true }),
  recipes: z.array(RecipeSchema).min(1),
}).strict().superRefine((artifact, context) => {
  const keys = artifact.recipes.map(recipeKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipes'],
      message: 'Listing and option external identity pairs must be distinct',
    });
  }
});

export type ChannelRecipeTransferArtifact = z.infer<
  typeof ChannelRecipeTransferArtifactSchema
>;
type TransferComponent = z.infer<typeof ComponentSchema>;
type Args = Map<string, string>;

type ResolvedVariant = {
  productVariantId: string;
  components: TransferComponent[];
};

type ApiClient = {
  get(pathname: string): Promise<unknown>;
  post(pathname: string, body: unknown): Promise<unknown>;
};

export function recipeKey(recipe: Pick<
  ChannelRecipeTransferArtifact['recipes'][number],
  'listingExternalId' | 'optionExternalId'
>): string {
  return JSON.stringify([recipe.listingExternalId, recipe.optionExternalId]);
}

export function canonicalComponents(components: TransferComponent[]): TransferComponent[] {
  return [...components]
    .map((component) => ({
      sellpiaSkuCode: component.sellpiaSkuCode.trim(),
      quantity: component.quantity,
    }))
    .sort((left, right) => left.sellpiaSkuCode.localeCompare(right.sellpiaSkuCode));
}

export function resolveArtifactRecipes(input: {
  artifact: ChannelRecipeTransferArtifact;
  queue: z.infer<typeof ChannelProductMatchingQueueResponseSchema>;
}): ResolvedVariant[] {
  const queueByKey = new Map<string, (typeof input.queue.options)[number]>();
  for (const row of input.queue.options) {
    const key = recipeKey({
      listingExternalId: row.listing.externalId,
      optionExternalId: row.option.externalOptionId,
    });
    if (queueByKey.has(key)) throw new Error(`Target queue has duplicate external identity: ${key}`);
    queueByKey.set(key, row);
  }

  const expectedByVariant = new Map<string, ResolvedVariant>();
  for (const recipe of input.artifact.recipes) {
    const row = queueByKey.get(recipeKey(recipe));
    if (!row) throw new Error('One or more artifact options do not exist in the target account');
    if (!row.option.productVariantId || !row.listing.masterProductId) {
      throw new Error('One or more artifact options are not linked to a target product variant');
    }
    const resolved: ResolvedVariant = {
      productVariantId: row.option.productVariantId,
      components: canonicalComponents(recipe.components),
    };
    const previous = expectedByVariant.get(resolved.productVariantId);
    if (previous && !sameComponents(previous.components, resolved.components)) {
      throw new Error('Artifact options resolve to conflicting recipes for one target variant');
    }
    expectedByVariant.set(resolved.productVariantId, resolved);
  }
  return [...expectedByVariant.values()]
    .sort((left, right) => left.productVariantId.localeCompare(right.productVariantId));
}

function sameComponents(left: TransferComponent[], right: TransferComponent[]): boolean {
  return JSON.stringify(canonicalComponents(left)) === JSON.stringify(canonicalComponents(right));
}

function parseArgs(argv: string[]): { command: string; values: Args } {
  const [command, ...tokens] = argv;
  if (!command) throw new Error(usage());
  const values = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument near ${key ?? '<end>'}\n${usage()}`);
    }
    values.set(key.slice(2), value);
  }
  return { command, values };
}

function required(args: Args, key: string): string {
  const value = args.get(key)?.trim();
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

async function exportArtifact(args: Args): Promise<void> {
  const target = required(args, 'target');
  if (target !== 'local') throw new Error('Recipe export currently requires --target local');
  const organizationId = required(args, 'organization-id');
  const channelAccountId = required(args, 'channel-account-id');
  const outputPath = path.resolve(required(args, 'output'));
  assertPrivateOutputPath(outputPath);
  if (existsSync(outputPath)) throw new Error('Refusing to overwrite an existing recipe artifact');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for recipe export');
  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.$connect();
    const account = await prisma.channelAccount.findFirst({
      where: { id: channelAccountId, organizationId, status: 'active' },
      select: { channel: true },
    });
    if (!account) throw new Error('Active organization-owned channel account was not found');
    const rows = await prisma.channelListingOption.findMany({
      where: {
        organizationId,
        isActive: true,
        productVariantId: { not: null },
        listing: { is: { organizationId, channelAccountId, isActive: true } },
      },
      select: {
        externalOptionId: true,
        listing: { select: { externalId: true } },
        productVariant: {
          select: {
            components: {
              where: { organizationId },
              orderBy: [{ sellpiaInventorySku: { code: 'asc' } }, { id: 'asc' }],
              select: {
                quantity: true,
                sellpiaInventorySku: { select: { code: true } },
              },
            },
          },
        },
      },
      orderBy: [{ listing: { externalId: 'asc' } }, { externalOptionId: 'asc' }],
    });
    const recipes = rows.flatMap((row) => {
      const components = row.productVariant?.components ?? [];
      if (components.length === 0) return [];
      return [{
        listingExternalId: row.listing.externalId,
        optionExternalId: row.externalOptionId,
        components: components.map((component) => ({
          sellpiaSkuCode: component.sellpiaInventorySku.code,
          quantity: component.quantity,
        })),
      }];
    });
    const artifact = ChannelRecipeTransferArtifactSchema.parse({
      schemaVersion: CHANNEL_RECIPE_TRANSFER_SCHEMA,
      channel: account.channel,
      exportedAt: new Date().toISOString(),
      recipes,
    });
    mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({
      operation: 'export',
      target,
      outputPath,
      recipeOptions: artifact.recipes.length,
      distinctListings: new Set(artifact.recipes.map((recipe) => recipe.listingExternalId)).size,
      distinctSellpiaSkuCodes: new Set(artifact.recipes.flatMap((recipe) =>
        recipe.components.map((component) => component.sellpiaSkuCode))).size,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

function assertPrivateOutputPath(outputPath: string): void {
  const repositoryRoot = path.resolve(process.cwd());
  const relative = path.relative(repositoryRoot, outputPath);
  const insideRepository = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (insideRepository && !relative.startsWith(`.secrets${path.sep}`)) {
    throw new Error('Recipe artifacts inside the repository must be written below ignored .secrets/');
  }
}

function readArtifact(filePath: string): ChannelRecipeTransferArtifact {
  return ChannelRecipeTransferArtifactSchema.parse(
    JSON.parse(readFileSync(path.resolve(filePath), 'utf8')),
  );
}

export function cookieHeaderFromContent(content: string): string {
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error('Cookie file is empty');
  const rawHeader = normalizedContent.split(/\r?\n/u)
    .find((line) => /^cookie\s*:/iu.test(line));
  if (rawHeader) return rawHeader.replace(/^cookie\s*:\s*/iu, '').trim();
  const cookies = normalizedContent.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
    .flatMap((line) => {
      const columns = line.split('\t');
      return columns.length >= 7 ? [`${columns[5]}=${columns[6]}`] : [];
    });
  if (cookies.length === 0) throw new Error('Cookie file must be a Netscape jar or contain one Cookie: header');
  return cookies.join('; ');
}

function cookieHeader(cookieFile: string): string {
  return cookieHeaderFromContent(readFileSync(path.resolve(cookieFile), 'utf8'));
}

function authorizationHeaders(args: Args): Record<string, string> {
  const cookieFile = args.get('cookie-file')?.trim();
  const bearerTokenFile = args.get('bearer-token-file')?.trim();
  if (Boolean(cookieFile) === Boolean(bearerTokenFile)) {
    throw new Error('Provide exactly one of --cookie-file or --bearer-token-file');
  }
  if (cookieFile) return { Cookie: cookieHeader(cookieFile) };
  const token = readFileSync(path.resolve(bearerTokenFile!), 'utf8').trim();
  if (!token) throw new Error('Bearer token file is empty');
  return { Authorization: `Bearer ${token}` };
}

function createApiClient(baseUrl: string, authorization: Record<string, string>): ApiClient {
  const origin = new URL(baseUrl);
  const request = async (pathname: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetch(new URL(pathname, origin), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...authorization,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : 'non-JSON response';
      throw new Error(`API ${response.status} for ${pathname}: ${message}`);
    }
    return body;
  };
  return {
    get: (pathname) => request(pathname),
    post: (pathname, body) => request(pathname, { method: 'POST', body: JSON.stringify(body) }),
  };
}

function assertTargetBaseUrl(target: string, baseUrl: string): void {
  const url = new URL(baseUrl);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (target === 'local' && !isLocal) throw new Error('--target local requires a localhost base URL');
  if (target === 'staging' && isLocal) throw new Error('--target staging requires a non-local base URL');
  if (target !== 'local' && target !== 'staging') {
    throw new Error('Recipe transfer supports only --target local or --target staging');
  }
}

async function transferArtifact(command: 'plan' | 'apply', args: Args): Promise<void> {
  const target = required(args, 'target');
  const baseUrl = required(args, 'base-url');
  assertTargetBaseUrl(target, baseUrl);
  const approvedOrganizationId = required(args, 'approved-organization-id');
  const channelAccountId = required(args, 'channel-account-id');
  const artifact = readArtifact(required(args, 'input'));
  const api = createApiClient(baseUrl, authorizationHeaders(args));

  const identity = z.object({ organizationId: z.string().uuid() }).passthrough()
    .parse(await api.get('/api/auth/me'));
  if (identity.organizationId !== approvedOrganizationId) {
    throw new Error('Authenticated organization does not match --approved-organization-id');
  }
  const accounts = z.array(ChannelAccountListItemSchema).parse(await api.get('/api/channels/accounts'));
  const account = accounts.find((item) => item.id === channelAccountId);
  if (!account || account.channel !== artifact.channel) {
    throw new Error('Target channel account is missing or has the wrong channel');
  }

  const queue = ChannelProductMatchingQueueResponseSchema.parse(await api.get(
    `/api/channels/product-mappings?channelAccountId=${encodeURIComponent(channelAccountId)}`,
  ));
  const resolved = resolveArtifactRecipes({ artifact, queue });

  const inventoryByCode = await loadActiveInventoryByCode(api);
  const requiredCodes = new Set(resolved.flatMap((variant) =>
    variant.components.map((component) => component.sellpiaSkuCode)));
  const skuIdByCode = new Map<string, string>();
  for (const code of requiredCodes) {
    const matches = inventoryByCode.get(code) ?? [];
    if (matches.length !== 1) {
      throw new Error('Every pending Sellpia SKU code must resolve to exactly one active target SKU');
    }
    skuIdByCode.set(code, matches[0]!);
  }
  const recipeInputs = resolved.map((variant) => ({
    productVariantId: variant.productVariantId,
    components: variant.components.map((component) => ({
      sellpiaInventorySkuId: skuIdByCode.get(component.sellpiaSkuCode)!,
      quantity: component.quantity,
    })),
  }));
  const plan = await planRecipeBatches(api, recipeInputs);

  console.log(JSON.stringify({
    operation: command,
    target,
    verifiedOrganizationId: identity.organizationId,
    artifactOptions: artifact.recipes.length,
    resolvedVariants: recipeInputs.length,
    pendingVariants: plan.pendingProductVariantIds.length,
    unchangedVariants: plan.unchangedProductVariantIds.length,
    requiredSellpiaSkuCodes: requiredCodes.size,
  }));
  if (command === 'plan') return;
  if (required(args, 'confirm') !== APPLY_CHANNEL_RECIPE_TRANSFER_CONFIRMATION) {
    throw new Error(`apply requires --confirm ${APPLY_CHANNEL_RECIPE_TRANSFER_CONFIRMATION}`);
  }

  const pendingIds = new Set(plan.pendingProductVariantIds);
  const pendingRecipes = recipeInputs.filter((recipe) => pendingIds.has(recipe.productVariantId));
  let applied = 0;
  let concurrentUnchanged = 0;
  for (const recipes of chunks(pendingRecipes, MAX_CREATE_IF_EMPTY_PRODUCT_VARIANT_RECIPES)) {
    const response = CreateProductVariantRecipesIfEmptyResponseSchema.parse(await api.post(
      '/api/products/variant-recipes/create-if-empty',
      { recipes },
    ));
    assertPartition(
      recipes.map(({ productVariantId }) => productVariantId),
      response.appliedProductVariantIds,
      response.unchangedProductVariantIds,
    );
    applied += response.appliedProductVariantIds.length;
    concurrentUnchanged += response.unchangedProductVariantIds.length;
    console.log(JSON.stringify({
      progress: applied + concurrentUnchanged,
      total: pendingRecipes.length,
      applied,
      concurrentUnchanged,
    }));
  }

  const verification = await planRecipeBatches(api, recipeInputs);
  if (verification.pendingProductVariantIds.length !== 0) {
    throw new Error('Post-apply verification found recipes that are still empty');
  }
  console.log(JSON.stringify({
    appliedVariants: applied,
    concurrentUnchangedVariants: concurrentUnchanged,
    verifiedVariants: verification.unchangedProductVariantIds.length,
  }));
}

async function planRecipeBatches(
  api: ApiClient,
  recipes: Array<{
    productVariantId: string;
    components: Array<{ sellpiaInventorySkuId: string; quantity: number }>;
  }>,
) {
  const pendingProductVariantIds: string[] = [];
  const unchangedProductVariantIds: string[] = [];
  for (const batch of chunks(recipes, MAX_CREATE_IF_EMPTY_PRODUCT_VARIANT_RECIPES)) {
    const response = PlanProductVariantRecipesIfEmptyResponseSchema.parse(await api.post(
      '/api/products/variant-recipes/create-if-empty/plan',
      { recipes: batch },
    ));
    assertPartition(
      batch.map(({ productVariantId }) => productVariantId),
      response.pendingProductVariantIds,
      response.unchangedProductVariantIds,
    );
    pendingProductVariantIds.push(...response.pendingProductVariantIds);
    unchangedProductVariantIds.push(...response.unchangedProductVariantIds);
  }
  return { pendingProductVariantIds, unchangedProductVariantIds };
}

function assertPartition(expected: string[], left: string[], right: string[]): void {
  const observed = [...left, ...right].sort((first, second) => first.localeCompare(second));
  const canonicalExpected = [...expected].sort((first, second) => first.localeCompare(second));
  if (new Set(observed).size !== observed.length
    || JSON.stringify(observed) !== JSON.stringify(canonicalExpected)) {
    throw new Error('Recipe batch response did not partition every requested ProductVariant');
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

async function loadActiveInventoryByCode(api: ApiClient): Promise<Map<string, string[]>> {
  const byCode = new Map<string, string[]>();
  let page = 1;
  while (true) {
    const response = InventorySkuSnapshotListResponseSchema.parse(await api.get(
      `/api/inventory/sellpia-skus?page=${page}&limit=200&activeStatus=active`,
    ));
    for (const item of response.items) {
      const ids = byCode.get(item.code) ?? [];
      ids.push(item.sellpiaInventorySkuId);
      byCode.set(item.code, ids);
    }
    if (page * response.limit >= response.total) return byCode;
    page += 1;
  }
}

function usage(): string {
  return `
Usage:
  npm run recipes:transfer -- export --target local --organization-id <uuid> --channel-account-id <uuid> --output <private-json>
  npm run recipes:transfer -- plan --target local|staging --base-url <url> (--cookie-file <private-path> | --bearer-token-file <private-path>) --approved-organization-id <uuid> --channel-account-id <uuid> --input <private-json>
  npm run recipes:transfer -- apply --target local|staging --base-url <url> (--cookie-file <private-path> | --bearer-token-file <private-path>) --approved-organization-id <uuid> --channel-account-id <uuid> --input <private-json> --confirm ${APPLY_CHANNEL_RECIPE_TRANSFER_CONFIRMATION}
`.trim();
}

async function main(): Promise<void> {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === 'export') return exportArtifact(values);
  if (command === 'plan' || command === 'apply') return transferArtifact(command, values);
  throw new Error(usage());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
