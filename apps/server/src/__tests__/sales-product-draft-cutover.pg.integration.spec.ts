import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../test-helpers/real-prisma';
import { salesProductDraftCutoverMigration } from '../../../../scripts/data-migrations/v0.1.31/023_sales_product_draft_cutover';
import { contentWorkspaceOwnerCutoverMigration } from '../../../../scripts/data-migrations/v0.1.31/024_content_workspace_owner_cutover';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER_ORGANIZATION_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '11111111-1111-4111-8111-222222222222';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_CANDIDATE_ID = '22222222-2222-4222-8222-333333333333';
const DELETED_CANDIDATE_ID = '22222222-2222-4222-8222-444444444444';
const PRODUCT_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_TARGET_ID = '33333333-3333-4333-8333-444444444444';
const LISTING_ID = '55555555-5555-4555-8555-555555555555';
const WORKSPACE_ID = '99999999-9999-4999-8999-999999999999';

/**
 * 후보와 판매상품이 공존하지 않게 만드는 이관(KID-310 · ADR-0022).
 *
 * `pre-schema` 라 Prisma 가 아직 칸을 만들지 않은 상태에서 돈다 — 그래서 이 spec 은 022 가
 * 남겨 둔 모양(코드 · 판매가가 NOT NULL 인 판매상품 표)을 그대로 세우고, 023 이 스스로
 * 칸을 넓힌 뒤 쓰는지까지 본다.
 */
