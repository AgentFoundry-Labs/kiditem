#!/usr/bin/env tsx
// Baseline product import for the 3-layer schema (Plan 2026-04-24, ADR-0020).
// - Defaults to dry-run. `--write` required to persist.
// - Reads kiditem_list + wing-inventory-matched Excel files.
// - Writes only canonical rows that can be identified exactly; wing listings
//   are upserted by (companyId, channel='coupang', externalId) and no
//   ChannelListingOption is created unless a true option-level external id
//   column is present (current observed files do not have one).
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';

type CliArgs = {
  kiditemPath: string;
  wingPath: string;
  companyId: string;
  write: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string | true>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') {
      args.set('write', true);
      continue;
    }
    if (token.startsWith('--')) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      args.set(token.slice(2), next);
      i += 1;
    }
  }

  const kiditemPath = args.get('kiditem') as string | undefined;
  const wingPath = args.get('wing') as string | undefined;
  const companyId = args.get('company') as string | undefined;
  if (!kiditemPath) throw new Error('Missing --kiditem <xlsx-path>');
  if (!wingPath) throw new Error('Missing --wing <xlsx-path>');
  if (!companyId) throw new Error('Missing --company <uuid>');

  return {
    kiditemPath,
    wingPath,
    companyId,
    write: args.get('write') === true,
  };
}

