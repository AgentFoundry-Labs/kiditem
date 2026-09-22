import type { Prisma } from '@prisma/client';
import { allocateKidItemCode } from '../../../apps/server/src/common/kid-item-code';
import { alignAllocator, mapSourceComponents } from './019_prepare_selling_catalog_sources';
import type { DataMigration } from '../types';

const KID = /^KID\d{8}$/;
type LegacyRow = { row: Record<string, unknown> };

/** Writer-stopped expand/contract step; never rewrites external sellerSku or execution evidence. */
export const sellingCatalogCutoverMigration: DataMigration = {
  id: 'v0.1.31:020_selling_catalog_cutover',
  releaseVersion: '0.1.31',
  name: 'Move selling catalog identities and final option prices to the Channels model',
  phase: 'pre-schema',
  async run(tx) {
    const [shape] = await tx.$queryRaw<Array<{ products: boolean; options: boolean }>>`
      SELECT to_regclass('public.sales_products') IS NOT NULL AS products,
        to_regclass('public.sales_product_options') IS NOT NULL AS options
    `;
    if (!shape?.products && !shape?.options) return { affectedRows: 0, details: { outcome: 'catalog_not_created' } };
    if (!shape?.products || !shape?.options) throw new Error('Incomplete selling catalog schema blocks cutover.');
    await tx.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS sale_price integer`;
    await tx.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS normal_price integer`;
    await tx.$executeRaw`ALTER TABLE sales_product_options ADD COLUMN IF NOT EXISTS sabangnet_option_code varchar(80)`;
    await mapSourceComponents(tx);
    await alignAllocator(tx);

    const products = await tx.$queryRaw<LegacyRow[]>`
      -- queryraw-tenancy-exempt: writer-stopped versioned cutover validates every organization, then scopes each write.
      SELECT to_jsonb(product) AS row FROM sales_products product ORDER BY organization_id, id
    `;
    let changed = 0;
    for (const { row: product } of products) {
      const organizationId = requiredText(product.organization_id);
      const productId = requiredText(product.id);
      const productCode = requiredText(product.code);
      if (!KID.test(productCode)) {
        // Imported code is already represented by goods number or own code. A
        // manually issued legacy code is retained as ownCode, never lost.
        const ownCode = product.own_code == null && product.sabangnet_goods_no == null ? productCode : product.own_code;
        const code = await allocateKidItemCode(tx);
        await tx.$executeRaw`
          UPDATE sales_products SET code = ${code}, own_code = ${ownCode == null ? null : requiredText(ownCode)}
          WHERE id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
        `;
        changed++;
      }
      const options = await tx.$queryRaw<LegacyRow[]>`
        SELECT to_jsonb(option) AS row FROM sales_product_options option
        WHERE sales_product_id = ${productId}::uuid AND organization_id = ${organizationId}::uuid
        ORDER BY sort_order, id
      `;
      for (const { row: option } of options) {
        const optionId = requiredText(option.id);
        const oldCode = requiredText(option.option_code);
        const oldPrice = option.sale_price;
        const finalPrice = oldPrice == null
          ? money(integer(product.sale_price, 'legacy base price') + integer(option.extra_price ?? 0, 'legacy option extra'), 'final option price')
          : money(oldPrice, 'final option price');
        const normalPrice = option.normal_price ?? (oldPrice == null ? product.tag_price : null);
        const normalizedNormal = normalPrice == null ? null : money(normalPrice, 'normal price');
        const code = KID.test(oldCode) ? oldCode : await initialOptionCode(tx, organizationId, optionId);
        const bootstrapCode = option.sabangnet_option_code ?? (KID.test(oldCode) ? null : oldCode);
        if (oldPrice !== finalPrice || option.normal_price !== normalizedNormal || oldCode !== code || option.sabangnet_option_code !== bootstrapCode) {
          await tx.$executeRaw`
            UPDATE sales_product_options SET sale_price = ${finalPrice}, normal_price = ${normalizedNormal},
              option_code = ${code}, sabangnet_option_code = ${bootstrapCode == null ? null : requiredText(bootstrapCode)}
            WHERE id = ${optionId}::uuid AND organization_id = ${organizationId}::uuid
          `;
          changed++;
        }
      }
    }
    return { affectedRows: changed, details: { convertedRows: changed, externalIdentifiersChanged: false } };
  },
};

async function initialOptionCode(tx: Prisma.TransactionClient, organizationId: string, optionId: string): Promise<string> {
  const usedCodes = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT DISTINCT kid_item_code AS code FROM channel_listing_options
    WHERE organization_id = ${organizationId}::uuid AND sales_product_option_id = ${optionId}::uuid AND kid_item_code IS NOT NULL
  `;
  if (usedCodes.length > 1) throw new Error('A common option is linked to conflicting issued KID identities; reconcile before cutover.');
  if (usedCodes.length === 1) {
    if (!KID.test(usedCodes[0].code)) throw new Error('Invalid existing channel option KID blocks cutover.');
    return usedCodes[0].code;
  }
  const components = await tx.$queryRaw<Array<{ quantity: number; code: string | null }>>`
    SELECT component.quantity, master.code FROM sales_product_option_components component
    LEFT JOIN master_products master ON master.id = component.master_product_id AND master.organization_id = component.organization_id
    WHERE component.sales_product_option_id = ${optionId}::uuid AND component.organization_id = ${organizationId}::uuid
  `;
  if (components.length === 1 && components[0].quantity === 1 && components[0].code && KID.test(components[0].code)) return components[0].code;
  return allocateKidItemCode(tx);
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing selling catalog identity blocks cutover.');
  return value;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`Invalid ${label} blocks selling catalog cutover.`);
  return value;
}
function money(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result < 0 || result > 1_000_000_000) throw new Error(`Out-of-range ${label} blocks selling catalog cutover.`);
  return result;
}
