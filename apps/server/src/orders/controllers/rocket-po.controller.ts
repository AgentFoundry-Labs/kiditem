import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Inject,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import type { MulterFile } from '../../common/types';
import {
  INVENTORY_PORT,
  type InventoryPort,
} from '../../inventory/application/port/in/stock/inventory.port';
import {
  RocketPoConfirmService,
  type ConfirmComputedRow,
  type ConfirmSourceRow,
  type ConfirmPreviewResult,
  type RocketConfirmFillResult,
} from '../services/rocket-po-confirm.service';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(xls|xlsx)$/i;

@Controller('orders/rocket')
export class RocketPoController {
  constructor(
    private readonly rocketPoConfirmService: RocketPoConfirmService,
    @Inject(INVENTORY_PORT)
    private readonly inventory: InventoryPort,
  ) {}

  /** 쿠팡 발주 업로드 양식(.xlsx) → KidItem 재고로 확정수량/사유 채워서 반환 */
  @Post('confirm-fill')
  @Header(
    'Access-Control-Expose-Headers',
    ['Content-Disposition', 'X-Rocket-Total', 'X-Rocket-Confirmed', 'X-Rocket-Short', 'X-Rocket-Matched'].join(', '),
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_EXTENSIONS.test(file.originalname)) return cb(null, true);
        cb(new BadRequestException('xlsx 발주 양식만 업로드 가능합니다.'), false);
      },
    }),
  )
  async confirmFill(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }
    const result = await this.rocketPoConfirmService.fillConfirmTemplate(file, organizationId);
    setConfirmHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  /** 발주리스트(거래처확인요청) SKU 행 → 양식을 처음부터 직접 생성 */
  @Post('confirm-generate')
  @Header(
    'Access-Control-Expose-Headers',
    ['Content-Disposition', 'X-Rocket-Total', 'X-Rocket-Confirmed', 'X-Rocket-Short', 'X-Rocket-Matched'].join(', '),
  )
  async confirmGenerate(
    @CurrentOrganization() organizationId: string,
    @Body() body: { rows?: ConfirmSourceRow[] },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('생성할 발주 행이 없습니다.');
    }
    const result = await this.rocketPoConfirmService.generateConfirmFile(rows, organizationId);
    setConfirmHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  /** 발주리스트 SKU 행 → 확정수량/사유 계산(편집 미리보기용 JSON) */
  @Post('confirm-preview')
  async confirmPreview(
    @CurrentOrganization() organizationId: string,
    @Body() body: { rows?: ConfirmSourceRow[] },
  ): Promise<ConfirmPreviewResult> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('미리볼 발주 행이 없습니다.');
    }
    return this.rocketPoConfirmService.previewConfirmRows(rows, organizationId);
  }

  /** 미리보기에서 확정한 쿠팡 로켓 수량 → KidItem Rocket 예약 ledger 기록 */
  @Post('confirm-commit')
  async confirmCommit(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { rows?: ConfirmComputedRow[] },
  ): Promise<RocketConfirmCommitResult> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('예약 처리할 발주 행이 없습니다.');
    }

    const result: RocketConfirmCommitResult = {
      reservedRows: 0,
      alreadyReservedRows: 0,
      skippedRows: 0,
      skipped: [],
    };

    for (const [index, row] of rows.entries()) {
      const quantity = toCommitQuantity(row.confirmQty);
      if (quantity <= 0) {
        result.skippedRows += 1;
        result.skipped.push(toSkipped(row, 'zero_confirm_qty'));
        continue;
      }
      if (!row.inventoryId || !row.optionId) {
        result.skippedRows += 1;
        result.skipped.push(toSkipped(row, 'unmatched_inventory'));
        continue;
      }

      const applied = await this.inventory.applyRocketInventoryEvent({
        organizationId,
        userId: user.id,
        inventoryId: row.inventoryId,
        optionId: row.optionId,
        eventType: 'reserve',
        quantity,
        sourceActionId: rocketConfirmSourceActionId(row, index),
        sourceType: 'rocket_confirm',
        sourceRef: rocketConfirmSourceRef(row),
        note: 'Coupang Rocket confirm quantity reserve',
      });
      if (applied.alreadyApplied) result.alreadyReservedRows += 1;
      else result.reservedRows += 1;
    }

    return result;
  }
}

interface RocketConfirmCommitResult {
  reservedRows: number;
  alreadyReservedRows: number;
  skippedRows: number;
  skipped: Array<{
    poNumber: string;
    barcode: string;
    reason: 'zero_confirm_qty' | 'unmatched_inventory';
  }>;
}

function setConfirmHeaders(result: RocketConfirmFillResult, response: Response): void {
  response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('X-Rocket-Total', String(result.totalRows));
  response.setHeader('X-Rocket-Confirmed', String(result.fullyConfirmed));
  response.setHeader('X-Rocket-Short', String(result.shortRows));
  response.setHeader('X-Rocket-Matched', String(result.matchedSkus));
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function toCommitQuantity(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function rocketConfirmSourceActionId(row: ConfirmComputedRow, index: number): string {
  return [
    'rocket-confirm',
    sourcePart(row.poNumber, 48),
    sourcePart(row.productNo ?? row.barcode, 48),
    sourcePart(row.barcode, 48),
    String(index + 1),
  ].join(':').slice(0, 200);
}

function rocketConfirmSourceRef(row: ConfirmComputedRow): string {
  return `${sourcePart(row.poNumber, 80)}/${sourcePart(row.barcode, 80)}`.slice(0, 200);
}

function sourcePart(value: unknown, maxLength: number): string {
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  return (text || 'none').slice(0, maxLength);
}

function toSkipped(
  row: ConfirmComputedRow,
  reason: 'zero_confirm_qty' | 'unmatched_inventory',
): RocketConfirmCommitResult['skipped'][number] {
  return {
    poNumber: String(row.poNumber ?? ''),
    barcode: String(row.barcode ?? ''),
    reason,
  };
}
