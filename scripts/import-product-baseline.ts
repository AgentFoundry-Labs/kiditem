#!/usr/bin/env tsx
// Baseline product import for the 3-layer schema (R0, ADR-0022).
// - Defaults to dry-run. `--write` required to persist.
// - Reads kiditem_list + wing-inventory-matched Excel files.
// - Master grouping is the deterministic helper from
//   `scripts/import-baseline-planner.ts`. Source 자사상품코드 lives on
//   `MasterProduct.barcode` (non-unique). Option/scanner barcode is left
//   null for this baseline source — the planner never writes the source EAN
//   onto `ProductOption.barcode` so the (organizationId, barcode) unique on
//   options stays meaningful.
// - Wing rows are attached only when the planner reports an exact match
//   (option-legacy unique, or single-master barcode fallback). Ambiguous /
//   unmatched rows are reported but never silently linked.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';
import {
  normalizeForGroup,
  planKiditemImport,
  planWingMatches,
  projectWingRow,
  type KiditemPlan,
  type PlannedMaster,
  type PlannedOption,
  type WingPlan,
  type WorkbookRow,
} from './import-baseline-planner';

const DRIVE_REFERENCE_DIR = 'references';
const KIDITEM_LIST_FILE = 'kiditem_list.xlsx';
const WING_INVENTORY_MATCHED_FILE = 'wing-inventory-matched.xlsx';

type CliArgs = {
  kiditemPath: string;
  wingPath: string;
  organizationId: string;
  write: boolean;
};

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function resolveInputPath(input: string): string {
  return path.resolve(expandHome(input));
}

