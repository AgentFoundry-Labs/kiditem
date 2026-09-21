import type { EnsureStep } from './types';
import type { Prisma } from '@prisma/client';

export const KID_ITEM_CODE_SEQUENCE = 'kid_item_code_seq';
export const KID_ITEM_CODE_PATTERN = /^KID[0-9]{8}$/;
export const KID_ITEM_CODE_MAX = 99_999_999;

type CodeRow = { code: string; table_name: string; row_id: string };
type MaxCodeRow = { max_suffix: bigint | number | string | null };
type SequenceStateRow = { last_value: bigint | number | string; is_called: boolean };
type SequenceDefinitionRow = {
  min_value: bigint | number | string;
  max_value: bigint | number | string;
  increment_by: bigint | number | string;
  cycle: boolean;
};

/**
 * The sequence is the only allocator for independently issued KID codes. It
 * is shared by MasterProduct and ChannelListingOption so a new code cannot be
 * handed out twice. A singleton ChannelListingOption may intentionally reuse
 * its component MasterProduct's code; that is a reference to the canonical
 * code, not a second allocation.
 */
export const kidItemCodeSequenceStep: EnsureStep = {
  id: 'ensure:kid_item_code_sequence',
  name: 'Ensure the bounded global KID item-code sequence is aligned',
  async run(tx) {
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: this is a global allocator lock, not a tenant read.
      SELECT pg_advisory_xact_lock(hashtextextended('kiditem.kid-item-code-sequence', 0))::text AS "lock"
    `;

    const invalid = await tx.$queryRaw<CodeRow[]>`
      SELECT code, 'master_products' AS table_name, id::text AS row_id
      FROM master_products
      WHERE code IS NULL OR code !~ '^KID[0-9]{8}$'
      UNION ALL
      SELECT kid_item_code AS code, 'channel_listing_options' AS table_name, id::text AS row_id
      FROM channel_listing_options
      WHERE kid_item_code IS NOT NULL AND kid_item_code !~ '^KID[0-9]{8}$'
      ORDER BY table_name, row_id
    `;
    if (invalid.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: invalid existing KID codes `
        + JSON.stringify(invalid),
      );
    }

    const duplicate = await tx.$queryRaw<Array<{ code: string; table_name: string; row_count: bigint | number | string }>>`
      WITH master_duplicates AS (
        SELECT code, 'master_products' AS table_name, COUNT(*)::bigint AS row_count
        FROM master_products
        WHERE code IS NOT NULL
        GROUP BY code
        HAVING COUNT(*) > 1
      ), channel_code_rows AS (
        SELECT
          option.kid_item_code AS code,
          (
            master.id IS NOT NULL
            AND master.organization_id = option.organization_id
            AND COUNT(component.id) = 1
            AND BOOL_AND(component.quantity = 1) IS TRUE
            AND BOOL_AND(component.master_product_id = master.id) IS TRUE
          ) AS legal_singleton_reuse
        FROM channel_listing_options option
        LEFT JOIN master_products master ON master.code = option.kid_item_code
        LEFT JOIN channel_listing_option_inventory_components component
          ON component.channel_listing_option_id = option.id
         AND component.organization_id = option.organization_id
        WHERE option.kid_item_code IS NOT NULL
        GROUP BY option.id, option.kid_item_code, master.id, master.organization_id, option.organization_id
      ), channel_duplicates AS (
        SELECT code, 'channel_listing_options' AS table_name, COUNT(*)::bigint AS row_count
        FROM channel_code_rows
        GROUP BY code
        HAVING COUNT(*) > 1
           AND BOOL_AND(legal_singleton_reuse) IS NOT TRUE
      )
      SELECT code, table_name, row_count FROM master_duplicates
      UNION ALL
      SELECT code, table_name, row_count FROM channel_duplicates
      ORDER BY table_name, code
    `;
    if (duplicate.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: duplicate independently issued KID codes `
        + JSON.stringify(duplicate),
      );
    }

    const illegalReuse = await tx.$queryRaw<Array<{
      code: string;
      option_id: string;
      master_id: string;
      component_count: bigint | number | string;
    }>>`
      SELECT
        option.kid_item_code AS code,
        option.id::text AS option_id,
        master.id::text AS master_id,
        COUNT(component.id)::bigint AS component_count
      FROM channel_listing_options option
      JOIN master_products master ON master.code = option.kid_item_code
      LEFT JOIN channel_listing_option_inventory_components component
        ON component.channel_listing_option_id = option.id
       AND component.organization_id = option.organization_id
      WHERE option.kid_item_code IS NOT NULL
      GROUP BY option.id, option.kid_item_code, master.id
      HAVING COUNT(component.id) <> 1
          OR BOOL_AND(component.quantity = 1) IS NOT TRUE
          OR BOOL_AND(component.master_product_id = master.id) IS NOT TRUE
          OR master.organization_id <> option.organization_id
      ORDER BY option.id
    `;
    if (illegalReuse.length > 0) {
      throw new Error(
        `${KID_ITEM_CODE_SEQUENCE} cannot be ensured: MasterProduct/ChannelListingOption `
        + 'code collision is not a singleton canonical-code reuse '
        + JSON.stringify(illegalReuse),
      );
    }

    const maxRows = await tx.$queryRaw<MaxCodeRow[]>`
      SELECT MAX(suffix)::bigint AS max_suffix
      FROM (
        SELECT substring(code FROM 4)::bigint AS suffix
        FROM master_products
        WHERE code IS NOT NULL
        UNION ALL
        SELECT substring(kid_item_code FROM 4)::bigint AS suffix
        FROM channel_listing_options
        WHERE kid_item_code IS NOT NULL
      ) codes
    `;
    const maxSuffix = toSafeNonNegativeInteger(maxRows[0]?.max_suffix ?? 0, 'max KID suffix');
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

function toSafeNonNegativeInteger(value: bigint | number | string, label: string): number {
  const result = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > KID_ITEM_CODE_MAX) {
    throw new Error(`${KID_ITEM_CODE_SEQUENCE} returned an invalid ${label}: ${String(value)}.`);
  }
  return result;
}
