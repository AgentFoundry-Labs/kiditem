#!/usr/bin/env tsx
// Baseline product import for the 3-layer schema (R0, ADR-0022).
// - Defaults to dry-run. `--write` required to persist.
// - Reads kiditem_list + wing-inventory-matched Excel files.
// - Master grouping is the deterministic helper from
//   `scripts/import-baseline-planner.ts`. Source 자사상품코드 lives on
//   `MasterProduct.barcode` (non-unique). Option/scanner barcode is left
//   null for this baseline source — the planner never writes the source EAN
//   onto `ProductOption.barcode` so the (companyId, barcode) unique on
//   options stays meaningful.
// - Wing rows are attached only when the planner reports an exact match
//   (option-legacy unique, or single-master barcode fallback). Ambiguous /
//   unmatched rows are reported but never silently linked.
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';
import {
  planKiditemImport,
  planWingMatches,
  projectWingRow,
  type KiditemPlan,
  type PlannedMaster,
  type WingPlan,
  type WorkbookRow,
} from './import-baseline-planner';

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

function readSheetRows(filePath: string): WorkbookRow[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error(`No sheets in ${filePath}`);
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<WorkbookRow>(sheet, { defval: '' });
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

interface MasterRawDataPayload {
  source: 'kiditem-baseline';
  sourceBarcode: string | null;
  normalizedName: string;
  rowNumbers: number[];
  optionLegacyCodes: string[];
  representativeRow: WorkbookRow;
}

interface KiditemWriteStats {
  rows: number;
  hardConflicts: number;
  mastersCreated: number;
  mastersFound: number;
  optionsCreated: number;
  optionsFound: number;
  inventoryUpserted: number;
}

async function applyKiditemPlan(
  prisma: PrismaClient,
  companyId: string,
  plan: KiditemPlan,
  write: boolean,
): Promise<KiditemWriteStats> {
  const stats: KiditemWriteStats = {
    rows: plan.expectedOptions,
    hardConflicts: plan.hardConflicts.length,
    mastersCreated: 0,
    mastersFound: 0,
    optionsCreated: 0,
    optionsFound: 0,
    inventoryUpserted: 0,
  };

  if (write && plan.hardConflicts.length > 0) {
    const sample = plan.hardConflicts
      .slice(0, 5)
      .map((c) => `${c.masterImportKey}::${c.optionDisplayName ?? '∅'} rows=${c.rowNumbers.join(',')}`)
      .join('; ');
    const more =
      plan.hardConflicts.length > 5 ? `, ... (${plan.hardConflicts.length - 5} more)` : '';
    throw new Error(
      `Refusing to write: ${plan.hardConflicts.length} hard (master, optionName) conflict(s) would violate ProductOption (master_id, option_name) uniqueness. Resolve in source then re-run. Sample: ${sample}${more}`,
    );
  }

  if (!write) {
    // Dry-run still counts what a write pass would perform.
    stats.mastersCreated = plan.masters.length;
    stats.optionsCreated = plan.options.length;
    stats.inventoryUpserted = plan.options.length;
    return stats;
  }

  for (const masterPlan of plan.masters) {
    const optionsForMaster = plan.options.filter(
      (opt) => opt.masterImportKey === masterPlan.importKey,
    );

    await prisma.$transaction(async (tx) => {
      const existing = await tx.masterProduct.findFirst({
        where: { companyId, legacyCode: masterPlan.importKey, isDeleted: false },
        select: { id: true, code: true },
      });

      let masterId: string;
      let masterCode: string;
      if (existing) {
        masterId = existing.id;
        masterCode = existing.code;
        stats.mastersFound += 1;
        // Refresh fields that may have drifted (display name, source barcode, raw aggregate).
        await tx.masterProduct.update({
          where: { id: masterId },
          data: {
            name: masterPlan.name,
            barcode: masterPlan.sourceBarcode,
            category: masterPlan.category,
            brand: masterPlan.brand,
            rawData: buildRawData(masterPlan) as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        const code = await nextMasterCode(tx);
        const created = await tx.masterProduct.create({
          data: {
            companyId,
            code,
            legacyCode: masterPlan.importKey,
            barcode: masterPlan.sourceBarcode,
            name: masterPlan.name,
            category: masterPlan.category,
            brand: masterPlan.brand,
            rawData: buildRawData(masterPlan) as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, code: true },
        });
        masterId = created.id;
        masterCode = created.code;
        stats.mastersCreated += 1;
      }

      for (const optionPlan of optionsForMaster) {
        const existingOption = optionPlan.optionLegacyCode
          ? await tx.productOption.findFirst({
              where: { companyId, legacyCode: optionPlan.optionLegacyCode, isDeleted: false },
              select: { id: true, sku: true },
            })
          : null;

        let optionId: string;
        if (existingOption) {
          optionId = existingOption.id;
          stats.optionsFound += 1;
          await tx.productOption.update({
            where: { id: optionId },
            data: {
              masterId,
              optionName: optionPlan.optionDisplayName,
              costPrice: optionPlan.costPrice,
              sellPrice: optionPlan.sellPrice,
              // Source EAN must NOT be written to option barcode (ADR-0022).
              barcode: null,
            },
          });
        } else {
          const sku = await nextOptionSku(tx, masterId, masterCode);
          const created = await tx.productOption.create({
            data: {
              companyId,
              masterId,
              sku,
              legacyCode: optionPlan.optionLegacyCode,
              barcode: null,
              optionName: optionPlan.optionDisplayName,
              costPrice: optionPlan.costPrice,
              sellPrice: optionPlan.sellPrice,
            },
            select: { id: true, sku: true },
          });
          optionId = created.id;
          stats.optionsCreated += 1;
        }

        await tx.inventory.upsert({
          where: { optionId },
          update: {
            currentStock: optionPlan.currentStock,
            safetyStock: optionPlan.safetyStock,
            warehouseLocation: optionPlan.warehouseLocation,
          },
          create: {
            companyId,
            optionId,
            currentStock: optionPlan.currentStock,
            safetyStock: optionPlan.safetyStock,
            warehouseLocation: optionPlan.warehouseLocation,
          },
        });
        stats.inventoryUpserted += 1;
      }
    });
  }

  return stats;
}

function buildRawData(masterPlan: PlannedMaster): MasterRawDataPayload {
  return {
    source: 'kiditem-baseline',
    sourceBarcode: masterPlan.sourceBarcode,
    normalizedName: masterPlan.name,
    rowNumbers: masterPlan.rowNumbers,
    optionLegacyCodes: masterPlan.optionLegacyCodes,
    representativeRow: masterPlan.representativeRow,
  };
}

interface WingWriteStats {
  rows: number;
  notMatched: number;
  optionLegacyMatches: number;
  barcodeFallbackMatches: number;
  ambiguousBarcodeMatches: number;
  unmatchedMatchedRows: number;
  skippedMissingListingExternalId: number;
  listingsUpserted: number;
  attachmentsRequiringMaster: number;
  attachmentsSkippedMasterMissing: number;
}

async function applyWingPlan(
  prisma: PrismaClient,
  companyId: string,
  wingPlan: WingPlan,
  write: boolean,
): Promise<WingWriteStats> {
  const stats: WingWriteStats = {
    rows:
      wingPlan.attachments.length +
      wingPlan.notMatchedRows +
      wingPlan.skippedMissingListingExternalId +
      wingPlan.ambiguousBarcodeMatches +
      wingPlan.unmatchedMatchedRows,
    notMatched: wingPlan.notMatchedRows,
    optionLegacyMatches: wingPlan.optionLegacyMatches,
    barcodeFallbackMatches: wingPlan.barcodeFallbackMatches,
    ambiguousBarcodeMatches: wingPlan.ambiguousBarcodeMatches,
    unmatchedMatchedRows: wingPlan.unmatchedMatchedRows,
    skippedMissingListingExternalId: wingPlan.skippedMissingListingExternalId,
    listingsUpserted: 0,
    attachmentsRequiringMaster: wingPlan.attachments.length,
    attachmentsSkippedMasterMissing: 0,
  };

  if (!write) {
    stats.listingsUpserted = wingPlan.attachments.length;
    return stats;
  }

  for (const attachment of wingPlan.attachments) {
    const master = await prisma.masterProduct.findFirst({
      where: { companyId, legacyCode: attachment.masterImportKey, isDeleted: false },
      select: { id: true },
    });
    if (!master) {
      stats.attachmentsSkippedMasterMissing += 1;
      continue;
    }

    const existing = await prisma.channelListing.findFirst({
      where: {
        companyId,
        channel: 'coupang',
        externalId: attachment.listingExternalId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.channelListing.update({
        where: { id: existing.id },
        data: {
          masterId: master.id,
          channelName: attachment.channelName,
          channelPrice: attachment.channelPrice,
        },
      });
    } else {
      await prisma.channelListing.create({
        data: {
          companyId,
          masterId: master.id,
          channel: 'coupang',
          externalId: attachment.listingExternalId,
          channelName: attachment.channelName,
          channelPrice: attachment.channelPrice,
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
  const wingRows = readSheetRows(args.wingPath).map((row, idx) => projectWingRow(row, idx + 2));

  const kiditemPlan = planKiditemImport(kiditemRows);
  const wingPlan = planWingMatches(wingRows, kiditemPlan);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const kiditem = await applyKiditemPlan(prisma, args.companyId, kiditemPlan, args.write);
    const wing = await applyWingPlan(prisma, args.companyId, wingPlan, args.write);

    const report = {
      mode: args.write ? 'write' : 'dry-run',
      kiditem: {
        rows: kiditemPlan.expectedOptions,
        expectedMastersByBarcodeName: kiditemPlan.expectedMastersByBarcodeName,
        sharedSourceBarcodeGroups: kiditemPlan.sharedSourceBarcodeGroups,
        multiNameBarcodeGroups: kiditemPlan.multiNameBarcodeGroups,
        hardConflicts: kiditemPlan.hardConflicts.length,
        hardConflictSample: kiditemPlan.hardConflicts.slice(0, 3),
        ...kiditem,
      },
      wing: {
        rows: wing.rows,
        notMatched: wing.notMatched,
        optionLegacyMatches: wing.optionLegacyMatches,
        barcodeFallbackMatches: wing.barcodeFallbackMatches,
        ambiguousBarcodeMatches: wing.ambiguousBarcodeMatches,
        unmatchedMatchedRows: wing.unmatchedMatchedRows,
        skippedMissingListingExternalId: wing.skippedMissingListingExternalId,
        listingsUpserted: wing.listingsUpserted,
        attachmentsRequiringMaster: wing.attachmentsRequiringMaster,
        attachmentsSkippedMasterMissing: wing.attachmentsSkippedMasterMissing,
        reportSample: wingPlan.reports.slice(0, 5),
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
