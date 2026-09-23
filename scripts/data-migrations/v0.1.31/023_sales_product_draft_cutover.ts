import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  clampDraftText,
  planDraftOptions,
  type SalesProductTextField,
} from '../../../apps/server/src/channels/domain/sales-product/sales-product-draft';
import { salesProductOptionKey } from '@kiditem/shared/sales-product';
import type { DataMigration } from '../types';

type Json = Record<string, unknown>;

type CandidateRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  source_platform: string | null;
  source_url: string | null;
  cost_cny: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  raw_data: unknown;
  status: string;
  sales_product_id: string | null;
  sales_product_status: string | null;
};

/**
 * 후보와 판매상품이 공존하지 않게 만든다(KID-310, 사장님 결정 2026-09-23).
 *
 * 수집상품에 흩어져 있던 편집값(`rawData.manualBasics`, 등록 설정의 `registrationInput`)을
 * 판매상품 초안 한 줄로 옮기고, 후보의 `rawData` 에는 원문만 남긴다. KID 는 발급하지 않는다 —
 * 팔기로 정할 때(첫 등록 설정 · 몰 엑셀) 발급한다.
 *
 * 애매하면 통째로 멈춘다: 한 후보에 초안이 둘이면 rollback. 상품 × 몰 계정에 활성 등록 설정이
 * 여럿이면 가장 최근 하나만 남기고 나머지는 보관한다(ADR-0010 데이터 폐기 정책).
 * 다시 돌리면 아무것도 바꾸지 않는다.
 */
