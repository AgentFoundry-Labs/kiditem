import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { planDraftOptions } from '../../../apps/server/src/channels/domain/sales-product/sales-product-draft';
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
    if (!shape.candidates || !shape.salesProducts) {
      return { affectedRows: 0, details: { outcome: 'tables_absent' } };
    }
    await tx.$queryRaw`
      -- queryraw-tenancy-exempt: serialize this global, writer-stopped cutover.
      SELECT pg_advisory_xact_lock(hashtextextended('kiditem.sales-product-draft-cutover', 0))::text AS "lock"
    `;
    await assertOneDraftPerCandidate(tx);
    const archivedDuplicateTargets = shape.targets ? await archiveDuplicateTargets(tx) : 0;

    const candidates = await readCandidates(tx, shape);
    let createdDrafts = 0;
    let filledDrafts = 0;
    let movedMallValues = 0;
    let movedDefaults = 0;
    for (const candidate of candidates) {
      const raw = asRecord(candidate.raw_data);
      const manual = asRecord(raw.manualBasics);
      const registrationInput = shape.targets ? await readTargetInput(tx, candidate) : {};
      const projected = projectDraft(candidate, manual, registrationInput);
      if (candidate.sales_product_id) {
        filledDrafts += await fillEmptyColumns(tx, candidate.sales_product_id, candidate.organization_id, projected);
      } else {
        await createDraft(tx, candidate, projected, await readCandidateImages(tx, candidate));
        createdDrafts += 1;
      }
      if (shape.targets) {
        const moved = await moveMallValues(tx, candidate, manual);
        movedMallValues += moved.values;
        movedDefaults += moved.defaults;
      }
    }
    const strippedCandidates = await stripCandidateEdits(tx);

    return {
      affectedRows: createdDrafts + filledDrafts + movedMallValues + movedDefaults + strippedCandidates,
      details: {
        createdDrafts,
        filledDrafts,
        movedMallValues,
        movedDefaults,
        strippedCandidates,
        archivedDuplicateTargets,
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
  keywords: string[];
  colorVariantNames: string[];
  boxSetQuantity: number | null;
  noticeValues: string[];
  certifications: Json[] | null;
  registrationDefaults: Json | null;
  salePrice: number | null;
  optionNames: string[];
};

/**
 * 컬럼 투영 우선순위: 등록 설정 입력값 → 후보의 수기 편집값(manualBasics) → 원문.
 * 프리젠터가 하던 3단 권위를 여기서 한 번만 적용하고 끝낸다.
 */
function projectDraft(candidate: CandidateRow, manual: Json, registrationInput: Json): ProjectedDraft {
  const raw = asRecord(candidate.raw_data);
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
  return {
    name: pick('name', 'productName', 'title') ?? candidate.name,
    columns: {
      description: pick('description', 'productDescription') ?? candidate.description ?? null,
      target_audience: pick('targetAudience', 'target'),
      age_group: pick('ageGroup', 'age'),
      product_size: pick('productSize', 'size'),
      brand: pick('brand'),
      manufacturer: pick('manufacturer', 'maker'),
      model_name: pick('modelName'),
      model_no: pick('modelNo', 'modelNumber'),
      origin_country: pick('originCountry', 'origin'),
      standard_category: pick('standardCategory'),
      notice_category: pick('noticeCategory'),
      import_declaration_no: pick('importDeclarationNo'),
      admin_memo: pick('adminMemo', 'memo'),
    },
    keywords: list('keywords', 'tags'),
    colorVariantNames: list('colorVariantNames', 'colors'),
    boxSetQuantity: number('boxSetQuantity', 'boxQuantity'),
    noticeValues: list('noticeValues'),
    certifications: certificationsOf(registrationInput, manual),
    registrationDefaults: asRecordOrNull(registrationInput.mallRegisterShared ?? manual.mallRegisterShared),
    salePrice: number('salePrice'),
    optionNames: list('optionNames', 'options'),
  };
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
    draft_columns: boolean;
  }>>`
    SELECT to_regclass('sourcing_candidates') IS NOT NULL AS candidates,
      to_regclass('sales_products') IS NOT NULL AS sales_products,
      to_regclass('registration_targets') IS NOT NULL AS targets,
      to_regclass('candidate_images') IS NOT NULL AS images,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sales_products' AND column_name = 'target_audience'
      ) AS draft_columns
  `;
  return row!;
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
  // 팔 옵션에 값이 다 차야 active 다. 옮겨 온 값이 없으면 초안으로 둔다.
  const status = draft.salePrice === null ? 'draft' : 'active';
  await tx.$executeRaw`
    INSERT INTO sales_products (
      id, organization_id, code, name, description, target_audience, age_group, product_size,
      color_variant_names, box_set_quantity, registration_defaults, keywords, notice_values,
      certifications, brand, manufacturer, model_name, model_no, origin_country, standard_category,
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
      ${draft.columns.brand}, ${draft.columns.manufacturer}, ${draft.columns.model_name}, ${draft.columns.model_no},
      ${draft.columns.origin_country}, ${draft.columns.standard_category},
      ${draft.columns.notice_category}, ${draft.columns.import_declaration_no}, ${draft.columns.admin_memo},
      ${status}, 'taxable', ${optionAxes}::text[], ${imageUrls}::text[],
      ${candidate.id}::uuid, ${candidate.source_platform}, ${candidate.source_url}, 1, NOW(), NOW()
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
  if (draft.registrationDefaults !== null) {
    written += await tx.$executeRaw`
      UPDATE sales_products SET registration_defaults = ${JSON.stringify(draft.registrationDefaults)}::jsonb
      WHERE id = ${salesProductId}::uuid AND organization_id = ${organizationId}::uuid
        AND registration_defaults IS NULL
    `;
  }
  return written;
}

/**
 * `mallRegisterValues` → 그 몰 계정의 등록 설정 `registration_input`,
 * `mallRegisterShared` → 초안의 `registration_defaults`.
 * 설정이 없으면 만들지 않는다 — 몰 계정을 고르는 것은 사람이 하는 판단이다.
 */
async function moveMallValues(
  tx: Prisma.TransactionClient,
  candidate: CandidateRow,
  manual: Json,
): Promise<{ values: number; defaults: number }> {
  const byMall = asRecord(manual.mallRegisterValues);
  if (Object.keys(byMall).length === 0) return { values: 0, defaults: 0 };
  let values = 0;
  for (const [mallKey, mallValues] of Object.entries(byMall)) {
    const payload = asRecordOrNull(mallValues);
    if (!payload) continue;
    values += await tx.$executeRaw`
      UPDATE registration_targets AS target
      SET registration_input = target.registration_input || ${JSON.stringify(payload)}::jsonb
      FROM channel_accounts AS account, sales_products AS product
      WHERE target.channel_account_id = account.id
        AND account.channel = ${mallKey}
        AND target.sales_product_id = product.id
        AND product.source_candidate_id = ${candidate.id}::uuid
        AND target.organization_id = ${candidate.organization_id}::uuid
        AND target.archived_at IS NULL
    `;
  }
  return { values, defaults: 0 };
}

/** 후보의 `rawData` 에는 원문만 남긴다. 편집 키는 초안으로 옮겼으니 지운다. */
async function stripCandidateEdits(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    -- queryraw-tenancy-exempt: writer-stopped cutover across every organization.
    UPDATE sourcing_candidates
    SET raw_data = raw_data - 'manualBasics' - 'registrationInput' - 'mallRegisterValues' - 'mallRegisterShared'
    WHERE raw_data ?| ARRAY['manualBasics', 'registrationInput', 'mallRegisterValues', 'mallRegisterShared']
  `;
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asRecordOrNull(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}
