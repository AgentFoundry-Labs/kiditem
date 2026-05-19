// scripts/import-baseline-planner.ts
//
// Pure planner for the baseline kiditem + Wing import. Deterministic and
// side-effect-free so script behavior is unit-testable without a database.
//
// `MasterProduct.barcode` is the source EAN/barcode (non-unique),
// `ProductOption.barcode` is true option/scanner barcode (unique). Baseline
// import never writes the source EAN into `ProductOption.barcode`.
//
// Master grouping: `(source barcode or blank fallback, normalized product name)`.
// Master identity (idempotency): deterministic versioned key
// `kiditem:v1:<sha256-16chars>` written to `MasterProduct.legacyCode`.
//
// The planner takes plain workbook rows (already deserialized) and produces
// the master/option write plan + hard conflicts + Wing match plan. The actual
// Prisma writes live in `import-product-baseline.ts`.
//

import { createHash } from 'node:crypto';

export type WorkbookRow = Record<string, unknown>;

export const MASTER_IMPORT_KEY_PREFIX = 'kiditem:v1:';
const MASTER_IMPORT_KEY_HASH_BYTES = 8; // 16 hex chars → 27-char keys, well under 100
const BLANK_BARCODE_PREFIX = 'blank:';
const BLANK_ROW_PREFIX = 'blank-row:';