function toInt(value: unknown): number {
  const text = String(value ?? '').replace(/[,\s원]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function readSheetRows(filePath: string): Array<Record<string, unknown>> {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error(`No sheets in ${filePath}`);
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
}

type Tx = Prisma.TransactionClient;

async function nextMasterCode(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT 'M-' || lpad(nextval('master_code_seq')::text, 8, '0') AS code
  `;
  return rows[0].code;
}

async function nextOptionSku(tx: Tx, masterId: string, masterCode: string): Promise<string> {
  const updated = await tx.masterProduct.update({
    where: { id: masterId },
    data: { optionCounter: { increment: 1 } },
    select: { optionCounter: true },
  });
  return `${masterCode}-${String(updated.optionCounter).padStart(2, '0')}`;
}

type KiditemStats = {
  rows: number;
  duplicateLegacyCodes: number;
  mastersCreated: number;
  optionsCreated: number;
  inventoryUpserted: number;
};

type WingStats = {
  rows: number;
  matchedRows: number;
  unmatchedRows: number;
  listingsUpserted: number;
  channelListingOptionsCreated: number;
  skippedMissingListingExternalId: number;
  skippedMissingExternalOptionId: number;
};

async function importKiditem(
  prisma: PrismaClient,
  companyId: string,
  rows: Array<Record<string, unknown>>,
  write: boolean,
): Promise<KiditemStats> {
  const stats: KiditemStats = {
    rows: rows.length,
    duplicateLegacyCodes: 0,
    mastersCreated: 0,
    optionsCreated: 0,
    inventoryUpserted: 0,
  };

  // Write-mode pre-flight: duplicate legacy codes in the sheet would silently
  // collapse onto the first-matched ProductOption, overwriting inventory and
  // warehouseLocation on subsequent rows. Refuse to write without explicit
  // deduplication by the caller. Dry-run is unaffected — it still counts the
  // duplicates and reports them for inspection.
  if (write) {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const row of rows) {
      const lc = clean(row['상품코드']);
      if (!lc) continue;
      if (seen.has(lc)) dupes.push(lc);
      else seen.add(lc);
    }
    if (dupes.length > 0) {
      const sample = dupes.slice(0, 5).join(', ');
      const more = dupes.length > 5 ? `, ... (${dupes.length - 5} more)` : '';
      throw new Error(
        `Refusing to write: ${dupes.length} duplicate 상품코드 row(s) would silently collapse onto the first-matched ProductOption. Deduplicate the sheet first or re-run without --write to inspect. Sample: ${sample}${more}`,
      );
    }
  }

  const seenLegacyCodes = new Set<string>();

  for (const row of rows) {
    const legacyCode = clean(row['상품코드']);
    const name =
      clean(row['상품명']) ?? clean(row['상품명(셀피아)']) ?? legacyCode ?? 'Unnamed product';
    const optionName = clean(row['옵션명']) ?? clean(row['모델명']) ?? null;
    const barcode = clean(row['자사상품코드']);
    const currentStock = toInt(row['재고']);
    const safetyStock = toInt(row['안전재고']);
    const warehouseLocation = clean(row['상품위치']);

    if (legacyCode) {
      if (seenLegacyCodes.has(legacyCode)) {
        stats.duplicateLegacyCodes += 1;
      } else {
        seenLegacyCodes.add(legacyCode);
      }
    }

    if (!write) {
      // Dry-run still counts the work a write pass would perform.
      stats.mastersCreated += 1;
      stats.optionsCreated += 1;
      stats.inventoryUpserted += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      let master = legacyCode
        ? await tx.masterProduct.findFirst({
            where: { companyId, legacyCode, isDeleted: false },
            select: { id: true, code: true },
          })
        : null;
      if (!master) {
        const code = await nextMasterCode(tx);
        const created = await tx.masterProduct.create({
          data: {
            companyId,
            code,
            legacyCode,
            name,
            category: clean(row['상품분류']),
            brand: clean(row['브랜드']),
            rawData: row as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, code: true },
        });
        master = created;
        stats.mastersCreated += 1;
      }

      let option = legacyCode
        ? await tx.productOption.findFirst({
            where: { companyId, legacyCode, isDeleted: false },
            select: { id: true, sku: true },
          })
        : null;
      if (!option) {
        const sku = await nextOptionSku(tx, master.id, master.code);
        const created = await tx.productOption.create({
          data: {
            companyId,
            masterId: master.id,
            sku,
            legacyCode,
            barcode,
            optionName,
            costPrice: toInt(row['매입가']),
            sellPrice: toInt(row['판매가']),
          },
          select: { id: true, sku: true },
        });
        option = created;
        stats.optionsCreated += 1;
      }

      await tx.inventory.upsert({
        where: { optionId: option.id },
        update: {
          currentStock,
          safetyStock,
          warehouseLocation,
        },
        create: {
          companyId,
          optionId: option.id,
          currentStock,
          safetyStock,
          warehouseLocation,
        },
      });
      stats.inventoryUpserted += 1;
    });
  }

  return stats;
}

async function importWing(
  prisma: PrismaClient,
  companyId: string,
  rows: Array<Record<string, unknown>>,
  write: boolean,
): Promise<WingStats> {
  const stats: WingStats = {
    rows: rows.length,
    matchedRows: 0,
    unmatchedRows: 0,
    listingsUpserted: 0,
    channelListingOptionsCreated: 0,
    skippedMissingListingExternalId: 0,
    skippedMissingExternalOptionId: 0,
  };

  for (const row of rows) {
    const listingExternalId = clean(row['등록상품ID']);
    const matched = clean(row['매칭상태']) === 'O';
    const legacyCode = clean(row['상품코드']);
    const channelName = clean(row['등록상품명']);
    const channelPrice = toInt(row['판매가']);

    if (!listingExternalId) {
      stats.skippedMissingListingExternalId += 1;
      continue;
    }

    if (matched) {
      stats.matchedRows += 1;
    } else {
      stats.unmatchedRows += 1;
    }

    // Option-level external id column not present in current files → skip
    // ChannelListingOption creation. Count row so the report is honest.
    stats.skippedMissingExternalOptionId += 1;

    if (!matched) continue;

    if (!write) {
      stats.listingsUpserted += 1;
      continue;
    }

    const master = legacyCode
      ? await prisma.masterProduct.findFirst({
          where: { companyId, legacyCode, isDeleted: false },
          select: { id: true },
        })
      : null;
    if (!master) {
      // Matched=true but no master to attach listing to (legacy code not yet imported or missing).
      stats.unmatchedRows += 1;
      stats.matchedRows = Math.max(0, stats.matchedRows - 1);
      continue;
    }

    const existing = await prisma.channelListing.findFirst({
      where: {
        companyId,
        channel: 'coupang',
        externalId: listingExternalId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.channelListing.update({
        where: { id: existing.id },
        data: {
          masterId: master.id,
          channelName,
          channelPrice: channelPrice || null,
        },
      });
    } else {
      await prisma.channelListing.create({
        data: {
          companyId,
          masterId: master.id,
          channel: 'coupang',
          externalId: listingExternalId,
          channelName,
          channelPrice: channelPrice || null,
        },
      });
    }
    stats.listingsUpserted += 1;
  }

  return stats;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const kiditemRows = readSheetRows(args.kiditemPath);
  const wingRows = readSheetRows(args.wingPath);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const kiditem = await importKiditem(prisma, args.companyId, kiditemRows, args.write);
    const wing = await importWing(prisma, args.companyId, wingRows, args.write);

    const report = {
      mode: args.write ? 'write' : 'dry-run',
      kiditem: {
        rows: kiditem.rows,
        duplicateLegacyCodes: kiditem.duplicateLegacyCodes,
        mastersCreated: kiditem.mastersCreated,
        optionsCreated: kiditem.optionsCreated,
        inventoryUpserted: kiditem.inventoryUpserted,
      },
      wing: {
        rows: wing.rows,
        matchedRows: wing.matchedRows,
        unmatchedRows: wing.unmatchedRows,
        listingsUpserted: wing.listingsUpserted,
        channelListingOptionsCreated: wing.channelListingOptionsCreated,
        skippedMissingListingExternalId: wing.skippedMissingListingExternalId,
        skippedMissingExternalOptionId: wing.skippedMissingExternalOptionId,
      },
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
