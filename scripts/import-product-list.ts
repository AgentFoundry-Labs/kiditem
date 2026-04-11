#!/usr/bin/env tsx
/**
 * import-product-list.ts
 *
 * kiditem_list.xlsx -> MasterProduct/MasterInventory/MasterSupplierProduct 생성
 * + 기존 Product(쿠팡 리스팅)에 masterProductId 매칭
 *
 * Usage: npx tsx scripts/import-product-list.ts [xlsx-path]
 * Default: ./kiditem_list.xlsx
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 'cacc5509-7f13-50a7-9b99-d2c18e35b5bf';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function excelDateToDate(serial: number | string): Date | null {
  const num = Number(serial);
  if (!num || isNaN(num)) return null;
  try {
    // Excel serial date: days since 1900-01-01 (with the 1900 leap year bug)
    const utcDays = Math.floor(num) - 25569; // 25569 = days from 1900-01-01 to 1970-01-01
    return new Date(utcDays * 86400 * 1000);
  } catch {
    return null;
  }
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, '').toLowerCase();
}

function toIntOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  return Math.round(num);
}

// ─── Row type ────────────────────────────────────────────────────────────────

interface XlsxRow {
  상품코드: string | number;
  상품명: string;
  옵션명: string;
  자사상품코드: string | number;
  상품분류: string;
  품절: string;
  품절일: string | number;
  단종: string;
  단종일: string | number;
  상품위치: string;
  매입처코드: string | number;
  매입처: string;
  '매입처 주소': string;
  '매입처 전화번호': string;
  '매입처 상가명': string;
  매입상품명: string;
  매입가: number | string;
  판매가: number | string;
  수수료: number | string;
  재고: number | string;
  안전재고: number | string;
  무한재고: string;
  상품구분: string;
  상품중량: string | number;
  중량단위: string;
  소재: string;
  원산지: string;
  모델명: string | number;
  제조원: string;
  브랜드: string;
  최소발주수량: number | string;
  발주단위: number | string;
  등록일: number | string;
  실등록일: number | string;
  임의필드: string;
  전달사항: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2] || './kiditem_list.xlsx';
  console.log(`Reading xlsx: ${filePath}`);

  // Step 1: Parse xlsx + validation
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet, { defval: '' });
  console.log(`Parsed ${rows.length} rows from sheet "${wb.SheetNames[0]}"`);

  // SKU uniqueness check
  const skuSet = new Set<string>();
  for (const row of rows) {
    const sku = String(row['상품코드']);
    if (!sku || sku === 'undefined') {
      throw new Error(`Empty SKU found in row: ${JSON.stringify(row).slice(0, 200)}`);
    }
    if (skuSet.has(sku)) {
      throw new Error(`Duplicate SKU: ${sku}`);
    }
    skuSet.add(sku);
  }
  console.log(`SKU validation passed: ${skuSet.size} unique SKUs`);

  let warnings = 0;
  let productsMatched = 0;
  let productsUnmatched = 0;
  let newSuppliers = 0;
  let existingSuppliers = 0;

  await prisma.$transaction(
    async (tx) => {
      // Step 2: Supplier creation
      console.log('\n--- Step 2: Suppliers ---');
      const supplierNames = [
        ...new Set(rows.map((r) => String(r['매입처']).trim()).filter(Boolean)),
      ];
      const supplierMap = new Map<string, string>();

      for (const name of supplierNames) {
        const existing = await tx.supplier.findFirst({
          where: { companyId: COMPANY_ID, name },
        });
        if (existing) {
          supplierMap.set(name, existing.id);
          existingSuppliers++;
        } else {
          const created = await tx.supplier.create({
            data: { companyId: COMPANY_ID, name },
          });
          supplierMap.set(name, created.id);
          newSuppliers++;
        }
      }
      console.log(
        `Suppliers: ${supplierMap.size} total (${newSuppliers} new, ${existingSuppliers} existing)`,
      );

      // Step 3: MasterProduct creation
      console.log('\n--- Step 3: MasterProducts ---');
      const masterProductIds: string[] = [];

      for (const row of rows) {
        const sku = String(row['상품코드']);
        const isDiscontinued = row['단종'] === 'Y';
        const isSoldOut = row['품절'] === 'Y';

        let deletedAt: Date | null = null;
        if (isDiscontinued && row['단종일']) {
          deletedAt = excelDateToDate(row['단종일']);
          if (!deletedAt) {
            console.warn(`  WARN: Failed to parse 단종일 for SKU ${sku}: ${row['단종일']}`);
            warnings++;
          }
        }

        const status = isDiscontinued || isSoldOut ? 'inactive' : 'active';

        // Build rawData with all extra fields
        const rawData: Record<string, unknown> = {};
        const rawFields: [string, string][] = [
          ['optionName', '옵션명'],
          ['productLocation', '상품위치'],
          ['material', '소재'],
          ['origin', '원산지'],
          ['modelName', '모델명'],
          ['manufacturer', '제조원'],
          ['productType', '상품구분'],
          ['productWeight', '상품중량'],
          ['weightUnit', '중량단위'],
          ['orderUnit', '발주단위'],
          ['customField', '임의필드'],
          ['unlimitedStock', '무한재고'],
          ['supplierCode', '매입처코드'],
          ['supplierMallName', '매입처 상가명'],
          ['supplierProductName', '매입상품명'],
          ['ownProductCode', '자사상품코드'],
        ];
        for (const [key, col] of rawFields) {
          const val = row[col as keyof XlsxRow];
          if (val !== '' && val !== undefined && val !== null) {
            rawData[key] = val;
          }
        }

        // Date fields in rawData
        const dateFields: [string, string][] = [
          ['registrationDate', '등록일'],
          ['actualRegistrationDate', '실등록일'],
          ['soldOutDate', '품절일'],
        ];
        for (const [key, col] of dateFields) {
          const val = row[col as keyof XlsxRow];
          if (val !== '' && val !== undefined && val !== null) {
            const d = excelDateToDate(val as number);
            if (d) {
              rawData[key] = d.toISOString();
            } else if (val) {
              rawData[key] = String(val);
              console.warn(`  WARN: Failed to parse date ${col} for SKU ${sku}: ${val}`);
              warnings++;
            }
          }
        }

        const mp = await tx.masterProduct.create({
          data: {
            companyId: COMPANY_ID,
            sku,
            name: String(row['상품명']),
            costPrice: toIntOrNull(row['매입가']),
            sellPrice: toIntOrNull(row['판매가']),
            commissionRate: null,
            barcode: row['자사상품코드'] ? String(row['자사상품코드']) : null,
            category: row['상품분류'] ? String(row['상품분류']) : null,
            brand: row['브랜드'] ? String(row['브랜드']) : null,
            status,
            isDeleted: isDiscontinued,
            deletedAt,
            memo: row['전달사항'] ? String(row['전달사항']) : null,
            rawData: Object.keys(rawData).length > 0 ? rawData : null,
          },
        });
        masterProductIds.push(mp.id);
      }
      console.log(`MasterProducts created: ${masterProductIds.length}`);

      // Step 4: Product <-> MasterProduct matching
      console.log('\n--- Step 4: Product matching ---');
      const products = await tx.product.findMany({
        where: { companyId: COMPANY_ID },
        select: { id: true, name: true },
      });
      console.log(`Existing Products found: ${products.length}`);

      // Build product name -> productIds map
      const productsByName = new Map<string, string[]>();
      for (const p of products) {
        const norm = normalizeName(p.name);
        if (!productsByName.has(norm)) {
          productsByName.set(norm, []);
        }
        productsByName.get(norm)!.push(p.id);
      }

      // Build master product name groups from xlsx data
      // Group masterProducts by normalized name, then pick the best one for matching
      const masterByName = new Map<
        string,
        { id: string; optionName: string; index: number }[]
      >();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const norm = normalizeName(String(row['상품명']));
        if (!masterByName.has(norm)) {
          masterByName.set(norm, []);
        }
        masterByName.get(norm)!.push({
          id: masterProductIds[i],
          optionName: String(row['옵션명'] || '').trim(),
          index: i,
        });
      }

      // For each product name, find the best matching MasterProduct
      const matchedProductIds = new Set<string>();

      for (const [normName, productIds] of productsByName) {
        const masterGroup = masterByName.get(normName);
        if (!masterGroup || masterGroup.length === 0) continue;

        // Pick the best MasterProduct: prefer one without option name
        const sorted = [...masterGroup].sort((a, b) => {
          if (!a.optionName && b.optionName) return -1;
          if (a.optionName && !b.optionName) return 1;
          return a.index - b.index;
        });
        const selectedMaster = sorted[0];

        if (masterGroup.length > 1) {
          console.warn(
            `  WARN: Multiple MasterProducts for name "${normName}", using SKU from row ${selectedMaster.index + 1}`,
          );
          warnings++;
        }

        // Update all matching products
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { masterProductId: selectedMaster.id },
        });

        for (const pid of productIds) {
          matchedProductIds.add(pid);
        }
      }

      productsMatched = matchedProductIds.size;
      productsUnmatched = products.length - productsMatched;
      console.log(`Products matched: ${productsMatched} / ${products.length}`);

      // Step 5: MasterInventory creation
      console.log('\n--- Step 5: MasterInventory ---');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        await tx.masterInventory.create({
          data: {
            companyId: COMPANY_ID,
            masterProductId: masterProductIds[i],
            currentStock: Number(row['재고']) || 0,
            safetyStock: Number(row['안전재고']) || 0,
          },
        });
      }
      console.log(`MasterInventory created: ${rows.length}`);

      // Step 6: MasterSupplierProduct creation
      console.log('\n--- Step 6: MasterSupplierProduct ---');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const supplierName = String(row['매입처']).trim();
        const supplierId = supplierMap.get(supplierName);
        if (!supplierId) {
          console.warn(
            `  WARN: Supplier not found for SKU ${String(row['상품코드'])}: "${supplierName}"`,
          );
          warnings++;
          continue;
        }

        await tx.masterSupplierProduct.create({
          data: {
            masterProductId: masterProductIds[i],
            supplierId,
            supplyPrice: Number(row['매입가']) || 0,
            minOrderQty: Number(row['최소발주수량']) || 1,
          },
        });
      }
      console.log(`MasterSupplierProduct created: ${rows.length}`);
    },
    { timeout: 120_000 },
  );

  // Step 7: Result logging
  console.log('\n========================================');
  console.log('Import complete:');
  console.log(`  MasterProducts: ${rows.length} created`);
  console.log(`  Products matched: ${productsMatched} (of ${await prisma.product.count({ where: { companyId: COMPANY_ID } })})`);
  console.log(`  Products unmatched: ${productsUnmatched}`);
  console.log(`  MasterInventory: ${rows.length} created`);
  console.log(`  MasterSupplierProduct: ${rows.length} created`);
  console.log(
    `  Suppliers: ${newSuppliers + existingSuppliers} (${newSuppliers} new, ${existingSuppliers} existing)`,
  );
  console.log(`  Warnings: ${warnings}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
