import type { Prisma } from '@prisma/client';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import type { ChannelsProductMappingGenerationPort } from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import type { ChannelOptionRecipePort } from '../../../application/port/in/channel-option-recipe.port';
import type { ChannelCatalogPublicationPort } from '../../../application/port/out/repository/channel-catalog-publication.port';
import type { ParsedWingCatalogRow } from '../documents/coupang-wing/workbook.parser';
import {
  rawSectionPatch,
  type OptionCatalogExcelSection,
} from '../../../domain/collection/channel-listing-raw-sections';
import {
  LISTING_ATTRIBUTE_KINDS,
  attributesFromWire,
} from '../../../domain/collection/channel-listing-attributes';
import {
  upsertChannelCatalogIdentities,
  type ChannelCatalogIdentityOption,
} from './channel-catalog-identity-upsert';
import { applyRegisteredOptionRecipes } from '../persistence/registered-option-recipes';

const SOURCE_TYPE = 'coupang_wing_catalog';

type WorkbookInput = Parameters<ChannelCatalogPublicationPort['publishWorkbook']>[1];

type CanonicalParent = Pick<
  ParsedWingCatalogRow,
  | 'externalProductId'
  | 'registeredName'
  | 'displayName'
  | 'category'
  | 'manufacturer'
  | 'brand'
  | 'productStatus'
  | 'rawJson'
> & {
  /** 상품의 첫 옵션 줄 가운데 비지 않은 `판매상태`. */
  saleStatus: string | null;
  /** 상품 칸(검색어·노출상품ID·성인 여부): 첫 비지 않은 값. */
  searchTags: string[];
  exposedProductId: string | null;
  adult: boolean | null;
};

/**
 * [쿠팡상품정보] 엑셀 반영(KID-349 → KID-354 `channels.wing_catalog_excel` finalize). 실행 계약의 finish
 * 트랜잭션 안에서 부르며, 출처는 `lastOperationId`로 남긴다(`source_import_runs` 행 없음). 계정 겹침은 실행
 * 잠금(`account:<id>`), 같은 파일 재반영은 실행 계약의 `fileHash`가 막는다.
 */
