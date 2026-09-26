import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import type { OperationView } from '@kiditem/shared/operation';
import {
  isMallOrdersManualUploadMall,
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_KIND,
} from '@kiditem/shared/orders-operations';
import { OPERATION_PORT, type OperationPort } from '../../../common/operation/application/port/in/operation.port';
import {
  ORDER_MALL_ACCOUNT_PORT,
  type OrderMallAccountPort,
} from '../port/out/persistence/order-mall-account.port';
import { OrderCollectionService } from './order-collection.service';

/**
 * 청크 하나에 싣는 파일 조각(base64 전) 크기. 실행 계약의 청크 상한(1MiB, 직렬화)에 base64 부풀림과 여유를 둔다.
 * 반드시 3의 배수로 둔다 — 조각마다 따로 base64로 바꾸고 owner(`joinedFile`)는 base64 글자를 그대로 이어 한 번에 푼다.
 * 3의 배수가 아니면 마지막이 아닌 조각에 `=` 채움이 붙어 이은 바이트가 깨진다.
 */
export const MALL_ORDERS_UPLOAD_PART_BYTES = 600_000;

export interface MallOrdersUploadInput {
  organizationId: string;
  userId: string | null;
  mallKey: string;
  file: { originalname: string; buffer: Buffer };
  password?: string;
}

/**
 * 수동 엑셀 업로드 = `orders.mall_orders` 실행 하나(`collectionMode: 'manual-upload'`, KID-380 T4). 화면 업로드를 받은
 * 서버가 스스로 producer가 된다(로켓 매칭 CSV kind와 같은 모양): 그 몰 계정으로 begin → 파일 조각을 `order_rows`
 * 청크로 → finish. 보관·주문 수는 브라우저 수집과 같은 owner finalize가 적고, 변환은 화면이 실행 id로 받는다.
 * 같은 파일을 다시 올려도 새 수집이다(옛 업로드와 같다) — 파일 지문으로 막지 않는다.
 */
@Injectable()
export class MallOrdersUploadService {
  constructor(
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
    @Inject(ORDER_MALL_ACCOUNT_PORT) private readonly accounts: OrderMallAccountPort,
    private readonly conversions: OrderCollectionService,
  ) {}

  async upload(input: MallOrdersUploadInput): Promise<{ operation: OperationView }> {
    if (!isMallOrdersManualUploadMall(input.mallKey)) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'manual_upload_unsupported', mallKey: input.mallKey } });
    }
    const account = await this.accounts.resolveMallAccount({ organizationId: input.organizationId, mallKey: input.mallKey });
    if (!account) throw new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND', { details: { mallKey: input.mallKey } });
    // 암호를 여기서 푼다 — 틀린 암호는 실행을 만들기 전에 거절된다.
    const file = await this.conversions.unlockUploadedFile(input.file, input.password);
    if (file.bytes.length === 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'upload_file_missing', field: 'file' } });
    }
    const begun = await this.operations.begin(input.organizationId, {
      kind: MALL_ORDERS_KIND,
      scope: {
        channelAccountId: account.channelAccountId,
        mallKey: input.mallKey,
        collectionDate: null,
        collectionMode: 'manual-upload',
      },
    }, { userId: input.userId });
    const fenced = { organizationId: input.organizationId, operationId: begun.operation.id, token: begun.token };
    try {
      const parts = fileParts(file.fileName, file.bytes);
      for (const [index, part] of parts.entries()) {
        const payload = [part];
        await this.operations.putChunk({
          ...fenced,
          chunkKind: MALL_ORDERS_CHUNK_KIND,
          sequence: index + 1,
          request: { checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload },
        });
      }
      return await this.operations.finish({ ...fenced, request: { outcome: 'succeeded' } });
    } catch (error) {
      await this.operations.finish({
        ...fenced,
        request: { outcome: 'failed', errorCode: errorCodeOf(error) },
      }).catch(() => undefined);
      throw error;
    }
  }
}

/** owner의 파일 조각 모양(`FilePartSchema`): 순번·조각 수·이름·base64. */
function fileParts(fileName: string, bytes: Buffer): Array<{ fileName: string; part: number; parts: number; base64: string }> {
  const parts = Math.max(1, Math.ceil(bytes.length / MALL_ORDERS_UPLOAD_PART_BYTES));
  return Array.from({ length: parts }, (_, part) => ({
    fileName,
    part,
    parts,
    base64: bytes.subarray(part * MALL_ORDERS_UPLOAD_PART_BYTES, (part + 1) * MALL_ORDERS_UPLOAD_PART_BYTES).toString('base64'),
  }));
}

/** 실패 코드: 레지스트리 코드를 단 오류면 그 코드, 변환기가 거절한 파일(옛 Nest 오류)은 옛 업로드와 같은 `CONVERSION_FAILED`. */
function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'CONVERSION_FAILED';
}