describe('v0.1.31:023 sales-product draft cutover (disposable PostgreSQL schema)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('projects the candidate onto one draft, in registration → manual → raw order, with no KID', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, {
        id: CANDIDATE_ID,
        name: '원문 이름',
        rawData: {
          title: '원문 이름',
          target: '원문 대상',
          productSize: '원문 크기',
          optionNames: ['빨강', '파랑'],
          manualBasics: {
            targetAudience: '수기 대상',
            ageGroup: '5세 이상',
            colorVariantNames: ['빨강', '파랑'],
            boxSetQuantity: '3',
            certifications: [{ number: 'CB-MANUAL' }],
          },
        },
      });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [draft] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id::text AS id, code, name, status, target_audience, age_group, product_size,
               color_variant_names, box_set_quantity, certifications, source_candidate_id::text AS source_candidate_id
        FROM sales_products WHERE source_candidate_id = ${CANDIDATE_ID}::uuid
      `;
      const options = await tx.$queryRaw<Array<{ option_code: string | null; sale_price: number | null; option_key: string }>>`
        SELECT option_code, sale_price, option_key FROM sales_product_options
        WHERE sales_product_id = ${(draft as { id: string }).id}::uuid ORDER BY sort_order ASC
      `;
      return { run, draft, options };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 1, outcome: 'moved' });
    expect(result.draft).toMatchObject({
      name: '원문 이름',
      status: 'draft',
      // 수기 편집값이 원문을 이긴다.
      target_audience: '수기 대상',
      age_group: '5세 이상',
      // 수기 값이 없는 칸만 원문이 채운다.
      product_size: '원문 크기',
      box_set_quantity: 3,
      source_candidate_id: CANDIDATE_ID,
    });
    expect(result.draft.color_variant_names).toEqual(['빨강', '파랑']);
    expect(result.draft.certifications).toEqual([{ number: 'CB-MANUAL' }]);
    // KID 는 팔기로 정한 순간에 발급한다 — 이관은 발급하지 않는다.
    expect(result.draft.code).toBeNull();
    expect(result.options.map((option) => [option.option_key, option.option_code, option.sale_price]))
      .toEqual([['빨강', null, null], ['파랑', null, null]]);
  }, 60_000);

  it('cuts a source value that is wider than its column and reports how many it cut', async () => {
    const result = await withPost022Schema(async (tx) => {
      // 원천(1688)은 칸 너비를 지킨 적이 없다. 자르지 않으면 INSERT 가 터져 이관 전체가 멈춘다.
      await seedCandidate(tx, {
        id: CANDIDATE_ID,
        name: '가'.repeat(300),
        rawData: { manualBasics: { targetAudience: '나'.repeat(260), noticeCategory: '01234567890123' } },
      });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [draft] = await tx.$queryRaw<Array<{ name: string; target_audience: string | null; notice_category: string | null }>>`
        SELECT name, target_audience, notice_category FROM sales_products
        WHERE source_candidate_id = ${CANDIDATE_ID}::uuid
      `;
      return { run, draft };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 1, truncatedValues: 3 });
    expect(result.draft!.name).toBe('가'.repeat(255));
    expect(result.draft!.target_audience).toBe('나'.repeat(200));
    expect(result.draft!.notice_category).toBe('0123456789');
  }, 60_000);

  /** 023 이 만드는 칸은 Prisma 와 같은 너비여야 한다 — text 로 만들면 push 가 뒤늦게 터진다. */
  it('adds the draft columns at the width Prisma will contract them to', async () => {
    const widths = await withPost022Schema(async (tx) => {
      await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      return tx.$queryRaw<Array<{ column: string; width: number | null }>>`
        SELECT attname AS "column", information_schema._pg_char_max_length(atttypid, atttypmod) AS width
        FROM pg_attribute
        WHERE attrelid = 'pg_temp.sales_products'::regclass
          AND attname IN ('target_audience', 'age_group', 'product_size', 'notice_category',
            'standard_category', 'brand', 'model_name', 'source_platform', 'kc_status')
        ORDER BY attname ASC
      `;
    });

    expect(Object.fromEntries(widths.map((row) => [row.column, row.width]))).toEqual({
      age_group: 100, brand: 50, kc_status: 20, model_name: 60, notice_category: 10,
      product_size: 200, source_platform: 40, standard_category: 40, target_audience: 200,
    });
  }, 60_000);

  it('fills only the empty columns of a draft a person already edited', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, {
        id: CANDIDATE_ID,
        rawData: { manualBasics: { targetAudience: '수기 대상', ageGroup: '5세 이상' } },
      });
      await seedDraft(tx, { id: PRODUCT_ID, candidateId: CANDIDATE_ID, targetAudience: '사람이 고친 대상' });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [draft] = await tx.$queryRaw<Array<{ target_audience: string | null; age_group: string | null }>>`
        SELECT target_audience, age_group FROM sales_products WHERE id = ${PRODUCT_ID}::uuid
      `;
      return { run, draft };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 0, outcome: 'moved' });
    expect(result.draft).toEqual({ target_audience: '사람이 고친 대상', age_group: '5세 이상' });
  }, 60_000);

  it('moves mall values onto that mall setting, makes the missing one, and keeps shared values on the draft', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, {
        id: CANDIDATE_ID,
        rawData: {
          manualBasics: {
            mallRegisterValues: { coupang: { categoryPath: '완구>블록' }, kidkids: { categoryPath: '완구>인형' } },
            mallRegisterShared: { certNumber: 'CB999' },
          },
        },
      });
      await seedDraft(tx, { id: PRODUCT_ID, candidateId: CANDIDATE_ID });
      await seedTarget(tx, { id: TARGET_ID, accountId: ACCOUNT_ID, productId: PRODUCT_ID });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const targets = await tx.$queryRaw<Array<{ channel_account_id: string; registration_input: unknown }>>`
        SELECT channel_account_id::text AS channel_account_id, registration_input
        FROM registration_targets WHERE sales_product_id = ${PRODUCT_ID}::uuid AND archived_at IS NULL
        ORDER BY channel_account_id ASC
      `;
      const [draft] = await tx.$queryRaw<Array<{ registration_defaults: unknown }>>`
        SELECT registration_defaults FROM sales_products WHERE id = ${PRODUCT_ID}::uuid
      `;
      return { run, targets, draft };
    });

    expect(result.run.details).toMatchObject({ movedMallValues: 2, movedDefaults: 1, createdTargets: 1 });
    expect(result.targets.map((target) => target.registration_input)).toEqual([
      { categoryPath: '완구>블록' },
      { categoryPath: '완구>인형' },
    ]);
    expect(result.draft!.registration_defaults).toEqual({ certNumber: 'CB999' });
  }, 60_000);

  it('keeps the newest setting of one product and account active and archives the rest', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID });
      await seedDraft(tx, { id: PRODUCT_ID, candidateId: CANDIDATE_ID });
      await seedTarget(tx, { id: TARGET_ID, accountId: ACCOUNT_ID, productId: PRODUCT_ID, updatedAt: '2026-09-01T00:00:00.000Z' });
      await seedTarget(tx, { id: SECOND_TARGET_ID, accountId: ACCOUNT_ID, productId: PRODUCT_ID, updatedAt: '2026-09-20T00:00:00.000Z' });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const rows = await tx.$queryRaw<Array<{ id: string; archived: boolean }>>`
        SELECT id::text AS id, archived_at IS NOT NULL AS archived
        FROM registration_targets WHERE sales_product_id = ${PRODUCT_ID}::uuid ORDER BY id ASC
      `;
      return { run, rows };
    });

    expect(result.run.details).toMatchObject({ archivedDuplicateTargets: 1 });
    expect(result.rows).toEqual([
      { id: TARGET_ID, archived: true },
      { id: SECOND_TARGET_ID, archived: false },
    ]);
  }, 60_000);

  it('links a mall product that still names its candidate to that candidate draft', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID });
      await seedDraft(tx, { id: PRODUCT_ID, candidateId: CANDIDATE_ID });
      await tx.$executeRaw`
        INSERT INTO channel_listings (id, organization_id, channel_account_id, source_candidate_id, sales_product_id, external_id)
        VALUES (${LISTING_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${ACCOUNT_ID}::uuid, ${CANDIDATE_ID}::uuid, NULL, 'EXT-1')
      `;

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [listing] = await tx.$queryRaw<Array<{ sales_product_id: string | null }>>`
        SELECT sales_product_id::text AS sales_product_id FROM channel_listings WHERE id = ${LISTING_ID}::uuid
      `;
      return { run, listing };
    });

    expect(result.run.details).toMatchObject({ linkedListings: 1 });
    expect(result.listing!.sales_product_id).toBe(PRODUCT_ID);
  }, 60_000);

  it('links a mall product to the draft this run makes for its candidate', async () => {
    const result = await withPost022Schema(async (tx) => {
      // 초안이 아직 없는 후보다. 이 이관이 초안을 만들고, 그 초안에 몰 상품이 이어져야 한다 —
      // 잇지 못하면 push 가 후보 열을 지운 뒤 몰 상품이 원천에 닿을 길이 없다.
      await seedCandidate(tx, { id: CANDIDATE_ID });
      await tx.$executeRaw`
        INSERT INTO channel_listings (id, organization_id, channel_account_id, source_candidate_id, sales_product_id, external_id)
        VALUES (${LISTING_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${ACCOUNT_ID}::uuid, ${CANDIDATE_ID}::uuid, NULL, 'EXT-2')
      `;

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [listing] = await tx.$queryRaw<Array<{ sales_product_id: string | null }>>`
        SELECT sales_product_id::text AS sales_product_id FROM channel_listings WHERE id = ${LISTING_ID}::uuid
      `;
      const [draft] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM sales_products WHERE source_candidate_id = ${CANDIDATE_ID}::uuid
      `;
      return { run, listing, draft };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 1, linkedListings: 1 });
    expect(result.listing!.sales_product_id).toBe(result.draft!.id);
  }, 60_000);

  it('strips the edit keys of a live candidate, leaves a deleted one alone and gives it no draft', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID, rawData: { title: '원문', manualBasics: { ageGroup: '5세 이상' } } });
      await seedCandidate(tx, {
        id: DELETED_CANDIDATE_ID,
        isDeleted: true,
        rawData: { title: '지운 원문', manualBasics: { ageGroup: '3세 이상' } },
      });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const rows = await tx.$queryRaw<Array<{ id: string; raw_data: Record<string, unknown> }>>`
        SELECT id::text AS id, raw_data FROM sourcing_candidates ORDER BY id ASC
      `;
      const [drafts] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM sales_products WHERE source_candidate_id = ${DELETED_CANDIDATE_ID}::uuid
      `;
      return { run, rows, deletedDrafts: Number(drafts?.count ?? 0) };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 1, strippedCandidates: 1 });
    expect(result.rows.find((row) => row.id === CANDIDATE_ID)!.raw_data).toEqual({ title: '원문' });
    // 지운 후보는 아무것도 옮기지 않았으므로 원문도 편집값도 그대로 둔다.
    expect(result.rows.find((row) => row.id === DELETED_CANDIDATE_ID)!.raw_data)
      .toEqual({ title: '지운 원문', manualBasics: { ageGroup: '3세 이상' } });
    expect(result.deletedDrafts).toBe(0);
  }, 60_000);

  /** 런타임은 후보를 거절하면 그 초안을 `unused` 로 내린다(sourcing/CLAUDE.md). 이관도 같다. */
  it('gives a rejected candidate an unused draft, not one that looks sellable', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID, status: 'rejected', rawData: { salePrice: '9900' } });
      await seedCandidate(tx, { id: SECOND_CANDIDATE_ID, status: 'sourced', rawData: { salePrice: '9900' } });

      const run = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const drafts = await tx.$queryRaw<Array<{ source_candidate_id: string; status: string }>>`
        SELECT source_candidate_id::text AS source_candidate_id, status FROM sales_products
        ORDER BY source_candidate_id ASC
      `;
      return { run, drafts };
    });

    expect(result.run.details).toMatchObject({ createdDrafts: 2 });
    expect(result.drafts).toEqual([
      { source_candidate_id: CANDIDATE_ID, status: 'unused' },
      { source_candidate_id: SECOND_CANDIDATE_ID, status: 'active' },
    ]);
  }, 60_000);

  it('changes nothing on a second run', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID, rawData: { manualBasics: { ageGroup: '5세 이상' } } });
      const first = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const second = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const [drafts] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM sales_products WHERE source_candidate_id = ${CANDIDATE_ID}::uuid
      `;
      return { first, second, drafts: Number(drafts?.count ?? 0) };
    });

    expect(result.first.details).toMatchObject({ createdDrafts: 1 });
    expect(result.second.details).toMatchObject({ createdDrafts: 0, filledDrafts: 0, strippedCandidates: 0 });
    expect(result.drafts).toBe(1);
  }, 60_000);

  it('rolls the whole migration back when one candidate already has two drafts', async () => {
    await expect(withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: CANDIDATE_ID });
      await seedDraft(tx, { id: PRODUCT_ID, candidateId: CANDIDATE_ID });
      await seedDraft(tx, { id: '66666666-6666-4666-8666-777777777777', candidateId: CANDIDATE_ID, code: 'KID00000002' });
      return salesProductDraftCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('more than one selling product');
  }, 60_000);

  it('hands 024 the draft it needs, so the workspace lands on the draft in one run order', async () => {
    const result = await withPost022Schema(async (tx) => {
      await seedCandidate(tx, { id: SECOND_CANDIDATE_ID });
      await tx.$executeRaw`CREATE TEMP TABLE content_workspaces (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, owner_type text NOT NULL,
        source_candidate_id uuid, channel_listing_id uuid, status text NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false
      ) ON COMMIT DROP`;
      // 024 는 지워질 후보 열이 작업공간과 어긋나지 않는지 장부에서 확인한다.
      await tx.$executeRaw`CREATE TEMP TABLE thumbnail_generations (
        id uuid PRIMARY KEY, source_candidate_id uuid, content_workspace_id uuid
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE content_generations (
        id uuid PRIMARY KEY, source_candidate_id uuid, content_workspace_id uuid
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_artifacts (
        id uuid PRIMARY KEY, content_workspace_id uuid
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_image_render_intents (
        id uuid PRIMARY KEY, source_candidate_id uuid, detail_page_artifact_id uuid
      ) ON COMMIT DROP`;
      await tx.$executeRaw`
        INSERT INTO content_workspaces (id, organization_id, owner_type, source_candidate_id)
        VALUES (${WORKSPACE_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'sourcing_candidate', ${SECOND_CANDIDATE_ID}::uuid)
      `;

      const draftRun = await salesProductDraftCutoverMigration.run(tx, { target: 'office' });
      const workspaceRun = await contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
      const [workspace] = await tx.$queryRaw<Array<{ owner_type: string; sales_product_id: string | null }>>`
        SELECT owner_type, sales_product_id::text AS sales_product_id FROM content_workspaces WHERE id = ${WORKSPACE_ID}::uuid
      `;
      const [draft] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM sales_products WHERE source_candidate_id = ${SECOND_CANDIDATE_ID}::uuid
      `;
      return { draftRun, workspaceRun, workspace, draft };
    });

    expect(result.draftRun.details).toMatchObject({ createdDrafts: 1 });
    expect(result.workspaceRun.details).toMatchObject({ movedWorkspaces: 1, outcome: 'moved' });
    expect(result.workspace).toEqual({ owner_type: 'sales_product', sales_product_id: result.draft!.id });
  }, 60_000);

  // ── 022 가 남긴 모양 ──

  async function withPost022Schema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL search_path TO pg_temp`;
      await createPost022Schema(tx);
      const result = await work(tx);
      await tx.$executeRaw`DROP TABLE IF EXISTS sourcing_candidates, candidate_images, sales_products,
        sales_product_options, registration_targets, channel_accounts, channel_listings,
        content_workspaces, thumbnail_generations, content_generations, detail_page_artifacts,
        detail_page_image_render_intents CASCADE`;
      return result;
    }, { timeout: 60_000 });
  }

  /** 022 뒤 · push 전의 모양. 코드와 판매가는 아직 NOT NULL 이고 초안 칸은 없다. */
  async function createPost022Schema(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`CREATE TEMP TABLE sourcing_candidates (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, name text NOT NULL, description text,
      source_platform text, source_url text, cost_cny numeric, thumbnail_url text, image_url text,
      raw_data jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'sourced',
      is_deleted boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE candidate_images (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, candidate_id uuid NOT NULL, image_url text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0, is_deleted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE sales_products (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, code varchar(60) NOT NULL, name varchar(255) NOT NULL,
      source_candidate_id uuid, option_axes text[] NOT NULL DEFAULT '{}', image_urls text[] NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'active', version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE sales_product_options (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL,
      option_code varchar(80) NOT NULL, "values" text[] NOT NULL DEFAULT '{}', option_key varchar(500) NOT NULL,
      sale_price integer NOT NULL, supply_status text NOT NULL DEFAULT 'selling', sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE channel_accounts (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, channel text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE channel_listings (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, channel_account_id uuid NOT NULL,
      source_candidate_id uuid, sales_product_id uuid, external_id text NOT NULL
    ) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE registration_targets (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, sales_product_id uuid NOT NULL,
      channel_account_id uuid NOT NULL, display_name text, registration_input jsonb NOT NULL DEFAULT '{}',
      archived_at timestamptz, version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP`;
    await tx.$executeRaw`
      INSERT INTO channel_accounts (id, organization_id, channel) VALUES
        (${ACCOUNT_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'coupang'),
        (${SECOND_ACCOUNT_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'kidkids')
    `;
  }

  async function seedCandidate(tx: Prisma.TransactionClient, input: {
    id: string;
    name?: string;
    rawData?: Record<string, unknown>;
    isDeleted?: boolean;
    status?: string;
    organizationId?: string;
  }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO sourcing_candidates (id, organization_id, name, raw_data, status, is_deleted, source_platform, source_url)
      VALUES (${input.id}::uuid, ${input.organizationId ?? ORGANIZATION_ID}::uuid,
        ${input.name ?? '수집 상품'}, ${JSON.stringify(input.rawData ?? {})}::jsonb,
        ${input.status ?? 'sourced'},
        ${input.isDeleted ?? false}, '1688', ${`https://detail.1688.com/offer/${input.id}.html`})
    `;
  }

  async function seedDraft(tx: Prisma.TransactionClient, input: {
    id: string;
    candidateId: string;
    code?: string;
    targetAudience?: string;
  }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO sales_products (id, organization_id, code, name, source_candidate_id)
      VALUES (${input.id}::uuid, ${ORGANIZATION_ID}::uuid, ${input.code ?? 'KID00000001'},
        '이미 있는 초안', ${input.candidateId}::uuid)
    `;
    if (input.targetAudience !== undefined) {
      await tx.$executeRaw`ALTER TABLE sales_products ADD COLUMN IF NOT EXISTS target_audience text`;
      await tx.$executeRaw`
        UPDATE sales_products SET target_audience = ${input.targetAudience} WHERE id = ${input.id}::uuid
      `;
    }
  }

  async function seedTarget(tx: Prisma.TransactionClient, input: {
    id: string;
    accountId: string;
    productId: string;
    updatedAt?: string;
  }): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO registration_targets (id, organization_id, sales_product_id, channel_account_id, updated_at)
      VALUES (${input.id}::uuid, ${ORGANIZATION_ID}::uuid, ${input.productId}::uuid, ${input.accountId}::uuid,
        ${new Date(input.updatedAt ?? '2026-09-10T00:00:00.000Z')})
    `;
  }

  void OTHER_ORGANIZATION_ID;
});
