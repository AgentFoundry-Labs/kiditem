/** Stored source identity and facts exposed by the Products owner. */
export type ProductSourceReadModel = Readonly<{
  masterProductId: string;
  code: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  purchasePrice: number | null;
  imageUrls: readonly string[];
}>;