export const salesProductDraftCutoverMigration: DataMigration = {
  id: 'v0.1.31:023_sales_product_draft_cutover',
  releaseVersion: '0.1.31',
  name: 'Move collected-product edits onto one selling-product draft per candidate',
  phase: 'pre-schema',
  async run(tx) {
    const shape = await readShape(tx);
    if (!shape.candidates || !shape.sales_products) {
      return { affectedRows: 0, details: { outcome: 'tables_absent' } };
    }
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: serialize this global, writer-stopped cutover.
      SELECT pg_advisory_xact_lock(hashtextextended('kiditem.sales-product-draft-cutover', 0))::text AS "lock"
    `;
    await assertOneDraftPerCandidate(tx);
    // 022 와 같은 expand 순서다: push 전에 우리가 쓸 칸을 만들고, 022 가 NOT NULL 로 세워 둔
    // 코드 · 가격 칸을 푼다. 초안은 KID 없이 · 가격 없이 존재해야 한다(ADR-0022).
    await expandDraftColumns(tx);
    if (!(await readShape(tx)).draft_columns) {
      throw new Error('The draft columns are still missing after expand; the draft cutover stopped before mutation.');
    }
    const archivedDuplicateTargets = shape.targets ? await archiveDuplicateTargets(tx) : 0;

    const candidates = await readCandidates(tx, shape);
    let createdDrafts = 0;
    let filledDrafts = 0;
    let movedMallValues = 0;
    let movedDefaults = 0;
    let createdTargets = 0;
    let discardedMallValues = 0;
    let truncatedValues = 0;
    for (const candidate of candidates) {
      const raw = asRecord(candidate.raw_data);
      const manual = asRecord(raw.manualBasics);
      const registrationInput = shape.targets ? await readTargetInput(tx, candidate) : {};
      const projected = projectDraft(candidate, manual, registrationInput);
      truncatedValues += projected.truncated;
      if (candidate.sales_product_id) {
        filledDrafts += await fillEmptyColumns(tx, candidate.sales_product_id, candidate.organization_id, projected);
      } else {
        await createDraft(tx, candidate, projected, await readCandidateImages(tx, candidate));
        createdDrafts += 1;
      }
      if (shape.targets) {
        const moved = await moveMallValues(tx, candidate, manual, projected);
        movedMallValues += moved.values;
        movedDefaults += moved.defaults;
        createdTargets += moved.created;
        discardedMallValues += moved.discarded;
      }
    }
    // 초안을 다 만든 뒤에 잇는다. 이 이관이 만든 초안도 몰 상품의 원천이라, 먼저 이으면
    // 그 상품만 `sales_product_id` 가 빈 채로 push 를 맞고 후보 열과 함께 원천을 잃는다.
    const linkedListings = shape.listings ? await backfillListingDrafts(tx) : 0;
    const strippedCandidates = await stripCandidateEdits(tx);

    return {
      affectedRows: createdDrafts + filledDrafts + movedMallValues + movedDefaults
        + strippedCandidates + linkedListings,
      details: {
        createdDrafts,
        filledDrafts,
        movedMallValues,
        movedDefaults,
        createdTargets,
        discardedMallValues,
        strippedCandidates,
        truncatedValues,
        archivedDuplicateTargets,
        linkedListings,
        outcome: 'moved',
      },
    };
  },
};

/** 편집값이 갈 칸. 이 목록이 이관과 '빈 칸만 채우기'의 유일한 기준이다. */
const DRAFT_COLUMNS = [
  'description', 'target_audience', 'age_group', 'product_size',
  'brand', 'manufacturer', 'model_name', 'model_no',
  'origin_country', 'standard_category', 'notice_category', 'import_declaration_no', 'admin_memo',
] as const;

type ProjectedDraft = {
  name: string;
  columns: Record<(typeof DRAFT_COLUMNS)[number], string | null>;
  sourcePlatform: string | null;
  keywords: string[];
  colorVariantNames: string[];
  boxSetQuantity: number | null;
  noticeValues: string[];
  certifications: Json[] | null;
  kcStatus: 'unknown' | 'none' | 'exists';
  registrationDefaults: Json | null;
  salePrice: number | null;
  optionNames: string[];
  /** 칸 너비를 넘어 잘라낸 값의 수. 이관 보고에 쌓인다. */
  truncated: number;
};

/**
 * 컬럼 투영 우선순위: 등록 설정 입력값 → 후보의 수기 편집값(manualBasics) → 원문.
 * 프리젠터가 하던 3단 권위를 여기서 한 번만 적용하고 끝낸다.
 *
 * 원천 값은 판매상품 칸보다 길 수 있다 — 1688 이름은 흔히 255 자를 넘는다. 거절하면 그 후보만
 * 못 옮기는 게 아니라 이관 전체가 멈추므로, 런타임과 같은 규칙(`clampDraftText`)으로 자르고
 * 자른 건수를 보고한다.
 */
function projectDraft(candidate: CandidateRow, manual: Json, registrationInput: Json): ProjectedDraft {
  const raw = asRecord(candidate.raw_data);
  let truncated = 0;
  const clamp = (field: SalesProductTextField, value: string | null): string | null => {
    const cut = clampDraftText(field, value);
    if (cut.truncated) truncated += 1;
    return cut.value;
  };
  const pick = (...keys: string[]): string | null => {
    for (const source of [registrationInput, manual, raw]) {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      }
    }
    return null;
  };
  const list = (...keys: string[]): string[] => {
    for (const source of [registrationInput, manual, raw]) {
      for (const key of keys) {
        const value = source[key];
        if (Array.isArray(value)) {
          const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
          if (items.length > 0) return items.map((item) => item.trim());
        }
      }
    }
    return [];
  };
  const number = (...keys: string[]): number | null => {
    const value = pick(...keys);
    const parsed = value === null ? Number.NaN : Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  };
  const name = clamp('name', pick('name', 'productName', 'title') ?? candidate.name) ?? candidate.name;
  const columns: ProjectedDraft['columns'] = {
    description: pick('description', 'productDescription') ?? candidate.description ?? null,
    target_audience: clamp('targetAudience', pick('targetAudience', 'target')),
    age_group: clamp('ageGroup', pick('ageGroup', 'age')),
    product_size: clamp('productSize', pick('productSize', 'size')),
    brand: clamp('brand', pick('brand')),
    manufacturer: clamp('manufacturer', pick('manufacturer', 'maker')),
    model_name: clamp('modelName', pick('modelName')),
    model_no: clamp('modelNo', pick('modelNo', 'modelNumber')),
    origin_country: clamp('originCountry', pick('originCountry', 'origin')),
    standard_category: clamp('standardCategory', pick('standardCategory')),
    notice_category: clamp('noticeCategory', pick('noticeCategory')),
    import_declaration_no: clamp('importDeclarationNo', pick('importDeclarationNo')),
    admin_memo: pick('adminMemo', 'memo'),
  };
  const sourcePlatform = clamp('sourcePlatform', candidate.source_platform);
  return {
    name,
    columns,
    sourcePlatform,
    truncated,
    keywords: list('keywords', 'tags'),
    colorVariantNames: list('colorVariantNames', 'colors'),
    boxSetQuantity: number('boxSetQuantity', 'boxQuantity'),
    noticeValues: list('noticeValues'),
    certifications: certificationsOf(registrationInput, manual),
    kcStatus: kcStatusOf(registrationInput, manual),
    registrationDefaults: asRecordOrNull(registrationInput.mallRegisterShared ?? manual.mallRegisterShared),
    salePrice: number('salePrice'),
    optionNames: list('optionNames', 'options'),
  };
}

/**
 * KC 가 걸리는 방식. 사람이 수기로 'none'(해당 없음) 이라고 말해 둔 것만 옮긴다 — 나머지는
 * 인증 문서가 말하므로 `unknown` 으로 두고 게이트가 문서를 본다.
 */
function kcStatusOf(registrationInput: Json, manual: Json): 'unknown' | 'none' | 'exists' {
  for (const source of [registrationInput, manual]) {
    const value = source.kcCertificationStatus;
    if (value === 'none' || value === 'exists') return value;
  }
  return 'unknown';
}

function certificationsOf(registrationInput: Json, manual: Json): Json[] | null {
  for (const source of [registrationInput, manual]) {
    const value = source.certifications;
    if (Array.isArray(value)) {
      const rows = value.filter((item): item is Json => !!item && typeof item === 'object' && !Array.isArray(item));
      if (rows.length > 0) return rows;
    }
    const number = source.kcNumber ?? source.certificationNumber;
    if (typeof number === 'string' && number.trim()) return [{ number: number.trim() }];
  }
  return null;
}

async function readShape(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<Array<{
    candidates: boolean; sales_products: boolean; targets: boolean; images: boolean;
    listings: boolean; draft_columns: boolean;
  }>>`
    SELECT to_regclass('sourcing_candidates') IS NOT NULL AS candidates,
      to_regclass('sales_products') IS NOT NULL AS sales_products,
      to_regclass('registration_targets') IS NOT NULL AS targets,
      to_regclass('candidate_images') IS NOT NULL AS images,
      EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('channel_listings')
          AND attname = 'source_candidate_id' AND attnum > 0 AND NOT attisdropped
      ) AS listings,
      (SELECT count(*) FROM pg_attribute
        WHERE attrelid = to_regclass('sales_products')
          AND attnum > 0 AND NOT attisdropped
          AND attname IN ('target_audience', 'age_group', 'product_size',
            'color_variant_names', 'box_set_quantity', 'registration_defaults')) = 6 AS draft_columns
  `;
  return row!;
}

/**
 * push 전에 우리가 쓸 칸을 만든다(022 의 expand 패턴). 초안은 KID 도 가격도 없이 존재하므로
 * 022 가 NOT NULL 로 세워 둔 코드 · 판매가도 여기서 푼다.
 */
async function expandDraftColumns(tx: Prisma.TransactionClient): Promise<void> {
  // 너비는 Prisma 와 같아야 한다. text 로 만들어 두면 push 가 좁힐 때 넘치는 줄에서 터진다.
  const columns: Array<[string, string]> = [
    ['description', `text NOT NULL DEFAULT ''`],
    ['target_audience', 'varchar(200)'],
    ['age_group', 'varchar(100)'],
    ['product_size', 'varchar(200)'],
    ['color_variant_names', `text[] NOT NULL DEFAULT '{}'`],
    ['box_set_quantity', 'integer'],
    ['registration_defaults', 'jsonb'],
    ['keywords', `text[] NOT NULL DEFAULT '{}'`],
    ['notice_values', `text[] NOT NULL DEFAULT '{}'`],
    ['certifications', 'jsonb'],
    ['kc_status', `varchar(20) NOT NULL DEFAULT 'unknown'`],
    ['brand', 'varchar(50)'], ['manufacturer', 'varchar(50)'],
    ['model_name', 'varchar(60)'], ['model_no', 'varchar(60)'],
    ['origin_country', 'varchar(50)'], ['standard_category', 'varchar(40)'],
    ['notice_category', 'varchar(10)'],
    ['import_declaration_no', 'varchar(60)'], ['admin_memo', 'text'],
    ['tax_type', `text NOT NULL DEFAULT 'taxable'`],
    ['source_platform', 'varchar(40)'], ['source_url', 'text'],
  ];
  for (const [column, definition] of columns) {
    await tx.$executeRawUnsafe(
      `ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS "${column}" ${definition}`,
    );
  }
  // 수집 초안은 코드를 발급하지 않고 판매가도 비어 있다(발급 시점 B).
  await tx.$executeRaw`ALTER TABLE sales_products ALTER COLUMN code DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE sales_product_options ALTER COLUMN option_code DROP NOT NULL`;
  await tx.$executeRaw`ALTER TABLE sales_product_options ALTER COLUMN sale_price DROP NOT NULL`;
}

/**
 * 몰 상품은 이제 판매상품 초안을 거쳐 원천에 닿는다(KID-310). `source_candidate_id` 가
 * 지워지기 전에 그 후보의 초안으로 이어 둔다 — 잇지 못하면 KC 근거가 영영 사라진다.
 */
async function backfillListingDrafts(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    -- queryraw-tenancy-exempt: writer-stopped cutover across every organization.
    UPDATE channel_listings AS listing
    SET sales_product_id = product.id
    FROM sales_products AS product
    WHERE listing.sales_product_id IS NULL
      AND listing.source_candidate_id IS NOT NULL
      AND product.source_candidate_id = listing.source_candidate_id
      AND product.organization_id = listing.organization_id
  `;
}

