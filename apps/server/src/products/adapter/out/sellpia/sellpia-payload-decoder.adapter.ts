import { Injectable } from '@nestjs/common';
import {
  SELLPIA_PAYLOAD_DECODER_PORT,
  type SellpiaPayloadDecodeInput,
  type SellpiaPayloadDecoderPort,
  type ParsedProductSourceArtifact,
} from '../../../application/port/out/source/sellpia-payload-decoder.port';
import { decodeSellpiaPayload } from './sellpia-workbook.decoder';
import { SellpiaPayloadValidator } from './sellpia-payload.validator';

/**
 * The source adapter owns envelope validation and workbook/JSON decoding. The
 * collection use case only receives normalized source rows and quality facts.
 */
@Injectable()
export class SellpiaPayloadDecoderAdapter implements SellpiaPayloadDecoderPort {
  constructor(private readonly validator: SellpiaPayloadValidator) {}

  validate(input: SellpiaPayloadDecodeInput): void {
    this.validator.validate(input);
  }

  decode(input: SellpiaPayloadDecodeInput): ParsedProductSourceArtifact {
    return decodeSellpiaPayload(input.buffer);
  }
}

export { SELLPIA_PAYLOAD_DECODER_PORT };