export function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export function toInt(value: unknown): number {
  const text = String(value ?? '').replace(/[,\s원]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function toPositiveInt(value: unknown, fallback = 1): number {
  const parsed = toInt(value);
  return parsed > 0 ? parsed : fallback;
}

/**
 * Canonical normalization for grouping comparisons. Trims, collapses every
 * internal whitespace run to nothing, and lowercases. Korean / numeric content
 * passes through unchanged. Used for product-name match in master grouping.
 */
export function normalizeForGroup(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * Resolve the master grouping bucket for a row. If the row has a real
 * `자사상품코드` we group by `(barcode, normalized name)`. If the source
 * barcode is blank we fall back to a row-local key so unrelated blank-barcode
 * rows never collapse onto each other (`blank:<optionLegacyCode>` if the row
 * has `상품코드`, otherwise `blank-row:<rowNumber>`).
 */
export function resolveBarcodeBucket(
  sourceBarcode: string | null,
  optionLegacyCode: string | null,
  rowNumber: number,
): string {
  if (sourceBarcode) return sourceBarcode;
  if (optionLegacyCode) return `${BLANK_BARCODE_PREFIX}${optionLegacyCode}`;
  return `${BLANK_ROW_PREFIX}${rowNumber}`;
}

/**
 * Deterministic versioned import key for `MasterProduct.legacyCode`. The key
 * is internal idempotency state — UI must not present it as the user-facing
 * product code.
 */
export function masterImportKey(
  barcodeBucket: string,
  normalizedName: string,
): string {
  const hash = createHash('sha256')
    .update(`${barcodeBucket}|${normalizedName}`)
    .digest('hex')
    .slice(0, MASTER_IMPORT_KEY_HASH_BYTES * 2);
  return `${MASTER_IMPORT_KEY_PREFIX}${hash}`;
}

export interface PlannedMaster {
  importKey: string;
  sourceBarcode: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  rowNumbers: number[];
  optionLegacyCodes: string[];
  representativeRow: WorkbookRow;
}

export interface PlannedOption {
  masterImportKey: string;
  optionLegacyCode: string | null;
  optionDisplayName: string | null;
  rowNumber: number;
  costPrice: number;
  supplyPrice: number;
  sellPrice: number;
  currentStock: number;
  safetyStock: number;
  warehouseLocation: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  supplierAddress: string | null;
  supplierPhone: string | null;
  supplierMarketName: string | null;
  supplierProductName: string | null;
  minOrderQty: number;
  rawRow: WorkbookRow;
}

export interface HardConflict {
  masterImportKey: string;
  optionDisplayName: string | null;
  rowNumbers: number[];
}

export interface KiditemPlan {
  masters: PlannedMaster[];
  options: PlannedOption[];
  hardConflicts: HardConflict[];
  expectedMastersByBarcodeName: number;
  expectedOptions: number;
  sharedSourceBarcodeGroups: number;
  multiNameBarcodeGroups: number;
  duplicateOptionNameGroups: number;
}

const NAME_FIELDS = ['상품명', '상품명(셀피아)', '제품명'] as const;

function rowName(row: WorkbookRow, fallback: string): string {
  for (const field of NAME_FIELDS) {
    const v = clean(row[field]);
    if (v) return v;
  }
  return fallback;
}

function rowOptionName(row: WorkbookRow): string | null {
  // `모델명` in the KidItem baseline workbook is frequently an EAN/barcode-like
  // identifier, not a human option label. Do not fall back to it for display:
  // no-option products must remain `null` so inventory/product UIs render "-".
  return clean(row['옵션명']);
}

/**
 * Build the kiditem master/option write plan from raw workbook rows.
 * Row indexing is 1-based to match the spreadsheet view (header is row 1).
 */
export function planKiditemImport(rows: ReadonlyArray<WorkbookRow>): KiditemPlan {
  const masters = new Map<string, PlannedMaster>();
  const options: PlannedOption[] = [];

  // Track which barcode buckets appear in master plans — used to derive how many
  // distinct masters share an actual source EAN (sharedSourceBarcodeGroups) and
  // how many EANs span multiple normalized product names (multiNameBarcodeGroups).
  const bucketUsage = new Map<string, Set<string>>(); // sourceBarcode -> set of importKey

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // header row is 1
    const sourceBarcode = clean(row['자사상품코드']);
    const optionLegacyCode = clean(row['상품코드']);
    const name = rowName(row, optionLegacyCode ?? `row-${rowNumber}`);
    const optionDisplayName = rowOptionName(row);
    const normalizedName = normalizeForGroup(name);
    const bucket = resolveBarcodeBucket(sourceBarcode, optionLegacyCode, rowNumber);
    const importKey = masterImportKey(bucket, normalizedName);

    const existing = masters.get(importKey);
    if (existing) {
      existing.rowNumbers.push(rowNumber);
      if (optionLegacyCode) existing.optionLegacyCodes.push(optionLegacyCode);
    } else {
      masters.set(importKey, {
        importKey,
        sourceBarcode,
        name,
        category: clean(row['상품분류']),
        brand: clean(row['브랜드']),
        rowNumbers: [rowNumber],
        optionLegacyCodes: optionLegacyCode ? [optionLegacyCode] : [],
        representativeRow: row,
      });
    }

    if (sourceBarcode) {
      const usage = bucketUsage.get(sourceBarcode) ?? new Set<string>();
      usage.add(importKey);
      bucketUsage.set(sourceBarcode, usage);
    }

    options.push({
      masterImportKey: importKey,
      optionLegacyCode,
      optionDisplayName,
      rowNumber,
      costPrice: toInt(row['매입가']),
      supplyPrice: toInt(row['매입가']),
      sellPrice: toInt(row['판매가']),
      currentStock: toInt(row['재고']),
      safetyStock: toInt(row['안전재고']),
      warehouseLocation: clean(row['상품위치']),
      supplierCode: clean(row['매입처코드']),
      supplierName: clean(row['매입처']),
      supplierAddress: clean(row['매입처 주소']),
      supplierPhone: clean(row['매입처 전화번호']),
      supplierMarketName: clean(row['매입처 상가명']),
      supplierProductName: clean(row['매입상품명']),
      minOrderQty: toPositiveInt(row['최소발주수량']),
      rawRow: row,
    });
  });

  // Hard conflicts: two rows planning the same (masterImportKey, optionDisplayName).
  // optionDisplayName=null is allowed for at most one option per master because
  // the schema has @@unique([masterId, optionName]) and a separate partial unique
  // index on `option_name IS NULL`.
  const conflictMap = new Map<string, HardConflict>();
  const seenPair = new Map<string, number[]>();
  for (const opt of options) {
    const key = `${opt.masterImportKey}::${opt.optionDisplayName ?? '∅'}`;
    const rows = seenPair.get(key) ?? [];
    rows.push(opt.rowNumber);
    seenPair.set(key, rows);
  }
  for (const [key, rowNumbers] of seenPair) {
    if (rowNumbers.length <= 1) continue;
    const [masterPart, displayPart] = key.split('::', 2);
    conflictMap.set(key, {
      masterImportKey: masterPart,
      optionDisplayName: displayPart === '∅' ? null : displayPart,
      rowNumbers: [...rowNumbers],
    });
  }

  let sharedSourceBarcodeGroups = 0;
  let multiNameBarcodeGroups = 0;
  for (const [, importKeys] of bucketUsage) {
    if (importKeys.size > 1) {
      sharedSourceBarcodeGroups += 1;
      multiNameBarcodeGroups += 1;
    }
  }

  return {
    masters: [...masters.values()],
    options,
    hardConflicts: [...conflictMap.values()],
    expectedMastersByBarcodeName: masters.size,
    expectedOptions: options.length,
    sharedSourceBarcodeGroups,
    multiNameBarcodeGroups,
    duplicateOptionNameGroups: conflictMap.size,
  };
}

// =============================================================================
// Wing matching — exact-only.
// =============================================================================

export interface WingPlanInput {
  /** 1-based spreadsheet row number used in reports. */
  rowNumber: number;
  listingExternalId: string | null;
  matched: boolean;
  optionLegacyCode: string | null;
  sourceBarcode: string | null;
  channelName: string | null;
  channelPrice: number;
}

export interface WingAttachment {
  rowNumber: number;
  listingExternalId: string;
  masterImportKey: string;
  channelName: string | null;
  channelPrice: number | null;
  matchedBy: 'option-legacy' | 'master-barcode-exact-one';
}

export interface WingPlan {
  attachments: WingAttachment[];
  optionLegacyMatches: number;
  barcodeFallbackMatches: number;
  ambiguousBarcodeMatches: number;
  unmatchedMatchedRows: number;
  skippedMissingListingExternalId: number;
  notMatchedRows: number;
  reports: Array<{ rowNumber: number; reason: string }>;
}

export function projectWingRow(
  row: WorkbookRow,
  rowNumber: number,
): WingPlanInput {
  return {
    rowNumber,
    listingExternalId: clean(row['등록상품ID']),
    matched: clean(row['매칭상태']) === 'O',
    optionLegacyCode: clean(row['상품코드']),
    sourceBarcode: clean(row['자사상품코드']),
    channelName: clean(row['등록상품명']),
    channelPrice: toInt(row['판매가']),
  };
}

export function planWingMatches(
  wingRows: ReadonlyArray<WingPlanInput>,
  kiditem: Pick<KiditemPlan, 'masters' | 'options'>,
): WingPlan {
  // Index masters by source barcode (one barcode → many masters allowed).
  const mastersByBarcode = new Map<string, PlannedMaster[]>();
  for (const master of kiditem.masters) {
    if (!master.sourceBarcode) continue;
    const list = mastersByBarcode.get(master.sourceBarcode) ?? [];
    list.push(master);
    mastersByBarcode.set(master.sourceBarcode, list);
  }

  // Index options by option legacy code. Same legacy code may appear under
  // multiple masters in degenerate workbooks, so it's a list and "unique" means
  // exactly one option in that list.
  const optionsByLegacyCode = new Map<string, PlannedOption[]>();
  for (const opt of kiditem.options) {
    if (!opt.optionLegacyCode) continue;
    const list = optionsByLegacyCode.get(opt.optionLegacyCode) ?? [];
    list.push(opt);
    optionsByLegacyCode.set(opt.optionLegacyCode, list);
  }

  const plan: WingPlan = {
    attachments: [],
    optionLegacyMatches: 0,
    barcodeFallbackMatches: 0,
    ambiguousBarcodeMatches: 0,
    unmatchedMatchedRows: 0,
    skippedMissingListingExternalId: 0,
    notMatchedRows: 0,
    reports: [],
  };

  for (const row of wingRows) {
    if (!row.listingExternalId) {
      plan.skippedMissingListingExternalId += 1;
      plan.reports.push({ rowNumber: row.rowNumber, reason: 'missing listingExternalId' });
      continue;
    }
    if (!row.matched) {
      plan.notMatchedRows += 1;
      continue;
    }

    // Option-legacy exact-one match takes priority.
    if (row.optionLegacyCode) {
      const candidates = optionsByLegacyCode.get(row.optionLegacyCode);
      if (candidates && candidates.length === 1) {
        plan.optionLegacyMatches += 1;
        plan.attachments.push({
          rowNumber: row.rowNumber,
          listingExternalId: row.listingExternalId,
          masterImportKey: candidates[0].masterImportKey,
          channelName: row.channelName,
          channelPrice: row.channelPrice || null,
          matchedBy: 'option-legacy',
        });
        continue;
      }
      if (candidates && candidates.length > 1) {
        plan.unmatchedMatchedRows += 1;
        plan.reports.push({
          rowNumber: row.rowNumber,
          reason: `option legacy code ${row.optionLegacyCode} resolves to ${candidates.length} options`,
        });
        continue;
      }
      // candidates undefined → fall through to barcode fallback below.
    }

    // Master source-barcode fallback only when exactly one master matches.
    if (row.sourceBarcode) {
      const candidates = mastersByBarcode.get(row.sourceBarcode);
      if (candidates && candidates.length === 1) {
        plan.barcodeFallbackMatches += 1;
        plan.attachments.push({
          rowNumber: row.rowNumber,
          listingExternalId: row.listingExternalId,
          masterImportKey: candidates[0].importKey,
          channelName: row.channelName,
          channelPrice: row.channelPrice || null,
          matchedBy: 'master-barcode-exact-one',
        });
        continue;
      }
      if (candidates && candidates.length > 1) {
        plan.ambiguousBarcodeMatches += 1;
        plan.reports.push({
          rowNumber: row.rowNumber,
          reason: `source barcode ${row.sourceBarcode} resolves to ${candidates.length} masters`,
        });
        continue;
      }
    }

    plan.unmatchedMatchedRows += 1;
    plan.reports.push({
      rowNumber: row.rowNumber,
      reason: 'no exact option-legacy match and no exact-one master barcode match',
    });
  }

  return plan;
}
