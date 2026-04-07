#!/usr/bin/env tsx
/**
 * migrate-ad-data.ts
 *
 * Dashboard SQLite에서 광고 관련 데이터만 kiditem PostgreSQL로 이식.
 * - AdCampaignSnapshot → ad_snapshots (level=campaign)
 * - AdProductSnapshot → ad_snapshots (level=product)
 * - ScheduledTask(ext_scrape_wing) → ad_snapshots (source=wing, Wing KPI)
 * - ItemWinner → item_winners
 *
 * Usage:
 *   npx tsx scripts/migrate-ad-data.ts
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { v5 as uuidv5 } from 'uuid';
import path from 'path';
import os from 'os';

const SQLITE_PATH = path.join(os.homedir(), 'workspace/kiditem_dashboard/prisma/dev.db');
const PG_URL = 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function toUUID(seed: string): string {
  return uuidv5(seed, UUID_NAMESPACE);
}

function toInt(val: unknown): number {
  if (val == null) return 0;
  return Math.round(Number(val));
}

function toDecimal(val: unknown, maxAbsValue = 9999): string {
  if (val == null) return '0';
  const n = Number(val);
  if (isNaN(n)) return '0';
  // Clamp to fit Decimal(8,4) / Decimal(10,2)
  if (Math.abs(n) >= maxAbsValue) return String(maxAbsValue);
  return String(n);
}

function toTimestamptz(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function log(msg: string) {
  console.log(`[migrate-ad] ${msg}`);
}

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({ connectionString: PG_URL });
  const pg = await pool.connect();

  log(`Source: ${SQLITE_PATH}`);
  log(`Target: ${PG_URL}`);

  // Get default company ID
  const companyResult = await pg.query("SELECT id FROM companies WHERE is_active = true LIMIT 1");
  if (companyResult.rows.length === 0) throw new Error('회사 정보를 찾을 수 없습니다');
  const companyId = companyResult.rows[0].id;
  log(`Company: ${companyId}`);

  try {
    await pg.query('BEGIN');

    // Clear existing ad data
    log('Clearing existing ad snapshot data...');
    await pg.query("DELETE FROM ad_snapshots WHERE company_id = $1", [companyId]);
    await pg.query("DELETE FROM item_winners WHERE company_id = $1", [companyId]);
    log('Cleared');

    // ── AdCampaignSnapshot → ad_snapshots ──────────────────────────────
    const campaigns = sqlite.prepare('SELECT * FROM AdCampaignSnapshot').all() as any[];
    log(`AdCampaignSnapshot: ${campaigns.length}건`);

    for (const r of campaigns) {
      await pg.query(
        `INSERT INTO ad_snapshots (id, company_id, source, page_type, level, campaign_name, period, date, status, on_off, budget, today_spend, impressions, clicks, conversions, ad_conversions, orders, spend, ad_spend, revenue, ad_revenue, total_revenue, roas, ctr, conversion_rate, collected_at, captured_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          toUUID(`camp-${r.id}`), companyId, 'advertising', 'campaign', 'campaign',
          r.campaignName, r.period ?? '7d', r.date ?? null, r.status ?? null, r.onOff ?? null,
          toInt(r.budget), toInt(r.todaySpend), toInt(r.impressions), toInt(r.clicks),
          toInt(r.conversions), toInt(r.conversions), toInt(r.orders),
          toInt(r.adSpend), toInt(r.adSpend), toInt(r.adRevenue), toInt(r.adRevenue),
          toInt(r.totalRevenue), toDecimal(r.roas), toDecimal(r.ctr), toDecimal(r.conversionRate),
          toTimestamptz(r.collectedAt), toTimestamptz(r.collectedAt) ?? new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }
    log(`  ✓ ad_snapshots (campaign): ${campaigns.length}건`);

    // ── AdProductSnapshot → ad_snapshots ───────────────────────────────
    const products = sqlite.prepare('SELECT * FROM AdProductSnapshot').all() as any[];
    log(`AdProductSnapshot: ${products.length}건`);

    for (const r of products) {
      await pg.query(
        `INSERT INTO ad_snapshots (id, company_id, source, page_type, level, campaign_name, period, date, keyword, product_name, vendor_item_id, status, on_off, impressions, clicks, ad_conversions, spend, ad_spend, revenue, ad_revenue, ctr, conversion_rate, collected_at, captured_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          toUUID(`prod-${r.id}`), companyId, 'advertising', 'product', 'product',
          r.campaignName, r.period ?? '7d', r.date ?? null,
          r.keyword ?? null, r.productName ?? null, r.vendorItemId ?? null,
          r.status ?? null, r.onOff ?? null,
          toInt(r.impressions), toInt(r.clicks), toInt(r.adConversions),
          toInt(r.adSpend), toInt(r.adSpend), toInt(r.adRevenue), toInt(r.adRevenue),
          toDecimal(r.ctr), toDecimal(r.conversionRate),
          toTimestamptz(r.collectedAt), toTimestamptz(r.collectedAt) ?? new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }
    log(`  ✓ ad_snapshots (product): ${products.length}건`);

    // ── Wing KPI (ScheduledTask) → ad_snapshots ───────────────────────
    const wingTasks = sqlite.prepare(
      "SELECT id, result, executedAt FROM ScheduledTask WHERE taskType='ext_scrape_wing' AND result IS NOT NULL ORDER BY executedAt DESC",
    ).all() as any[];
    log(`Wing KPI tasks: ${wingTasks.length}건`);

    for (const r of wingTasks) {
      await pg.query(
        `INSERT INTO ad_snapshots (id, company_id, source, page_type, level, raw_json, captured_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          toUUID(`wing-${r.id}`), companyId, 'wing', 'dashboard_kpi', null,
          r.result,
          toTimestamptz(r.executedAt) ?? new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }
    log(`  ✓ ad_snapshots (wing): ${wingTasks.length}건`);

    // ── ItemWinner → item_winners ──────────────────────────────────────
    const winners = sqlite.prepare('SELECT * FROM ItemWinner').all() as any[];
    log(`ItemWinner: ${winners.length}건`);

    for (const r of winners) {
      await pg.query(
        `INSERT INTO item_winners (id, company_id, product_id, is_winner, my_price, winner_price, checked_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          toUUID(`iw-${r.id}`), companyId, null,
          r.isWinner ? true : false,
          toInt(r.myPrice), r.winnerPrice != null ? toInt(r.winnerPrice) : null,
          toTimestamptz(r.checkedAt) ?? new Date().toISOString(),
        ],
      );
    }
    log(`  ✓ item_winners: ${winners.length}건`);

    await pg.query('COMMIT');
    log('═══════════════════════════════════════');
    log('광고 데이터 이식 완료!');
    log(`  캠페인 스냅샷: ${campaigns.length}건`);
    log(`  상품 스냅샷: ${products.length}건`);
    log(`  Wing KPI: ${wingTasks.length}건`);
    log(`  아이템위너: ${winners.length}건`);
    log('═══════════════════════════════════════');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('[migrate-ad] ERROR — rolled back');
    throw err;
  } finally {
    pg.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