export async function publishWingCatalogWorkbook(
  tx: Prisma.TransactionClient,
  deps: { recipes: ChannelOptionRecipePort; productMapping: ChannelsProductMappingGenerationPort },
  input: WorkbookInput,
): Promise<Awaited<ReturnType<ChannelCatalogPublicationPort['publishWorkbook']>>> {
  if (input.rows.length === 0) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'catalog_workbook_empty' } });
  }
  await lockProductMapping(tx, input.organizationId);
  const canonicalParents = canonicalParentRows(input.rows);
  const optionsByProduct = new Map<string, ChannelCatalogIdentityOption[]>();
  for (const row of input.rows) {
    const options = optionsByProduct.get(row.externalProductId) ?? [];
    const attributes = attributesFromWire(row.attributesJson, 'search');
    options.push({
      externalOptionId: row.externalSkuId,
      optionName: row.optionName,
      salePrice: null,
      sellerSku: null,
      barcode: row.barcode,
      modelNumber: row.modelNumber,
      skuStatus: row.skuStatus,
      attributes,
      // 빈 칸은 "못 봤다" (KID-349, 리더 결정): 검색옵션은 엑셀에서만 오므로 실린 줄이면 통째로
      // 바꾸고, 구매옵션은 이 줄이 값을 실은 속성 종류만 바꿔 상세가 준 다른 구매속성을 지킨다.
      attributeMerge: LISTING_ATTRIBUTE_KINDS
        .filter((kind) => attributes.some((attribute) => attribute.kind === kind))
        .map((kind) => ({ kind, replaceBy: kind === 'purchase' ? 'attributeType' as const : 'kind' as const })),
      raw: rawSectionPatch('catalogExcel', excelSection(input.observedAt, row.rawJson)),
    });
    optionsByProduct.set(row.externalProductId, options);
  }

  const identities = await upsertChannelCatalogIdentities(tx, {
    organizationId: input.organizationId,
    channelAccountId: input.channelAccountId,
    lastImportRunId: null,
    lastOperationId: input.operationId,
    rawSource: SOURCE_TYPE,
    // 윙 엑셀에는 판매자코드 칸도 판매가 칸도 없다. 브라우저 수집이 본 값을 지우지 않는다.
    // 옵션명·판매상태·모델번호·바코드는 양식의 필수 칸이라 그대로 관측한다.
    unobservedOptionFields: ['sellerSku', 'salePrice'],
    // 엑셀은 자기 구역(catalogExcel)만 쓴다: 목록·상세가 쓴 구역과 값을 지우지 않는다 (KID-349).
    rawJsonWrite: 'section',
    products: canonicalParents.map((parent) => ({
      externalProductId: parent.externalProductId,
      registeredName: parent.registeredName,
      displayName: parent.displayName,
      category: parent.category,
      manufacturer: parent.manufacturer,
      brand: parent.brand,
      productStatus: parent.productStatus,
      raw: rawSectionPatch(
        'catalogExcel',
        {
          ...excelSection(input.observedAt, parent.rawJson),
          searchTags: parent.searchTags,
          exposedProductId: parent.exposedProductId,
          adult: parent.adult,
        },
        {
          source: SOURCE_TYPE,
          externalProductId: parent.externalProductId,
          // 판매상태·승인상태 평면 키는 Products·Analytics가 판매상태로 읽는다: 엑셀로 처음 만든
          // 리스팅에도 둔다. 빈 칸은 싣지 않아 저장값을 지우지 않는다.
          ...(parent.saleStatus ? { saleStatus: parent.saleStatus } : {}),
          ...(parent.productStatus ? { productStatus: parent.productStatus } : {}),
        },
      ),
      options: optionsByProduct.get(parent.externalProductId) ?? [],
    })),
  });
  const { mappingIdentityChanged } = identities;
  const {
    createdProductCount,
    updatedProductCount,
    createdSkuCount,
    updatedSkuCount,
  } = identities.changes;

  await applyRegisteredOptionRecipes(ownerTransaction(tx), deps.recipes, {
    organizationId: input.organizationId,
    channelListingIds: [...identities.listingIds.values()],
  });

  // 엑셀은 목록에 없는 상품을 끄지 않는다. 사라진 상품은 브라우저 동기화의 삭제 확인으로만
  // 바뀐다 (KID-348). 건너뛴 줄 수는 응답으로 알린다.
  if (mappingIdentityChanged) {
    await deps.productMapping.advance(tx, input.organizationId);
  }

  return {
    createdProductCount,
    updatedProductCount,
    createdSkuCount,
    updatedSkuCount,
    skippedRowCount: input.skippedRows.length,
  };
}

function canonicalParentRows(rows: ParsedWingCatalogRow[]): CanonicalParent[] {
  const parents = new Map<string, CanonicalParent>();
  for (const row of rows) {
    const existing = parents.get(row.externalProductId);
    if (!existing) {
      parents.set(row.externalProductId, {
        externalProductId: row.externalProductId,
        registeredName: row.registeredName,
        displayName: row.displayName,
        category: row.category,
        manufacturer: row.manufacturer,
        brand: row.brand,
        productStatus: row.productStatus,
        saleStatus: row.skuStatus,
        searchTags: row.searchTags,
        exposedProductId: row.exposedProductId,
        adult: row.adult,
        rawJson: row.rawJson,
      });
      continue;
    }
    existing.registeredName ??= row.registeredName;
    existing.displayName ??= row.displayName;
    existing.category ??= row.category;
    existing.manufacturer ??= row.manufacturer;
    existing.brand ??= row.brand;
    existing.productStatus ??= row.productStatus;
    existing.saleStatus ??= row.skuStatus;
    existing.exposedProductId ??= row.exposedProductId;
    existing.adult ??= row.adult;
    if (existing.searchTags.length === 0) existing.searchTags = row.searchTags;
  }
  return [...parents.values()];
}

/** 엑셀 한 줄의 `catalogExcel` 구역. 빈 칸은 `null`로 남긴다. */
function excelSection(observedAt: string, rawJson: Record<string, unknown>): OptionCatalogExcelSection {
  return {
    observedAt,
    row: Object.fromEntries(Object.entries(rawJson).map(([header, value]) => {
      const text = value === null || value === undefined ? '' : String(value).trim();
      return [header, text ? String(value) : null];
    })),
  };
}

