export type ProductSourceExportRow = {
  셀피아상품코드: string;
  상품명: string;
  옵션: string;
  바코드: string;
  현재고: number;
  매입가: number | string;
  재고자산: number | string;
  최종가져오기: string;
};

export type ProductSourceExportDocument = {
  buffer: Buffer;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
};

export interface ProductSourceExportRendererPort {
  render(rows: readonly ProductSourceExportRow[]): ProductSourceExportDocument;
}

export const PRODUCT_SOURCE_EXPORT_RENDERER_PORT = Symbol(
  'PRODUCT_SOURCE_EXPORT_RENDERER_PORT',
);