/** 한 후보에 초안이 둘이면 어느 쪽이 정본인지 아무도 모른다 — 통째로 멈춘다. */
async function assertOneDraftPerCandidate(tx: Prisma.TransactionClient): Promise<void> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>`
    -- queryraw-tenancy-exempt: validate every organization before the writer-stopped cutover.
    SELECT count(*)::bigint AS count FROM (
      SELECT organization_id, source_candidate_id
      FROM sales_products
      WHERE source_candidate_id IS NOT NULL
      GROUP BY organization_id, source_candidate_id
      HAVING count(*) > 1
    ) AS duplicates
  `;
  if (Number(row?.count ?? 0) > 0) {
    throw new Error('One collected product has more than one selling product; the draft cutover stopped before mutation.');
  }
}

/**
 * 상품 × 몰 계정당 활성 등록 설정은 하나다(KID-310). 여럿이면 가장 최근 것만 남기고 보관한다 —
 * 어느 설정의 가격이 몰로 갔는지 아무도 모르는 상태를 스키마가 막기 전에 정리한다.
 */
async function archiveDuplicateTargets(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    -- queryraw-tenancy-exempt: writer-stopped cutover across every organization.
    UPDATE registration_targets
    SET archived_at = NOW()
    WHERE archived_at IS NULL
      AND id NOT IN (
        SELECT DISTINCT ON (organization_id, sales_product_id, channel_account_id) id
        FROM registration_targets
        WHERE archived_at IS NULL
        ORDER BY organization_id, sales_product_id, channel_account_id, updated_at DESC, id DESC
      )
  `;
}

async function readCandidates(
  tx: Prisma.TransactionClient,
  shape: { targets: boolean },
): Promise<CandidateRow[]> {
  void shape;
  return tx.$queryRaw<CandidateRow[]>`
    -- queryraw-tenancy-exempt: writer-stopped cutover across every organization.
    SELECT candidate.id::text AS id,
           candidate.organization_id::text AS organization_id,
           candidate.name,
           candidate.description,
           candidate.source_platform,
           candidate.source_url,
           candidate.cost_cny::text AS cost_cny,
           candidate.thumbnail_url,
           candidate.image_url,
           candidate.raw_data,
           candidate.status,
           product.id::text AS sales_product_id,
           product.status AS sales_product_status
    FROM sourcing_candidates AS candidate
    LEFT JOIN sales_products AS product
      ON product.source_candidate_id = candidate.id
     AND product.organization_id = candidate.organization_id
    WHERE candidate.is_deleted = false
    ORDER BY candidate.organization_id, candidate.id
  `;
}

async function readCandidateImages(tx: Prisma.TransactionClient, candidate: CandidateRow): Promise<string[]> {
  const urls = [candidate.thumbnail_url, candidate.image_url]
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  const rows = await tx.$queryRaw<Array<{ url: string }>>`
    SELECT image_url AS url FROM candidate_images
    WHERE candidate_id = ${candidate.id}::uuid
      AND organization_id = ${candidate.organization_id}::uuid
      AND is_deleted = false
    ORDER BY sort_order ASC, created_at ASC
  `;
  for (const row of rows) if (row.url?.trim() && !urls.includes(row.url)) urls.push(row.url);
  return urls.slice(0, 30);
}

async function readTargetInput(tx: Prisma.TransactionClient, candidate: CandidateRow): Promise<Json> {
  if (!candidate.sales_product_id) return {};
  const rows = await tx.$queryRaw<Array<{ registration_input: unknown }>>`
    SELECT registration_input FROM registration_targets
    WHERE sales_product_id = ${candidate.sales_product_id}::uuid
      AND organization_id = ${candidate.organization_id}::uuid
      AND archived_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return asRecord(rows[0]?.registration_input);
}

