import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { allocateKidItemCode } from '../../../apps/server/src/common/kid-item-code';
import { alignAllocator } from './019_prepare_selling_catalog_sources';
import type { DataMigration } from '../types';

type Row = Record<string, unknown>;
type StoredRow = { row: Row };
type Option = { id: string; values: string[]; sale_price: number; normal_price: number | null; sort_order: number };

/** Approved 2026-09-22: preserve exact preparations/evidence; ambiguous bootstrap aborts the transaction. */
export const linkRegistrationTargetsMigration: DataMigration = {
  id: 'v0.1.31:021_link_registration_targets', releaseVersion: '0.1.31',
  name: 'Link reusable registration settings to priced selling products', phase: 'pre-schema',
  async run(tx) {
    await expandTables(tx);
    await alignAllocator(tx);
    const preparations = await tx.$queryRaw<StoredRow[]>`
      -- queryraw-tenancy-exempt: writer-stopped cutover validates all organizations before scoped writes.
      SELECT to_jsonb(p) AS row FROM product_preparations p ORDER BY organization_id, created_at, id
    `;
    let linked = 0;
    const createdByCandidate = new Map<string, string>();
    for (const { row } of preparations) {
      const organizationId = text(row.organization_id), preparationId = text(row.id);
      if (row.sales_product_id != null) continue;
      const input = record(row.registrationInput ?? row.registration_input);
      const sourceCandidateId = nullableText(row.source_candidate_id);
      const matches = sourceCandidateId ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales_products WHERE organization_id = ${organizationId}::uuid AND source_candidate_id = ${sourceCandidateId}::uuid
      ` : [];
      if (matches.length > 1) throw new Error('Multiple selling products match one preparation candidate.');
      const plan = registrationBootstrapPlan(input, row.display_name);
      let productId = matches[0]?.id;
      const candidateKey = `${organizationId}:${sourceCandidateId}`;
      if (!productId) {
        productId = randomUUID();
        const code = await allocateKidItemCode(tx);
        await tx.$executeRaw`
          INSERT INTO sales_products (id, organization_id, code, name, source_candidate_id, option_axes, image_urls, detail_html, source_raw)
          VALUES (${productId}::uuid, ${organizationId}::uuid, ${code}, ${plan.name}, ${sourceCandidateId}::uuid,
            ${plan.axes}::text[], ${plan.images}::text[], ${plan.detailHtml}, ${JSON.stringify({ preparationBootstrap: preparationId })}::jsonb)
        `;
        for (const [index, option] of plan.options.entries()) {
          const id = randomUUID(), optionCode = await allocateKidItemCode(tx);
          await tx.$executeRaw`
            INSERT INTO sales_product_options (id, organization_id, sales_product_id, option_code, "values", option_key, sale_price, normal_price, sort_order)
            VALUES (${id}::uuid, ${organizationId}::uuid, ${productId}::uuid, ${optionCode}, ${option.values}::text[],
              ${option.values.join(':')}, ${option.salePrice}, ${option.normalPrice}, ${index})
          `;
        }
        if (sourceCandidateId) createdByCandidate.set(candidateKey, JSON.stringify(plan));
      } else if (createdByCandidate.has(candidateKey) && createdByCandidate.get(candidateKey) !== JSON.stringify(plan)) {
        throw new Error('Conflicting preparations cannot define one common selling product.');
      }
      const options = await tx.$queryRaw<Option[]>`
        SELECT id, "values", sale_price, normal_price, sort_order FROM sales_product_options
        WHERE organization_id = ${organizationId}::uuid AND sales_product_id = ${productId}::uuid AND supply_status <> 'unused'
        ORDER BY sort_order, id
      `;
      const [product] = await tx.$queryRaw<Array<{ option_axes: string[] }>>`
        SELECT option_axes FROM sales_products WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
      `;
      if (JSON.stringify(product?.option_axes) !== JSON.stringify(plan.axes)) throw new Error('Preparation option axes conflict with its selling product.');
      for (const [index, option] of plan.options.entries()) {
        const candidates = options.filter(item => JSON.stringify(item.values) === JSON.stringify(option.values));
        if (candidates.length !== 1) throw new Error('Preparation option cannot be linked unambiguously.');
        await insertSelection(tx, organizationId, preparationId, candidates[0].id, index, option.salePrice, option.normalPrice, null);
      }
      await tx.$executeRaw`UPDATE product_preparations SET sales_product_id = ${productId}::uuid
        WHERE id = ${preparationId}::uuid AND organization_id = ${organizationId}::uuid AND sales_product_id IS NULL`;
      linked++;
    }
    const overrides = await migrateOverrides(tx);
    // 018 closed successful one-shot drafts. They now remain reusable; cancellations stay closed.
    await tx.$executeRaw`
      -- queryraw-tenancy-exempt: reopen only successful non-deleted settings, preserving every execution row.
      UPDATE product_preparations p SET closed_at = NULL
      WHERE p.closed_at IS NOT NULL AND p.is_deleted = false
        AND (SELECT e.status FROM product_registration_executions e WHERE e.organization_id = p.organization_id
          AND e.product_preparation_id = p.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) = 'succeeded'
    `;
    const [invalid] = await tx.$queryRaw<Array<{ invalid: boolean }>>`
      -- queryraw-tenancy-exempt: verify every relationship before the new required same-owner FK is installed.
      SELECT EXISTS(SELECT 1 FROM product_preparations p
        LEFT JOIN sales_products s ON s.id = p.sales_product_id AND s.organization_id = p.organization_id
        LEFT JOIN channel_accounts a ON a.id = p.channel_account_id AND a.organization_id = p.organization_id
        WHERE s.id IS NULL OR a.id IS NULL) OR EXISTS(
        SELECT 1 FROM product_preparation_options selected
        JOIN product_preparations p ON p.id = selected.product_preparation_id
        LEFT JOIN sales_product_options o ON o.id = selected.sales_product_option_id AND o.organization_id = selected.organization_id
        WHERE o.id IS NULL OR o.sales_product_id <> p.sales_product_id OR selected.organization_id <> p.organization_id
      ) AS invalid
    `;
    if (invalid?.invalid) throw new Error('Invalid registration product, account or option relationship blocks cutover.');
    return { affectedRows: linked + overrides, details: { linkedPreparations: linked, migratedOverrides: overrides, executionEvidenceChanged: false } };
  },
};

/** Only explicit persisted prices/options are accepted; no name-derived or zero-price fallback. */
export function registrationBootstrapPlan(input: Row, fallbackName: unknown) {
  const wing = record(input.wingProduct);
  const name = text(input.name ?? wing.sellerProductName ?? wing.productName ?? fallbackName);
  const variants = Array.isArray(wing.variants) ? wing.variants : null;
  if (variants?.length === 0) throw new Error('Empty preparation variants block cutover.');
  if (!variants && ((Array.isArray(input.optionNames) && input.optionNames.length > 1) || input.options != null)) {
    throw new Error('Preparation options have no explicit priced variants.');
  }
  const options = (variants ?? [{ salePrice: input.salePrice, origPrice: input.originalPrice }]).map(raw => {
    const variant = record(raw);
    const pairs = variant.purchaseOptions ?? variant.options ?? [];
    if (!Array.isArray(pairs)) throw new Error('Invalid preparation option values.');
    const axes = pairs.map(pair => text(record(pair).type));
    const values = pairs.map(pair => text(record(pair).value));
    if (axes.length > 3 || new Set(axes).size !== axes.length) throw new Error('Ambiguous preparation option axes.');
    return { axes, values, salePrice: amount(variant.salePrice, true), normalPrice: variant.origPrice == null ? null : amount(variant.origPrice) };
  });
  const axes = options[0].axes;
  if (options.some(option => JSON.stringify(option.axes) !== JSON.stringify(axes))
    || new Set(options.map(option => option.values.join(':'))).size !== options.length) {
    throw new Error('Conflicting or duplicate preparation options block cutover.');
  }
  if (options.length === 1 && input.salePrice != null && amount(input.salePrice, true) !== options[0].salePrice) {
    throw new Error('Preparation prices conflict.');
  }
  const images = [...new Set([...(Array.isArray(input.registrationImages) ? input.registrationImages : []),
    ...(Array.isArray(input.thumbnailUrls) ? input.thumbnailUrls : []),
    ...options.map((_, i) => record(variants?.[i]).representativeImageUrl)].filter((value): value is string => typeof value === 'string' && value.length > 0))];
  return { name, axes, images, detailHtml: nullableText(input.description),
    options: options.map(({ values, salePrice, normalPrice }) => ({ values, salePrice, normalPrice })) };
}

async function migrateOverrides(tx: Prisma.TransactionClient): Promise<number> {
  const [shape] = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('public.sales_product_channel_overrides') IS NOT NULL AS present`;
  if (!shape?.present) return 0;
  const overrides = await tx.$queryRaw<StoredRow[]>`
    -- queryraw-tenancy-exempt: transfer all old account-specific settings in the writer-stopped cutover.
    SELECT to_jsonb(o) AS row FROM sales_product_channel_overrides o ORDER BY organization_id, id
  `;
  let count = 0;
  for (const { row } of overrides) {
    const organizationId = text(row.organization_id), id = text(row.id), productId = text(row.sales_product_id), accountId = text(row.channel_account_id);
    const existing = await tx.$queryRaw<Array<{ sales_product_id: string; channel_account_id: string }>>`
      SELECT sales_product_id, channel_account_id FROM product_preparations WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (existing.length) {
      if (existing[0].sales_product_id !== productId || existing[0].channel_account_id !== accountId) throw new Error('Legacy override target identity conflicts.');
      continue;
    }
    const [product] = await tx.$queryRaw<StoredRow[]>`
      SELECT to_jsonb(p) AS row FROM sales_products p WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (!product) throw new Error('Legacy override selling product is missing.');
    const options = await tx.$queryRaw<StoredRow[]>`
      SELECT to_jsonb(o) AS row FROM sales_product_options o
      WHERE sales_product_id = ${productId}::uuid AND organization_id = ${organizationId}::uuid AND supply_status <> 'unused' ORDER BY sort_order, id
    `;
    const input = { mallRegisterValues: record(row.adapter_values), detailHtml: row.detail_html ?? null,
      promoText: row.promo_text ?? null, noticeCategory: row.notice_category ?? null, stockPercent: row.stock_percent ?? null };
    await tx.$executeRaw`
      INSERT INTO product_preparations (id, organization_id, sales_product_id, channel_account_id, display_name, registration_input, created_at, updated_at)
      VALUES (${id}::uuid, ${organizationId}::uuid, ${productId}::uuid, ${accountId}::uuid, ${nullableText(row.name)}, ${JSON.stringify(input)}::jsonb, now(), now())
    `;
    for (const { row: option } of options) {
      let salePrice: number | null = null;
      if (row.sale_price != null || row.price_rate_bp != null) {
        const base = amount(product.row.sale_price);
        const extra = option.extra_price == null ? amount(option.sale_price) - base : integer(option.extra_price);
        const overrideBase = row.sale_price == null ? Math.round(base * integer(row.price_rate_bp) / 10_000) : amount(row.sale_price);
        salePrice = amount(Math.max(0, overrideBase + extra));
      }
      await insertSelection(tx, organizationId, id, text(option.id), integer(option.sort_order), salePrice, null, null);
    }
    count++;
  }
  return count;
}

async function insertSelection(tx: Prisma.TransactionClient, org: string, target: string, option: string, order: number,
  salePrice: number | null, normalPrice: number | null, supplyPrice: number | null) {
  await tx.$executeRaw`
    INSERT INTO product_preparation_options (id, organization_id, product_preparation_id, sales_product_option_id, sort_order, sale_price, normal_price, supply_price)
    VALUES (${randomUUID()}::uuid, ${org}::uuid, ${target}::uuid, ${option}::uuid, ${order}, ${salePrice}, ${normalPrice}, ${supplyPrice})
  `;
}

async function expandTables(tx: Prisma.TransactionClient): Promise<void> {
  // Minimal pre-schema shape. Prisma adds the remaining nullable/defaulted columns and owner FKs after backfill.
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS sales_products (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, code varchar(60) NOT NULL, name varchar(255) NOT NULL,
    source_candidate_id uuid, option_axes text[] NOT NULL DEFAULT '{}', image_urls text[] NOT NULL DEFAULT '{}', detail_html text, source_raw jsonb,
    status text NOT NULL DEFAULT 'active', version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS sales_product_options (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL, option_code varchar(80) NOT NULL,
    "values" text[] NOT NULL DEFAULT '{}', option_key varchar(500) NOT NULL, sale_price integer NOT NULL, normal_price integer,
    supply_status text NOT NULL DEFAULT 'selling', sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await tx.$executeRaw`CREATE TABLE IF NOT EXISTS product_preparation_options (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, product_preparation_id uuid NOT NULL, sales_product_option_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0, sale_price integer, normal_price integer, supply_price integer)`;
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS sales_product_id uuid`;
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`;
  await tx.$executeRaw`ALTER TABLE product_preparations ADD COLUMN IF NOT EXISTS closed_at timestamptz`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN source_candidate_id DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN source_content_workspace_id DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE product_preparations ALTER COLUMN display_name DROP NOT NULL`;
  const [legacy] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_products' AND column_name = 'sale_price') AS present
  `;
  if (legacy?.present) await tx.$executeRaw`ALTER TABLE sales_products ALTER COLUMN sale_price DROP NOT NULL`;
}
function record(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing registration identity or content blocks cutover.'); return value.trim(); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function integer(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Invalid registration number blocks cutover.'); return value; }
function amount(value: unknown, positive = false): number { const result = integer(value); if (result < (positive ? 1 : 0) || result > 1_000_000_000) throw new Error('Invalid registration price blocks cutover.'); return result; }
