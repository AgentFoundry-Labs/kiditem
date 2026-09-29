import { ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE } from '../../../domain/collection/catalog-source-identity';
import type { ChannelCatalogIdentityProduct } from './channel-catalog-identity-upsert';

export type RocketMatchingCsvCatalogRow = {
  rowNumber: number;
  externalSkuId: string;
  vendorItemId: string | null;
  productName: string;
  supplierStatus: string | null;
  channelBarcode: string | null;
  sellpiaProductName: string | null;
  sellpiaBarcode: string | null;
  matchMethod: string | null;
  confidence: string | null;
  sellpiaStoredMatch: boolean;
  kiditemSynchronized: boolean;
  matchStatus: string | null;
  evidence: string | null;
  rawJson: Record<string, string>;
};

export function rocketMatchingCsvRowsToCatalogProducts(
  rows: readonly RocketMatchingCsvCatalogRow[],
): ChannelCatalogIdentityProduct[] {
  return rows.map((row) => {
    const provenance = {
      source: ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE,
      rowNumber: row.rowNumber,
      vendorItemId: row.vendorItemId,
      supplierStatus: row.supplierStatus,
      sellpiaProductName: row.sellpiaProductName,
      sellpiaBarcode: row.sellpiaBarcode,
      matchMethod: row.matchMethod,
      confidence: row.confidence,
      sellpiaStoredMatch: row.sellpiaStoredMatch,
      kiditemSynchronized: row.kiditemSynchronized,
      matchStatus: row.matchStatus,
      evidence: row.evidence,
      csv: row.rawJson,
    };
    return {
      externalProductId: row.externalSkuId,
      registeredName: row.productName,
      displayName: row.productName,
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: row.supplierStatus ?? 'observed',
      raw: provenance,
      options: [{
        externalOptionId: row.externalSkuId,
        optionName: row.productName,
        salePrice: null,
        sellerSku: row.externalSkuId,
        barcode: row.channelBarcode,
        modelNumber: null,
        skuStatus: row.supplierStatus ?? 'observed',
        attributes: {},
        raw: provenance,
      }],
    };
  });
}