async function createDraft(
  tx: Prisma.TransactionClient,
  candidate: CandidateRow,
  draft: ProjectedDraft,
  imageUrls: string[],
): Promise<void> {
  const id = randomUUID();
  const { optionAxes, optionValues } = planDraftOptions(draft.optionNames);
  // 거절한 후보의 초안은 팔 물건이 아니다 — 런타임이 거절에서 `unused` 로 내리는 것과 같다
  // (`sourcing/CLAUDE.md`). 팔 옵션에 값이 다 차야 active 고, 옮겨 온 값이 없으면 초안이다.
  const status = candidate.status === 'rejected'
    ? 'unused'
    : draft.salePrice === null ? 'draft' : 'active';
  await tx.$executeRaw`
    INSERT INTO sales_products (
      id, organization_id, code, name, description, target_audience, age_group, product_size,
      color_variant_names, box_set_quantity, registration_defaults, keywords, notice_values,
      certifications, kc_status, brand, manufacturer, model_name, model_no, origin_country, standard_category,
      notice_category, import_declaration_no, admin_memo, status, tax_type, option_axes, image_urls,
      source_candidate_id, source_platform, source_url, version, created_at, updated_at
    ) VALUES (
      ${id}::uuid, ${candidate.organization_id}::uuid, NULL, ${draft.name},
      ${draft.columns.description ?? ''},
      ${draft.columns.target_audience}, ${draft.columns.age_group}, ${draft.columns.product_size},
      ${draft.colorVariantNames}::text[], ${draft.boxSetQuantity},
      ${draft.registrationDefaults === null ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(draft.registrationDefaults)}::jsonb`},
      ${draft.keywords}::text[], ${draft.noticeValues}::text[],
      ${draft.certifications === null ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(draft.certifications)}::jsonb`},
      ${draft.kcStatus},
      ${draft.columns.brand}, ${draft.columns.manufacturer}, ${draft.columns.model_name}, ${draft.columns.model_no},
      ${draft.columns.origin_country}, ${draft.columns.standard_category},
      ${draft.columns.notice_category}, ${draft.columns.import_declaration_no}, ${draft.columns.admin_memo},
      ${status}, 'taxable', ${optionAxes}::text[], ${imageUrls}::text[],
      ${candidate.id}::uuid, ${draft.sourcePlatform}, ${candidate.source_url}, 1, NOW(), NOW()
    )
  `;
  for (const [index, values] of optionValues.entries()) {
    await tx.$executeRaw`
      INSERT INTO sales_product_options (
        id, organization_id, sales_product_id, option_code, values, option_key,
        sale_price, supply_status, sort_order, created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid, ${candidate.organization_id}::uuid, ${id}::uuid, NULL,
        ${values}::text[], ${salesProductOptionKey(values)},
        ${draft.salePrice}, 'selling', ${index}, NOW(), NOW()
      )
    `;
  }
}

