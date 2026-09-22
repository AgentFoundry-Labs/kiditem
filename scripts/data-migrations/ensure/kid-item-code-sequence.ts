import type { Prisma } from '@prisma/client';
import type { EnsureStep } from './types';

export const KID_ITEM_CODE_SEQUENCE = 'kid_item_code_seq';
export const KID_ITEM_CODE_PATTERN = /^KID[0-9]{8}$/;
export const KID_ITEM_CODE_MAX = 99_999_999;

type AvailableSchema = {
  tables: ReadonlySet<string>;
  columns: ReadonlySet<string>;
};

type CodeRow = {
  code: string | null;
  organization_id: string;
  row_id: string;
  table_name: string;
  kind: 'master_product' | 'sales_product' | 'sales_product_option' | 'channel_listing_option';
};

type MasterCodeRow = { id: string; organization_id: string; code: string | null };
type SalesProductCodeRow = { id: string; organization_id: string; code: string | null };
type SalesProductOptionCodeRow = {
  id: string;
  organization_id: string;
  option_code: string | null;
};
type ChannelListingOptionCodeRow = {
  id: string;
  organization_id: string;
  kid_item_code: string | null;
  sales_product_option_id: string | null;
};
type ComponentRow = {
  organization_id: string;
  owner_id: string;
  master_product_id: string;
  quantity: number;
};
type SourceReference = {
  organization_id: string;
  master_product_id: string;
};

/**
 * The sequence is the only allocator for independently issued KID codes. It
 * is shared by Products and Channels. A common selling option may reuse a
 * source MasterProduct code only when its exact singleton composition proves
 * that the value is a reference to that source, not a second allocation. The
 * retained organization-scoped source UUID remains sufficient after the
 * source row is deleted; the ensure step never reconstructs a code mapping.
 * Linked ChannelListingOptions may then reuse the common option code across
 * malls; an unlinked listing keeps the older source-singleton rule.
 */