function requireExistingFile(filePath: string, label: string): string {
  const resolved = resolveInputPath(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`${label} file not found: ${resolved}`);
  }
  return resolved;
}

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

  const driveRoot = (args.get('drive-root') as string | undefined) ?? process.env.KIDITEM_DEV_DATA_DRIVE_DIR;
  const referenceDir =
    (args.get('reference-dir') as string | undefined) ??
    (args.get('references-dir') as string | undefined) ??
    (driveRoot ? path.join(resolveInputPath(driveRoot), DRIVE_REFERENCE_DIR) : undefined);
  const kiditemPath =
    (args.get('kiditem') as string | undefined) ??
    (args.get('kiditem-list') as string | undefined) ??
    (referenceDir ? path.join(resolveInputPath(referenceDir), KIDITEM_LIST_FILE) : undefined);
  const wingPath =
    (args.get('wing') as string | undefined) ??
    (args.get('wing-inventory-matched') as string | undefined) ??
    (referenceDir ? path.join(resolveInputPath(referenceDir), WING_INVENTORY_MATCHED_FILE) : undefined);
  const organizationId =
    (args.get('organization') as string | undefined) ??
    (args.get('organization-id') as string | undefined) ??
    process.env.KIDITEM_DEV_ORGANIZATION_ID;

  if (!kiditemPath) {
    throw new Error(
      `Missing KidItem baseline workbook. Set KIDITEM_DEV_DATA_DRIVE_DIR, pass --drive-root, or pass --kiditem-list/--kiditem.`,
    );
  }
  if (!wingPath) {
    throw new Error(
      `Missing Wing inventory matched workbook. Set KIDITEM_DEV_DATA_DRIVE_DIR, pass --drive-root, or pass --wing-inventory-matched/--wing.`,
    );
  }
  if (!organizationId) {
    throw new Error('Missing organization scope. Pass --organization-id/--organization or set KIDITEM_DEV_ORGANIZATION_ID.');
  }

  return {
    kiditemPath: requireExistingFile(kiditemPath, 'KidItem baseline workbook'),
    wingPath: requireExistingFile(wingPath, 'Wing inventory matched workbook'),
    organizationId,
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
  const counter = await tx.masterCodeCounter.upsert({
    where: { key: 'master_product' },
    create: { key: 'master_product', value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  if (counter.value > 99999999) {
    throw new Error(`master code counter overflow: ${counter.value} > 99999999`);
  }
  return `M-${String(counter.value).padStart(8, '0')}`;
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

interface SupplierSeed {
  key: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  marketName: string | null;
  rowNumbers: number[];
}

interface KiditemWriteStats {
  rows: number;
  hardConflicts: number;
  mastersCreated: number;
  mastersFound: number;
  optionsCreated: number;
  optionsFound: number;
  inventoryUpserted: number;
  suppliersCreated: number;
  suppliersFound: number;
  supplierProductsCreated: number;
  supplierProductsUpdated: number;
  supplierProductsSkippedMissingSupplier: number;
  supplierProductsSkippedMissingOption: number;
}

async function applyKiditemPlan(
  prisma: PrismaClient,
  organizationId: string,
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
    suppliersCreated: 0,
    suppliersFound: 0,
    supplierProductsCreated: 0,
    supplierProductsUpdated: 0,
    supplierProductsSkippedMissingSupplier: 0,
    supplierProductsSkippedMissingOption: 0,
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
    const suppliers = collectSupplierSeeds(plan);
    const supplierProductPlans = plan.options.filter((opt) => opt.supplierName);
    stats.mastersCreated = plan.masters.length;
    stats.optionsCreated = plan.options.length;
    stats.inventoryUpserted = plan.options.length;
    stats.suppliersCreated = suppliers.size;
    stats.supplierProductsCreated = supplierProductPlans.length;
    stats.supplierProductsSkippedMissingSupplier =
      plan.options.length - supplierProductPlans.length;
    return stats;
  }

  for (const masterPlan of plan.masters) {
    const optionsForMaster = plan.options.filter(
      (opt) => opt.masterImportKey === masterPlan.importKey,
    );

    await prisma.$transaction(async (tx) => {
      const existing = await tx.masterProduct.findFirst({
        where: { organizationId, legacyCode: masterPlan.importKey, isDeleted: false },
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
            organizationId,
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
              where: { organizationId, legacyCode: optionPlan.optionLegacyCode, isDeleted: false },
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
              organizationId,
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
            organizationId,
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

  await applySupplierMappings(prisma, organizationId, plan, stats);

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

function supplierKey(name: string): string {
  return normalizeForGroup(name) || name;
}

function collectSupplierSeeds(plan: KiditemPlan): Map<string, SupplierSeed> {
  const seeds = new Map<string, SupplierSeed>();

  for (const optionPlan of plan.options) {
    if (!optionPlan.supplierName) continue;
    const key = supplierKey(optionPlan.supplierName);
    const existing = seeds.get(key);
    if (existing) {
      existing.code ??= optionPlan.supplierCode;
      existing.address ??= optionPlan.supplierAddress;
      existing.phone ??= optionPlan.supplierPhone;
      existing.marketName ??= optionPlan.supplierMarketName;
      existing.rowNumbers.push(optionPlan.rowNumber);
      continue;
    }

    seeds.set(key, {
      key,
      name: optionPlan.supplierName,
      code: optionPlan.supplierCode,
      address: optionPlan.supplierAddress,
      phone: optionPlan.supplierPhone,
      marketName: optionPlan.supplierMarketName,
      rowNumbers: [optionPlan.rowNumber],
    });
  }

  return seeds;
}

function buildSupplierNotes(seed: SupplierSeed): string {
  const rows = seed.rowNumbers.slice(0, 10).join(',');
  const rowSuffix = seed.rowNumbers.length > 10 ? `,...(+${seed.rowNumbers.length - 10})` : '';
  return [
    'source: kiditem-baseline',
    seed.code ? `매입처코드: ${seed.code}` : null,
    seed.marketName ? `상가명: ${seed.marketName}` : null,
    `원본행: ${rows}${rowSuffix}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

async function findImportedOption(
  tx: Tx,
  organizationId: string,
  optionPlan: PlannedOption,
): Promise<{ id: string } | null> {
  if (optionPlan.optionLegacyCode) {
    const option = await tx.productOption.findFirst({
      where: { organizationId, legacyCode: optionPlan.optionLegacyCode, isDeleted: false },
      select: { id: true },
    });
    if (option) return option;
  }

  const master = await tx.masterProduct.findFirst({
    where: { organizationId, legacyCode: optionPlan.masterImportKey, isDeleted: false },
    select: { id: true },
  });
  if (!master) return null;

  return tx.productOption.findFirst({
    where: {
      organizationId,
      masterId: master.id,
      optionName: optionPlan.optionDisplayName,
      isDeleted: false,
    },
    select: { id: true },
  });
}

async function applySupplierMappings(
  prisma: PrismaClient,
  organizationId: string,
  plan: KiditemPlan,
  stats: KiditemWriteStats,
): Promise<void> {
  const supplierSeeds = collectSupplierSeeds(plan);

  await prisma.$transaction(async (tx) => {
    const supplierIdsByKey = new Map<string, string>();

    for (const seed of supplierSeeds.values()) {
      const existing = await tx.supplier.findFirst({
        where: { organizationId, name: seed.name },
        select: { id: true },
      });

      if (existing) {
        await tx.supplier.update({
          where: { id: existing.id },
          data: {
            address: seed.address ?? undefined,
            phone: seed.phone ?? undefined,
            notes: buildSupplierNotes(seed),
            status: 'active',
          },
        });
        supplierIdsByKey.set(seed.key, existing.id);
        stats.suppliersFound += 1;
        continue;
      }

      const created = await tx.supplier.create({
        data: {
          organizationId,
          name: seed.name,
          address: seed.address,
          phone: seed.phone,
          notes: buildSupplierNotes(seed),
          status: 'active',
        },
        select: { id: true },
      });
      supplierIdsByKey.set(seed.key, created.id);
      stats.suppliersCreated += 1;
    }

    for (const optionPlan of plan.options) {
      if (!optionPlan.supplierName) {
        stats.supplierProductsSkippedMissingSupplier += 1;
        continue;
      }

      const supplierId = supplierIdsByKey.get(supplierKey(optionPlan.supplierName));
      if (!supplierId) {
        stats.supplierProductsSkippedMissingSupplier += 1;
        continue;
      }

      const option = await findImportedOption(tx, organizationId, optionPlan);
      if (!option) {
        stats.supplierProductsSkippedMissingOption += 1;
        continue;
      }

      const existing = await tx.supplierProduct.findFirst({
        where: { supplierId, optionId: option.id },
        select: { id: true },
      });

      if (existing) {
        await tx.supplierProduct.update({
          where: { id: existing.id },
          data: {
            supplyPrice: optionPlan.supplyPrice,
            minOrderQty: optionPlan.minOrderQty,
          },
        });
        stats.supplierProductsUpdated += 1;
        continue;
      }

      await tx.supplierProduct.create({
        data: {
          supplierId,
          optionId: option.id,
          supplyPrice: optionPlan.supplyPrice,
          minOrderQty: optionPlan.minOrderQty,
        },
      });
      stats.supplierProductsCreated += 1;
    }
  });
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
  organizationId: string,
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
      where: { organizationId, legacyCode: attachment.masterImportKey, isDeleted: false },
      select: { id: true },
    });
    if (!master) {
      stats.attachmentsSkippedMasterMissing += 1;
      continue;
    }

    const existing = await prisma.channelListing.findFirst({
      where: {
        organizationId,
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
          organizationId,
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
    const kiditem = await applyKiditemPlan(prisma, args.organizationId, kiditemPlan, args.write);
    const wing = await applyWingPlan(prisma, args.organizationId, wingPlan, args.write);

    const report = {
      mode: args.write ? 'write' : 'dry-run',
      inputs: {
        kiditemPath: args.kiditemPath,
        wingPath: args.wingPath,
        organizationId: args.organizationId,
      },
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