/** 이미 초안이 있으면 비어 있는 칸만 채운다 — 사람이 고친 값은 덮지 않는다. */
async function fillEmptyColumns(
  tx: Prisma.TransactionClient,
  salesProductId: string,
  organizationId: string,
  draft: ProjectedDraft,
): Promise<number> {
  let written = 0;
  for (const column of DRAFT_COLUMNS) {
    const value = draft.columns[column];
    if (value === null) continue;
    written += await tx.$executeRaw`
      UPDATE sales_products
      SET ${Prisma.raw(`"${column}"`)} = ${value}
      WHERE id = ${salesProductId}::uuid
        AND organization_id = ${organizationId}::uuid
        AND (${Prisma.raw(`"${column}"`)} IS NULL OR ${Prisma.raw(`"${column}"`)} = '')
    `;
  }
  if (draft.keywords.length > 0) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET keywords = ${draft.keywords}::text[]
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND cardinality(keywords) = 0
    `;
  }
  if (draft.kcStatus !== 'unknown') {
    written += await tx.$executeRaw`
      UPDATE sales_products SET kc_status = ${draft.kcStatus}
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND kc_status = 'unknown'
    `;
  }
  if (draft.registrationDefaults !== null) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET registration_defaults = ${JSON.stringify(draft.registrationDefaults)}::jsonb
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND registration_defaults IS NULL
    `;
  }
  if (draft.colorVariantNames.length > 0) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET color_variant_names = ${draft.colorVariantNames}::text[]
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND cardinality(color_variant_names) = 0
    `;
  }
  if (draft.noticeValues.length > 0) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET notice_values = ${draft.noticeValues}::text[]
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND cardinality(notice_values) = 0
    `;
  }
  if (draft.boxSetQuantity !== null) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET box_set_quantity = ${draft.boxSetQuantity}
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND box_set_quantity IS NULL
    `;
  }
  if (draft.certifications !== null) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET certifications = ${JSON.stringify(draft.certifications)}::jsonb
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND (certifications IS NULL OR certifications = '[]'::jsonb)
    `;
  }
  return written;
}