export const kidItemCodeSequenceStep: EnsureStep = {
  id: 'ensure:kid_item_code_sequence',
  name: 'Ensure the bounded global KID item-code sequence is aligned',
  async run(tx) {
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: this is a global allocator lock, not a tenant read.
      SELECT pg_advisory_xact_lock(hashtextextended('kiditem.kid-item-code-sequence', 0))::text AS "lock"
    `;

    // Some migration fixtures represent an earlier pushed schema without the
    // Channels sales-product tables. Inspect the catalog before issuing any
    // table-specific SQL so an absent optional table is an empty source rather
    // than an invalid relation error.
    const schema = await inspectAvailableSchema(tx);
    const masterProducts = hasColumns(schema, 'master_products', ['id', 'organization_id', 'code'])
      ? await tx.$queryRaw<MasterCodeRow[]>`
        SELECT id::text AS id, organization_id::text AS organization_id, code
        FROM master_products
      `
      : [];
    const salesProducts = hasColumns(schema, 'sales_products', ['id', 'organization_id', 'code'])
      ? await tx.$queryRaw<SalesProductCodeRow[]>`
        SELECT id::text AS id, organization_id::text AS organization_id, code
        FROM sales_products
      `
      : [];
    const salesProductOptions = hasColumns(schema, 'sales_product_options', ['id', 'organization_id', 'option_code'])
      ? await tx.$queryRaw<SalesProductOptionCodeRow[]>`
        SELECT id::text AS id, organization_id::text AS organization_id, option_code
        FROM sales_product_options
      `
      : [];
    const channelListingOptions = hasColumns(schema, 'channel_listing_options', [
      'id', 'organization_id', 'kid_item_code',
    ])
      ? hasColumn(schema, 'channel_listing_options', 'sales_product_option_id')
        ? await tx.$queryRaw<ChannelListingOptionCodeRow[]>`
          SELECT
            id::text AS id,
            organization_id::text AS organization_id,
            kid_item_code,
            sales_product_option_id::text AS sales_product_option_id
          FROM channel_listing_options
        `
        : await tx.$queryRaw<ChannelListingOptionCodeRow[]>`
          SELECT
            id::text AS id,
            organization_id::text AS organization_id,
            kid_item_code,
            NULL::text AS sales_product_option_id
          FROM channel_listing_options
        `
      : [];
    const salesProductOptionComponents = hasColumns(schema, 'sales_product_option_components', [
      'organization_id', 'sales_product_option_id', 'master_product_id', 'quantity',
    ])
      ? await tx.$queryRaw<ComponentRow[]>`
        SELECT
          organization_id::text AS organization_id,
          sales_product_option_id::text AS owner_id,
          master_product_id::text AS master_product_id,
          quantity
        FROM sales_product_option_components
      `
      : [];
    const channelListingOptionComponents = hasColumns(schema, 'channel_listing_option_inventory_components', [
      'organization_id', 'channel_listing_option_id', 'master_product_id', 'quantity',
    ])
      ? await tx.$queryRaw<ComponentRow[]>`
        SELECT
          organization_id::text AS organization_id,
          channel_listing_option_id::text AS owner_id,
          master_product_id::text AS master_product_id,
          quantity
        FROM channel_listing_option_inventory_components
      `
      : [];

    const codeRows = [
      ...masterProducts.map((row): CodeRow => ({
        code: row.code,
        organization_id: row.organization_id,
        row_id: row.id,
        table_name: 'master_products',
        kind: 'master_product',
      })),
      ...salesProducts.map((row): CodeRow => ({
        code: row.code,
        organization_id: row.organization_id,
        row_id: row.id,
        table_name: 'sales_products',
        kind: 'sales_product',
      })),
      ...salesProductOptions.map((row): CodeRow => ({
        code: row.option_code,
        organization_id: row.organization_id,
        row_id: row.id,
        table_name: 'sales_product_options',
        kind: 'sales_product_option',
      })),
      ...channelListingOptions.flatMap((row): CodeRow[] => row.kid_item_code === null ? [] : [{
        code: row.kid_item_code,
        organization_id: row.organization_id,
        row_id: row.id,
        table_name: 'channel_listing_options',
        kind: 'channel_listing_option',
      }]),
    ];

    // Before the selling-catalog cutover, SalesProduct.code and
    // SalesProductOption.optionCode still contain external/bootstrap
    // identifiers. The new sabangnet_option_code column is the schema marker
    // that makes the KID fields authoritative. Valid KIDs are authoritative
    // even in the legacy shape and must still participate in collision and
    // sequence checks; only non-KID legacy values are temporarily tolerated.
    const salesCodesAreStrict = hasColumn(schema, 'sales_product_options', 'sabangnet_option_code');
    const invalid = codeRows.filter((row) => {
      if (row.code === null) return true;
      if (KID_ITEM_CODE_PATTERN.test(row.code)) return false;
      return salesCodesAreStrict || !isLegacySalesCode(row.kind);
    });
    if (invalid.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: invalid existing KID codes `
        + JSON.stringify(invalid.map(({ code, table_name, row_id }) => ({ code, table_name, row_id }))),
      );
    }

    const validMasterProducts = masterProducts.filter((row) => row.code !== null && KID_ITEM_CODE_PATTERN.test(row.code));
    const validSalesProducts = salesProducts.filter((row) => row.code !== null && KID_ITEM_CODE_PATTERN.test(row.code));
    const validSalesProductOptions = salesProductOptions.filter((row) => row.option_code !== null && KID_ITEM_CODE_PATTERN.test(row.option_code));
    const masterByCode = groupBy(validMasterProducts, (row) => row.code);
    const salesProductByCode = groupBy(validSalesProducts, (row) => row.code);
    const salesProductOptionByCode = groupBy(validSalesProductOptions, (row) => row.option_code);
    const salesProductOptionById = new Map(
      salesProductOptions.map((row) => [identityKey(row.organization_id, row.id), row]),
    );
    const componentsBySalesProductOption = groupComponents(salesProductOptionComponents);
    const componentsByChannelListingOption = groupComponents(channelListingOptionComponents);
    const salesProductOptionComponentsAvailable = hasColumns(schema, 'sales_product_option_components', [
      'organization_id', 'sales_product_option_id', 'master_product_id', 'quantity',
    ]);
    const channelListingOptionComponentsAvailable = hasColumns(schema, 'channel_listing_option_inventory_components', [
      'organization_id', 'channel_listing_option_id', 'master_product_id', 'quantity',
    ]);

    const duplicate: Array<{ code: string; table_name: string; row_count: number }> = [];
    for (const [code, rows] of masterByCode) {
      if (rows.length > 1) duplicate.push({ code, table_name: 'master_products', row_count: rows.length });
    }
    for (const [code, rows] of salesProductByCode) {
      if (rows.length > 1) duplicate.push({ code, table_name: 'sales_products', row_count: rows.length });
    }

    // A common option code can be shared by multiple common options only when
    // every one is the exact singleton reference to the same organization and
    // source UUID. The source row may already have been deleted; otherwise
    // each option code is an independent issuance.
    for (const [code, rows] of salesProductOptionByCode) {
      const master = unique(masterByCode.get(code));
      const allSingletonReuses = allOptionsShareCanonicalSource(
        rows,
        master,
        componentsBySalesProductOption,
        salesProductOptionComponentsAvailable,
      );
      if (rows.length > 1 && !allSingletonReuses) {
        duplicate.push({ code, table_name: 'sales_product_options', row_count: rows.length });
      }
      if (master !== null && !allSingletonReuses && rows.length > 0) {
        duplicate.push({ code, table_name: 'sales_product_options', row_count: rows.length });
      }
    }

    // SalesProduct codes are independently issued common-product identities;
    // they cannot collide with either a source product or a common option.
    for (const [code, rows] of salesProductByCode) {
      const collidingMasters = masterByCode.get(code) ?? [];
      const collidingOptions = salesProductOptionByCode.get(code) ?? [];
      if (collidingMasters.length > 0 || collidingOptions.length > 0) {
        duplicate.push({
          code,
          table_name: 'canonical_code_collision',
          row_count: rows.length + collidingMasters.length + collidingOptions.length,
        });
      }
    }

    if (duplicate.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: duplicate independently issued KID codes `
        + JSON.stringify(uniqueDuplicateRows(duplicate)),
      );
    }

    const invalidListingReuse: Array<Record<string, unknown>> = [];
    for (const listing of channelListingOptions) {
      if (listing.kid_item_code === null) continue;
      const code = listing.kid_item_code;
      const linkedOption = listing.sales_product_option_id === null
        ? null
        : salesProductOptionById.get(identityKey(listing.organization_id, listing.sales_product_option_id)) ?? null;

      if (listing.sales_product_option_id !== null && linkedOption === null) {
        invalidListingReuse.push({
          code,
          option_id: listing.sales_product_option_id,
          listing_id: listing.id,
          reason: 'linked common option is missing or belongs to another organization',
        });
        continue;
      }

      if (linkedOption !== null) {
        if (
          (
            salesCodesAreStrict
            || (linkedOption.option_code !== null && KID_ITEM_CODE_PATTERN.test(linkedOption.option_code))
          )
          && linkedOption.option_code !== code
        ) {
          invalidListingReuse.push({
            code,
            option_id: linkedOption.id,
            listing_id: listing.id,
            reason: 'listing code disagrees with its linked common option',
          });
          continue;
        }
        // A linked listing's recipe is a confirmed channel-owned fact. The
        // common option template may have been changed independently; KID and
        // organization identity are the only reuse contract here.
        continue;
      }

      const master = unique(masterByCode.get(code));
      const collidingSalesProducts = salesProductByCode.get(code) ?? [];
      const collidingOptions = salesProductOptionByCode.get(code) ?? [];
      if (collidingSalesProducts.length > 0) {
        invalidListingReuse.push({
          code,
          listing_id: listing.id,
          reason: 'unlinked listing collides with an independently issued common product',
        });
        continue;
      }
      if (
        collidingOptions.length > 0
        && !allUnlinkedRowsShareCanonicalSource(
          listing,
          collidingOptions,
          master,
          componentsBySalesProductOption,
          salesProductOptionComponentsAvailable,
          componentsByChannelListingOption,
          channelListingOptionComponentsAvailable,
        )
      ) {
        invalidListingReuse.push({
          code,
          listing_id: listing.id,
          reason: 'unlinked listing collides with a common option without an explicit link',
        });
        continue;
      }
      if (
        master !== null
        && singletonSourceReuseReference(
          listing.organization_id,
          listing.id,
          master,
          componentsByChannelListingOption,
          channelListingOptionComponentsAvailable,
        ) === null
      ) {
        invalidListingReuse.push({
          code,
          listing_id: listing.id,
          master_id: master.id,
          reason: 'legacy unlinked listing is not an exact singleton source reuse',
        });
      }
    }

    // A linked common option may be present at many malls. An unlinked row may
    // repeat only under the preserved source-singleton rule, and a mixed group
    // is allowed only when every row still proves that same source identity.
    for (const [code, rows] of groupBy(channelListingOptions.filter((row) => row.kid_item_code !== null), (row) => row.kid_item_code)) {
      if (rows.length < 2) continue;
      const master = unique(masterByCode.get(code));
      const allLinked = rows.every((row) => row.sales_product_option_id !== null);
      const allSameSingleton = rowsShareCanonicalSource(
        rows,
        master,
        salesProductOptionById,
        componentsBySalesProductOption,
        salesProductOptionComponentsAvailable,
        componentsByChannelListingOption,
        channelListingOptionComponentsAvailable,
      );
      if (!allLinked && !allSameSingleton) {
        invalidListingReuse.push({
          code,
          listing_ids: rows.map((row) => row.id),
          reason: 'repeated listing code is neither linked to a common option nor a source singleton reuse',
        });
      }
    }
    if (invalidListingReuse.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: MasterProduct/ChannelListingOption `
        + 'code collision is not a confirmed canonical reuse '
        + JSON.stringify(invalidListingReuse),
      );
    }

    const maxSuffix = codeRows.filter((row) => row.code !== null && KID_ITEM_CODE_PATTERN.test(row.code)).reduce((max, row) => {
      if (row.code === null) return max;
      return Math.max(max, Number(row.code.slice(3)));
    }, 0);
    if (maxSuffix > KID_ITEM_CODE_MAX) {
      throw new Error(`${KID_ITEM_CODE_SEQUENCE} is exhausted by existing code ${maxSuffix}.`);
    }

    const existed = await tx.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('public.kid_item_code_seq') IS NOT NULL AS exists
    `;
    const existedBeforeCreate = existed[0]?.exists === true;
    if (!existedBeforeCreate) {
      await tx.$executeRaw`
        CREATE SEQUENCE kid_item_code_seq
          AS integer
          MINVALUE 1
          MAXVALUE 99999999
          START WITH 1
          INCREMENT BY 1
          NO CYCLE
      `;
    }

    await assertKidItemCodeSequenceDefinition(tx);

    const sequenceState = await tx.$queryRaw<SequenceStateRow[]>`
      SELECT last_value, is_called
      FROM kid_item_code_seq
    `;
    const current = toSafeNonNegativeInteger(sequenceState[0]?.last_value ?? 0, 'sequence last value');
    const isCalled = sequenceState[0]?.is_called === true;
    let advanced = false;
    if (maxSuffix > 0 && (!isCalled || current < maxSuffix)) {
      await tx.$executeRaw`
        SELECT setval('kid_item_code_seq'::regclass, ${maxSuffix}, true)
      `;
      advanced = true;
    }

    return {
      changedRows: (existedBeforeCreate ? 0 : 1) + (advanced ? 1 : 0),
      details: {
        sequence: KID_ITEM_CODE_SEQUENCE,
        outcome: existedBeforeCreate && !advanced ? 'unchanged' : 'ensured',
        maxExistingSuffix: maxSuffix,
        sequenceLastValue: advanced ? maxSuffix : current,
        sequenceWasCreated: !existedBeforeCreate,
        sequenceWasAdvanced: advanced,
      },
    };
  },
};

type SequenceStateRow = { last_value: bigint | number | string; is_called: boolean };
type SequenceDefinitionRow = {
  min_value: bigint | number | string;
  max_value: bigint | number | string;
  increment_by: bigint | number | string;
  cycle: boolean;
};

/**
 * Existing sequence definitions are part of the allocator contract. A
 * sequence with a different bound, increment, or cycle policy could issue a
 * duplicate or out-of-range code, so an ensure/cutover fails closed rather
 * than silently altering it.
 */
export async function assertKidItemCodeSequenceDefinition(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const [definition] = await tx.$queryRaw<SequenceDefinitionRow[]>`
    SELECT
      seqmin AS min_value,
      seqmax AS max_value,
      seqincrement AS increment_by,
      seqcycle AS cycle
    FROM pg_sequence
    WHERE seqrelid = 'public.kid_item_code_seq'::regclass
  `;
  const actual = definition && {
    minValue: Number(definition.min_value),
    maxValue: Number(definition.max_value),
    incrementBy: Number(definition.increment_by),
    cycle: definition.cycle,
  };
  const expected = {
    minValue: 1,
    maxValue: KID_ITEM_CODE_MAX,
    incrementBy: 1,
    cycle: false,
  };
  if (
    !actual
    || !Number.isSafeInteger(actual.minValue)
    || !Number.isSafeInteger(actual.maxValue)
    || !Number.isSafeInteger(actual.incrementBy)
    || actual.minValue !== expected.minValue
    || actual.maxValue !== expected.maxValue
    || actual.incrementBy !== expected.incrementBy
    || actual.cycle !== expected.cycle
  ) {
    throw new Error(
      `${KID_ITEM_CODE_SEQUENCE} has a malformed definition: `
      + `${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`,
    );
  }
}

async function inspectAvailableSchema(tx: Prisma.TransactionClient): Promise<AvailableSchema> {
  const tables = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (
        'master_products',
        'sales_products',
        'sales_product_options',
        'sales_product_option_components',
        'channel_listing_options',
        'channel_listing_option_inventory_components'
      )
  `;
  const columns = await tx.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'master_products',
        'sales_products',
        'sales_product_options',
        'sales_product_option_components',
        'channel_listing_options',
        'channel_listing_option_inventory_components'
      )
  `;
  return {
    tables: new Set(tables.map((row) => row.table_name)),
    columns: new Set(columns.map((row) => `${row.table_name}.${row.column_name}`)),
  };
}

function hasColumn(schema: AvailableSchema, table: string, column: string): boolean {
  return schema.tables.has(table) && schema.columns.has(`${table}.${column}`);
}

function hasColumns(schema: AvailableSchema, table: string, columns: readonly string[]): boolean {
  return columns.every((column) => hasColumn(schema, table, column));
}

function isLegacySalesCode(kind: CodeRow['kind']): boolean {
  return kind === 'sales_product' || kind === 'sales_product_option';
}

function identityKey(organizationId: string, id: string): string {
  return `${organizationId}:${id}`;
}

function groupBy<T>(rows: readonly T[], readKey: (row: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = readKey(row);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function groupComponents(rows: readonly ComponentRow[]): Map<string, ComponentRow[]> {
  return groupBy(rows, (row) => identityKey(row.organization_id, row.owner_id));
}

function unique<T>(rows: readonly T[] | undefined): T | null {
  return rows?.length === 1 ? rows[0]! : null;
}

function singletonSourceReference(
  organizationId: string,
  ownerId: string,
  componentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  componentsAvailable: boolean,
): SourceReference | null {
  if (!componentsAvailable) return null;
  const components = componentsByOwner.get(identityKey(organizationId, ownerId)) ?? [];
  if (
    components.length !== 1
    || components[0]!.organization_id !== organizationId
    || components[0]!.quantity !== 1
  ) return null;
  return {
    organization_id: organizationId,
    master_product_id: components[0]!.master_product_id,
  };
}

function singletonSourceReuseReference(
  organizationId: string,
  ownerId: string,
  master: MasterCodeRow | null,
  componentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  componentsAvailable: boolean,
): SourceReference | null {
  const source = singletonSourceReference(organizationId, ownerId, componentsByOwner, componentsAvailable);
  if (
    source === null
    || (master !== null && (
      master.organization_id !== source.organization_id
      || master.id !== source.master_product_id
    ))
  ) return null;
  return source;
}

function sameSourceReferences(references: readonly SourceReference[]): boolean {
  const first = references[0];
  return first !== undefined && references.every((reference) =>
    reference.organization_id === first.organization_id
    && reference.master_product_id === first.master_product_id);
}

function allOptionsShareCanonicalSource(
  rows: readonly SalesProductOptionCodeRow[],
  master: MasterCodeRow | null,
  componentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  componentsAvailable: boolean,
): boolean {
  const references = rows.map((row) => singletonSourceReuseReference(
    row.organization_id,
    row.id,
    master,
    componentsByOwner,
    componentsAvailable,
  ));
  return references.every((reference): reference is SourceReference => reference !== null)
    && sameSourceReferences(references);
}

function allUnlinkedRowsShareCanonicalSource(
  listing: ChannelListingOptionCodeRow,
  options: readonly SalesProductOptionCodeRow[],
  master: MasterCodeRow | null,
  optionComponentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  optionComponentsAvailable: boolean,
  listingComponentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  listingComponentsAvailable: boolean,
): boolean {
  const listingReference = singletonSourceReuseReference(
    listing.organization_id,
    listing.id,
    master,
    listingComponentsByOwner,
    listingComponentsAvailable,
  );
  const optionReferences = options.map((option) => singletonSourceReuseReference(
    option.organization_id,
    option.id,
    master,
    optionComponentsByOwner,
    optionComponentsAvailable,
  ));
  const references = [listingReference, ...optionReferences];
  return references.every((reference): reference is SourceReference => reference !== null)
    && sameSourceReferences(references);
}

function rowsShareCanonicalSource(
  rows: readonly ChannelListingOptionCodeRow[],
  master: MasterCodeRow | null,
  optionsById: ReadonlyMap<string, SalesProductOptionCodeRow>,
  optionComponentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  optionComponentsAvailable: boolean,
  listingComponentsByOwner: ReadonlyMap<string, ComponentRow[]>,
  listingComponentsAvailable: boolean,
): boolean {
  const references = rows.map((row) => {
    if (row.sales_product_option_id !== null) {
      const option = optionsById.get(identityKey(row.organization_id, row.sales_product_option_id));
      return option === undefined ? null : singletonSourceReuseReference(
        option.organization_id,
        option.id,
        master,
        optionComponentsByOwner,
        optionComponentsAvailable,
      );
    }
    return singletonSourceReuseReference(
      row.organization_id,
      row.id,
      master,
      listingComponentsByOwner,
      listingComponentsAvailable,
    );
  });
  return references.every((reference): reference is SourceReference => reference !== null)
    && sameSourceReferences(references);
}

function uniqueDuplicateRows(
  rows: readonly { code: string; table_name: string; row_count: number }[],
): { code: string; table_name: string; row_count: number }[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.code}:${row.table_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toSafeNonNegativeInteger(value: bigint | number | string, label: string): number {
  const result = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > KID_ITEM_CODE_MAX) {
    throw new Error(`${KID_ITEM_CODE_SEQUENCE} returned an invalid ${label}: ${String(value)}.`);
  }
  return result;
}
