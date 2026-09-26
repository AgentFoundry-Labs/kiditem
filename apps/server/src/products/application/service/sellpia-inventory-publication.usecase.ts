import { Inject, Injectable } from '@nestjs/common';
import type { SellpiaInventoryResult } from '@kiditem/shared/sellpia-operations';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import type { SellpiaInventoryPublicationPort } from '../port/in/sellpia-inventory-publication.port';
import {
  PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT,
  type ProductSourcePublicationRepositoryPort,
} from '../port/out/persistence/product-source-publication.repository.port';
import {
  SELLPIA_PAYLOAD_DECODER_PORT,
  type SellpiaPayloadDecoderPort,
} from '../port/out/source/sellpia-payload-decoder.port';

const SNAPSHOT_MIME_TYPE = 'application/json';

/**
 * 셀피아 재고 발행(ADR-0025 finalize). 청크로 모은 스냅샷을 옛 완료 파일과 같은 JSON 본문으로 만들어 기존 봉투 검증·
 * 복호화(`SellpiaPayloadDecoderPort`)를 그대로 거친 뒤, 실행 finish 트랜잭션 안에서 발행한다.
 */
@Injectable()
export class SellpiaInventoryPublicationUseCase implements SellpiaInventoryPublicationPort {
  constructor(
    @Inject(PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT)
    private readonly publication: ProductSourcePublicationRepositoryPort,
    @Inject(SELLPIA_PAYLOAD_DECODER_PORT)
    private readonly decoder: SellpiaPayloadDecoderPort,
  ) {}

  async publish(
    transaction: OwnerTransaction,
    input: Parameters<SellpiaInventoryPublicationPort['publish']>[1],
  ): Promise<SellpiaInventoryResult> {
    const payload = { buffer: Buffer.from(JSON.stringify(input.snapshot), 'utf8'), mimeType: SNAPSHOT_MIME_TYPE };
    this.decoder.validate(payload);
    const parsed = this.decoder.decode(payload);
    const changes = await this.publication.publishSnapshot(transaction, {
      organizationId: input.organizationId,
      operationId: input.operationId,
      trigger: input.trigger,
      rows: parsed.rows,
    });
    return { rows: parsed.rows.length, products: changes.productCount };
  }
}