/**
 * `mallRegisterValues` → 그 몰의 등록 설정 `registration_input`,
 * `mallRegisterShared` → 초안의 `registration_defaults`.
 *
 * 설정이 없으면 만든다 — 사장님이 그 몰에 쓰려고 적어 둔 값이라 갈 곳이 있어야 한다. 그 몰에
 * 계정이 없으면 옮길 데가 없으므로 버린 건수로 보고한다. 같은 상품 · 같은 계정에 활성 설정이
 * 둘 이상이면 어느 쪽 값인지 아무도 모르므로 통째로 멈춘다.
 */
async function moveMallValues(
  tx: Prisma.TransactionClient,
  candidate: CandidateRow,
  manual: Json,
  draft: ProjectedDraft,
): Promise<{ values: number; defaults: number; created: number; discarded: number }> {
  const byMall = asRecord(manual.mallRegisterValues);
  const defaults = draft.registrationDefaults === null ? 0 : 1;
  if (Object.keys(byMall).length === 0) return { values: 0, defaults, created: 0, discarded: 0 };
  const [product] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM sales_products
    WHERE source_candidate_id = ${candidate.id}::uuid
      AND organization_id = ${candidate.organization_id}::uuid
  `;
  if (!product) return { values: 0, defaults, created: 0, discarded: Object.keys(byMall).length };

  let values = 0;
  let created = 0;
  let discarded = 0;
  for (const [mallKey, mallValues] of Object.entries(byMall)) {
    const payload = asRecordOrNull(mallValues);
    if (!payload) continue;
    const accounts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM channel_accounts
      WHERE organization_id = ${candidate.organization_id}::uuid AND channel = ${mallKey}
      ORDER BY created_at ASC, id ASC
    `;
    if (accounts.length === 0) {
      discarded += 1;
      continue;
    }
    for (const account of accounts) {
      const targets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM registration_targets
        WHERE organization_id = ${candidate.organization_id}::uuid
          AND sales_product_id = ${product.id}::uuid
          AND channel_account_id = ${account.id}::uuid
          AND archived_at IS NULL
      `;
      if (targets.length > 1) {
        throw new Error(
          'One selling product and mall account has more than one active registration setting; the draft cutover stopped before mutation.',
        );
      }
      if (targets.length === 1) {
        values += await tx.$executeRaw`
          UPDATE registration_targets
          SET registration_input = registration_input || ${JSON.stringify(payload)}::jsonb
          WHERE id = ${targets[0]!.id}::uuid
            AND organization_id = ${candidate.organization_id}::uuid
        `;
        continue;
      }
      await tx.$executeRaw`
        INSERT INTO registration_targets (
          id, organization_id, sales_product_id, channel_account_id, display_name,
          registration_input, version, created_at, updated_at
        ) VALUES (
          ${randomUUID()}::uuid, ${candidate.organization_id}::uuid, ${product.id}::uuid,
          ${account.id}::uuid, ${draft.name},
          ${JSON.stringify(payload)}::jsonb, 1, NOW(), NOW()
        )
      `;
      created += 1;
      values += 1;
    }
  }
  return { values, defaults, created, discarded };
}

/**
 * 후보의 `rawData` 에는 원문만 남긴다. 편집 키는 초안으로 옮겼으니 지운다.
 *
 * 초안이 생긴 후보(살아 있는 후보)만 지운다 — 지운 후보의 편집값까지 없애면 이관이 옮기지
 * 않은 값을 되찾을 방법이 사라진다.
 */
async function stripCandidateEdits(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    -- queryraw-tenancy-exempt: writer-stopped cutover across every organization.
    UPDATE sourcing_candidates AS candidate
    SET raw_data = candidate.raw_data - 'manualBasics' - 'registrationInput' - 'mallRegisterValues' - 'mallRegisterShared'
    FROM sales_products AS product
    WHERE product.source_candidate_id = candidate.id
      AND product.organization_id = candidate.organization_id
      AND candidate.is_deleted = false
      AND candidate.raw_data ?| ARRAY['manualBasics', 'registrationInput', 'mallRegisterValues', 'mallRegisterShared']
  `;
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asRecordOrNull(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}
