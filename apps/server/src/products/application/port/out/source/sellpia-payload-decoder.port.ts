export type ParsedProductSourceRow = {
  rowNumber: number;
  sellpiaProductCode: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
};

export type ParsedProductSourceArtifact = {
  rows: ParsedProductSourceRow[];
  headers: string[];
};

export type SellpiaPayloadDecodeInput = {
  buffer: Buffer;
  mimeType: string;
};

export interface SellpiaPayloadDecoderPort {
  decode(input: SellpiaPayloadDecodeInput): ParsedProductSourceArtifact;
  validate(input: SellpiaPayloadDecodeInput): void;
}

export const SELLPIA_PAYLOAD_DECODER_PORT = Symbol('SELLPIA_PAYLOAD_DECODER_PORT');
