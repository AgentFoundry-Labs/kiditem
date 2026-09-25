import { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';
import { quotedIdentifier, type SqlClient } from '../helpers/dependent-row-removal';

/**
 * KID-360: 소싱 원장 12표의 `ingestion_run_id`(run 표 FK)가 실행 계약의 스칼라 `operation_id`가 된다
 * (ADR-0025 — 다른 owner의 실행은 id + 인덱스로만 가리킨다). 값은 그대로 옛 run id라서 옛 사실이 계속 읽힌다.
 *
 * `db push`는 열 이름 변경을 "옛 열 삭제 + 새 NOT NULL 열 추가"로 보고 행이 있으면 멈추므로, 스키마 단계 전에
 * 열 이름을 바꾸고 Prisma가 새 열에 붙일 인덱스 이름으로 옛 인덱스 이름도 바꾼다(다시 만들지 않게).
 * run 표로 가는 FK 제약은 `db push`가 지운다. 이름을 지정한 인덱스(`…identity_key`·`…run_keyword_idx`·
 * `…run_input_idx`)는 열을 따라가므로 손대지 않는다.
 *
 * 표가 없거나(Office 0.1.30에는 fact 4표가 없다) 이미 `operation_id`가 있으면 그 표는 건너뛴다. 다시 돌리면
 * 아무것도 바꾸지 않는다.
 */
export const SOURCING_OPERATION_ID_TABLES = [
  'sourcing_evidence_observations',
  'sourcing_1688_offer_keyword_observations',
  'sourcing_wing_catalog_product_facts',
  'sourcing_keyword_suggestion_facts',
  'sourcing_naver_keyword_analysis_facts',
  'sourcing_market_shadow_facts',
  'naver_keyword_daily_snapshots',
  'naver_popular_keyword_daily_snapshots',
  'shorts_trend_daily_snapshots',
  'live_commerce_broadcast_daily_snapshots',
  'live_commerce_product_daily_snapshots',
  'tiktok_creative_trend_daily_snapshots',
] as const;

/** 옛 인덱스 이름 → Prisma가 `operation_id` 열에 붙이는 이름(`prisma migrate diff`로 확인). */
export const SOURCING_OPERATION_ID_INDEX_RENAMES: Readonly<Record<string, string>> = Object.freeze({
  sourcing_evidence_observations_ingestion_run_id_idx: 'sourcing_evidence_observations_operation_id_idx',
  sourcing_1688_offer_keyword_observations_ingestion_run_id_idx: 'sourcing_1688_offer_keyword_observations_operation_id_idx',
  sourcing_wing_catalog_product_facts_ingestion_run_id_idx: 'sourcing_wing_catalog_product_facts_operation_id_idx',
  sourcing_keyword_suggestion_facts_ingestion_run_id_idx: 'sourcing_keyword_suggestion_facts_operation_id_idx',
  sourcing_naver_keyword_analysis_facts_ingestion_run_id_idx: 'sourcing_naver_keyword_analysis_facts_operation_id_idx',
  sourcing_market_shadow_facts_ingestion_run_id_idx: 'sourcing_market_shadow_facts_operation_id_idx',
  naver_keyword_daily_snapshots_organization_id_ingestion_run_idx: 'naver_keyword_daily_snapshots_organization_id_operation_id_idx',
  naver_keyword_daily_snapshots_organization_id_ingestion_run_key: 'naver_keyword_daily_snapshots_organization_id_operation_id__key',
  naver_popular_keyword_daily_snapshots_organization_id_inges_idx: 'naver_popular_keyword_daily_snapshots_organization_id_opera_idx',
  naver_popular_keyword_daily_snapshots_organization_id_inges_key: 'naver_popular_keyword_daily_snapshots_organization_id_opera_key',
  shorts_trend_daily_snapshots_organization_id_ingestion_run__idx: 'shorts_trend_daily_snapshots_organization_id_operation_id_idx',
  shorts_trend_daily_snapshots_organization_id_ingestion_run__key: 'shorts_trend_daily_snapshots_organization_id_operation_id_b_key',
  live_commerce_broadcast_daily_snapshots_organization_id_ing_idx: 'live_commerce_broadcast_daily_snapshots_organization_id_ope_idx',
  live_commerce_broadcast_daily_snapshots_organization_id_ing_key: 'live_commerce_broadcast_daily_snapshots_organization_id_ope_key',
  live_commerce_product_daily_snapshots_organization_id_inges_idx: 'live_commerce_product_daily_snapshots_organization_id_opera_idx',
  live_commerce_product_daily_snapshots_organization_id_inges_key: 'live_commerce_product_daily_snapshots_organization_id_opera_key',
  tiktok_creative_trend_daily_snapshots_ingestion_run_id_idx: 'tiktok_creative_trend_daily_snapshots_operation_id_idx',
  tiktok_creative_trend_daily_snapshots_organization_id_inges_idx: 'tiktok_creative_trend_daily_snapshots_organization_id_opera_idx',
  tiktok_creative_trend_daily_snapshots_organization_id_inges_key: 'tiktok_creative_trend_daily_snapshots_organization_id_opera_key',
});

export async function renameSourcingIngestionRunIds(tx: SqlClient): Promise<MigrationResult> {
  const columnRows = await tx.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join([...SOURCING_OPERATION_ID_TABLES])})
      AND column_name IN ('ingestion_run_id', 'operation_id')
  `;
  const columns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const renamedColumns: string[] = [];
  for (const table of SOURCING_OPERATION_ID_TABLES) {
    if (!columns.has(`${table}.ingestion_run_id`) || columns.has(`${table}.operation_id`)) continue;
    await tx.$executeRaw`ALTER TABLE ${quotedIdentifier(table)} RENAME COLUMN "ingestion_run_id" TO "operation_id"`;
    renamedColumns.push(table);
  }

  const indexRows = await tx.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname IN (${Prisma.join([
        ...Object.keys(SOURCING_OPERATION_ID_INDEX_RENAMES),
        ...Object.values(SOURCING_OPERATION_ID_INDEX_RENAMES),
      ])})
  `;
  const indexes = new Set(indexRows.map((row) => row.indexname));
  const renamedIndexes: string[] = [];
  for (const [from, to] of Object.entries(SOURCING_OPERATION_ID_INDEX_RENAMES)) {
    if (!indexes.has(from) || indexes.has(to)) continue;
    await tx.$executeRaw`ALTER INDEX ${quotedIdentifier(from)} RENAME TO ${quotedIdentifier(to)}`;
    renamedIndexes.push(to);
  }

  return {
    affectedRows: 0,
    details: { renamedColumns, renamedIndexes },
  };
}

export const renameSourcingIngestionRunIdsMigration: DataMigration = {
  id: 'v0.1.31:030_rename_sourcing_ingestion_run_ids_to_operation_ids',
  releaseVersion: '0.1.31',
  name: 'Rename sourcing ledger ingestion_run_id columns to scalar operation_id',
  phase: 'pre-schema',
  run: renameSourcingIngestionRunIds,
};
